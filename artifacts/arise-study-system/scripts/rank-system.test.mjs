import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  STORAGE_KEY, batchPayload, createProviderRuntime, legacyPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  assert.match(name, /^@\/contexts\/(?:rankSystem|progressHistory|progressHistorySchema|progressHistoryRecords|progressHistoryTransitions)$/);
  const sourcePath = `../contexts/${name.slice('@/contexts/'.length)}.ts`;
  const compiled = ts.transpileModule(readFileSync(new URL(sourcePath, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  modules.set(name, exports);
  vm.runInNewContext(compiled, { exports, require: load, Date, Math }, { filename: sourcePath });
  return exports;
}
const ranks = load('@/contexts/rankSystem');
const historyApi = load('@/contexts/progressHistory');
const plain = (value) => JSON.parse(JSON.stringify(value));
const expected = [
  ['rank-e', 'E-RANK', 1, 0],
  ['rank-d', 'D-RANK', 4, 3000],
  ['rank-c', 'C-RANK', 9, 8500],
  ['rank-b', 'B-RANK', 21, 20000],
  ['rank-a', 'A-RANK', 43, 42000],
  ['rank-s', 'S-RANK', 86, 85000],
  ['rank-ss', 'SS-RANK', 141, 140000],
  ['rank-sss', 'SSS-RANK', 221, 220000],
];

function historyWithEvidence(activeDays, completedStudyActivities) {
  const history = plain(historyApi.createEmptyProgressHistory());
  const firstDate = Date.UTC(2020, 0, 1);
  history.systemEvents = Array.from({ length: completedStudyActivities }, (_, index) => {
    const dayIndex = Math.min(activeDays - 1, Math.floor(index * activeDays / Math.max(1, completedStudyActivities)));
    const activityDate = new Date(firstDate + dayIndex * 86_400_000).toISOString().slice(0, 10);
    return {
      id: `rank-evidence-${index}`,
      type: 'quest.completed',
      timestamp: `${activityDate}T12:00:00.000Z`,
      idempotencyKey: `rank-evidence-${index}`,
      metadata: { activityDate, questId: `rank-evidence-quest-${index}` },
    };
  });
  return history;
}

test('eight earnable definitions have ordered thresholds and complete stable metadata', () => {
  assert.deepEqual(plain(ranks.RANK_DEFINITIONS.map((rank) =>
    [rank.id, rank.displayName, rank.minimumLevel, rank.minimumXp])), expected);
  assert.equal(ranks.RANK_DEFINITIONS.length, 8);
  assert.equal(ranks.LEGACY_RANK_DEFINITIONS.length, 2);
  assert.equal(new Set([...ranks.RANK_DEFINITIONS, ...ranks.LEGACY_RANK_DEFINITIONS]
    .map((rank) => rank.crownVariant)).size, 10);
  assert.ok(Object.isFrozen(ranks.RANK_DEFINITIONS));
  for (const rank of ranks.RANK_DEFINITIONS) {
    assert.ok(Object.isFrozen(rank));
    assert.ok(rank.announcement.length > 0);
    assert.ok(rank.visualTier);
    assert.deepEqual(plain(rank.futureUnlockHooks), ['gates', 'inventory', 'equipment']);
    assert.equal(ranks.levelFromTotalXp(rank.minimumXp), rank.minimumLevel);
    assert.equal(ranks.rankArtworkKey(rank.id), rank.id);
  }
});

for (let index = 0; index < expected.length; index += 1) {
  const [id, displayName, minimumLevel, minimumXp] = expected[index];
  test(`${displayName}: just below, at, and just above its XP and level thresholds`, () => {
    const previous = expected[Math.max(0, index - 1)][1];
    const xpOnlyBoundary = (minimumLevel - 1) * ranks.XP_PER_LEVEL;
    assert.equal(ranks.rankFromXp(xpOnlyBoundary - 1), previous);
    assert.equal(ranks.rankFromXp(xpOnlyBoundary), displayName);
    assert.equal(ranks.rankFromXp(xpOnlyBoundary + 1), displayName);
    assert.ok(minimumXp >= xpOnlyBoundary);
    assert.equal(ranks.rankForLevel(minimumLevel - 1), previous);
    assert.equal(ranks.rankForLevel(minimumLevel), displayName);
    assert.equal(ranks.rankDefinitionForLevel(minimumLevel).id, id);
  });
}

test('whole-rank artwork resolution distinguishes SS, SSS, and Hidden, including exact aliases', () => {
  for (const [input, id, variant] of [
    ['SS-RANK', 'rank-ss', 'double-halo-crown'],
    ['sss-rank', 'rank-sss', 'triple-halo-crown'],
    ['Hidden/Transcendent', 'rank-transcendent', 'void-crown'],
    ['rank-hidden-transcendent', 'rank-transcendent', 'void-crown'],
    ['Hidden', 'rank-hidden', 'eclipse-crown'],
  ]) {
    assert.equal(ranks.rankArtworkKey(input), id);
    assert.equal(ranks.rankDefinitionFor(input).crownVariant, variant);
  }
  for (const [id, displayName] of expected) {
    assert.equal(ranks.rankDefinitionFor(displayName).id, id);
    const short = id.replace(/^rank-/, '');
    assert.equal(ranks.rankDefinitionFor(short).id, id);
  }
  assert.equal(ranks.rankFromXp(999999), 'SSS-RANK');
});

test('rank advancement requires XP, distinct active study days and unique completed study events', () => {
  for (let index = 1; index < expected.length; index += 1) {
    const [rankId, displayName] = expected[index];
    const requirement = ranks.RANK_REQUIREMENTS[rankId];
    const enoughEvidence = historyWithEvidence(requirement.minimumActiveDays, requirement.minimumStudyActivities);
    assert.equal(ranks.rankForProgress(requirement.minimumXp, enoughEvidence), displayName);
    assert.equal(ranks.rankForProgress(requirement.minimumXp - 1, enoughEvidence), expected[index - 1][1]);
    assert.equal(ranks.rankForProgress(requirement.minimumXp,
      historyWithEvidence(requirement.minimumActiveDays - 1, requirement.minimumStudyActivities)), expected[index - 1][1]);
    assert.equal(ranks.rankForProgress(requirement.minimumXp,
      historyWithEvidence(requirement.minimumActiveDays, requirement.minimumStudyActivities - 1)), expected[index - 1][1]);
  }
  const duplicated = historyWithEvidence(7, 14);
  duplicated.systemEvents[13] = { ...duplicated.systemEvents[0] };
  assert.equal(ranks.rankEvidenceFromHistory(duplicated).completedStudyActivities, 13);
  assert.equal(ranks.rankForProgress(3000, duplicated), 'E-RANK');
  assert.equal(ranks.rankDefinitionForProgress(220000, { systemEvents: [
    { id: 'xp-only', type: 'xp.awarded', timestamp: '2026-10-01T12:00:00.000Z', idempotencyKey: 'xp-only', metadata: { activityDate: '2026-10-01' } },
    { id: 'rank-only', type: 'rank.changed', timestamp: '2026-10-02T12:00:00.000Z', idempotencyKey: 'rank-only', metadata: { activityDate: '2026-10-02' } },
  ] }).id, 'rank-e');
});

test('malformed and unknown rank/XP/level inputs fall back safely without first-character parsing', () => {
  for (const input of [undefined, null, {}, [], 20, '', 'SOME-UNKNOWN-RANK', 'SSSS', 'ghost']) {
    assert.equal(ranks.rankDefinitionFor(input).id, 'rank-e');
    assert.equal(ranks.rankArtworkKey(input), 'rank-e');
  }
  for (const input of [undefined, null, {}, '49000', -100, NaN, Infinity, -Infinity]) {
    assert.equal(ranks.rankFromXp(input), 'E-RANK');
    assert.equal(ranks.rankForLevel(input), 'E-RANK');
  }
});

test('a real transition carries stable IDs, timestamp and progression value and replay is idempotent', () => {
  const historyWithRankEvidence = historyWithEvidence(450, 1500);
  const previous = { totalXp: 139990, date: '2026-10-01', progressHistory: historyWithRankEvidence };
  const next = { totalXp: 140070, date: '2026-10-01', progressHistory: historyWithRankEvidence };
  const ticket = { ticketId: 'fixed-rank-action', timestamp: '2026-10-01T12:00:00.000Z' };
  const history = historyApi.captureProgressHistoryTransition(previous, next,
    historyWithRankEvidence, ticket);
  const events = history.systemEvents.filter((event) => event.type === 'rank.changed');
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.timestamp, ticket.timestamp);
  assert.ok(event.id && event.idempotencyKey);
  assert.equal(event.metadata.previousRank, 'S-RANK');
  assert.equal(event.metadata.rank, 'SS-RANK');
  assert.equal(event.metadata.previousRankId, 'rank-s');
  assert.equal(event.metadata.rankId, 'rank-ss');
  assert.equal(event.metadata.previousTotalXp, 139990);
  assert.equal(event.metadata.totalXp, 140070);
  assert.equal(event.metadata.progressionValue, 140070);
  assert.equal(event.metadata.level, 141);
  const replay = historyApi.captureProgressHistoryTransition(previous, next, history, ticket);
  assert.deepEqual(plain(replay.systemEvents.filter((item) => item.type === 'rank.changed')), plain(events));
  const reloaded = historyApi.normalizeProgressHistory(plain(replay));
  const unchanged = historyApi.captureProgressHistoryTransition(next, next, reloaded, {
    ticketId: 'after-reload', timestamp: '2026-10-01T13:00:00.000Z',
  });
  assert.deepEqual(plain(unchanged.systemEvents.filter((item) => item.type === 'rank.changed')), plain(events));
});

test('a multi-threshold award records one real prior-to-final transition, with no intermediate history', () => {
  const evidence = historyWithEvidence(700, 2600);
  const history = historyApi.captureProgressHistoryTransition(
    { totalXp: 999, date: '2026-10-01', progressHistory: evidence },
    { totalXp: 220000, date: '2026-10-01', progressHistory: evidence },
    evidence,
    { ticketId: 'large-real-award', timestamp: '2026-10-01T12:00:00.000Z' },
  );
  const events = history.systemEvents.filter((event) => event.type === 'rank.changed');
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.previousRankId, 'rank-e');
  assert.equal(events[0].metadata.rankId, 'rank-sss');
});

