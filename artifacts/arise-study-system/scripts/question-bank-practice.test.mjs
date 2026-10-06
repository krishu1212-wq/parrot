import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  controlledClock,
  createProviderRuntime,
  mountProvider,
  mockStorage,
} from './study-provider-harness.mjs';

const draftPath = new URL('../docs/question-bank-drafts/percentage-class-4.review-draft.json', import.meta.url);
const draft = JSON.parse(readFileSync(draftPath, 'utf8'));

function compileModule(path, requireModule = () => { throw new Error('Unexpected module dependency'); }) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: requireModule,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Error,
    Map,
    Set,
    RegExp,
  });
  return exports;
}

const sourceDraftModule = '../docs/question-bank-drafts/percentage-class-4.review-draft.json';
const questionBank = compileModule('../contexts/questionBank.ts', (name) => {
  if (name === sourceDraftModule) return draft;
  throw new Error(`Unexpected question bank import: ${name}`);
});
const questionPractice = compileModule('../contexts/questionPractice.ts');
const bank = questionBank.percentageClass4QuestionBank;

test('published bank contains only the approved 35 Percentage Class 4 entries with source content intact', () => {
  assert.equal(bank.publicationStatus, 'LIVE');
  assert.equal(bank.subject, 'Mathematics');
  assert.equal(bank.chapter, 'Percentage');
  assert.equal(bank.classOrLecture, 'Class 4');
  assert.equal(bank.questions.length, 35);
  assert.equal(JSON.stringify(bank.source), JSON.stringify(draft.source));
  for (let index = 0; index < draft.questions.length; index += 1) {
    const live = bank.questions[index];
    const source = draft.questions[index];
    assert.equal(live.id, source.id);
    assert.equal(live.sectionLabel, source.sectionLabel);
    assert.equal(live.sourceQuestionNumber, source.sourceQuestionNumber);
    assert.equal(live.sourceOrder, source.sourceOrder);
    assert.equal(live.englishText, source.englishText);
    assert.equal(live.hindiTextRaw, source.hindiTextRaw);
    assert.equal(JSON.stringify(live.options), JSON.stringify(source.options));
    assert.equal(live.sourceProvidedAnswer.result, source.handwrittenAnswer.result);
    assert.equal(live.sourceProvidedAnswer.optionLabel, source.handwrittenAnswer.verifiedOptionLabel);
    assert.equal(live.sourceProvidedAnswer.mathValidationStatus, 'NOT-INDEPENDENTLY-VERIFIED');
    assert.equal(JSON.stringify(live.sourceProvidedSolution.sourcePages), JSON.stringify(source.handwrittenSolution.sourcePages));
    assert.equal(live.questionPage, source.questionPage);
    assert.equal(JSON.stringify(live.optionPages), JSON.stringify(source.optionPages));
    assert.equal(live.sourceProvidedAnswer.sourceStatus, source.handwrittenAnswer.sourceStatus);
    assert.equal(live.sourceProvidedAnswer.sourcePage, source.handwrittenAnswer.sourcePage);
    assert.equal(live.sourceProvidedSolution.transcription, source.handwrittenSolution.transcription);
    assert.equal(live.sourceProvidedSolution.sourceStatus, source.handwrittenSolution.sourceStatus);
    assert.equal(live.sourceProvidedSolution.reviewStatus, source.handwrittenSolution.reviewStatus);
    assert.equal(live.reviewStatus, source.reviewStatus);
  }
});

