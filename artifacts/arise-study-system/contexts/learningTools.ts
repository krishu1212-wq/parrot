export type ReviewCard = {
  id: string;
  batchId: string;
  subjectId: string;
  topicTitle: string;
  question: string;
  answer: string;
  createdAt: string;
};

export type BossTestRecord = {
  id: string;
  gateAttemptId?: string;
  batchId: string;
  date: string;
  weekStart: string;
  results: {
    cardId: string;
    question: string;
    expectedAnswer: string;
    answer: string;
    correct: boolean;
    topicTitle: string;
    subjectId: string;
  }[];
  weakTopics: string[];
};

export type WorkoutSession = {
  id: string;
  date: string;
  duration: number;
};

export type RevisionRecord = {
  id: string;
  date: string;
  cardIds: string[];
  batchId: string;
};

export type StudyExperiment = {
  id: string;
  startDate: string;
  target: string;
  checkIns: string[];
  result?: { date: string; reflection: string; decision: 'continue' | 'change' | 'finish' };
};

export type WordEvidence = {
  bookId: string;
  word: string;
  meaning: string;
  attempts: { date: string; stage: 'learn' | 'recall' | 'practice' | 'revision'; response: string; correct: boolean }[];
};
export type WindDownRecord = { date: string; completedQuestIds: string[]; review: string; tomorrowPriority: string; preparation: string };
export type ConceptLink = { id: string; batchId: string; fromCardId: string; toCardId: string };
export type FocusSession = { id: string; date: string; kind: 'focus' | 'break'; durationSeconds: number; presetMinutes: 25 | 50 | 5 | 10; task: string; completed: boolean };
export type BossRetest = { id: string; sourceTestId: string; batchId: string; date: string; results: BossTestRecord['results'] };
export type QuestionBankMistakeStatus = 'NONE' | 'OPEN' | 'CLEARED';
export type QuestionBankAttempt = {
  id: string;
  bankId: string;
  questionId: string;
  subject: string;
  chapter: string;
  classOrLecture: string;
  topic: string;
  date: string;
  attemptNumber: number;
  selectedOptionLabel: 'a' | 'b' | 'c' | 'd';
  selectedOptionText: string;
  sourceAnswerResult: string;
  correctOptionLabel: 'a' | 'b' | 'c' | 'd';
  isCorrect: boolean;
  timeTakenSeconds: number;
  mistakeStatus: QuestionBankMistakeStatus;
  sourceSha256: string;
};

