import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = new Map();
function load(request) {
  if (cache.has(request)) return cache.get(request);
  assert.ok(request.startsWith('@/contexts/'), `Unexpected runtime dependency: ${request}`);
  const path = `${root}/${request.slice(2)}.ts`;
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(request, module.exports);
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { Date, console })(load, module, module.exports);
  return module.exports;
}
const { buildEvidenceLog, paginateEvidenceLog, summarizeEvidence } = load('@/contexts/evidenceSummary');
const { classifyAccuracyEvidence, deriveWeaknessRadar } = load('@/contexts/masterProgress');
const event = (id, type, metadata = {}) => ({
  id, type, timestamp: '2026-07-08T10:00:00Z', idempotencyKey: id,
  metadata: { activityDate: '2026-07-08', ...metadata },
});
const fixture = () => ({
  date: '2026-07-08', activeBatchId: 'batch', batches: [], calculationHistory: [],
  studyTools: { bossTests: [], revisionHistory: [], workoutSessions: [], reviewCards: [] },
  progressHistory: {
    trackingStartedAt: '2026-07-07T10:00:00Z', systemEvents: [], xpEvents: [],
    dailyObservations: { '2026-07-07': { active: true }, '2026-07-08': { active: true } },
  },
  rpg: { events: [] },
});

test('unified log has signed XP once and deduplicates RPG mirror and saved sessions', () => {
  const state = fixture();
  state.progressHistory.systemEvents = [
    event('xp-mirror', 'xp.awarded', { amount: 100 }),
    event('calculation:c1', 'calculation.session', { activityId: 'c1', correct: 1, questions: 2 }),
    event('revision:r1', 'study.activity', { activityId: 'r1', activity: 'revision' }),
    event('rpg-history:g1', 'gate.cleared', { rpgEventId: 'gate-event', gateId: 'gate' }),
    event('quest', 'quest.completed'), event('level', 'level.up'), event('rank', 'rank.changed'),
    event('badge', 'achievement.unlocked'),
  ];
  state.progressHistory.xpEvents = [
    { id: 'xp', amount: -10, source: 'equipment-reversal', timestamp: '2026-07-08T10:00:00Z', activityDate: state.date },
  ];
  state.rpg.events = [{ ...event('gate-event', 'gate.cleared'), idempotencyKey: 'g1' }];
  state.calculationHistory = [{ id: 'c1', date: state.date, correct: 1, questions: 2, duration: 20 }];
  state.studyTools.revisionHistory = [{ id: 'r1', date: state.date, cardIds: ['a'] }];
  const before = JSON.stringify(state);
  const rows = buildEvidenceLog(state);
  assert.equal(rows.filter((r) => r.category === 'xp').length, 1);
  assert.equal(rows.find((r) => r.category === 'xp').title, '-10 XP');
  assert.equal(rows.filter((r) => r.type === 'gate.cleared').length, 1);
  assert.equal(rows.filter((r) => r.type === 'calculation.session').length, 1);
  assert.equal(rows.filter((r) => r.type === 'recovery.activity').length, 0);
  assert.equal(JSON.stringify(state), before, 'projection must not mutate state');
});

test('legacy session dates are preserved without invented times or rewards', () => {
  const state = fixture();
  state.calculationHistory = [{ id: 'legacy', date: '2025-01-02', questions: 10, correct: 7, duration: 90 }];
  const rows = buildEvidenceLog(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dateOnly, true);
  assert.match(rows[0].detail, /exact time not tracked/);
  assert.equal(rows.filter((r) => r.category === 'xp').length, 0);
  delete state.progressHistory;
  delete state.rpg;
  assert.equal(buildEvidenceLog(state).length, 1);
  assert.equal(summarizeEvidence(state).weeklyXp, 0);
});

test('category/date filters and clamped pagination do not fabricate empty pages', () => {
  const rows = Array.from({ length: 35 }, (_, i) => ({
    id: String(i), category: i < 30 ? 'quests' : 'boss', date: i < 15 ? '2026-06-01' : '2026-07-08',
  }));
  const result = paginateEvidenceLog(rows, 'quests', 99, 10, '2026-07-01', '2026-07-08');
  assert.equal(result.total, 15);
  assert.equal(result.pages, 2);
  assert.equal(result.page, 1);
  assert.equal(result.rows.length, 5);
  assert.equal(paginateEvidenceLog(rows, 'ranks', 99).page, 0);
});