test('the complete practice flow requires a choice, shows the result, then solution before advancing', () => {
  const questions = bank.questions;
  let flow = questionPractice.createQuestionPracticeFlow(1000);
  const initial = flow;
  flow = questionPractice.submitQuestionOption(flow, questions[0], 1500);
  assert.equal(flow, initial, 'cannot submit without choosing');
  flow = questionPractice.selectQuestionOption(flow, questions[0], 'z');
  assert.equal(flow, initial, 'cannot choose a label outside the four printed options');
  flow = questionPractice.selectQuestionOption(flow, questions[0], questions[0].sourceProvidedAnswer.optionLabel);
  flow = questionPractice.submitQuestionOption(flow, questions[0], 3500);
  assert.equal(flow.phase, 'result');
  assert.equal(flow.result.isCorrect, true);
  assert.equal(flow.result.timeTakenSeconds, 2.5);
  const beforeSolution = flow;
  flow = questionPractice.advanceQuestionPractice(flow, questions.length, 4000);
  assert.equal(flow, beforeSolution, 'cannot advance before source solution is revealed');
  flow = questionPractice.revealQuestionSolution(flow);
  assert.equal(flow.phase, 'solution');
  flow = questionPractice.advanceQuestionPractice(flow, questions.length, 5000);
  assert.equal(flow.phase, 'answering');
  assert.equal(flow.questionIndex, 1);
  assert.equal(flow.selectedOptionLabel, null);

  for (let index = 1; index < questions.length; index += 1) {
    const question = questions[index];
    flow = questionPractice.selectQuestionOption(flow, question, question.sourceProvidedAnswer.optionLabel);
    flow = questionPractice.submitQuestionOption(flow, question, 6000 + index * 1000);
    assert.equal(flow.result.isCorrect, true, `source-marked option should grade consistently for ${question.id}`);
    flow = questionPractice.revealQuestionSolution(flow);
    flow = questionPractice.advanceQuestionPractice(flow, questions.length, 7000 + index * 1000);
  }
  assert.equal(flow.phase, 'complete');
  assert.equal(flow.questionIndex, questions.length - 1);
});

test('bank attempts persist with mistake state and do not touch XP, quests, calculation practice, or RPG state', async (t) => {
  const storage = mockStorage();
  const clock = controlledClock();
  const runtime = createProviderRuntime(storage, clock);
  const provider = await mountProvider(t, storage, { runtime, clock });
  const original = provider.current.state;
  const question = bank.questions[0];
  const wrongOption = question.options.find((option) => option.label !== question.sourceProvidedAnswer.optionLabel);

  await provider.edit((context) => {
    assert.equal(context.recordQuestionBankAttempt({
      bankId: bank.id,
      questionId: question.id,
      selectedOptionLabel: wrongOption.label,
      timeTakenSeconds: 3.25,
    }), true);
  });
  await provider.edit((context) => {
    assert.equal(context.recordQuestionBankAttempt({
      bankId: bank.id,
      questionId: question.id,
      selectedOptionLabel: question.sourceProvidedAnswer.optionLabel,
      timeTakenSeconds: 1.75,
    }), true);
    assert.equal(context.recordQuestionBankAttempt({
      bankId: 'other-bank',
      questionId: question.id,
      selectedOptionLabel: question.sourceProvidedAnswer.optionLabel,
      timeTakenSeconds: 1,
    }), false);
  });

  const attempts = provider.current.state.studyTools.questionBankAttempts;
  assert.equal(attempts.length, 2);
  assert.equal(JSON.stringify(attempts.map((attempt) => ({
    questionId: attempt.questionId,
    topic: attempt.topic,
    attemptNumber: attempt.attemptNumber,
    isCorrect: attempt.isCorrect,
    timeTakenSeconds: attempt.timeTakenSeconds,
    mistakeStatus: attempt.mistakeStatus,
  }))), JSON.stringify([
    { questionId: question.id, topic: question.sectionLabel, attemptNumber: 1, isCorrect: false, timeTakenSeconds: 3.25, mistakeStatus: 'OPEN' },
    { questionId: question.id, topic: question.sectionLabel, attemptNumber: 2, isCorrect: true, timeTakenSeconds: 1.75, mistakeStatus: 'CLEARED' },
  ]));
  assert.equal(provider.current.state.totalXp, original.totalXp);
  assert.deepEqual(provider.current.state.quests, original.quests);
  assert.deepEqual(provider.current.state.calculationHistory, original.calculationHistory);
  assert.equal(
    JSON.stringify(provider.current.state.progressHistory?.xpEvents ?? []),
    JSON.stringify(original.progressHistory?.xpEvents ?? []),
  );
  for (const key of ['gates', 'attempts', 'inventory', 'acquisitions', 'effects', 'events', 'presentationQueue', 'claimedRewardKeys']) {
    assert.equal(
      JSON.stringify(provider.current.state.rpg[key]),
      JSON.stringify(original.rpg[key]),
      `Question Bank attempts must not change RPG ${key}`,
    );
  }

  await provider.unmount();
  const restored = await mountProvider(t, storage, { runtime, clock });
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.current.state.studyTools.questionBankAttempts)),
    JSON.parse(JSON.stringify(attempts)),
  );
});