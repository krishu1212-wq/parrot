import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../contexts/learningTools.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Date, Math, Map, Number, String, Error, Object, Array, RegExp });
const {
  createStudyToolsState,
  normalizeStudyTools,
  getWeekStart,
  getWeeklyReviewCards,
  getWeeklyBossTest,
  getWeakTopics,
  getMissedReviewCards,
  hasExperimentCheckedInOnDate,
} = exports;
const assertSameData = (actual, expected, message) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

const card = (id, batchId, createdAt, topicTitle = 'Fractions') => ({
  id,
  batchId,
  subjectId: 'maths',
  topicTitle,
  question: `Question ${id}`,
  answer: `Answer ${id}`,
  createdAt,
});

test('new study tools model uses empty histories and a bounded local wind-down default', () => {
  assertSameData(createStudyToolsState(), {
    reviewCards: [],
    bossTests: [],
    workoutSessions: [],
    revisionHistory: [],
    experiments: [],
    windDownHour: 21,
    questionBankAttempts: [],
  });
});

test('weekly start is local Monday and handles Sunday and year boundaries', () => {
  assert.equal(getWeekStart('2024-12-29'), '2024-12-23');
  assert.equal(getWeekStart('2024-12-30'), '2024-12-30');
  assert.equal(getWeekStart('2025-01-05'), '2024-12-30');
  assert.throws(() => getWeekStart('2025-02-29'), /YYYY-MM-DD/);
  assert.throws(() => getWeekStart('not-a-date'), /YYYY-MM-DD/);
});

test('weekly review selection is limited to matching batch and local Monday through Sunday', () => {
  const cards = [
    card('monday', 'batch-a', '2025-01-06'),
    card('wednesday', 'batch-a', '2025-01-08'),
    card('sunday', 'batch-a', '2025-01-12'),
    card('previous-sunday', 'batch-a', '2025-01-05'),
    card('next-monday', 'batch-a', '2025-01-13'),
    card('other-batch', 'batch-b', '2025-01-08'),
  ];
  assert.deepEqual(
    getWeeklyReviewCards(cards, 'batch-a', '2025-01-11').map((item) => item.id),
    ['monday', 'wednesday', 'sunday'],
  );
  assert.deepEqual(getWeeklyReviewCards(cards, 'missing-batch', '2025-01-11'), []);
});

test('boss test lookup keys one official record by both batch and local week', () => {
  const saved = {
    id: 'test-1',
    batchId: 'batch-a',
    date: '2025-01-11',
    weekStart: '2025-01-06',
    results: [],
    weakTopics: [],
  };
  assert.equal(getWeeklyBossTest([saved], 'batch-a', '2025-01-12'), saved);
  assert.equal(getWeeklyBossTest([saved], 'batch-b', '2025-01-12'), undefined);
  assert.equal(getWeeklyBossTest([saved], 'batch-a', '2025-01-13'), undefined);
});

test('weak-topic summary counts misses, omits fully recalled topics, and orders deterministically', () => {
  const results = [
    { topicTitle: 'Ratio', correct: false },
    { topicTitle: 'Fractions', correct: false },
    { topicTitle: 'Ratio', correct: false },
    { topicTitle: 'Fractions', correct: true },
    { topicTitle: 'Percentages', correct: true },
  ];
  assertSameData(getWeakTopics(results), ['Ratio', 'Fractions']);
  assertSameData(getWeakTopics([]), []);
});

test('missed-card recall matches incorrect results by saved card identity, not a shared topic title', () => {
  const cards = [
    { ...card('maths-basics', 'batch-a', '2025-01-08', 'Basics'), subjectId: 'maths' },
    { ...card('english-basics', 'batch-a', '2025-01-08', 'Basics'), subjectId: 'english' },
    { ...card('english-basics', 'batch-b', '2025-01-08', 'Basics'), subjectId: 'english' },
    { ...card('correct-maths', 'batch-a', '2025-01-08', 'Basics'), subjectId: 'maths' },
  ];
  const testRecord = {
    id: 'boss-1',
    batchId: 'batch-a',
    date: '2025-01-11',
    weekStart: '2025-01-06',
    results: [
      { cardId: 'english-basics', correct: false, topicTitle: 'Basics' },
      { cardId: 'correct-maths', correct: true, topicTitle: 'Basics' },
      { cardId: 'removed-card', correct: false, topicTitle: 'Basics' },
    ],
    weakTopics: ['Basics'],
  };
  assertSameData(getMissedReviewCards(cards, testRecord, 'batch-a').map((item) => item.id), ['english-basics']);
  assertSameData(getMissedReviewCards(cards, testRecord, 'batch-b'), []);
  assertSameData(getMissedReviewCards(cards, undefined, 'batch-a'), []);
});

