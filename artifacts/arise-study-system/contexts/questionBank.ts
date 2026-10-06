import reviewDraftJson from '../docs/question-bank-drafts/percentage-class-4.review-draft.json';

export type QuestionBankOption = { label: 'a' | 'b' | 'c' | 'd'; text: string };

export type PublishedQuestion = {
  id: string;
  sectionLabel: string;
  topicLabel: string;
  sourceOrder: number;
  sourceQuestionNumber: number;
  questionPage: number;
  optionPages: number[];
  englishText: string;
  hindiTextRaw: string;
  hindiTextStatus: string;
  options: QuestionBankOption[];
  sourceProvidedAnswer: {
    result: string;
    sourceStatus: string;
    optionLabel: QuestionBankOption['label'];
    optionMatchStatus: 'SOURCE-VERIFIED';
    mathValidationStatus: 'NOT-INDEPENDENTLY-VERIFIED';
    sourcePage: number;
  };
  sourceProvidedSolution: {
    transcription: string;
    sourceStatus: string;
    reviewStatus: string;
    sourcePages: number[];
  };
  reviewStatus: string;
  difficulty: string | null;
};

export type PublishedQuestionBank = {
  id: string;
  publicationStatus: 'LIVE';
  subject: string;
  chapter: string;
  classOrLecture: string;
  source: {
    file: string;
    sha256: string;
    pageCount: number;
    visibleWatermark: string;
    rightsStatus: string;
    rawTextLayerDump: string;
  };
  questions: PublishedQuestion[];
};

type ReviewDraftQuestion = {
  id: string;
  sectionLabel: string;
  sourceOrder: number;
  sourceQuestionNumber: number;
  questionPage: number;
  optionPages: number[];
  englishText: string;
  hindiTextRaw: string;
  hindiTextStatus: string;
  options: QuestionBankOption[];
  handwrittenAnswer: {
    result: string;
    sourceStatus: string;
    reviewStatus: string;
    verifiedOptionLabel: QuestionBankOption['label'] | null;
    sourcePage: number;
  };
  handwrittenSolution: {
    transcription: string;
    sourceStatus: string;
    reviewStatus: string;
    sourcePages: number[];
  };
  reviewStatus: string;
  difficulty: string | null;
};

type ReviewDraft = {
  draftId: string;
  hierarchy: { subject: string; chapter: string; classOrLecture: string };
  source: PublishedQuestionBank['source'];
  questions: ReviewDraftQuestion[];
};

const sourceDraft = reviewDraftJson as unknown as ReviewDraft;
const expectedOptionLabels: QuestionBankOption['label'][] = ['a', 'b', 'c', 'd'];

if (sourceDraft.draftId !== 'mathematics-percentage-class-4'
  || sourceDraft.hierarchy.subject !== 'Mathematics'
  || sourceDraft.hierarchy.chapter !== 'Percentage'
  || sourceDraft.hierarchy.classOrLecture !== 'Class 4'
  || sourceDraft.questions.length !== 35) {
  throw new Error('The approved Percentage Class 4 source dataset does not match its publication scope.');
}

const seenQuestionKeys = new Set<string>();

export const percentageClass4QuestionBank: PublishedQuestionBank = {
  id: sourceDraft.draftId,
  publicationStatus: 'LIVE',
  subject: sourceDraft.hierarchy.subject,
  chapter: sourceDraft.hierarchy.chapter,
  classOrLecture: sourceDraft.hierarchy.classOrLecture,
  source: { ...sourceDraft.source },
  questions: sourceDraft.questions.map((item) => {
    const key = `${item.sectionLabel}:${item.sourceQuestionNumber}`;
    if (seenQuestionKeys.has(key)) throw new Error(`Duplicate printed question number inside section: ${key}`);
    seenQuestionKeys.add(key);
    if (item.options.length !== 4
      || item.options.some((option, index) => option.label !== expectedOptionLabels[index])) {
      throw new Error(`Question ${item.id} does not contain the four source options in a/b/c/d order.`);
    }
    const mappedOptions = item.options.filter((option) => option.text === item.handwrittenAnswer.result);
    if (item.handwrittenAnswer.reviewStatus !== 'SOURCE-VERIFIED'
      || !item.handwrittenAnswer.verifiedOptionLabel
      || mappedOptions.length !== 1
      || mappedOptions[0].label !== item.handwrittenAnswer.verifiedOptionLabel) {
      throw new Error(`Question ${item.id} has no unique source-verified answer-to-option match.`);
    }
    if (!item.questionPage || !item.optionPages.length || !item.handwrittenAnswer.sourcePage
      || !item.handwrittenSolution.sourcePages.length) {
      throw new Error(`Question ${item.id} is missing source page references.`);
    }

    return {
      id: item.id,
      sectionLabel: item.sectionLabel,
      topicLabel: item.sectionLabel,
      sourceOrder: item.sourceOrder,
      sourceQuestionNumber: item.sourceQuestionNumber,
      questionPage: item.questionPage,
      optionPages: [...item.optionPages],
      englishText: item.englishText,
      hindiTextRaw: item.hindiTextRaw,
      hindiTextStatus: item.hindiTextStatus,
      options: item.options.map((option) => ({ ...option })),
      sourceProvidedAnswer: {
        result: item.handwrittenAnswer.result,
        sourceStatus: item.handwrittenAnswer.sourceStatus,
        optionLabel: item.handwrittenAnswer.verifiedOptionLabel,
        optionMatchStatus: 'SOURCE-VERIFIED',
        mathValidationStatus: 'NOT-INDEPENDENTLY-VERIFIED',
        sourcePage: item.handwrittenAnswer.sourcePage,
      },
      sourceProvidedSolution: {
        transcription: item.handwrittenSolution.transcription,
        sourceStatus: item.handwrittenSolution.sourceStatus,
        reviewStatus: item.handwrittenSolution.reviewStatus,
        sourcePages: [...item.handwrittenSolution.sourcePages],
      },
      reviewStatus: item.reviewStatus,
      difficulty: item.difficulty,
    };
  }),
};

export function getPublishedQuestionBank(id: string): PublishedQuestionBank | undefined {
  return id === percentageClass4QuestionBank.id ? percentageClass4QuestionBank : undefined;
}

export function getPublishedQuestion(bankId: string, questionId: string): PublishedQuestion | undefined {
  const bank = getPublishedQuestionBank(bankId);
  return bank?.questions.find((question) => question.id === questionId);
}