export type StudyToolsState = {
  reviewCards: ReviewCard[];
  bossTests: BossTestRecord[];
  workoutSessions: WorkoutSession[];
  revisionHistory: RevisionRecord[];
  experiments: StudyExperiment[];
  windDownHour: number;
  wordEvidence?: WordEvidence[];
  windDownReviews?: WindDownRecord[];
  conceptLinks?: ConceptLink[];
  focusHistory?: FocusSession[];
  bossRetests?: BossRetest[];
  questionBankAttempts: QuestionBankAttempt[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

const dateKeyFor = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}`;
};

export const createStudyToolsState = (): StudyToolsState => ({
  reviewCards: [],
  bossTests: [],
  workoutSessions: [],
  revisionHistory: [],
  experiments: [],
  windDownHour: 21,
  questionBankAttempts: [],
});

const requireString = (value: unknown, label: string): string => {
  if (!isString(value)) throw new Error(`Saved study tools data has an invalid ${label}.`);
  return value;
};

const requireDateKey = (value: unknown, label: string): string => {
  if (!isDateKey(value)) throw new Error(`Saved study tools data has an invalid ${label}.`);
  return value;
};

const requireStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    throw new Error(`Saved study tools data has an invalid ${label}.`);
  }
  return [...value];
};

const normalizeReviewCard = (value: unknown): ReviewCard => {
  if (!isRecord(value)) throw new Error('Saved review card is invalid.');
  const createdAt = requireString(value.createdAt, 'review card creation time');
  const datePrefix = /^(\d{4}-\d{2}-\d{2})(?:$|[Tt ])/.exec(createdAt)?.[1];
  if (!createdAt
    || (datePrefix !== undefined && !isDateKey(datePrefix))
    || (!isDateKey(createdAt) && Number.isNaN(Date.parse(createdAt)))) {
    throw new Error('Saved review card creation time is invalid.');
  }
  return {
    id: requireString(value.id, 'review card id'),
    batchId: requireString(value.batchId, 'review card batch id'),
    subjectId: requireString(value.subjectId, 'review card subject id'),
    topicTitle: requireString(value.topicTitle, 'review card topic'),
    question: requireString(value.question, 'review card question'),
    answer: requireString(value.answer, 'review card answer'),
    createdAt,
  };
};

const normalizeBossTest = (value: unknown): BossTestRecord => {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error('Saved boss test is invalid.');
  }
  const results = value.results.map((result) => {
    if (!isRecord(result) || typeof result.correct !== 'boolean') {
      throw new Error('Saved boss test result is invalid.');
    }
    return {
      cardId: requireString(result.cardId, 'boss test card id'),
      question: requireString(result.question, 'boss test question'),
      expectedAnswer: requireString(result.expectedAnswer, 'boss test expected answer'),
      answer: requireString(result.answer, 'boss test answer'),
      correct: result.correct,
      topicTitle: requireString(result.topicTitle, 'boss test topic'),
      subjectId: requireString(result.subjectId, 'boss test subject id'),
    };
  });
  const date = requireDateKey(value.date, 'boss test date');
  const weekStart = requireDateKey(value.weekStart, 'boss test week start');
  if (weekStart !== getWeekStart(date)) throw new Error('Saved boss test week start does not match its local date.');
  return {
    id: requireString(value.id, 'boss test id'),
    ...(value.gateAttemptId === undefined
      ? {}
      : { gateAttemptId: requireString(value.gateAttemptId, 'boss test gate attempt id') }),
    batchId: requireString(value.batchId, 'boss test batch id'),
    date,
    weekStart,
    results,
    weakTopics: requireStringArray(value.weakTopics, 'boss test weak topics'),
  };
};

const normalizeWorkoutSession = (value: unknown): WorkoutSession => {
  if (!isRecord(value) || typeof value.duration !== 'number'
    || !Number.isFinite(value.duration) || value.duration < 0) {
    throw new Error('Saved workout session is invalid.');
  }
  return {
    id: requireString(value.id, 'workout session id'),
    date: requireDateKey(value.date, 'workout session date'),
    duration: value.duration,
  };
};

const normalizeRevisionRecord = (value: unknown): RevisionRecord => {
  if (!isRecord(value)) throw new Error('Saved revision record is invalid.');
  return {
    id: requireString(value.id, 'revision record id'),
    date: requireDateKey(value.date, 'revision record date'),
    cardIds: requireStringArray(value.cardIds, 'revision card ids'),
    batchId: requireString(value.batchId, 'revision batch id'),
  };
};

const normalizeExperiment = (value: unknown): StudyExperiment => {
  if (!isRecord(value)) throw new Error('Saved study experiment is invalid.');
  return {
    id: requireString(value.id, 'study experiment id'),
    startDate: requireDateKey(value.startDate, 'study experiment start date'),
    target: requireString(value.target, 'study experiment target'),
    checkIns: requireStringArray(value.checkIns, 'study experiment check-ins').map(
      (date) => requireDateKey(date, 'study experiment check-in date'),
    ),
    ...(value.result === undefined ? {} : { result: normalizeExperimentResult(value.result) }),
  };
};

const normalizeExperimentResult = (value: unknown): NonNullable<StudyExperiment['result']> => {
  if (!isRecord(value) || !['continue', 'change', 'finish'].includes(String(value.decision))) throw new Error('Saved experiment result is invalid.');
  return { date: requireDateKey(value.date, 'experiment result date'), reflection: requireString(value.reflection, 'experiment reflection'), decision: value.decision as 'continue' | 'change' | 'finish' };
};
const normalizeWordEvidence = (value: unknown): WordEvidence => {
  if (!isRecord(value) || !Array.isArray(value.attempts)) throw new Error('Saved word evidence is invalid.');
  return {
    bookId: requireString(value.bookId, 'word book'), word: requireString(value.word, 'word'),
    meaning: requireString(value.meaning, 'word meaning'),
    attempts: value.attempts.map((attempt) => {
      if (!isRecord(attempt) || !['learn', 'recall', 'practice', 'revision'].includes(String(attempt.stage)) || typeof attempt.correct !== 'boolean') throw new Error('Saved word attempt is invalid.');
      return { date: requireDateKey(attempt.date, 'word attempt date'), stage: attempt.stage as WordEvidence['attempts'][number]['stage'], response: requireString(attempt.response, 'word response'), correct: attempt.correct };
    }),
  };
};
const normalizeWindDown = (value: unknown): WindDownRecord => {
  if (!isRecord(value)) throw new Error('Saved wind-down review is invalid.');
  return { date: requireDateKey(value.date, 'wind-down date'), completedQuestIds: requireStringArray(value.completedQuestIds, 'completed quests'), review: requireString(value.review, 'day review'), tomorrowPriority: requireString(value.tomorrowPriority, 'tomorrow priority'), preparation: requireString(value.preparation, 'preparation') };
};
const normalizeConceptLink = (value: unknown): ConceptLink => {
  if (!isRecord(value)) throw new Error('Saved concept link is invalid.');
  const link = { id: requireString(value.id, 'concept link id'), batchId: requireString(value.batchId, 'concept batch'), fromCardId: requireString(value.fromCardId, 'concept source'), toCardId: requireString(value.toCardId, 'concept target') };
  if (link.fromCardId === link.toCardId) throw new Error('Saved concept link points to itself.');
  return link;
};
const normalizeFocus = (value: unknown): FocusSession => {
  if (!isRecord(value) || !['focus', 'break'].includes(String(value.kind)) || ![25, 50, 5, 10].includes(Number(value.presetMinutes)) || typeof value.durationSeconds !== 'number' || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0 || typeof value.completed !== 'boolean') throw new Error('Saved focus session is invalid.');
  return { id: requireString(value.id, 'focus id'), date: requireDateKey(value.date, 'focus date'), kind: value.kind as FocusSession['kind'], presetMinutes: value.presetMinutes as FocusSession['presetMinutes'], durationSeconds: value.durationSeconds, task: requireString(value.task, 'focus task'), completed: value.completed };
};
const normalizeRetest = (value: unknown): BossRetest => {
  if (!isRecord(value)) throw new Error('Saved Boss retest is invalid.');
  const test = normalizeBossTest({ ...value, weekStart: getWeekStart(requireDateKey(value.date, 'retest date')), weakTopics: [] });
  return { id: test.id, sourceTestId: requireString(value.sourceTestId, 'retest source'), batchId: test.batchId, date: test.date, results: test.results };
};
const normalizeQuestionBankAttempt = (value: unknown): QuestionBankAttempt => {
  if (!isRecord(value) || typeof value.isCorrect !== 'boolean'
    || !['a', 'b', 'c', 'd'].includes(String(value.selectedOptionLabel))
    || !['a', 'b', 'c', 'd'].includes(String(value.correctOptionLabel))
    || !['NONE', 'OPEN', 'CLEARED'].includes(String(value.mistakeStatus))
    || typeof value.attemptNumber !== 'number' || !Number.isInteger(value.attemptNumber) || value.attemptNumber < 1
    || typeof value.timeTakenSeconds !== 'number' || !Number.isFinite(value.timeTakenSeconds) || value.timeTakenSeconds < 0
    || value.isCorrect !== (value.selectedOptionLabel === value.correctOptionLabel)
    || (!value.isCorrect && value.mistakeStatus !== 'OPEN')
    || (value.isCorrect && value.mistakeStatus === 'OPEN')
    || !/^[a-f0-9]{64}$/i.test(String(value.sourceSha256))) {
    throw new Error('Saved Question Bank attempt is invalid.');
  }
  return {
    id: requireString(value.id, 'Question Bank attempt id'),
    bankId: requireString(value.bankId, 'Question Bank id'),
    questionId: requireString(value.questionId, 'Question Bank question id'),
    subject: requireString(value.subject, 'Question Bank subject'),
    chapter: requireString(value.chapter, 'Question Bank chapter'),
    classOrLecture: requireString(value.classOrLecture, 'Question Bank class or lecture'),
    topic: requireString(value.topic, 'Question Bank topic'),
    date: requireDateKey(value.date, 'Question Bank attempt date'),
    attemptNumber: value.attemptNumber,
    selectedOptionLabel: value.selectedOptionLabel as QuestionBankAttempt['selectedOptionLabel'],
    selectedOptionText: requireString(value.selectedOptionText, 'selected Question Bank option'),
    sourceAnswerResult: requireString(value.sourceAnswerResult, 'source Question Bank answer'),
    correctOptionLabel: value.correctOptionLabel as QuestionBankAttempt['correctOptionLabel'],
    isCorrect: value.isCorrect,
    timeTakenSeconds: value.timeTakenSeconds,
    mistakeStatus: value.mistakeStatus as QuestionBankMistakeStatus,
    sourceSha256: requireString(value.sourceSha256, 'Question Bank source hash'),
  };
};
export const normalizeStudyTools = (value: unknown): StudyToolsState => {
  if (value === undefined) return createStudyToolsState();
  if (!isRecord(value)) throw new Error('Saved study tools state is not a valid object.');

  const defaults = createStudyToolsState();
  const readArray = <T>(
    key: keyof Pick<StudyToolsState, 'reviewCards' | 'bossTests' | 'workoutSessions' | 'revisionHistory' | 'experiments' | 'wordEvidence' | 'windDownReviews' | 'conceptLinks' | 'focusHistory' | 'bossRetests' | 'questionBankAttempts'>,
    normalize: (item: unknown) => T,
  ): T[] => {
    const saved = value[key];
    if (saved === undefined) return [];
    if (!Array.isArray(saved)) throw new Error(`Saved study tools ${key} is invalid.`);
    return saved.map(normalize);
  };

  const windDownHour = value.windDownHour === undefined ? defaults.windDownHour : value.windDownHour;
  if (typeof windDownHour !== 'number' || !Number.isInteger(windDownHour)
    || windDownHour < 0 || windDownHour > 23) {
    throw new Error('Saved wind-down hour is invalid.');
  }

  return {
    reviewCards: readArray('reviewCards', normalizeReviewCard),
    bossTests: readArray('bossTests', normalizeBossTest),
    workoutSessions: readArray('workoutSessions', normalizeWorkoutSession),
    revisionHistory: readArray('revisionHistory', normalizeRevisionRecord),
    experiments: readArray('experiments', normalizeExperiment),
    windDownHour,
    ...(value.wordEvidence === undefined ? {} : { wordEvidence: readArray('wordEvidence', normalizeWordEvidence) }),
    ...(value.windDownReviews === undefined ? {} : { windDownReviews: readArray('windDownReviews', normalizeWindDown) }),
    ...(value.conceptLinks === undefined ? {} : { conceptLinks: readArray('conceptLinks', normalizeConceptLink) }),
    ...(value.focusHistory === undefined ? {} : { focusHistory: readArray('focusHistory', normalizeFocus) }),
    ...(value.bossRetests === undefined ? {} : { bossRetests: readArray('bossRetests', normalizeRetest) }),
    questionBankAttempts: readArray('questionBankAttempts', normalizeQuestionBankAttempt),
  };
};

export const getWeekStart = (date: string): string => {
  if (!isDateKey(date)) throw new Error('Date must be a valid YYYY-MM-DD local date.');
  const [year, month, day] = date.split('-').map(Number);
  const localDate = new Date(0);
  localDate.setHours(0, 0, 0, 0);
  localDate.setFullYear(year, month - 1, day);
  const daysSinceMonday = (localDate.getDay() + 6) % 7;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  return dateKeyFor(localDate);
};

const localDateForTimestamp = (value: string): string | null => {
  if (isDateKey(value)) return value;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : dateKeyFor(timestamp);
};

export const getWeeklyReviewCards = (
  cards: ReviewCard[],
  batchId: string,
  date: string,
): ReviewCard[] => {
  const weekStart = getWeekStart(date);
  const [year, month, day] = weekStart.split('-').map(Number);
  const monday = new Date(0);
  monday.setHours(0, 0, 0, 0);
  monday.setFullYear(year, month - 1, day);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const firstDay = dateKeyFor(monday);
  const lastDay = dateKeyFor(sunday);
  return cards.filter((card) => {
    if (card.batchId !== batchId) return false;
    const createdDay = localDateForTimestamp(card.createdAt);
    return createdDay !== null && createdDay >= firstDay && createdDay <= lastDay;
  });
};

export const getWeakTopics = (
  results: BossTestRecord['results'],
): string[] => {
  const missedByTopic = new Map<string, number>();
  for (const result of results) {
    if (!result.correct) {
      missedByTopic.set(result.topicTitle, (missedByTopic.get(result.topicTitle) ?? 0) + 1);
    }
  }
  return [...missedByTopic.entries()]
    .sort(([topicA, countA], [topicB, countB]) => countB - countA || topicA.localeCompare(topicB))
    .map(([topic]) => topic);
};

export const getMissedReviewCards = (
  cards: ReviewCard[],
  test: BossTestRecord | undefined,
  batchId: string,
): ReviewCard[] => {
  if (!test || test.batchId !== batchId) return [];
  const missedCardIds = new Set(test.results.filter((result) => !result.correct).map((result) => result.cardId));
  return cards.filter((card) => card.batchId === batchId && missedCardIds.has(card.id));
};

export const getWeeklyBossTest = (
  tests: BossTestRecord[],
  batchId: string,
  date: string,
): BossTestRecord | undefined => {
  const weekStart = getWeekStart(date);
  return tests.find((test) => !test.gateAttemptId
    && test.batchId === batchId && test.weekStart === weekStart);
};

export const hasExperimentCheckedInOnDate = (
  experiment: StudyExperiment,
  date: string,
): boolean => experiment.checkIns.includes(date);