test('legacy hydration recalculates rank from real XP without resetting progress or backfilling ranks', async (t) => {
  for (const totalXp of [2345, 4321, 19321, 29321, 39321, 49321]) {
    const original = JSON.parse(legacyPayload({
      totalXp,
      blackBookPage: 37,
      blackBookTotal: 10000,
      vocabularySections: [{ id: 'legacy-words', title: 'Saved words', pages: 10000, completed: 37 }],
      calculationHistory: [{
        id: 'prior-calculation', date: '2026-10-01', questions: 10,
        correct: 8, accuracy: 80, duration: 90,
      }],
    }));
    const storage = mockStorage([[STORAGE_KEY, JSON.stringify(original)]]);
    const provider = await mountProvider(t, storage);
    const state = provider.current.state;
    assert.equal(state.totalXp, totalXp);
    assert.equal(provider.current.level, ranks.levelFromTotalXp(totalXp));
    assert.equal(provider.current.rank, ranks.rankForProgress(totalXp, state.progressHistory));
    for (const key of ['streak', 'blackBookPage', 'blackBookTotal',
      'calculationHistory']) {
      assert.deepEqual(plain(state[key]), original[key], `Saved ${key} is unchanged`);
    }
    const migratedLectures = state.batches[0].subjects[0].topics[0].lectures;
    assert.equal(migratedLectures.filter((lecture) => lecture.status === 'completed').length, 3);
    assert.equal(migratedLectures.length, 4);
    assert.equal(state.progressHistory.systemEvents.filter((event) => event.type === 'rank.changed').length, 0);
    await provider.unmount();
  }
});

