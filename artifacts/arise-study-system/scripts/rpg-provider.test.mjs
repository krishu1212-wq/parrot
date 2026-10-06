import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  STORAGE_KEY, batchPayload, controlledClock, createProviderRuntime, legacyPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

const moduleCache = new Map();
function loadCatalogue(name) {
  if (moduleCache.has(name)) return moduleCache.get(name);
  assert.match(name, /^@\/contexts\/(?:rpgCatalog|rpgTypes|rankSystem|progressHistorySchema)$/);
  const path = `../contexts/${name.slice('@/contexts/'.length)}.ts`;
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const exports = {};
  moduleCache.set(name, exports);
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: loadCatalogue, Date, Math }, { filename: path });
  return exports;
}
const { GATE_DEFINITIONS } = loadCatalogue('@/contexts/rpgCatalog');
const { RANK_REQUIREMENTS } = loadCatalogue('@/contexts/rankSystem');
const { createEmptyProgressHistory } = loadCatalogue('@/contexts/progressHistorySchema');
const gateOf = (type) => GATE_DEFINITIONS.find((gate) => gate.type === type);
const plain = (value) => JSON.parse(JSON.stringify(value));
const rankXp = 12000;
const lecture = (id, status = 'not-started') => ({
  id, title: `Real lecture ${id}`, link: '', status, xpReward: 50,
  sessionCount: status === 'completed' ? 1 : 0,
  firstStartedAt: status === 'completed' ? '2026-09-30T10:00:00.000Z' : null,
  lastStartedAt: status === 'completed' ? '2026-09-30T10:00:00.000Z' : null,
  completedAt: status === 'completed' ? '2026-09-30T10:05:00.000Z' : null,
  xpEarnedOn: status === 'completed' ? '2026-09-30' : null,
  xpAwarded: status === 'completed', isArchived: false,
});
const batch = (id, lectures) => ({
  id, name: id, source: 'Real saved course', startDate: '2026-10-01',
  createdAt: '2026-09-30T09:00:00.000Z', isActive: id === 'gate-batch',
  subjects: [{
    id: 'maths', name: 'Maths', topics: [{
      id: 'gate-topic', title: 'Real topic', category: 'ARITHMETIC',
      lectures, isArchived: false,
    }],
  }],
});
const payload = (overrides = {}) => batchPayload({
  totalXp: rankXp,
  activeBatchId: 'gate-batch',
  batches: [batch('gate-batch', [lecture('first'), lecture('second')])],
  ncertCatalogVersion: 1,
  ncertShelves: [{
    id: 'class-2', classLabel: 'CLASS 02', bookCount: 1,
    completed: 0, sessions: 0, vocabulary: 1,
  }],
  ncertBooks: [{
    id: 'gate-book', classId: 'class-2', classLabel: 'CLASS 02',
    title: 'Actual saved book', totalSessions: 6, completedSessions: 0, vocabulary: ['saved word'],
  }],
  ...overrides,
});
const historyWithEvidence = (activeDays, completedStudyActivities) => {
  const history = createEmptyProgressHistory();
  const firstDate = Date.UTC(2020, 0, 1);
  history.systemEvents = Array.from({ length: completedStudyActivities }, (_, index) => {
    const dayIndex = Math.min(activeDays - 1, Math.floor(index * activeDays / completedStudyActivities));
    const activityDate = new Date(firstDate + dayIndex * 86_400_000).toISOString().slice(0, 10);
    return {
      id: `gate-rank-evidence-${index}`, type: 'quest.completed',
      timestamp: `${activityDate}T12:00:00.000Z`, idempotencyKey: `gate-rank-evidence-${index}`,
      metadata: { activityDate, questId: `gate-rank-evidence-quest-${index}` },
    };
  });
  return history;
};
const payloadWithRank = (rankId, totalXp = RANK_REQUIREMENTS[rankId].minimumXp) => {
  const requirements = RANK_REQUIREMENTS[rankId];
  return payload({
    totalXp,
    progressHistory: historyWithEvidence(requirements.minimumActiveDays, requirements.minimumStudyActivities),
  });
};
const rpgEvents = (provider, type) => provider.current.rpg.events.filter((event) => event.type === type);
const progressEvents = (provider, type) => provider.current.state.progressHistory.systemEvents.filter((event) => event.type === type);
const xpSum = (provider) => provider.current.state.progressHistory.xpEvents.reduce((sum, event) => sum + event.amount, 0);
const completeMaths = (study, id = 'first') => {
  study.startLecture('maths', 'gate-topic', id);
  study.completeLecture('maths', 'gate-topic', id);
};

