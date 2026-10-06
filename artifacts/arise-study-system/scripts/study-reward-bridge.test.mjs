import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  assert.match(name, /^@\/contexts\/[a-zA-Z]+$/);
  const path = `../contexts/${name.split('/').pop()}.ts`;
  const exports = {};
  modules.set(name, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: load, Date, Math, Object, Array, Map, Set, Number, String }, { filename: path });
  return exports;
}
const api = load('@/contexts/rpgSystem');
const rank = load('@/contexts/rankSystem');
const plain = (value) => JSON.parse(JSON.stringify(value));
let sequence = 0;
const ticket = () => ({ timestamp: '2026-04-01T12:00:00Z', ticketId: `reward-${++sequence}` });
const state = (xp = 0) => ({
  totalXp: xp, date: '2026-04-01', activeBatchId: 'batch', streak: 0,
  batches: [], quests: [], ncertBooks: [], calculationHistory: [],
  blackBookPage: 0, blackBookTotal: 300,
  studyTools: { bossTests: [] },
  achievementHistory: { highestObservedStreak: 0, earnedRelicIds: [] },
  progressHistory: { xpEvents: [], systemEvents: [] },
  rpg: api.createEmptyRpgState(xp),
});
const bridge = (before, next) => api.bridgeStudyRewards(before, next, ticket());
const historyWithEvidence = (activeDays, completedStudyActivities) => ({
  xpEvents: [],
  systemEvents: Array.from({ length: completedStudyActivities }, (_, index) => {
    const dayIndex = Math.min(activeDays - 1, Math.floor(index * activeDays / completedStudyActivities));
    const activityDate = new Date(Date.UTC(2020, 0, 1 + dayIndex)).toISOString().slice(0, 10);
    return {
      id: `rank-evidence-${index}`, type: 'quest.completed',
      timestamp: `${activityDate}T12:00:00.000Z`, idempotencyKey: `rank-evidence-${index}`,
      metadata: { activityDate, questId: `rank-evidence-${index}` },
    };
  }),
});
function quest(before, id) {
  const old = before.quests.find((q) => q.id === id);
  const next = {
    ...before, totalXp: before.totalXp + 100,
    quests: [...before.quests.filter((q) => q.id !== id), { ...old, id, completed: true, xp: 100 }],
    progressHistory: { ...before.progressHistory, xpEvents: [...before.progressHistory.xpEvents,
      { idempotencyKey: `base:${++sequence}`, source: 'quest', amount: 100, activityDate: before.date,
        relatedActivityId: id, metadata: { questId: id } }] },
  };
  return bridge(before, next);
}

test('ordinary quest receipts are durable, base XP remains canonical, undo revokes items and replay cannot farm', () => {
  let before = state();
  let paid = quest(before, 'ncert-reading');
  assert.equal(paid.totalXp, 100);
  assert.equal(paid.rpg.inventory['study-coins'].quantity, 2);
  const normalized = api.normalizeRpgState(plain(paid.rpg), paid.totalXp);
  assert.deepEqual(plain(normalized), plain(paid.rpg));
  const undo = bridge(paid, { ...paid, totalXp: 0, rpg: normalized,
    quests: [{ id: 'ncert-reading', xp: 100, completed: false }] });
  assert.equal(undo.rpg.inventory['study-coins'], undefined);
  assert.equal(api.getQuestCombo(undo.rpg, undo.date).count, 0);
  const replay = quest(undo, 'ncert-reading');
  assert.equal(replay.totalXp, 100);
  assert.equal(replay.rpg.inventory['study-coins'], undefined);
  assert.equal(replay.rpg.acquisitions.length, 1);
  assert.equal(before.rpg.events.length, 0, 'previous snapshot is not mutated');
});

test('combo requires three distinct new receipts; repeat and hydration do not pay twice', () => {
  let current = quest(state(), 'ncert-reading');
  current = quest(current, 'maths-lecture');
  assert.equal(api.getQuestCombo(current.rpg, current.date).count, 2);
  current = quest(current, 'timed-calculation');
  assert.equal(current.totalXp, 350);
  assert.equal(api.getQuestCombo(current.rpg, current.date).claimed, true);
  assert.ok(current.achievementHistory.earnedRelicIds.includes('combo-3'));
  const reload = { ...plain(current), rpg: api.normalizeRpgState(plain(current.rpg), current.totalXp) };
  const observed = bridge(reload, { ...reload, setting: 'changed' });
  assert.equal(observed.totalXp, current.totalXp);
  assert.equal(observed.rpg.events.filter((e) => e.metadata.kind === 'combo-reward').length, 1);
  const undo = bridge(observed, { ...observed, totalXp: observed.totalXp - 100,
    quests: observed.quests.map((q) => q.id === 'timed-calculation' ? { ...q, completed: false } : q) });
  assert.equal(undo.totalXp, 200, 'undo reverses the original daily combo XP');
  const replay = quest(undo, 'timed-calculation');
  assert.equal(replay.totalXp, 300, 're-completing owns base XP only, never another combo');
  assert.equal(api.getQuestCombo(replay.rpg, replay.date).count, 2);
});