test('existing rich study data and prior history survive rank recalculation unchanged', async (t) => {
  // Construct a populated canonical save through the actual provider/actions,
  // rather than comparing partial import fixtures with normalizer-added fields.
  const priorHistory = plain(historyApi.createEmptyProgressHistory());
  priorHistory.systemEvents.push({
    id: 'saved-rank-event', type: 'rank.changed',
    timestamp: '2026-09-29T12:00:00.000Z', idempotencyKey: 'saved-rank-event',
    metadata: { previousRank: 'A-RANK', rank: 'S-RANK', previousLevel: 19, level: 20, totalXp: 19000 },
  });
  const seedStorage = mockStorage([[STORAGE_KEY, batchPayload({
    totalXp: 49000,
    progressHistory: priorHistory,
    achievementHistory: { highestObservedStreak: 8, earnedRelicIds: ['streak-7'] },
    batches: [{
      id: 'saved-batch', name: 'Saved batch', source: 'Saved course',
      startDate: '2026-10-01', createdAt: '2026-10-01T09:00:00.000Z', isActive: true,
      subjects: [{
        id: 'maths', name: 'Maths', topics: [{
          id: 'saved-topic', title: 'Saved topic', category: 'ARITHMETIC', isArchived: false,
          lectures: [{
            id: 'saved-lecture', title: 'Previously completed lecture', link: '',
            status: 'completed', xpReward: 50, sessionCount: 2,
            firstStartedAt: '2026-09-30T09:00:00.000Z', lastStartedAt: '2026-09-30T10:00:00.000Z',
            completedAt: '2026-09-30T10:05:00.000Z', xpEarnedOn: '2026-09-30',
            xpAwarded: true, isArchived: false,
          }],
        }],
      }],
    }],
  })]]);
  const seed = await mountProvider(t, seedStorage);
  await seed.edit((study) => {
    study.completeQuest('morning-workout');
    study.addCalculationSession({ questions: 10, correct: 8, accuracy: 80, duration: 90 });
    study.saveReviewCard({
      batchId: 'saved-batch', subjectId: 'maths', topicTitle: 'Saved topic',
      question: 'What is 2 + 2?', answer: '4',
    });
    study.advanceNcertBookSession(study.state.ncertBooks[0].id);
    study.addNcertVocabulary(study.state.ncertBooks[0].id, 'preserved word');
    study.completeVocabularyPage(study.state.vocabularySections[0].id);
  });
  const card = seed.current.state.studyTools.reviewCards[0];
  await seed.edit((study) => study.saveBossTest({
    batchId: 'saved-batch', weekStart: '2026-09-28',
    results: [{
      cardId: card.id, question: card.question, expectedAnswer: card.answer,
      answer: '4', correct: true, topicTitle: card.topicTitle, subjectId: card.subjectId,
    }],
    weakTopics: ['Previously noted topic'],
  }));
  const original = JSON.parse(seed.snapshot());
  assert.ok(original.calculationHistory.length > 0);
  assert.ok(original.studyTools.bossTests.length > 0);
  assert.ok(original.ncertBooks.some((book) => book.completedSessions > 0));
  assert.ok(original.ncertBooks.some((book) => book.vocabulary.includes('preserved word')));
  assert.ok(original.quests.some((quest) => quest.completed));
  assert.ok(original.achievementHistory.earnedRelicIds.includes('streak-7'));
  await seed.unmount();
  const storage = mockStorage([[STORAGE_KEY, JSON.stringify(original)]]);
  const first = await mountProvider(t, storage);
  const before = JSON.parse(first.snapshot());
  assert.equal(first.current.rank, ranks.rankForProgress(before.totalXp, before.progressHistory));
  assert.deepEqual(before, original, 'Every populated canonical field is preserved on hydration');
  await first.unmount();
  const reloaded = await mountProvider(t, storage);
  const after = JSON.parse(reloaded.snapshot());
  for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `${key} survives rank reload`);
  for (const key of ['totalXp', 'batches', 'activeBatchId', 'achievementHistory', 'ncertBooks',
    'ncertProgressLedger', 'blackBookPage', 'blackBookTotal', 'calculationHistory', 'studyTools']) {
    if (Object.hasOwn(original, key)) assert.deepEqual(after[key], original[key], `${key} remains unchanged`);
  }
  assert.deepEqual(after.progressHistory.systemEvents.filter((event) => event.type === 'rank.changed'),
    original.progressHistory.systemEvents.filter((event) => event.type === 'rank.changed'));
});