test('local experiment dates allow at most one saved check-in on a given day', () => {
  const experiment = {
    id: 'experiment-1',
    startDate: '2025-01-06',
    target: 'Recall one saved card',
    checkIns: ['2025-01-06', '2025-01-08'],
  };
  assert.equal(hasExperimentCheckedInOnDate(experiment, '2025-01-08'), true);
  assert.equal(hasExperimentCheckedInOnDate(experiment, '2025-01-09'), false);
});

test('normalizer fills only missing fields and preserves saved history', () => {
  const defaults = normalizeStudyTools(undefined);
  assertSameData(defaults, createStudyToolsState());
  assertSameData(normalizeStudyTools({}), createStudyToolsState());
  assertSameData(normalizeStudyTools({ reviewCards: undefined, windDownHour: undefined }), createStudyToolsState());

  const savedCard = card('card-1', 'batch-a', '2025-01-08T10:30:00.000Z');
  const savedTest = {
    id: 'test-1',
    batchId: 'batch-a',
    date: '2025-01-11',
    weekStart: '2025-01-06',
    results: [{
      cardId: 'card-1',
      question: savedCard.question,
      expectedAnswer: savedCard.answer,
      answer: 'recalled answer',
      correct: true,
      topicTitle: savedCard.topicTitle,
      subjectId: savedCard.subjectId,
    }],
    weakTopics: [],
  };
  const input = {
    reviewCards: [savedCard],
    bossTests: [savedTest],
    workoutSessions: [{ id: 'workout-1', date: '2025-01-08', duration: 125 }],
    revisionHistory: [{ id: 'revision-1', date: '2025-01-08', cardIds: ['card-1'], batchId: 'batch-a' }],
    experiments: [{ id: 'experiment-1', startDate: '2025-01-08', target: 'Recall one card', checkIns: ['2025-01-08'] }],
    windDownHour: 0,
  };
  const normalized = normalizeStudyTools(input);
  assertSameData(normalized.reviewCards, [savedCard]);
  assertSameData(normalized.bossTests, [savedTest]);
  assertSameData(normalized.workoutSessions, input.workoutSessions);
  assertSameData(normalized.revisionHistory, input.revisionHistory);
  assertSameData(normalized.experiments, input.experiments);
  assert.equal(normalized.windDownHour, 0);
  assert.deepEqual(input.reviewCards, [savedCard], 'normalization does not mutate saved payloads');
});

test('malformed saved study tools data raises explicit errors instead of resetting histories', () => {
  assert.throws(() => normalizeStudyTools(null), /not a valid object/);
  assert.throws(() => normalizeStudyTools({ reviewCards: {} }), /reviewCards is invalid/);
  assert.throws(() => normalizeStudyTools({ reviewCards: [null] }), /review card is invalid/);
  assert.throws(() => normalizeStudyTools({ reviewCards: [card('c', 'b', 'not a date')] }), /creation time is invalid/);
  assert.throws(() => normalizeStudyTools({ windDownHour: 24 }), /wind-down hour is invalid/);
  assert.throws(() => normalizeStudyTools({
    experiments: [{ id: 'exp', startDate: '2025-01-01', target: 'Read', checkIns: ['bad-date'] }],
  }), /invalid study experiment check-in date/);
  assert.throws(() => normalizeStudyTools({
    questionBankAttempts: [{ id: 'bad', isCorrect: false, selectedOptionLabel: 'a', correctOptionLabel: 'b', mistakeStatus: 'NONE' }],
  }), /Saved Question Bank attempt is invalid/);
});