test('legacy saves receive empty inventory/loadout without modifying XP, rank, study data, or creating Gate history', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, legacyPayload()]]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.state.totalXp, 4321);
  assert.equal(provider.current.level, 5);
  assert.equal(provider.current.rank, 'E-RANK');
  assert.equal(provider.current.state.streak, 9);
  assert.deepEqual(plain(provider.current.rpg.inventory), {});
  assert.ok(Object.values(provider.current.rpg.loadout).every((item) => item === null));
  assert.equal(provider.current.rpg.attempts.length, 0);
  assert.equal(provider.current.rpg.events.length, 0);
  assert.equal(provider.current.state.progressHistory.systemEvents.length, 0);
  const before = JSON.parse(provider.snapshot());
  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  assert.deepEqual(JSON.parse(reloaded.snapshot()), before);
});

test('malformed optional RPG fields do not reject canonical study progress or erase valid inventory siblings', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, payload({
    rpg: {
      version: 1, gates: 'damaged', attempts: [{ id: 'bad-attempt' }],
      inventory: { 'xp-crystal': { itemId: 'xp-crystal', quantity: 2 }, 'not-real': { quantity: -40 } },
      loadout: { 'xp-boost': 'not-owned', revision: {} }, events: 'broken',
      presentationQueue: ['missing-event'], claimedRewardKeys: 'broken',
    },
  })]]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.state.totalXp, rankXp);
  assert.equal(provider.current.rpg.inventory['xp-crystal'].quantity, 2);
  assert.equal(provider.current.rpg.presentationQueue.length, 0);
  assert.ok(provider.current.rpg.malformedRaw);
  assert.ok(Object.values(provider.current.rpg.loadout).every((item) => item === null));
  assert.equal(progressEvents(provider, 'gate.cleared').length, 0);
});

test('locked entry fails explicitly; real progression unlocks a Gate without fabricating completion/rewards', async (t) => {
  const requirement = RANK_REQUIREMENTS['rank-c'];
  const evidence = historyWithEvidence(requirement.minimumActiveDays - 1, requirement.minimumStudyActivities - 1);
  const provider = await mountProvider(t, mockStorage([[STORAGE_KEY, payload({
    totalXp: requirement.minimumXp - 80, progressHistory: evidence,
  })]]));
  const special = gateOf('special');
  await provider.edit((study) => study.enterGate(special.id));
  assert.ok(provider.current.rpgError);
  assert.equal(provider.current.rpg.attempts.length, 0);
  assert.deepEqual(plain(provider.current.rpg.inventory), {});
  await provider.edit((study) => study.completeQuest('morning-workout'));
  assert.equal(provider.current.state.totalXp, requirement.minimumXp);
  assert.equal(provider.current.rank, 'C-RANK');
  assert.equal(provider.current.rpg.gates[special.id].unlocked, true);
  assert.equal(rpgEvents(provider, 'gate.unlocked').length, 1);
  assert.equal(progressEvents(provider, 'gate.unlocked').length, 1);
  assert.equal(rpgEvents(provider, 'gate.cleared').length, 0);
  await provider.edit((study) => study.enterGate(special.id));
  assert.equal(provider.current.rpgError, null);
  assert.equal(provider.current.rpg.attempts.length, 1);
});