test('every upward provider rank crossing is exactly once, survives reload, and does not repeat for a retried quest', async (t) => {
  for (let index = 1; index < expected.length; index += 1) {
    const [rankId, displayName, , xp] = expected[index];
    const requirement = ranks.RANK_REQUIREMENTS[rankId];
    const evidence = historyWithEvidence(
      requirement.minimumActiveDays - 1,
      requirement.minimumStudyActivities - 1,
    );
    const storage = mockStorage([[STORAGE_KEY, batchPayload({ totalXp: xp - 40, progressHistory: evidence })]]);
    const runtime = createProviderRuntime(storage);
    const provider = await mountProvider(t, storage, { runtime, strictMode: true });
    assert.equal(provider.current.rank, expected[index - 1][1]);
    await provider.edit((study) => {
      study.completeQuest('morning-workout');
      study.completeQuest('morning-workout');
    });
    const milestoneXp = rankId === 'rank-s' ? 200 : 0;
    assert.equal(provider.current.state.totalXp, xp + 40 + milestoneXp);
    assert.equal(provider.current.rank, displayName);
    const events = plain(provider.current.state.progressHistory.systemEvents.filter((event) => event.type === 'rank.changed'));
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.previousRankId, expected[index - 1][0]);
    assert.equal(events[0].metadata.rankId, rankId);
    const snapshot = JSON.parse(provider.snapshot());
    await provider.unmount();
    const reloaded = await mountProvider(t, storage, { runtime });
    assert.equal(reloaded.current.rank, displayName);
    assert.equal(reloaded.current.state.totalXp, xp + 40 + milestoneXp);
    assert.deepEqual(JSON.parse(reloaded.snapshot()), snapshot);
    await reloaded.edit((study) => study.completeQuest('morning-workout'));
    assert.deepEqual(plain(reloaded.current.state.progressHistory.systemEvents
      .filter((event) => event.type === 'rank.changed')), events);
    await reloaded.unmount();
  }
});