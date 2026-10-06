import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = name === '@/contexts/rpgSystem' ? 'rpgSystem.ts'
    : name === '@/contexts/rpgCatalog' ? 'rpgCatalog.ts'
      : name === '@/contexts/rpgStudyTransitions' ? 'rpgStudyTransitions.ts'
        : name === '@/contexts/achievementHistory' ? 'achievementHistory.ts'
        : name === '@/contexts/rankSystem' ? 'rankSystem.ts' : null;
  assert.ok(filename, `Unexpected dependency ${name}`);
  const source = readFileSync(new URL(`../contexts/${filename}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  modules.set(name, exports);
  vm.runInNewContext(compiled, { exports, require: load, Date, Math, Object, Map, Set, Number, String, Array }, { filename });
  return exports;
}
const system = load('@/contexts/rpgSystem');
const catalog = load('@/contexts/rpgCatalog');
const ranks = load('@/contexts/rankSystem');
let sequence = 0;
const ticket = (timestamp = '2026-04-01T12:00:00.000Z') => ({ timestamp, ticketId: `ticket-${++sequence}` });
const historyWithEvidence = (activeDays, completedStudyActivities) => ({
  systemEvents: Array.from({ length: completedStudyActivities }, (_, index) => {
    const dayIndex = Math.min(activeDays - 1, Math.floor(index * activeDays / completedStudyActivities));
    const activityDate = new Date(Date.UTC(2020, 0, 1 + dayIndex)).toISOString().slice(0, 10);
    return {
      id: `rank-evidence-${index}`, type: 'quest.completed',
      timestamp: `${activityDate}T12:00:00.000Z`, idempotencyKey: `rank-evidence-${index}`,
      metadata: { activityDate, questId: `rank-evidence-${index}` },
    };
  }),
  xpEvents: [],
});
const snapshot = (xp = 0, progressHistory = { systemEvents: [], xpEvents: [] }) => {
  const currentRankId = ranks.rankDefinitionForProgress(xp, progressHistory).id;
  return {
    date: '2026-04-01', totalXp: xp, activeBatchId: 'batch-alpha',
    batches: [{ id: 'batch-alpha', subjects: [{ id: 'maths', name: 'Maths', topics: [] }] }],
    ncertBooks: [], calculationHistory: [], studyTools: { bossTests: [] }, progressHistory,
    rpg: system.createEmptyRpgState(xp, '2026-04-01T12:00:00.000Z', currentRankId),
  };
};
const snapshotForRank = (rankId) => {
  const requirements = ranks.RANK_REQUIREMENTS[rankId];
  return snapshot(requirements.minimumXp,
    historyWithEvidence(requirements.minimumActiveDays, requirements.minimumStudyActivities));
};
const command = (state, value, time) => system.applyRpgCommand(state, value, ticket(time));
const activity = (state, type, id, metadata, time = '2026-04-01T12:00:01.000Z') => ({
  ...state,
  progressHistory: { ...state.progressHistory, systemEvents: [
    ...state.progressHistory.systemEvents,
    { id, type, timestamp: time, idempotencyKey: id, metadata },
  ] },
});
const enter = (state, gateId, time) => command(state, { type: 'enter-gate', gateId }, time);
function assertRewarded(state, expectedXp, itemId) {
  assert.equal(state.totalXp, expectedXp);
  assert.ok(state.rpg.inventory[itemId]?.quantity > 0);
  assert.equal(state.rpg.gates[Object.keys(state.rpg.gates).find((id) => state.rpg.gates[id].completed)].completed, true);
}

assert.equal(JSON.stringify(catalog.GATE_DEFINITIONS.map((gate) => [gate.type, gate.requiredLevel, gate.timeLimitSeconds, gate.rewards.xp])), JSON.stringify([
  ['normal', 1, 1200, 120], ['difficult', 6, 1800, 180], ['special', 3, 600, 150], ['boss', 12, 1800, 250],
]));
assert.deepEqual(catalog.EQUIPMENT_SLOTS.length, 6);
assert.equal(new Set(catalog.ITEM_DEFINITIONS.map((item) => item.category)).size, 7);
assert.deepEqual(new Set(catalog.ITEM_DEFINITIONS.map((item) => item.rarity)).size, 5);
assert.equal(catalog.getGateDefinition('unknown'), undefined);
assert.equal(catalog.getItemDefinition('unknown'), undefined);
assert.equal(catalog.getGateEligibility(catalog.getGateDefinition('gate-ncert-depths'), 4_999).eligible, false);
assert.equal(catalog.getGateEligibility(catalog.getGateDefinition('gate-ncert-depths'), 5_000).eligible, false);
assert.equal(catalog.getGateEligibility(catalog.getGateDefinition('gate-ncert-depths'), 20_000).eligible, true);
const rankLockedGate = { ...catalog.getGateDefinition('gate-ncert-depths'), requiredLevel: 1, requiredRankId: 'rank-b' };
assert.equal(catalog.getGateEligibility(rankLockedGate, 0).levelMet, true);
assert.equal(catalog.getGateEligibility(rankLockedGate, 0).rankMet, false);
assert.equal(catalog.getGateEligibility(rankLockedGate, 20_000, 'rank-b').eligible, true);
assert.equal(catalog.getGateEligibility(catalog.getGateDefinition('gate-ncert-depths'), 6_000).eligible, false);
assert.throws(() => enter(snapshot(0), 'gate-ncert-depths'), /Requires Level 6/);

let normal = snapshot();
const initialEntry = ticket();
normal = system.applyRpgCommand(normal, { type: 'enter-gate', gateId: 'gate-maths-lecture' }, initialEntry);
assert.equal(normal.rpg.activeAttemptId, `attempt:${initialEntry.ticketId}`);
assert.equal(system.applyRpgCommand(normal, { type: 'enter-gate', gateId: 'gate-maths-lecture' }, initialEntry), normal,
  'strict replay must reuse the original command result');
assert.equal(system.getActiveGateAttempt(normal.rpg).batchId, 'batch-alpha');
const beforeOldLecture = normal;
const historicalLecture = activity(normal, 'lecture.completed', 'old-lecture', {
  batchId: 'batch-alpha', subjectId: 'maths', lectureIdentity: 'old-path',
}, '2026-04-01T11:59:59.000Z');
assert.equal(system.advanceRpgStudyState(normal, historicalLecture, ticket()), historicalLecture);
let normalNext = activity(normal, 'lecture.completed', 'lecture-one', {
  batchId: 'batch-alpha', subjectId: 'maths', lectureIdentity: 'batch-alpha/math/topic/lecture-1',
});
normal = system.advanceRpgStudyState(normal, normalNext, ticket());
assertRewarded(normal, 120, 'gate-key');
assert.equal(normal.rpg.attempts[0].status, 'cleared');
assert.equal(normal.rpg.claimedRewardKeys.length, 1);
assert.equal(system.getActiveGateAttempt(normal.rpg), null);
const normalReplay = system.advanceRpgStudyState(beforeOldLecture, normalNext, ticket());
assert.equal(normalReplay.totalXp, normal.totalXp);
assert.equal(JSON.stringify(normalReplay.rpg.events.map((event) => event.id)), JSON.stringify(normal.rpg.events.map((event) => event.id)));
assert.throws(() => enter(normal, 'gate-maths-lecture'), /already been cleared/);
assert.equal(beforeOldLecture.rpg.gates['gate-maths-lecture'].completed, false);

let ncert = enter(snapshotForRank('rank-b'), 'gate-ncert-depths');
ncert = system.advanceRpgStudyState(ncert, activity(ncert, 'ncert.session', 'ncert-a', { bookId: 'book-7', sessionNumber: 4 }), ticket());
assert.equal(ncert.rpg.attempts[0].progress, 1);
ncert = system.advanceRpgStudyState(ncert, activity(ncert, 'ncert.session', 'ncert-b', { bookId: 'book-7', sessionNumber: 5 }), ticket());
assertRewarded(ncert, 20_180, 'scholar-core');
const persistedNcert = system.normalizeRpgState(JSON.parse(JSON.stringify(ncert.rpg)), ncert.totalXp);
assert.equal(persistedNcert.gates['gate-ncert-depths'].completed, true);
assert.equal(persistedNcert.claimedRewardKeys.length, 1);

let calc = enter(snapshotForRank('rank-c'), 'gate-calculation-citadel');
calc = system.advanceRpgStudyState(calc, activity(calc, 'calculation.session', 'calc-bad', {
  activityId: 'calc-bad', questions: 10, correct: 7, accuracy: 70,
}), ticket());
assert.equal(calc.rpg.attempts[0].progress, 0);
calc = system.advanceRpgStudyState(calc, activity(calc, 'calculation.session', 'calc-good', {
  activityId: 'calc-new-uuid', questions: 10, correct: 8, accuracy: 80,
}), ticket());
assertRewarded(calc, 8_650, 'xp-crystal');

let boss = enter(snapshotForRank('rank-a'), 'gate-boss-record');
boss = system.advanceRpgStudyState(boss, activity(boss, 'boss.activity', 'boss-new', {
  activityId: 'boss-uuid', batchId: 'batch-alpha', correct: 4, total: 5,
}), ticket());
assertRewarded(boss, 42_250, 'reward-chest');
assert.equal(boss.rpg.inventory['study-coins'].quantity, 50);
let taggedBoss = enter(snapshotForRank('rank-a'), 'gate-boss-record');
taggedBoss = system.advanceRpgStudyState(taggedBoss, activity(taggedBoss, 'boss.activity', 'boss-wrong-tag', {
  activityId: 'boss-wrong-tag', batchId: 'batch-alpha', correct: 5, total: 5, gateAttemptId: 'different-attempt',
}), ticket());
assert.equal(taggedBoss.rpg.attempts[0].progress, 0);
const taggedAttemptId = taggedBoss.rpg.activeAttemptId;
taggedBoss = system.advanceRpgStudyState(taggedBoss, activity(taggedBoss, 'boss.activity', 'boss-matching-tag', {
  activityId: 'boss-matching-tag', batchId: 'batch-alpha', correct: 5, total: 5, gateAttemptId: taggedAttemptId,
}), ticket());
assertRewarded(taggedBoss, 42_250, 'reward-chest');

let directNcert = snapshotForRank('rank-b');
directNcert.ncertBooks = [{ id: 'book-direct', title: 'Book', classId: 'class-2', completedSessions: 0, totalSessions: 6 }];
directNcert = enter(directNcert, 'gate-ncert-depths');
let directNcertNext = {
  ...directNcert,
  ncertBooks: [{ ...directNcert.ncertBooks[0], completedSessions: 1 }],
};
directNcert = system.advanceRpgStudyState(directNcert, directNcertNext, ticket());
assert.equal(directNcert.rpg.attempts[0].progress, 1);
directNcertNext = { ...directNcert, ncertBooks: [{ ...directNcert.ncertBooks[0], completedSessions: 2 }] };
directNcert = system.advanceRpgStudyState(directNcert, directNcertNext, ticket());
assertRewarded(directNcert, 20_180, 'scholar-core');

let directBoss = snapshotForRank('rank-a');
directBoss.studyTools.bossTests = [];
directBoss = enter(directBoss, 'gate-boss-record');
const taggedWrong = {
  ...directBoss,
  studyTools: { bossTests: [{ id: 'boss-other-attempt', batchId: 'batch-alpha', gateAttemptId: 'different-attempt',
    results: Array.from({ length: 5 }, () => ({ correct: true })) }] },
};
directBoss = system.advanceRpgStudyState(directBoss, taggedWrong, ticket());
assert.equal(directBoss.rpg.attempts[0].progress, 0);
const taggedRight = {
  ...directBoss,
  studyTools: { bossTests: [{ id: 'boss-for-this-attempt', batchId: 'batch-alpha',
    gateAttemptId: directBoss.rpg.activeAttemptId, results: Array.from({ length: 5 }, () => ({ correct: true })) }] },
};
directBoss = system.advanceRpgStudyState(directBoss, taggedRight, ticket());
assertRewarded(directBoss, 42_250, 'reward-chest');

let failure = enter(snapshot(), 'gate-maths-lecture');
failure = command(failure, { type: 'abandon-gate', attemptId: failure.rpg.activeAttemptId });
assert.equal(failure.rpg.attempts[0].status, 'abandoned');
assert.equal(failure.totalXp, 0);
failure = enter(failure, 'gate-maths-lecture');
const expired = command(failure, { type: 'refresh-clock' }, '2026-04-01T12:21:00.000Z');
assert.equal(expired.rpg.attempts[1].status, 'failed');
assert.equal(expired.totalXp, 0);
assert.equal(expired.rpg.presentationQueue.some((id) => id.endsWith(':failed')), true);

let chest = snapshot();
chest.rpg.inventory['reward-chest'] = { itemId: 'reward-chest', quantity: 2 };
chest = command(chest, { type: 'use-item', itemId: 'reward-chest' });
assert.equal(chest.rpg.inventory['reward-chest'].quantity, 1);
assert.equal(chest.rpg.inventory['achievement-relic'].quantity, 1);
assert.equal(chest.rpg.inventory['xp-crystal'].quantity, 2);
assert.equal(chest.rpg.events.filter((event) => event.type === 'chest.opened').length, 1);
assert.ok(chest.rpg.acquisitions.some((acquisition) => acquisition.itemId === 'quest-lens'));
const chestReplay = system.applyRpgCommand(chest, { type: 'use-item', itemId: 'reward-chest' }, {
  timestamp: '2026-04-01T12:00:00.000Z', ticketId: 'ticket-unique-unused',
});
assert.equal(chestReplay.rpg.inventory['reward-chest']?.quantity ?? 0, 0);

let use = snapshot();
use.rpg.inventory['xp-crystal'] = { itemId: 'xp-crystal', quantity: 2 };
use = command(use, { type: 'use-item', itemId: 'xp-crystal' });
assert.equal(use.totalXp, 25);
assert.equal(use.rpg.inventory['xp-crystal'].quantity, 1);
assert.equal(system.getItemUseAvailability(use.rpg, 'study-coins', '2026-04-01T12:00:00Z').usable, false);

let equipment = snapshot();
equipment.rpg.inventory['scholar-core'] = { itemId: 'scholar-core', quantity: 1 };
equipment.rpg.inventory['revision-relic'] = { itemId: 'revision-relic', quantity: 1 };
equipment = command(equipment, { type: 'equip-item', itemId: 'scholar-core' });
const sameEquip = system.applyRpgCommand(equipment, { type: 'equip-item', itemId: 'scholar-core' }, ticket());
assert.equal(sameEquip.rpg.events.filter((event) => event.type === 'equipment.equipped').length, 1);
equipment = command(equipment, { type: 'equip-item', itemId: 'revision-relic' });
assert.equal(equipment.rpg.effects.ncertXpPercent, 5);
assert.equal(equipment.rpg.effects.revisionTimeMultiplier, 2);
equipment = command(equipment, { type: 'unequip-slot', slot: 'xp-boost' });
assert.equal(equipment.rpg.effects.ncertXpPercent, 0);
assert.equal(equipment.rpg.inventory['scholar-core'].quantity, 1);
assert.throws(() => command(equipment, { type: 'equip-item', itemId: 'gate-key' }), /not equippable/);
assert.throws(() => command(equipment, { type: 'equip-item', itemId: 'focus-crystal' }), /do not own/);

let timer = snapshot();
timer.rpg.inventory['life-potion'] = { itemId: 'life-potion', quantity: 1 };
timer = enter(timer, 'gate-maths-lecture');
const beforeDeadline = system.getActiveGateAttempt(timer.rpg).deadlineAt;
timer = command(timer, { type: 'use-item', itemId: 'life-potion' });
assert.equal(Date.parse(system.getActiveGateAttempt(timer.rpg).deadlineAt) - Date.parse(beforeDeadline), 60_000);
assert.equal(system.getItemUseAvailability(timer.rpg, 'life-potion', '2026-04-01T12:00:01Z').reason, 'This item was already used during this attempt.');

const malformed = system.normalizeRpgState({
  version: 99, inventory: { 'xp-crystal': { itemId: 'xp-crystal', quantity: 3 }, fake: { quantity: 9 } },
  loadout: { 'xp-boost': 'not-owned', broken: 'bad' }, attempts: [{ id: 'bad' }], events: [{ type: 'nope' }],
}, 0);
assert.equal(malformed.inventory['xp-crystal'].quantity, 3);
assert.equal(malformed.inventory.fake, undefined);
assert.equal(malformed.loadout['xp-boost'], null);
assert.ok(malformed.malformedRaw);
assert.equal(system.normalizeRpgState(undefined, 42_000).gates['gate-boss-record'].unlocked, true);
assert.equal(system.normalizeRpgState(undefined, 12_000).events.length, 0);

let unlocks = snapshot(8_499, historyWithEvidence(21, 50));
const unlocked = system.advanceRpgStudyState(unlocks, { ...unlocks, totalXp: 8_500 }, ticket());
assert.equal(unlocked.rpg.gates['gate-calculation-citadel'].unlocked, true);
assert.equal(unlocked.rpg.events.filter((event) => event.type === 'gate.unlocked').length, 1);
assert.equal(unlocked.rpg.presentationQueue.length, 1);

let boostedGate = snapshot();
boostedGate.rpg.inventory['focus-crystal'] = { itemId: 'focus-crystal', quantity: 1 };
boostedGate.rpg.inventory['achievement-relic'] = { itemId: 'achievement-relic', quantity: 1 };
boostedGate.rpg.loadout['study-boost'] = 'focus-crystal';
boostedGate.rpg.loadout['achievement-relic'] = 'achievement-relic';
boostedGate.rpg.effects = system.computeLoadoutEffects(boostedGate.rpg);
assert.equal(boostedGate.rpg.effects.gateXpPercent, 5);
boostedGate = enter(boostedGate, 'gate-maths-lecture');
const boostedActivity = activity(boostedGate, 'lecture.completed', 'boosted-lecture', {
  batchId: 'batch-alpha', subjectId: 'maths', lectureIdentity: 'boosted',
});
boostedGate = system.advanceRpgStudyState(boostedGate, boostedActivity, ticket());
assert.equal(boostedGate.totalXp, 126);
assert.equal(boostedGate.rpg.events.find((event) => event.type === 'gate.cleared').xpDelta, 126);

let questState = snapshot();
questState.rpg.inventory['scholar-core'] = { itemId: 'scholar-core', quantity: 1 };
questState = command(questState, { type: 'equip-item', itemId: 'scholar-core' });
const questCompleted = {
  ...questState, totalXp: 100,
  progressHistory: {
    systemEvents: [...questState.progressHistory.systemEvents, {
      id: 'quest-event', type: 'quest.completed', timestamp: '2026-04-01T12:00:01.000Z',
      idempotencyKey: 'quest:2026-04-01:ncert-reading:completed',
      metadata: { questId: 'ncert-reading', questDate: '2026-04-01' },
    }],
    xpEvents: [{
      id: 'quest-xp', amount: 100, source: 'quest', relatedActivityId: 'ncert-reading',
      timestamp: '2026-04-01T12:00:01.000Z', idempotencyKey: 'quest-xp-key',
      activityDate: '2026-04-01', metadata: { questId: 'ncert-reading' },
    }],
  },
};
questState = system.advanceRpgStudyState(questState, questCompleted, ticket());
assert.equal(questState.totalXp, 105);
assert.equal(questState.rpg.events.find((event) => event.type === 'equipment.bonus').xpDelta, 5);
const questReversed = {
  ...questState, totalXp: 5,
  progressHistory: {
    ...questState.progressHistory,
    xpEvents: [...questState.progressHistory.xpEvents, {
      id: 'quest-reversal', amount: -100, source: 'quest-reversal', relatedActivityId: 'ncert-reading',
      timestamp: '2026-04-01T12:00:02.000Z', idempotencyKey: 'quest-reversal-key',
      activityDate: '2026-04-01', metadata: { questId: 'ncert-reading', reversal: true },
    }],
  },
};
questState = system.advanceRpgStudyState(questState, questReversed, ticket());
assert.equal(questState.totalXp, 0);
assert.equal(questState.rpg.events.find((event) => event.type === 'equipment.bonus-reversed').xpDelta, -5);

console.log('RPG domain tests passed');