import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));

function loadTypeScript(relativePath, dependencies = {}) {
  const path = join(mobileRoot, relativePath);
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require(request) {
      assert.ok(Object.hasOwn(dependencies, request), `Unexpected module dependency: ${request}`);
      return dependencies[request];
    },
    Date,
    Math,
    Number,
    Set,
    Array,
    Object,
  }, { filename: path });
  return exports;
}

const historyDomain = loadTypeScript('contexts/achievementHistory.ts');
const badgeAdapter = loadTypeScript('components/earnedBadges.ts', {
  '@/contexts/achievementHistory': historyDomain,
});

const evidence = (overrides = {}) => ({
  streak: 0,
  batches: [],
  calculationHistory: [],
  blackBookPage: 0,
  blackBookTotal: 0,
  bossTests: [],
  ncertBooks: [],
  ...overrides,
});

const ids = (history) => [...history.earnedRelicIds];
const badge = (badges, id) => badges.find((item) => item.id === id);

test('streak relic history survives a rollover and keeps current and observed streak wording honest', () => {
  const realSavedState = evidence({ streak: 8 });
  const beforeRollover = historyDomain.updateAchievementHistory(undefined, realSavedState, realSavedState.streak);
  const afterBreak = historyDomain.updateAchievementHistory(beforeRollover, evidence({ streak: 0 }), 0);

  assert.equal(afterBreak.highestObservedStreak, 8);
  assert.deepEqual(ids(afterBreak), ['streak-7']);
  const badges = badgeAdapter.deriveBadges([], 0, 0, { streak: 0, achievementHistory: afterBreak });
  assert.equal(badge(badges, 'streak-7').earned, true);
  assert.equal(badge(badges, 'streak-30').earned, false);
  assert.match(badge(badges, 'streak-7').detail, /Highest observed streak 8 days · current streak 0 days/);
  assert.doesNotMatch(badge(badges, 'streak-7').detail, /\d{4}-\d{2}-\d{2}/);
});

test('a genuinely clean new account starts with zero streak and zero achievement history', () => {
  const initial = historyDomain.createEmptyAchievementHistory();
  const next = historyDomain.updateAchievementHistory(initial, evidence({ streak: 0 }), 0);

  assert.equal(next.highestObservedStreak, 0);
  assert.deepEqual(ids(next), []);
  assert.equal(badge(badgeAdapter.deriveBadges([], 0, 0, {
    streak: 0,
    achievementHistory: next,
  }), 'streak-7').earned, false);
});

test('malformed metadata is rejected while future fields and future relic IDs round-trip', () => {
  for (const malformed of [
    null,
    [],
    { highestObservedStreak: -1, earnedRelicIds: [] },
    { highestObservedStreak: 7.5, earnedRelicIds: [] },
    { highestObservedStreak: 7, earnedRelicIds: 'streak-7' },
    { highestObservedStreak: 0, earnedRelicIds: ['streak-7'] },
    { highestObservedStreak: 7, earnedRelicIds: ['streak-7', 'streak-7'] },
  ]) {
    assert.throws(() => historyDomain.readAchievementHistory(malformed), /Saved achievement history is invalid/);
  }

  const saved = {
    highestObservedStreak: 0,
    earnedRelicIds: ['future-relic'],
    futurePayload: { version: 2 },
  };
  const updated = historyDomain.updateAchievementHistory(saved, evidence(), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(updated)), saved);
});

test('achievement history updates are idempotent and derive only from recorded conditions', () => {
  const first = historyDomain.updateAchievementHistory(undefined, evidence({
    streak: 30,
    calculationHistory: [{ id: 'practice-1' }],
    blackBookPage: 5,
    blackBookTotal: 5,
    bossTests: [{
      results: Array.from({ length: 10 }, (_, index) => ({ correct: index < 7 })),
    }],
    ncertBooks: [{ totalSessions: 4, completedSessions: 4 }],
  }), 30);
  const repeated = historyDomain.updateAchievementHistory(first, evidence({
    streak: 30,
    calculationHistory: [{ id: 'practice-1' }],
    blackBookPage: 5,
    blackBookTotal: 5,
    bossTests: [{
      results: Array.from({ length: 10 }, (_, index) => ({ correct: index < 7 })),
    }],
    ncertBooks: [{ totalSessions: 4, completedSessions: 4 }],
  }), 30);

  assert.deepEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(first)));
  assert.deepEqual(ids(first), [
    'practice',
    'blackbook',
    'streak-7',
    'streak-30',
    'first-boss',
    'ncert-master',
    'vocab-master',
  ]);
  const belowBossThreshold = historyDomain.deriveCurrentAchievementIds(evidence({
    bossTests: [{ results: Array.from({ length: 10 }, (_, index) => ({ correct: index < 6 })) }],
  }));
  assert.equal([...belowBossThreshold].includes('first-boss'), false, 'Boss defeat requires at least 70% correct');
});

test('completed archived lectures across every saved batch count toward real lecture relics', () => {
  const makeLecture = (id) => ({
    id,
    status: 'completed',
    isArchived: true,
    completedAt: '2026-02-03T12:00:00.000Z',
  });
  const batches = Array.from({ length: 2 }, (_, batchIndex) => ({
    id: `batch-${batchIndex}`,
    subjects: [{
      id: 'maths',
      topics: Array.from({ length: 5 }, (_, topicIndex) => ({
        id: `topic-${batchIndex}-${topicIndex}`,
        isArchived: true,
        lectures: Array.from({ length: 10 }, (_, lectureIndex) =>
          makeLecture(`lecture-${batchIndex}-${topicIndex}-${lectureIndex}`)),
      })),
    }],
  }));
  batches[1].subjects[0].topics[4].lectures[9].status = 'in-progress';

  const current = historyDomain.deriveCurrentAchievementIds(evidence({ batches }));
  assert.deepEqual([...current], ['first-lecture', 'ten-lectures']);
  const oneMoreCompletedBatch = structuredClone(batches);
  oneMoreCompletedBatch[1].subjects[0].topics[4].lectures[9].status = 'completed';
  const hundred = historyDomain.deriveCurrentAchievementIds(evidence({ batches: oneMoreCompletedBatch }));
  assert.deepEqual([...hundred], ['first-lecture', 'ten-lectures', 'hundred-lectures']);
});