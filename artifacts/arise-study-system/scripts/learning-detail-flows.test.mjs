import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { STORAGE_KEY, batchPayload, mockStorage, mountProvider, createProviderRuntime } from './study-provider-harness.mjs';

function load(name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../contexts/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Date, Math, Number, String, Array, Object, Error, Map, Set });
  return exports;
}
const tools = load('learningTools');
const calculation = load('calculationEvidence');
const plain = (value) => JSON.parse(JSON.stringify(value));
const book = { id: 'book', classId: 'class-1', classLabel: 'CLASS 01', title: 'Reader', totalSessions: 2, completedSessions: 1, vocabulary: ['resilient'] };
const card = (id) => ({ id, batchId: 'saved-batch', subjectId: 'maths', topicTitle: id, question: `Explain ${id}`, answer: `Saved answer ${id}`, createdAt: '2026-10-01' });
const payload = () => batchPayload({
  ncertBooks: [book], ncertCatalogVersion: 2,
  studyTools: { ...tools.createStudyToolsState(), reviewCards: [card('a'), card('b')],
    experiments: [{ id: 'ended', startDate: '2026-09-24', target: 'Review daily', checkIns: ['2026-09-24', '2026-09-26'] }],
  },
});

test('question details are optional, validated and never reconstructed from old aggregates', () => {
  assert.equal(calculation.validateCalculationAnswers(undefined, 20, 12, 90), undefined);
  const answers = [{ prompt: '2 + 3', expectedAnswer: 5, answer: 4, correct: false, elapsedSeconds: 2 }];
  assert.deepEqual(plain(calculation.validateCalculationAnswers(answers, 1, 0, 3)), answers);
  assert.throws(() => calculation.validateCalculationAnswers(answers, 2, 0, 3), /attempted/);
  assert.throws(() => calculation.validateCalculationAnswers([{ ...answers[0], correct: true }], 1, 1, 3), /invalid/);
  assert.throws(() => calculation.validateCalculationAnswers(answers, 1, 0, 1), /duration/);
  assert.equal(calculation.calculationTrend([{ questions: 3, duration: 0, accuracy: 80 }]).speed, null);
  assert.equal(calculation.calculationTrend([{ questions: 3, duration: 30, accuracy: 80 }]).accuracyChange, null);
});

test('new optional learning fields normalize round-trip and malformed evidence fails closed', () => {
  const state = { ...tools.createStudyToolsState(),
    wordEvidence: [{ bookId: 'book', word: 'resilient', meaning: 'recovers', attempts: [{ date: '2026-10-01', stage: 'learn', response: 'recovers', correct: true }] }],
    windDownReviews: [{ date: '2026-10-01', completedQuestIds: [], review: 'Reviewed', tomorrowPriority: 'Read', preparation: '' }],
    conceptLinks: [{ id: 'link', batchId: 'batch', fromCardId: 'a', toCardId: 'b' }],
    focusHistory: [{ id: 'focus', date: '2026-10-01', kind: 'focus', durationSeconds: 60, presetMinutes: 25, task: 'Read', completed: false }],
    bossRetests: [],
  };
  assert.deepEqual(plain(tools.normalizeStudyTools(state)), plain(state));
  assert.throws(() => tools.normalizeStudyTools({ ...state, wordEvidence: [{ ...state.wordEvidence[0], attempts: [{ date: '2026-02-31', stage: 'learn', response: '', correct: true }] }] }), /date/);
  assert.throws(() => tools.normalizeStudyTools({ ...state, conceptLinks: [{ ...state.conceptLinks[0], toCardId: 'a' }] }), /itself/);
});

test('word stages, ended experiment result, day review and concept links survive provider remount without XP', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, payload()]]);
  const runtime = createProviderRuntime(storage);
  let provider = await mountProvider(t, storage, { runtime });
  const xp = provider.current.state.totalXp;
  await provider.edit((study) => study.saveWordAttempt('book', 'invented', 'not real', { stage: 'learn', response: 'no', correct: true }));
  assert.equal(provider.current.studyTools.wordEvidence, undefined, 'only genuinely collected words can receive evidence');
  await provider.edit((study) => study.saveWordAttempt('book', 'resilient', 'recovers', { stage: 'practice', response: 'recovers', correct: true }));
  assert.equal(provider.current.studyTools.wordEvidence, undefined, 'cannot skip Learn and Recall');
  for (const stage of ['learn', 'recall', 'practice', 'revision']) {
    await provider.edit((study) => study.saveWordAttempt('book', 'resilient', 'recovers', { stage, response: `My ${stage} response`, correct: true }));
  }
  await provider.edit((study) => study.finishExperiment('ended', 'Two recorded days; try a smaller habit.', 'change', 'Read one paragraph'));
  const ended = provider.current.studyTools.experiments.find((item) => item.id === 'ended');
  assert.equal(ended.result.decision, 'change');
  assert.equal(ended.checkIns.length, 2, 'missed days remain missed');
  assert.equal(provider.current.studyTools.experiments.length, 2);
  await provider.edit((study) => study.finishExperiment('ended', 'Duplicate', 'continue'));
  assert.equal(provider.current.studyTools.experiments.length, 2, 'result cannot replay a continuation');
  await provider.edit((study) => study.saveWindDownReview({ review: 'Reviewed words', tomorrowPriority: 'Read next session', preparation: 'Open book' }));
  await provider.edit((study) => study.addConceptLink('a', 'b'));
  await provider.edit((study) => study.addConceptLink('b', 'a'));
  assert.equal(provider.current.studyTools.conceptLinks.length, 1);
  await provider.edit((study) => study.logFocusSession({ kind: 'break', durationSeconds: 45, presetMinutes: 5, task: 'Pause', completed: false }));
  assert.equal(provider.current.state.totalXp, xp);
  const savedTools = plain(provider.current.studyTools);
  await provider.unmount();
  provider = await mountProvider(t, storage, { runtime });
  assert.deepEqual(plain(provider.current.studyTools), savedTools);
  await provider.edit((study) => study.removeConceptLink(study.studyTools.conceptLinks[0].id));
  assert.equal(provider.current.studyTools.conceptLinks.length, 0);
});

test('new calculation answers persist; legacy aggregate sessions stay detail-free', async (t) => {
  const old = { id: 'old', date: '2026-09-30', questions: 10, correct: 8, accuracy: 80, duration: 90 };
  const storage = mockStorage([[STORAGE_KEY, batchPayload({ calculationHistory: [old] })]]);
  const provider = await mountProvider(t, storage);
  await provider.edit((study) => study.addCalculationSession({ questions: 1, correct: 0, accuracy: 0, duration: 3, answers: [{ prompt: '2 + 3', expectedAnswer: 5, answer: 4, correct: false, elapsedSeconds: 2 }] }));
  assert.equal(provider.current.state.calculationHistory[0].answers[0].answer, 4);
  assert.deepEqual(plain(provider.current.state.calculationHistory.find((item) => item.id === 'old')), old);
});