test('legacy and seeded defaults become a non-paying baseline, never an achievement or streak backfill', () => {
  const legacy = { ...state(49_000), streak: 30, blackBookPage: 300,
    calculationHistory: Array.from({ length: 20 }, (_, i) => ({ id: `old-${i}`, questions: 10, accuracy: 100 })),
    quests: [{ id: 'ncert-reading', xp: 100, completed: true }] };
  const baseline = bridge(legacy, { ...legacy, setting: 'changed' });
  assert.equal(baseline.totalXp, legacy.totalXp);
  assert.equal(baseline.rpg.events.length, 0);
  assert.equal(baseline.rpg.rewardTracking.observedActiveDates.length, 0);
  assert.equal(baseline.rpg.rewardTracking.masteredCalculationIds.length, 0);
  assert.deepEqual(plain(baseline.achievementHistory.earnedRelicIds), []);
  assert.equal(rank.rankArtworkKey('rank-hidden-transcendent'), 'rank-transcendent');
  assert.equal(rank.rankArtworkKey('Hidden'), 'rank-hidden');
  assert.equal(rank.rankFromXp(49_000), 'A-RANK');
});

test('Calculation Master needs ten newly observed qualifying sessions and owns a single explicit reward', () => {
  let current = bridge(state(), { ...state(), setting: 'start-tracking' });
  for (let i = 0; i < 10; i++) {
    const next = { ...current, calculationHistory: [...current.calculationHistory,
      { id: `new-${i}`, questions: 10, correct: 8, accuracy: 80 }] };
    current = bridge(current, next);
  }
  assert.equal(current.totalXp, 200);
  assert.equal(current.rpg.inventory['calculation-gauntlet'].quantity, 1);
  assert.ok(current.achievementHistory.earnedRelicIds.includes('calculation-master'));
  const saved = plain(current);
  current = bridge(current, { ...current, calculationHistory: [] });
  current = bridge(current, { ...current, calculationHistory: saved.calculationHistory });
  assert.equal(current.totalXp, 200);
  assert.equal(current.rpg.inventory['calculation-gauntlet'].quantity, 1);
});

test('official Boss special reward is weekly/batch scoped, Gate practice never owns it', () => {
  const boss = (id, extra = {}) => ({ id, batchId: 'batch', weekStart: '2026-03-30',
    results: Array.from({ length: 5 }, () => ({ correct: true })), ...extra });
  const before = state();
  let next = bridge(before, { ...before, studyTools: { bossTests: [boss('official')] } });
  assert.equal(next.totalXp, 150);
  assert.equal(next.rpg.inventory['reward-chest'].quantity, 1);
  next = bridge(next, { ...next, studyTools: { bossTests: [] } });
  next = bridge(next, { ...next, studyTools: { bossTests: [boss('same-week-new-id')] } });
  assert.equal(next.totalXp, 150);
  const gatePractice = bridge(before, { ...before, studyTools: { bossTests: [boss('gate', { gateAttemptId: 'attempt' })] } });
  assert.equal(gatePractice.totalXp, 0);
  assert.equal(gatePractice.rpg.inventory['reward-chest'], undefined);
  const wrongBatch = bridge(before, { ...before, studyTools: { bossTests: [boss('other', { batchId: 'other' })] } });
  assert.equal(wrongBatch.totalXp, 0);
  const legacy = { ...state(), studyTools: { bossTests: [boss('legacy')] } };
  const migration = bridge(legacy, { ...legacy, setting: true });
  const replaced = bridge(migration, { ...migration, studyTools: { bossTests: [boss('replacement')] } });
  assert.equal(replaced.totalXp, 0, 'legacy official weeks are a non-paying baseline even with a new row ID');
});

test('real observed consecutive active dates pay streak milestones once without seeded streak shortcuts', () => {
  let current = state();
  current.streak = 6;
  current = bridge(current, {
    ...current, streak: 7,
    achievementHistory: { highestObservedStreak: 7, earnedRelicIds: ['streak-7'] },
  });
  assert.equal(current.achievementHistory.earnedRelicIds.includes('streak-7'), false,
    'a seeded display streak must not produce a newly unlocked relic');
  for (let day = 1; day <= 7; day++) {
    const date = `2026-04-${String(day).padStart(2, '0')}`;
    current = { ...current, date, quests: [] };
    current = quest(current, 'ncert-reading');
    if (day < 7) assert.equal(current.rpg.events.filter((e) => e.metadata.achievementId === 'streak-7').length, 0);
  }
  assert.equal(current.totalXp, 800);
  assert.equal(current.achievementHistory.highestObservedStreak, 7);
  const reload = plain(current);
  current = bridge(reload, { ...reload, setting: true });
  assert.equal(current.totalXp, 800);
  assert.equal(current.rpg.events.filter((e) => e.metadata.achievementId === 'streak-7').length, 1);
});

test('rank milestone pays once and malformed tracking surfaces an explicit error', () => {
  const before = {
    ...state(84_990),
    progressHistory: historyWithEvidence(260, 750),
  };
  const paid = bridge(before, { ...before, totalXp: 85_010 });
  assert.equal(paid.totalXp, 85_210);
  assert.ok(paid.achievementHistory.earnedRelicIds.includes('rank-ascendant'));
  const next = bridge(paid, { ...paid, setting: 'changed' });
  assert.equal(next.totalXp, paid.totalXp);
  assert.throws(() => bridge(before, { ...before, rpg: { ...before.rpg, rewardTracking: { version: 9 } } }),
    /Saved reward tracking is invalid/);
});