test('real Maths completion atomically grants base quest/lecture XP and one independent Gate reward; retries and shared-runtime reload do not repeat it', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, payload()]]);
  const clock = controlledClock();
  const runtime = createProviderRuntime(storage, clock);
  const provider = await mountProvider(t, storage, { runtime, strictMode: true });
  const normal = gateOf('normal');
  await provider.edit((study) => study.enterGate(normal.id));
  const attempt = provider.current.rpg.attempts[0];
  assert.equal(attempt.status, 'active');
  assert.equal(attempt.progress, 0);
  assert.equal(provider.current.state.totalXp, rankXp);
  await provider.edit((study) => {
    completeMaths(study);
    study.completeLecture('maths', 'gate-topic', 'first');
  });
  assert.equal(provider.current.state.totalXp - rankXp, 210 + normal.rewards.xp + 25 + 50);
  assert.equal(xpSum(provider), 210 + normal.rewards.xp + 25 + 50);
  const sources = provider.current.state.progressHistory.xpEvents.map((event) => event.source).sort();
  assert.deepEqual(plain(sources), ['achievement', 'achievement', 'gate', 'lecture', 'quest']);
  assert.equal(provider.current.state.progressHistory.xpEvents.find((e) => e.source === 'quest').amount, 160,
    'canonical quest base XP is unchanged');
  assert.equal(rpgEvents(provider, 'gate.cleared').length, 1);
  assert.equal(progressEvents(provider, 'gate.cleared').length, 1);
  assert.equal(provider.current.rpg.gates[normal.id].completed, true);
  assert.equal(provider.current.rpg.activeAttemptId, null);
  for (const reward of normal.rewards.items) {
    assert.equal(provider.current.rpg.inventory[reward.itemId].quantity,
      reward.quantity + (reward.itemId === 'study-coins' ? 3 : 0));
  }
  const snapshot = JSON.parse(provider.snapshot());
  await provider.unmount();
  const reloaded = await mountProvider(t, storage, { runtime });
  assert.deepEqual(JSON.parse(reloaded.snapshot()), snapshot);
  await reloaded.edit((study) => {
    study.enterGate(normal.id);
    study.completeLecture('maths', 'gate-topic', 'first');
  });
  assert.ok(reloaded.current.rpgError);
  assert.deepEqual(JSON.parse(reloaded.snapshot()), snapshot);
});

test('a persisted active deadline expires on resume; later study earns ordinary rewards but no Gate reward', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, payload()]]);
  const clock = controlledClock();
  const runtime = createProviderRuntime(storage, clock);
  const first = await mountProvider(t, storage, { runtime });
  await first.edit((study) => study.enterGate(gateOf('normal').id));
  const attemptId = first.current.rpg.activeAttemptId;
  const deadline = first.current.rpg.attempts[0].deadlineAt;
  await first.unmount();
  clock.setTime(new Date(deadline).getTime() + 1);
  const resumed = await mountProvider(t, storage, { runtime });
  await resumed.edit((study) => study.refreshRpgClock());
  assert.equal(resumed.current.rpg.attempts.find((attempt) => attempt.id === attemptId).status, 'failed');
  await resumed.edit((study) => {
    completeMaths(study);
    study.refreshRpgClock();
  });
  assert.equal(resumed.current.state.totalXp - rankXp, 235);
  assert.equal(rpgEvents(resumed, 'gate.failed').length, 1);
  assert.equal(rpgEvents(resumed, 'gate.cleared').length, 0);
  assert.deepEqual(plain(resumed.current.rpg.inventory), {
    'study-coins': { itemId: 'study-coins', quantity: 3 },
    'relic-fragment': { itemId: 'relic-fragment', quantity: 1 },
  });
  assert.equal(xpSum(resumed), 235);
});

test('historical completed lectures and switching batches cannot advance an entered Gate', async (t) => {
  const provider = await mountProvider(t, mockStorage([[STORAGE_KEY, payload({
    batches: [
      batch('gate-batch', [lecture('first', 'completed'), lecture('second')]),
      batch('other-batch', [lecture('first', 'completed')]),
    ],
  })]]));
  await provider.edit((study) => study.enterGate(gateOf('normal').id));
  await provider.edit((study) => {
    study.setActiveBatch('other-batch');
    study.completeLecture('maths', 'gate-topic', 'first');
    study.setActiveBatch('gate-batch');
    study.completeLecture('maths', 'gate-topic', 'first');
  });
  assert.equal(provider.current.rpg.attempts[0].progress, 0);
  assert.equal(provider.current.state.totalXp, rankXp);
  assert.equal(rpgEvents(provider, 'gate.cleared').length, 0);
  await provider.edit((study) => completeMaths(study, 'second'));
  assert.equal(rpgEvents(provider, 'gate.cleared').length, 1);
});

