import type { PublishedQuestion } from '@/contexts/questionBank';

export type QuestionPracticePhase = 'answering' | 'result' | 'solution' | 'complete';

export type QuestionPracticeResult = {
  isCorrect: boolean;
  selectedOptionLabel: 'a' | 'b' | 'c' | 'd';
  sourceOptionLabel: 'a' | 'b' | 'c' | 'd';
  timeTakenSeconds: number;
};

export type QuestionPracticeFlow = {
  phase: QuestionPracticePhase;
  questionIndex: number;
  selectedOptionLabel: 'a' | 'b' | 'c' | 'd' | null;
  result: QuestionPracticeResult | null;
  questionStartedAtMs: number;
};

export function createQuestionPracticeFlow(now: number): QuestionPracticeFlow {
  return {
    phase: 'answering',
    questionIndex: 0,
    selectedOptionLabel: null,
    result: null,
    questionStartedAtMs: now,
  };
}

export function selectQuestionOption(
  flow: QuestionPracticeFlow,
  question: PublishedQuestion,
  label: string,
): QuestionPracticeFlow {
  if (flow.phase !== 'answering' || !question.options.some((option) => option.label === label)) return flow;
  return { ...flow, selectedOptionLabel: label as QuestionPracticeFlow['selectedOptionLabel'] };
}

export function submitQuestionOption(
  flow: QuestionPracticeFlow,
  question: PublishedQuestion,
  now: number,
): QuestionPracticeFlow {
  if (flow.phase !== 'answering' || !flow.selectedOptionLabel) return flow;
  return {
    ...flow,
    phase: 'result',
    result: {
      isCorrect: flow.selectedOptionLabel === question.sourceProvidedAnswer.optionLabel,
      selectedOptionLabel: flow.selectedOptionLabel,
      sourceOptionLabel: question.sourceProvidedAnswer.optionLabel,
      timeTakenSeconds: Math.max(0, (now - flow.questionStartedAtMs) / 1000),
    },
  };
}

export function revealQuestionSolution(flow: QuestionPracticeFlow): QuestionPracticeFlow {
  return flow.phase === 'result' ? { ...flow, phase: 'solution' } : flow;
}

export function advanceQuestionPractice(
  flow: QuestionPracticeFlow,
  questionCount: number,
  now: number,
): QuestionPracticeFlow {
  if (flow.phase !== 'solution') return flow;
  if (flow.questionIndex + 1 >= questionCount) {
    return { ...flow, phase: 'complete' };
  }
  return {
    phase: 'answering',
    questionIndex: flow.questionIndex + 1,
    selectedOptionLabel: null,
    result: null,
    questionStartedAtMs: now,
  };
}