test('period XP uses activity dates and signed canonical ledger only', () => {
  const state = fixture();
  state.totalXp = 999999;
  state.progressHistory.xpEvents = [
    { amount: 100, activityDate: '2026-07-06' },
    { amount: -20, activityDate: '2026-07-08' },
    { amount: 50, activityDate: '2026-07-01' },
    { amount: 900, activityDate: '2026-06-30' },
    { amount: 900, activityDate: '2026-07-09' },
  ];
  const result = summarizeEvidence(state);
  assert.equal(result.weeklyXp, 80);
  assert.equal(result.monthlyXp, 130);
  assert.equal(result.weekStart, '2026-07-06');
  assert.equal(result.trackedWeekDays, 2);
  assert.equal(result.activeDaysThisWeek, 2);
});

test('accuracy is question-weighted; measured study excludes workout and invalid duration', () => {
  const state = fixture();
  state.calculationHistory = [
    { id: 'a', questions: 1, correct: 1, duration: 30, accuracy: 0 },
    { id: 'b', questions: 9, correct: 4, duration: 60, accuracy: 100 },
    { id: 'bad', questions: 2, correct: 3, duration: 1000 },
    { id: 'untimed', questions: 10, correct: 5, duration: -10 },
  ];
  state.studyTools.workoutSessions = [{ duration: 3600 }];
  const result = summarizeEvidence(state);
  assert.equal(result.calculationAccuracy, 50);
  assert.equal(result.studySeconds, 90);
  assert.equal(result.timedSessions, 2);
  assert.equal(summarizeEvidence(fixture()).calculationAccuracy, null);
});

test('older calculation ledger samples contribute once beyond the retained history cap', () => {
  const state = fixture();
  state.calculationHistory = [{ id: 'recent', questions: 10, correct: 8, duration: 60 }];
  state.progressHistory.systemEvents = [
    event('calc:recent', 'calculation.session', { activityId: 'recent', questions: 10, correct: 8, duration: 60 }),
    event('calc:old', 'calculation.session', { activityId: 'old', questions: 10, correct: 2, duration: 90 }),
    event('lecture', 'lecture.completed'), event('reading', 'ncert.session'), event('vocab', 'vocabulary.activity'),
  ];
  const result = summarizeEvidence(state);
  assert.equal(result.questions, 20);
  assert.equal(result.calculationAccuracy, 50);
  assert.equal(result.studySeconds, 150);
  assert.equal(result.timedSessions, 2);
  assert.equal(result.trackedLectures, 1);
  assert.equal(result.trackedReading, 1);
  assert.equal(result.trackedVocabulary, 1);
});

test('radar separates evidence bands; completion never becomes accuracy', () => {
  const accuracy = (correct, total) => ({ numerator: correct, denominator: total, percent: correct / total * 100 });
  assert.equal(classifyAccuracyEvidence(null), 'insufficient-data');
  assert.equal(classifyAccuracyEvidence(accuracy(1, 1)), 'insufficient-data');
  assert.equal(classifyAccuracyEvidence(accuracy(4, 5)), 'strong');
  assert.equal(classifyAccuracyEvidence(accuracy(3, 5)), 'developing');
  assert.equal(classifyAccuracyEvidence(accuracy(2, 5)), 'weak');
  const state = fixture();
  state.blackBookPage = 100;
  state.blackBookTotal = 100;
  state.studyTools.bossTests = [{ batchId: 'batch', results: Array.from({ length: 5 }, (_, i) => ({
    subjectId: 'maths', topicTitle: 'Fractions', cardId: `card-${i}`, correct: i < 4,
  })) }];
  const radar = deriveWeaknessRadar(state);
  assert.equal(radar.findings[0].evidenceBand, 'strong');
  assert.equal(radar.calculationEvidenceBand, 'insufficient-data');
  state.studyTools.bossTests = [];
  assert.equal(deriveWeaknessRadar(state).findings.length, 0);
});