test('calculation Gate rewards, crystal consumption and loadout persist independently of capped study history', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, payloadWithRank('rank-c', rankXp)]]);
  const runtime = createProviderRuntime(storage);
  const provider = await mountProvider(t, storage, { runtime });
  const gate = gateOf('special');
  await provider.edit((study) => study.enterGate(gate.id));
  await provider.edit((study) => study.addCalculationSession({
    questions: 10, correct: 9, accuracy: 90, duration: 90,
  }));
  assert.equal(provider.current.rpg.gates[gate.id].completed, true);
  assert.equal(provider.current.state.totalXp, rankXp + 120 + gate.rewards.xp + 75);
  assert.equal(provider.current.rpg.inventory['xp-crystal'].quantity, 2);
  await provider.edit((study) => study.useInventoryItem('xp-crystal'));
  assert.equal(provider.current.rpg.inventory['xp-crystal'].quantity, 1);
  assert.equal(provider.current.state.totalXp, rankXp + 120 + gate.rewards.xp + 75 + 25);
  assert.equal(provider.current.state.progressHistory.xpEvents.filter((event) => event.source === 'inventory').length, 1);
  await provider.edit((study) => study.equipItem('calculation-gauntlet'));
  assert.equal(provider.current.rpg.loadout['quest-modifier'], 'calculation-gauntlet');
  assert.equal(provider.current.rpg.effects.calculationXpPercent, 5);
  const equipCount = rpgEvents(provider, 'equipment.equipped').length;
  await provider.edit((study) => study.equipItem('calculation-gauntlet'));
  assert.equal(rpgEvents(provider, 'equipment.equipped').length, equipCount);
  const snapshot = JSON.parse(provider.snapshot());
  await provider.unmount();
  const reloaded = await mountProvider(t, storage, { runtime });
  assert.deepEqual(JSON.parse(reloaded.snapshot()), snapshot);
  await reloaded.edit((study) => {
    study.toggleQuest('timed-calculation');
    study.addCalculationSession({ questions: 10, correct: 9, accuracy: 90, duration: 90 });
  });
  assert.equal(reloaded.current.state.totalXp, snapshot.totalXp + 6, 'Only the small new equipment bonus is additional; base quest undo/recompletion nets zero');
  assert.equal(reloaded.current.state.progressHistory.xpEvents.filter((event) => event.source === 'equipment').at(-1).amount, 6);
  const withBonus = reloaded.current.state.totalXp;
  await reloaded.edit((study) => {
    study.unequipSlot('quest-modifier');
    study.toggleQuest('timed-calculation');
  });
  assert.equal(reloaded.current.state.totalXp, withBonus - 120 - 6, 'Reversal uses the original awarded bonus even after unequip');
  assert.equal(reloaded.current.rpg.loadout['quest-modifier'], null);
});

test('NCERT Gate requires two real sessions and Scholar Core modifies only subsequent canonical reading awards', async (t) => {
  const provider = await mountProvider(t, mockStorage([[STORAGE_KEY, payloadWithRank('rank-b')]]));
  const gate = gateOf('difficult');
  await provider.edit((study) => study.enterGate(gate.id));
  await provider.edit((study) => study.advanceNcertBookSession('gate-book'));
  assert.equal(provider.current.rpg.attempts[0].progress, 1);
  assert.equal(rpgEvents(provider, 'gate.cleared').length, 0);
  await provider.edit((study) => study.advanceNcertBookSession('gate-book'));
  assert.equal(provider.current.rpg.gates[gate.id].completed, true);
  await provider.edit((study) => study.equipItem('scholar-core'));
  assert.equal(provider.current.rpg.effects.ncertXpPercent, 5);
  const before = provider.current.state.totalXp;
  await provider.edit((study) => {
    study.toggleQuest('ncert-reading');
    study.advanceNcertBookSession('gate-book');
  });
  assert.equal(provider.current.state.totalXp, before + 5);
  assert.equal(provider.current.state.ncertBooks.find((book) => book.id === 'gate-book').completedSessions, 3);
  assert.equal(provider.current.state.progressHistory.xpEvents.filter((event) => event.source === 'equipment').at(-1).amount, 5);
});

test('real Boss record clears its Gate; chest consumes once per unit and persists exact contents and acquisition history', async (t) => {
  const bossStartXp = RANK_REQUIREMENTS['rank-a'].minimumXp;
  const storage = mockStorage([[STORAGE_KEY, payloadWithRank('rank-a', bossStartXp)]]);
  const runtime = createProviderRuntime(storage);
  const provider = await mountProvider(t, storage, { runtime });
  for (let index = 0; index < 5; index++) await provider.edit((study) => study.saveReviewCard({
    batchId: 'gate-batch', subjectId: 'maths', topicTitle: 'Real topic',
    question: `Actual saved question ${index}`, answer: '4',
  }));
  const cards = provider.current.studyTools.reviewCards;
  const results = cards.map((card, index) => ({
    cardId: card.id, question: card.question, expectedAnswer: card.answer,
    answer: index === 4 ? '3' : '4', correct: index !== 4, topicTitle: card.topicTitle, subjectId: card.subjectId,
  }));
  const details = {
    batchId: 'gate-batch', date: '2026-10-01', weekStart: '2026-09-28',
    results,
    weakTopics: ['Real topic'],
  };
  await provider.edit((study) => study.saveBossTest(details));
  const official = plain(provider.current.studyTools.bossTests[0]);
  await provider.edit((study) => study.enterGate(gateOf('boss').id));
  assert.equal(provider.current.rpg.attempts[0].progress, 0, 'Historical official Boss results cannot clear a new Gate');
  await provider.edit((study) => study.saveGateBossTest(details));
  assert.equal(provider.current.rpg.gates[gateOf('boss').id].completed, true);
  assert.deepEqual(plain(provider.current.studyTools.bossTests[0]), official, 'Gate practice preserves the official test');
  assert.equal(provider.current.studyTools.bossTests.length, 2);
  assert.equal(provider.current.studyTools.bossTests[1].gateAttemptId, provider.current.rpg.attempts[0].id);
  assert.equal(provider.current.state.totalXp - bossStartXp, gateOf('boss').rewards.xp + 150 + 100 + 50,
    'official special reward and two once-only achievements have independent XP ownership');
  assert.equal(provider.current.state.progressHistory.xpEvents.filter((e) => e.source === 'boss').length, 1);
  assert.equal(provider.current.rpg.inventory['reward-chest'].quantity, 2);
  await provider.edit((study) => {
    study.useInventoryItem('reward-chest');
    study.useInventoryItem('reward-chest');
  });
  assert.equal(provider.current.rpg.inventory['reward-chest']?.quantity ?? 0, 0);
  assert.equal(provider.current.rpg.inventory['achievement-relic'].quantity, 2);
  assert.equal(provider.current.rpg.inventory['quest-lens'].quantity, 2);
  assert.equal(rpgEvents(provider, 'chest.opened').length, 2);
  assert.equal(progressEvents(provider, 'chest.opened').length, 2);
  assert.ok(provider.current.rpg.acquisitions.every((record) => record.id && record.idempotencyKey && record.timestamp));
  const snapshot = JSON.parse(provider.snapshot());
  await provider.edit((study) => study.useInventoryItem('reward-chest'));
  assert.ok(provider.current.rpgError);
  assert.deepEqual(JSON.parse(provider.snapshot()), snapshot);
  await provider.unmount();
  const reloaded = await mountProvider(t, storage, { runtime });
  assert.deepEqual(JSON.parse(reloaded.snapshot()), snapshot);
});

test('inventory/gear operations never modify unrelated canonical study records, achievements, or old progress history', async (t) => {
  const provider = await mountProvider(t, mockStorage([[STORAGE_KEY, payload()]]));
  await provider.edit((study) => {
    study.enterGate(gateOf('special').id);
    study.addCalculationSession({ questions: 10, correct: 9, accuracy: 90, duration: 90 });
  });
  const before = plain(provider.current.state);
  const previousIds = before.progressHistory.systemEvents.map((event) => event.id);
  await provider.edit((study) => {
    study.equipItem('focus-crystal');
    study.equipItem('sentinel-sigil');
    study.unequipSlot('study-boost');
  });
  const after = plain(provider.current.state);
  for (const key of ['totalXp', 'quests', 'batches', 'ncertBooks', 'ncertShelves', 'ncertProgressLedger',
    'vocabularySections', 'blackBookPage', 'blackBookTotal', 'calculationHistory', 'studyTools', 'achievementHistory']) {
    assert.deepEqual(after[key], before[key], `${key} is preserved`);
  }
  assert.ok(previousIds.every((id) => after.progressHistory.systemEvents.some((event) => event.id === id)));
  assert.equal(xpSum(provider), after.totalXp - rankXp);
});