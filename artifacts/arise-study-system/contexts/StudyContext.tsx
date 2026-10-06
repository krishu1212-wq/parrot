import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { completeQuestInState, isPhaseTwoSubject } from '@/contexts/studyActivityRules';
import { validateSavedStudyState } from '@/contexts/savedStudyValidation';
import {
  createEmptyAchievementHistory,
  deriveCurrentAchievementIds,
  readAchievementHistory,
  updateAchievementHistory,
} from '@/contexts/achievementHistory';
import {
  appendProgressHistoryEvent,
  captureMissedQuestRollover,
  captureProgressHistoryTransition,
  createEmptyProgressHistory,
  createProgressHistoryTicket,
  finalizeRpgProgressHistory,
  normalizeProgressHistory,
} from '@/contexts/progressHistory';
import type { ProgressHistoryEventType } from '@/contexts/progressHistory';
import {
  levelFromTotalXp as levelFromXp,
  rankDefinitionForProgress,
  rankForProgress,
  XP_PER_LEVEL,
} from '@/contexts/rankSystem';
import { advanceRpgStudyState, applyRpgCommand, createEmptyRpgState, normalizeRpgState } from '@/contexts/rpgSystem';
import type { EquipmentSlot, RpgCommand, RpgState } from '@/contexts/rpgTypes';
import { getGateDefinition } from '@/contexts/rpgCatalog';
import type {
  AchievementEvidence,
  AchievementEvidenceSources,
  AchievementHistory,
} from '@/contexts/achievementHistory';
import { createStudyToolsState, normalizeStudyTools, getWeekStart, getWeeklyReviewCards } from '@/contexts/learningTools';
import type { StudyToolsState, ReviewCard, BossTestRecord } from '@/contexts/learningTools';
import type { WordEvidence, WindDownRecord, StudyExperiment, FocusSession, BossRetest } from '@/contexts/learningTools';
import { validateCalculationAnswers } from '@/contexts/calculationEvidence';
import { isProfileHapticsEnabled } from '@/contexts/profilePreferences';
import type { CalculationAnswer } from '@/contexts/calculationEvidence';
import { getPublishedQuestion, getPublishedQuestionBank } from '@/contexts/questionBank';
import type { QuestionBankAttempt } from '@/contexts/learningTools';
import {
  completeVocabularyDailyPage as completeDailyVocabularyPage,
  prepareVocabularyDailyProgress,
  selectVocabularyDailyCategory,
} from '@/contexts/vocabularyProgress';
import {
  createNcertBooksFromShelves,
  NcertProgressLedger,
  prepareNcertProgressState,
  summarizeNcertProgress,
} from '@/contexts/ncertProgress';
import {
  ANONYMOUS_STUDY_STORAGE_KEY,
  STUDY_STORAGE_BACKUP_KEY,
  claimStudyStorageOwner,
  drainStudyStorageQueue,
  getAccountStudyStorageKey,
  isStudyStorageOwnerCurrent,
  withStudyStorageQueue,
} from '@/contexts/accountStudyVault';
import { persistAccountStudyVaultSnapshot } from '@/services/accountStudyVaultPersistence';
import {
  createInitialStudyBatch,
  createRecordId,
  createStudyBatch as makeStudyBatch,
  getBatchProgress,
  getNextLecture,
  getProtectedLectureCount,
  MAX_TOPIC_LECTURES,
  isPhaseOneComplete,
  normalizeBatchCollection,
  resizeTopicLectures,
  StudyBatch,
  StudyLecture,
  StudySubject,
  StudyTopic,
} from '@/contexts/batchSystem';

const STORAGE_KEY = ANONYMOUS_STUDY_STORAGE_KEY;
const LEGACY_BACKUP_KEY = STUDY_STORAGE_BACKUP_KEY;

export type Quest = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  xp: number;
  completed: boolean;
  isRecovery?: boolean;
};

export type MathsTopic = {
  id: string;
  section: 'ARITHMETIC' | 'ADVANCE';
  title: string;
  total: number;
  completed: number;
};

export type NcertShelf = {
  id: string;
  classLabel: string;
  bookCount: number;
  completed: number;
  sessions: number;
  vocabulary: number;
};

export type NcertBook = {
  id: string;
  classId: string;
  classLabel: string;
  title: string;
  totalSessions: number;
  completedSessions: number;
  vocabulary: string[];
};

export type VocabularySection = {
  id: string;
  title: string;
  pages: number;
  completed: number;
};

export type CalculationSession = {
  id: string;
  date: string;
  questions: number;
  correct: number;
  accuracy: number;
  duration: number;
  answers?: CalculationAnswer[];
};

export type StudyState = {
  date: string;
  lastActiveDate: string;
  streak: number;
  totalXp: number;
  quests: Quest[];
  recoveryAvailable: boolean;
  recoveryXp: number;
  ncertCompleted: number;
  ncertTotal: number;
  blackBookPage: number;
  blackBookTotal: number;
  batches: StudyBatch[];
  activeBatchId: string;
  ncertShelves: NcertShelf[];
  ncertBooks: NcertBook[];
  ncertCatalogVersion: number;
  ncertProgressLedger?: NcertProgressLedger;
  vocabularySections: VocabularySection[];
  currentVocabularySectionId: string;
  currentVocabularyPage: number;
  vocabularyDailyDate: string;
  vocabularyDailyCompleted: boolean;
  calculationHistory: CalculationSession[];
  studyTools: StudyToolsState;
  achievementHistory?: AchievementHistory;
  progressHistory?: import('@/contexts/progressHistory').ProgressHistory;
  rpg?: RpgState;
};

function playProfileHaptic(feedback: () => Promise<unknown>): void {
  if (isProfileHapticsEnabled()) void feedback().catch(() => undefined);
}

type StudyContextValue = {
  state: StudyState;
  hydrated: boolean;
  todayXp: number;
  level: number;
  nextLevelXp: number;
  levelProgress: number;
  rank: string;
  completedCount: number;
  phaseTwoUnlocked: boolean;
  studyTools: StudyToolsState;
  rpg: RpgState;
  rpgError: string | null;
  resetLocalProfile: () => Promise<void>;
  clearRpgError: () => void;
  enterGate: (gateId: string) => void;
  abandonGate: (attemptId: string) => void;
  useInventoryItem: (itemId: string) => void;
  equipItem: (itemId: string) => void;
  unequipSlot: (slot: EquipmentSlot) => void;
  acknowledgeRpgPresentation: (eventId: string) => void;
  refreshRpgClock: () => void;
  completeQuest: (questId: string) => void;
  refreshStudyDay: () => void;
  isSubjectLocked: (subjectId: string) => boolean;
  updateNcertBookTarget: (bookId: string, totalSessions: number) => boolean;
  saveReviewCard: (details: Omit<ReviewCard, 'id' | 'createdAt'>) => void;
  saveBossTest: (details: Omit<BossTestRecord, 'id'>) => void;
  saveGateBossTest: (details: Omit<BossTestRecord, 'id' | 'gateAttemptId'>) => void;
  logWorkout: (duration: number) => void;
  logRevision: (cardIds: string[], batchId: string) => void;
  startExperiment: (target: string) => void;
  checkInExperiment: (id: string) => void;
  finishExperiment: (id: string, reflection: string, decision: 'continue' | 'change' | 'finish', nextTarget?: string) => void;
  saveWordAttempt: (bookId: string, word: string, meaning: string, attempt: Omit<WordEvidence['attempts'][number], 'date'>) => void;
  saveWindDownReview: (details: Pick<WindDownRecord, 'review' | 'tomorrowPriority' | 'preparation'>) => void;
  addConceptLink: (fromCardId: string, toCardId: string) => void;
  removeConceptLink: (id: string) => void;
  logFocusSession: (details: Omit<FocusSession, 'id' | 'date'>) => void;
  saveBossRetest: (details: Omit<BossRetest, 'id'>) => void;
  setWindDownHour: (hour: number) => void;
  levelUp: number | null;
  activeBatch: StudyBatch;
  activeBatchProgress: ReturnType<typeof getBatchProgress>;
  nextLecture: ReturnType<typeof getNextLecture>;
  toggleQuest: (questId: string) => void;
  acceptRecoveryQuest: () => void;
  dismissLevelUp: () => void;
  setActiveBatch: (batchId: string) => void;
  createBatch: (details: { name: string; source: string; startDate: string }) => void;
  updateBatch: (batchId: string, details: { name: string; source: string; startDate: string }) => void;
  addBatchSubject: (name: string) => string | null;
  addBatchTopic: (subjectId: string, title: string, category: string, lectureCount?: number) => string | null;
  updateBatchSubject: (subjectId: string, name: string) => string | null;
  updateBatchTopic: (subjectId: string, topicId: string, details: { title: string; category: string; isArchived: boolean; lectureCount?: number }) => boolean;
  addBatchLecture: (subjectId: string, topicId: string, details: { title: string; link: string; xpReward: number }) => string | null;
  updateBatchLecture: (subjectId: string, topicId: string, lectureId: string, details: { title: string; link: string; xpReward: number; isArchived: boolean }) => void;
  startLecture: (subjectId: string, topicId: string, lectureId: string) => void;
  completeLecture: (subjectId: string, topicId: string, lectureId: string) => void;
  advanceNcertShelf: (shelfId: string) => void;
  advanceNcertBookSession: (bookId: string) => void;
  addNcertVocabulary: (bookId: string, word: string) => void;
  selectVocabularySection: (sectionId: string) => void;
  completeVocabularyPage: (sectionId: string) => void;
  addCalculationSession: (session: Omit<CalculationSession, 'id' | 'date'>) => void;
  recordQuestionBankAttempt: (details: {
    bankId: string;
    questionId: string;
    selectedOptionLabel: 'a' | 'b' | 'c' | 'd';
    timeTakenSeconds: number;
  }) => boolean;
  recordProgressActivity: (
    type: ProgressHistoryEventType,
    idempotencyKey: string,
    metadata?: Record<string, unknown>,
  ) => void;
};

const defaultQuests: Quest[] = [
  {
    id: 'morning-workout',
    title: 'Morning Workout',
    subtitle: 'Wake the body. Start the system.',
    category: 'FOUNDATION',
    xp: 80,
    completed: false,
  },
  {
    id: 'black-book',
    title: 'Black Book Vocabulary',
    subtitle: '1 page · collect unfamiliar words',
    category: 'ENGLISH',
    xp: 100,
    completed: false,
  },
  {
    id: 'timed-calculation',
    title: 'Timed Calculation Practice',
    subtitle: '90 seconds · build speed under pressure',
    category: 'MATHS',
    xp: 120,
    completed: false,
  },
  {
    id: 'maths-lecture',
    title: 'Maths · 1 Lecture',
    subtitle: 'Advance the current topic',
    category: 'MATHS',
    xp: 160,
    completed: false,
  },
  {
    id: 'ncert-reading',
    title: 'NCERT Reading',
    subtitle: 'Read one focused chapter or session',
    category: 'GENERAL',
    xp: 100,
    completed: false,
  },
  {
    id: 'ncert-vocabulary',
    title: 'NCERT Vocabulary',
    subtitle: 'Note, review, and learn',
    category: 'GENERAL',
    xp: 100,
    completed: false,
  },
];

const createMathsTopics = (): MathsTopic[] => [
  { id: 'percentage', section: 'ARITHMETIC', title: 'Percentage', total: 15, completed: 3 },
  { id: 'ci', section: 'ARITHMETIC', title: 'C.I.', total: 6, completed: 4 },
  { id: 'si', section: 'ARITHMETIC', title: 'S.I.', total: 6, completed: 3 },
  { id: 'profit-loss', section: 'ARITHMETIC', title: 'Profit and Loss', total: 7, completed: 5 },
  { id: 'ratio-proportion', section: 'ARITHMETIC', title: 'Ratio and Proportion', total: 8, completed: 3 },
  { id: 'mixture-alligation', section: 'ARITHMETIC', title: 'Mixture Alligation', total: 6, completed: 0 },
  { id: 'average', section: 'ARITHMETIC', title: 'Average', total: 6, completed: 0 },
  { id: 'statistics', section: 'ARITHMETIC', title: 'Statistics', total: 3, completed: 0 },
  { id: 'time-work', section: 'ARITHMETIC', title: 'Time and Work', total: 9, completed: 0 },
  { id: 'time-speed-distance', section: 'ARITHMETIC', title: 'Time, Speed & Distance', total: 9, completed: 0 },
  { id: 'boat-stream', section: 'ARITHMETIC', title: 'Boat and Stream', total: 1, completed: 0 },
  { id: 'linear-race', section: 'ARITHMETIC', title: 'Linear Race', total: 1, completed: 0 },
  { id: 'circular-race', section: 'ARITHMETIC', title: 'Circular Race', total: 1, completed: 0 },
  { id: 'lcm-hcf', section: 'ARITHMETIC', title: 'LCM and HCF', total: 5, completed: 0 },
  { id: 'data-interpretation', section: 'ARITHMETIC', title: 'Data Interpretation', total: 3, completed: 0 },
  { id: 'coordinate-geometry', section: 'ARITHMETIC', title: 'Coordinate Geometry', total: 9, completed: 0 },
  { id: 'probability', section: 'ARITHMETIC', title: 'Probability', total: 5, completed: 0 },
  { id: 'logarithm', section: 'ARITHMETIC', title: 'Logarithm', total: 2, completed: 0 },
  { id: 'permutation-combination', section: 'ARITHMETIC', title: 'Permutation and Combination', total: 5, completed: 0 },
  { id: 'number-digit', section: 'ADVANCE', title: 'Number of Digit', total: 2, completed: 0 },
  { id: 'decimal', section: 'ADVANCE', title: 'Decimal', total: 1, completed: 0 },
  { id: 'digital-sum', section: 'ADVANCE', title: 'Digital Sum', total: 1, completed: 0 },
  { id: 'classification-number', section: 'ADVANCE', title: 'Classification of Number', total: 4, completed: 0 },
  { id: 'divisibility', section: 'ADVANCE', title: 'Divisibility', total: 7, completed: 0 },
  { id: 'remainder-theorem', section: 'ADVANCE', title: 'Remainder Theorem', total: 4, completed: 0 },
  { id: 'ap', section: 'ADVANCE', title: 'A.P.', total: 4, completed: 0 },
  { id: 'gp', section: 'ADVANCE', title: 'G.P.', total: 1, completed: 0 },
  { id: 'unit-digit', section: 'ADVANCE', title: 'Unit Digit', total: 1, completed: 0 },
  { id: 'trailing-zeroes', section: 'ADVANCE', title: 'Trailing Zeroes', total: 1, completed: 0 },
  { id: 'number-factors', section: 'ADVANCE', title: 'No of Factors', total: 1, completed: 0 },
  { id: 'fraction', section: 'ADVANCE', title: 'Fraction', total: 2, completed: 0 },
  { id: 'bodmas', section: 'ADVANCE', title: 'BODMAS', total: 1, completed: 0 },
  { id: 'series', section: 'ADVANCE', title: 'Series', total: 2, completed: 0 },
  { id: 'power-surd', section: 'ADVANCE', title: 'Power & Surd', total: 6, completed: 0 },
  { id: 'componendo', section: 'ADVANCE', title: 'Componendo', total: 1, completed: 0 },
  { id: 'algebraic-formula', section: 'ADVANCE', title: 'Algebraic Formula', total: 4, completed: 0 },
  { id: 'algebraic-result', section: 'ADVANCE', title: 'Algebraic Result', total: 6, completed: 0 },
  { id: 'algebraic-identity', section: 'ADVANCE', title: 'Algebraic Identity', total: 3, completed: 0 },
  { id: 'algebra', section: 'ADVANCE', title: 'Algebra', total: 1, completed: 0 },
  { id: 'trigonometry', section: 'ADVANCE', title: 'Trigonometry', total: 10, completed: 0 },
  { id: 'height-distance', section: 'ADVANCE', title: 'Height and Distance', total: 2, completed: 0 },
  { id: 'geometry', section: 'ADVANCE', title: 'Geometry', total: 24, completed: 0 },
  { id: 'mensuration-2d', section: 'ADVANCE', title: 'Mensuration 2D', total: 13, completed: 0 },
  { id: 'mensuration-3d', section: 'ADVANCE', title: 'Mensuration 3D', total: 13, completed: 0 },
];

const createNcertShelves = (): NcertShelf[] => [
  { id: 'class-1', classLabel: 'CLASS 01', bookCount: 5, completed: 2, sessions: 4, vocabulary: 12 },
  { id: 'class-2', classLabel: 'CLASS 02', bookCount: 5, completed: 2, sessions: 3, vocabulary: 9 },
  { id: 'class-3', classLabel: 'CLASS 03', bookCount: 5, completed: 2, sessions: 3, vocabulary: 8 },
  { id: 'class-4', classLabel: 'CLASS 04', bookCount: 6, completed: 2, sessions: 4, vocabulary: 10 },
  { id: 'class-5', classLabel: 'CLASS 05', bookCount: 7, completed: 2, sessions: 3, vocabulary: 11 },
  { id: 'class-6', classLabel: 'CLASS 06', bookCount: 7, completed: 2, sessions: 4, vocabulary: 15 },
  { id: 'class-7', classLabel: 'CLASS 07', bookCount: 8, completed: 2, sessions: 4, vocabulary: 14 },
  { id: 'class-8', classLabel: 'CLASS 08', bookCount: 8, completed: 0, sessions: 0, vocabulary: 0 },
  { id: 'class-9', classLabel: 'CLASS 09', bookCount: 9, completed: 0, sessions: 0, vocabulary: 0 },
  { id: 'class-10', classLabel: 'CLASS 10', bookCount: 10, completed: 0, sessions: 0, vocabulary: 0 },
  { id: 'class-11', classLabel: 'CLASS 11', bookCount: 11, completed: 0, sessions: 0, vocabulary: 0 },
  { id: 'class-12', classLabel: 'CLASS 12', bookCount: 10, completed: 0, sessions: 0, vocabulary: 0 },
];

const createVocabularySections = (): VocabularySection[] => [
  { id: 'one-word', title: 'One Word', pages: 67, completed: 12 },
  { id: 'idioms', title: 'Idioms', pages: 70, completed: 10 },
  { id: 'syno-anto', title: 'Synonyms/Antonyms', pages: 75, completed: 8 },
  { id: 'phrasal-verbs', title: 'Phrasal Verbs', pages: 22, completed: 4 },
  { id: 'fixed-preposition', title: 'Fixed Preposition', pages: 15, completed: 2 },
  { id: 'hindu-vocabulary', title: 'The Hindu Vocabulary', pages: 37, completed: 4 },
  { id: 'homonyms', title: 'Homonyms', pages: 20, completed: 2 },
];

const ncertCompletedFrom = (shelves: NcertShelf[]) => shelves.reduce((sum, shelf) => sum + shelf.completed, 0);
const ncertTotalFrom = (shelves: NcertShelf[]) => shelves.reduce((sum, shelf) => sum + shelf.bookCount, 0);
const vocabularyCompletedFrom = (sections: VocabularySection[]) => sections.reduce((sum, section) => sum + section.completed, 0);
const vocabularyTotalFrom = (sections: VocabularySection[]) => sections.reduce((sum, section) => sum + section.pages, 0);
const initialMathsTopics = createMathsTopics();
const initialNcertShelves = createNcertShelves();
const initialNcertBooks = createNcertBooksFromShelves(initialNcertShelves);
const initialVocabularySections = createVocabularySections();

const achievementEvidenceFromState = (state: StudyState): AchievementEvidence => ({
  streak: state.streak,
  batches: state.batches,
  calculationHistory: state.calculationHistory,
  blackBookPage: state.blackBookPage,
  blackBookTotal: state.blackBookTotal,
  bossTests: state.studyTools.bossTests,
  ncertBooks: state.ncertBooks,
});

const ALL_ACHIEVEMENT_EVIDENCE_SOURCES: AchievementEvidenceSources = {
  streak: true,
  batches: true,
  calculationHistory: true,
  vocabulary: true,
  bossTests: true,
  ncertBooks: true,
};

const newlyCompletedLectureKeys = (previous: StudyState, next: StudyState): string[] => {
  const wasCompleted = new Set<string>();
  for (const batch of previous.batches) {
    for (const subject of batch.subjects) {
      for (const topic of subject.topics) {
        for (const lecture of topic.lectures) {
          if (lecture.status === 'completed') {
            wasCompleted.add(JSON.stringify([batch.id, subject.id, topic.id, lecture.id]));
          }
        }
      }
    }
  }
  const newlyCompleted: string[] = [];
  for (const batch of next.batches) {
    for (const subject of batch.subjects) {
      for (const topic of subject.topics) {
        for (const lecture of topic.lectures) {
          const key = JSON.stringify([batch.id, subject.id, topic.id, lecture.id]);
          if (lecture.status === 'completed' && !wasCompleted.has(key)) newlyCompleted.push(key);
        }
      }
    }
  }
  return newlyCompleted;
};

const achievementEvidenceFromMutation = (
  previous: StudyState,
  next: StudyState,
): { evidence: AchievementEvidence; evidenceSources: AchievementEvidenceSources; metadata: {
  observedCompletedLectureIds: string[];
  observedVocabularyPageCount: number;
} } => {
  const previousHistory = readAchievementHistory(previous.achievementHistory);
  const evidenceSources = {
    ...ALL_ACHIEVEMENT_EVIDENCE_SOURCES,
    ...previousHistory.evidenceSources,
  };
  const previousIds = new Set(deriveCurrentAchievementIds(achievementEvidenceFromState(previous)));
  const nextIds = new Set(deriveCurrentAchievementIds(achievementEvidenceFromState(next)));
  const crossedLectureMilestone = (['first-lecture', 'ten-lectures', 'hundred-lectures'] as const)
    .some((id) => nextIds.has(id) && !previousIds.has(id));
  const vocabularyChanged = next.blackBookPage !== previous.blackBookPage;
  const observedCompletedLectureIds = new Set(previousHistory.observedCompletedLectureIds ?? []);
  if (!evidenceSources.batches) {
    for (const id of newlyCompletedLectureKeys(previous, next)) observedCompletedLectureIds.add(id);
  }
  const completedLectures = evidenceSources.batches && crossedLectureMilestone
    ? next.batches
    : !evidenceSources.batches && observedCompletedLectureIds.size
      ? [{
        id: 'observed-lecture-history',
        subjects: [{
          id: 'observed-completions',
          topics: [{
            id: 'observed-completions',
            lectures: [...observedCompletedLectureIds].map((id) => ({ id, status: 'completed' })),
          }],
        }],
      }]
      : [];
  let streak = evidenceSources.streak && next.streak !== previous.streak ? next.streak : 0;
  if (!evidenceSources.streak && previous.streak === 0 && next.streak > 0) {
    evidenceSources.streak = true;
    streak = next.streak;
  }
  if (!evidenceSources.calculationHistory && next.calculationHistory.length > previous.calculationHistory.length) {
    evidenceSources.calculationHistory = true;
  }
  if (!evidenceSources.bossTests && next.studyTools.bossTests.length > previous.studyTools.bossTests.length) {
    evidenceSources.bossTests = true;
  }
  const observedVocabularyPageCount = previousHistory.observedVocabularyPageCount ?? 0;
  const newVocabularyPages = !evidenceSources.vocabulary && vocabularyChanged
    ? Math.max(0, next.blackBookPage - previous.blackBookPage)
    : 0;
  const evidence: AchievementEvidence = {
    streak,
    batches: completedLectures,
    calculationHistory: evidenceSources.calculationHistory
      && next.calculationHistory !== previous.calculationHistory
      ? next.calculationHistory
      : [],
    blackBookPage: evidenceSources.vocabulary
      ? vocabularyChanged ? next.blackBookPage : 0
      : observedVocabularyPageCount + newVocabularyPages,
    blackBookTotal: evidenceSources.vocabulary && vocabularyChanged ? next.blackBookTotal : 0,
    bossTests: evidenceSources.bossTests && next.studyTools.bossTests !== previous.studyTools.bossTests
      ? next.studyTools.bossTests
      : [],
    ncertBooks: evidenceSources.ncertBooks && next.ncertBooks !== previous.ncertBooks
      ? next.ncertBooks
      : [],
  };
  return {
    evidence,
    evidenceSources,
    metadata: {
      observedCompletedLectureIds: [...observedCompletedLectureIds],
      observedVocabularyPageCount: observedVocabularyPageCount + newVocabularyPages,
    },
  };
};

const dateKey = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateDifference = (from: string, to: string) => {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
};

const createInitialState = (): StudyState => {
  const state: StudyState = {
    date: dateKey(),
    lastActiveDate: dateKey(),
    streak: 4,
    totalXp: 1240,
    quests: defaultQuests,
    recoveryAvailable: false,
    recoveryXp: 0,
    ncertCompleted: 14,
    ncertTotal: 91,
    blackBookPage: 42,
    blackBookTotal: 306,
    batches: [createInitialStudyBatch(initialMathsTopics)],
    activeBatchId: 'current-batch',
    ncertShelves: initialNcertShelves,
    ncertBooks: initialNcertBooks,
    ncertCatalogVersion: 1,
    ncertProgressLedger: summarizeNcertProgress(initialNcertBooks, initialNcertShelves).ledger,
    vocabularySections: initialVocabularySections,
    currentVocabularySectionId: initialVocabularySections[0].id,
    currentVocabularyPage: initialVocabularySections[0].completed + 1,
    vocabularyDailyDate: dateKey(),
    vocabularyDailyCompleted: false,
    calculationHistory: [],
    studyTools: createStudyToolsState(),
    achievementHistory: createEmptyAchievementHistory(),
    progressHistory: createEmptyProgressHistory(),
    rpg: createEmptyRpgState(1240),
  };
  const achievementHistory = updateAchievementHistory(
    state.achievementHistory,
    achievementEvidenceFromState(state),
    state.streak,
  );
  return {
    ...state,
    achievementHistory: {
      ...achievementHistory,
      evidenceSources: { ...ALL_ACHIEVEMENT_EVIDENCE_SOURCES },
    },
  };
};

// New account and anonymous profiles share the same clean defaults. Existing
// snapshots are hydrated first and never replaced by these defaults.
export const createCleanAccountStudyState = (): StudyState => {
  const shelves = createNcertShelves().map((shelf) => ({
    ...shelf,
    completed: 0,
    sessions: 0,
    vocabulary: 0,
  }));
  const books = createNcertBooksFromShelves(shelves);
  const topics = createMathsTopics().map((topic) => ({ ...topic, completed: 0 }));
  const batch = createInitialStudyBatch(topics);
  const vocabularySections = createVocabularySections().map((section) => ({
    ...section,
    completed: 0,
  }));
  const state = createInitialState();
  return {
    ...state,
    streak: 0,
    totalXp: 0,
    quests: defaultQuests.map((quest) => ({ ...quest, completed: false })),
    recoveryAvailable: false,
    recoveryXp: 0,
    ncertCompleted: 0,
    ncertTotal: ncertTotalFrom(shelves),
    blackBookPage: 0,
    blackBookTotal: vocabularyTotalFrom(vocabularySections),
    batches: [batch],
    activeBatchId: batch.id,
    ncertShelves: shelves,
    ncertBooks: books,
    ncertProgressLedger: summarizeNcertProgress(books, shelves).ledger,
    vocabularySections,
    currentVocabularySectionId: vocabularySections[0].id,
    currentVocabularyPage: 1,
    vocabularyDailyDate: dateKey(),
    vocabularyDailyCompleted: false,
    calculationHistory: [],
    studyTools: createStudyToolsState(),
    progressHistory: createEmptyProgressHistory(),
    rpg: createEmptyRpgState(0),
    achievementHistory: {
      ...createEmptyAchievementHistory(),
      evidenceSources: { ...ALL_ACHIEVEMENT_EVIDENCE_SOURCES },
    },
  };
};

type SavedStudyState = Partial<StudyState> & {
  mathsTopics?: MathsTopic[];
  mathsCompleted?: number;
  mathsTotal?: number;
};

const prepareStateForToday = (saved: SavedStudyState): StudyState => {
  validateSavedStudyState(saved);
  // Keep the observed value before the day-boundary logic can reset the live streak.
  const rawSavedStreak = saved.streak;
  const previousHistory = readAchievementHistory(saved.achievementHistory);
  const today = dateKey();
  const {
    mathsTopics: legacyMathsTopics,
    mathsCompleted: _legacyMathsCompleted,
    mathsTotal: _legacyMathsTotal,
    ...savedWithoutLegacyMaths
  } = saved;
  const batchCollection = normalizeBatchCollection(
    saved.batches,
    saved.activeBatchId,
    legacyMathsTopics,
    createMathsTopics(),
  );
  const normalizedSaved = {
    ...createCleanAccountStudyState(),
    ...savedWithoutLegacyMaths,
    ...batchCollection,
    streak: saved.streak ?? 0,
    achievementHistory: previousHistory,
    progressHistory: normalizeProgressHistory(saved.progressHistory),
    rpg: normalizeRpgState(saved.rpg, saved.totalXp ?? 0, new Date().toISOString(),
      rankDefinitionForProgress(saved.totalXp ?? 0, saved.progressHistory).id),
  } as StudyState;
  const evidenceSources = previousHistory.evidenceSources ?? {
    streak: saved.streak !== undefined,
    batches: Array.isArray(saved.batches) || Array.isArray(legacyMathsTopics),
    calculationHistory: Array.isArray(saved.calculationHistory),
    vocabulary: Array.isArray(saved.vocabularySections)
      || (saved.blackBookPage !== undefined && saved.blackBookTotal !== undefined),
    bossTests: typeof saved.studyTools === 'object' && saved.studyTools !== null
      && Array.isArray((saved.studyTools as Record<string, unknown>).bossTests),
    ncertBooks: Array.isArray(saved.ncertBooks),
  };
  const ncertProgress = prepareNcertProgressState(
    saved.ncertShelves,
    saved.ncertBooks,
    saved.ncertCatalogVersion,
    saved.ncertProgressLedger,
    createNcertShelves(),
  );
  const ncertBooks = ncertProgress.books as NcertBook[];
  const ncertShelves = ncertProgress.shelves;
  const vocabularySections = saved.vocabularySections ?? createVocabularySections();
  const vocabularyProgress = prepareVocabularyDailyProgress(
    vocabularySections,
    normalizedSaved,
    today,
  );
  const prepared: StudyState = {
    ...normalizedSaved,
    quests: normalizedSaved.quests.map((quest) => quest.id === 'timed-calculation'
      ? { ...quest, subtitle: '90 seconds · build speed under pressure' } : quest),
    ncertShelves,
    ncertBooks,
    ncertCatalogVersion: 1,
    ncertProgressLedger: ncertProgress.ledger,
    vocabularySections,
    ...vocabularyProgress,
    calculationHistory: (saved.calculationHistory ?? []).map((session) => {
      const answers = validateCalculationAnswers(session.answers, session.questions, session.correct, session.duration);
      return answers === undefined ? session : { ...session, answers };
    }),
    studyTools: normalizeStudyTools(saved.studyTools),
    recoveryXp: saved.recoveryXp ?? 0,
    ncertTotal: ncertTotalFrom(ncertShelves),
    ncertCompleted: ncertCompletedFrom(ncertShelves),
    blackBookTotal: vocabularyTotalFrom(vocabularySections),
    blackBookPage: vocabularyCompletedFrom(vocabularySections),
  };
  const achievementEvidence: AchievementEvidence = {
    streak: evidenceSources.streak ? rawSavedStreak : 0,
    batches: evidenceSources.batches && (Array.isArray(saved.batches) || Array.isArray(legacyMathsTopics))
      ? batchCollection.batches
      : [],
    calculationHistory: evidenceSources.calculationHistory ? saved.calculationHistory ?? [] : [],
    blackBookPage: evidenceSources.vocabulary && Array.isArray(saved.vocabularySections)
      ? prepared.blackBookPage
      : evidenceSources.vocabulary ? saved.blackBookPage ?? 0 : 0,
    blackBookTotal: evidenceSources.vocabulary && Array.isArray(saved.vocabularySections)
      ? prepared.blackBookTotal
      : evidenceSources.vocabulary ? saved.blackBookTotal ?? 0 : 0,
    bossTests: evidenceSources.bossTests ? prepared.studyTools.bossTests : [],
    ncertBooks: evidenceSources.ncertBooks ? prepared.ncertBooks : [],
  };
  const achievementHistory = updateAchievementHistory(
    normalizedSaved.achievementHistory,
    achievementEvidence,
    evidenceSources.streak ? rawSavedStreak : 0,
  );
  prepared.achievementHistory = {
    ...achievementHistory,
    evidenceSources,
    observedCompletedLectureIds: previousHistory.observedCompletedLectureIds ?? [],
    observedVocabularyPageCount: previousHistory.observedVocabularyPageCount ?? 0,
  };
  if (normalizedSaved.date === today) return prepared;

  const missedCount = prepared.quests.filter((quest) => !quest.completed && !quest.isRecovery).length;
  const missedXp = prepared.quests.reduce(
    (total, quest) => total + (!quest.completed && !quest.isRecovery ? quest.xp : 0),
    0,
  );
  const daysSinceActive = dateDifference(prepared.lastActiveDate, today);
  const unfinishedRecovery = prepared.quests.filter((quest) => quest.isRecovery && !quest.completed);
  // An offer and its accepted quest represent the same entitlement, not two rewards.
  const carriedRecoveryXp = Math.max(
    prepared.recoveryXp,
    unfinishedRecovery.reduce((sum, quest) => sum + quest.xp, 0),
  );
  return {
    ...prepared,
    date: today,
    quests: defaultQuests,
    recoveryAvailable: missedCount > 0 || prepared.recoveryAvailable || unfinishedRecovery.length > 0 || carriedRecoveryXp > 0,
    recoveryXp: missedXp + carriedRecoveryXp,
    streak: daysSinceActive > 1 ? 0 : normalizedSaved.streak,
  };
};

export function prepareStudyStateForAccount(value: unknown): StudyState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The selected study progress is not a valid object.');
  }
  return prepareStateForToday(value as SavedStudyState);
}

const updateBatchInState = (
  current: StudyState,
  batchId: string,
  update: (batch: StudyBatch) => StudyBatch,
): StudyState => {
  if (!current.batches.some((batch) => batch.id === batchId)) return current;
  return {
    ...current,
    batches: current.batches.map((batch) => batch.id === batchId ? update(batch) : batch),
  };
};

const lectureXpEarnedOn = (batches: StudyBatch[], date: string) =>
  batches.reduce(
    (batchTotal, batch) => batchTotal + batch.subjects.reduce(
      (subjectTotal, subject) => subjectTotal + subject.topics.reduce(
        (topicTotal, topic) => topicTotal + topic.lectures.reduce(
          (lectureTotal, lecture) => lectureTotal
            + (lecture.xpAwarded && lecture.xpEarnedOn === date ? lecture.xpReward : 0),
          0,
        ),
        0,
      ),
      0,
    ),
    0,
  );

const StudyContext = createContext<StudyContextValue | null>(null);

type StudyProviderProps = {
  children: React.ReactNode;
  accountUserId?: string | null;
  initialAccountState?: StudyState;
  accountPayloadMetadata?: (serializedState: string) => string;
  accountPersistenceAllowed?: boolean;
  storageWritesEnabled?: boolean;
};

export function StudyProvider({
  children,
  accountUserId = null,
  initialAccountState,
  accountPayloadMetadata,
  accountPersistenceAllowed = true,
  storageWritesEnabled = true,
}: StudyProviderProps) {
  const colors = useColors();
  const storageKey = accountUserId
    ? getAccountStudyStorageKey(accountUserId)
    : STORAGE_KEY;
  const activeProfileIdentity = useRef<{
    key: string;
    accountUserId: string | null;
    hasInitialAccountState: boolean;
  }>({
    key: storageKey,
    accountUserId,
    hasInitialAccountState: initialAccountState !== undefined,
  });
  activeProfileIdentity.current = {
    key: storageKey,
    accountUserId,
    hasInitialAccountState: initialAccountState !== undefined,
  };
  const fallbackState = useMemo(
    () => initialAccountState ?? createCleanAccountStudyState(),
    [initialAccountState],
  );
  const [storedState, setStoredState] = useState<StudyState>(() => fallbackState);
  const setState = (
    action: React.SetStateAction<StudyState>,
    progressTicket = createProgressHistoryTicket(),
  ) => {
    setStoredState((current) => {
      const canonicalNext = typeof action === 'function' ? action(current) : action;
      if (canonicalNext === current) return current;
      const mutation = achievementEvidenceFromMutation(current, canonicalNext);
      const achievementHistory = updateAchievementHistory(
        canonicalNext.achievementHistory,
        mutation.evidence,
        mutation.evidence.streak,
      );
      const nextWithAchievements = {
        ...canonicalNext,
        achievementHistory: {
          ...achievementHistory,
          evidenceSources: mutation.evidenceSources,
          observedCompletedLectureIds: mutation.metadata.observedCompletedLectureIds,
          observedVocabularyPageCount: mutation.metadata.observedVocabularyPageCount,
        },
      };
      // First capture trusted canonical evidence; the RPG engine consumes only
      // these NEW receipts. All operations still occur in this one updater.
      const canonicalHistory = captureProgressHistoryTransition(
          current,
          nextWithAchievements,
          nextWithAchievements.progressHistory ?? current.progressHistory,
          progressTicket,
          { deferRpgAndRank: true },
        );
      const next = advanceRpgStudyState(current, {
        ...nextWithAchievements, progressHistory: canonicalHistory,
      }, progressTicket, true);
      if (levelFromXp(next.totalXp) > levelFromXp(current.totalXp)) setLevelUp(levelFromXp(next.totalXp));
      return {
        ...next,
        progressHistory: finalizeRpgProgressHistory(current, next, next.progressHistory, progressTicket),
      };
    });
  };
  const [stateIdentity, setStateIdentity] = useState<{
    key: string;
    initialState?: StudyState;
  } | null>(null);
  const state = stateIdentity?.key === storageKey
    && stateIdentity.initialState === initialAccountState
    ? storedState
    : fallbackState;
  const [hydratedStorage, setHydratedStorage] = useState<{
    key: string;
    initialState?: StudyState;
  } | null>(null);
  const hydrated = hydratedStorage?.key === storageKey
    && hydratedStorage.initialState === initialAccountState;
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [rpgError, setRpgError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const storageOwner = useRef<{ key: string; owner: number } | null>(null);
  const [localResetPending, setLocalResetPending] = useState(false);
  const localResetInProgress = useRef(false);
  const localResetArchiveSequence = useRef(0);

  const resetLocalProfile = useCallback(async () => {
    if (!__DEV__) {
      throw new Error('Reset Local Profile is available only in development builds.');
    }
    const identity = activeProfileIdentity.current;
    if (identity.key !== STORAGE_KEY || identity.accountUserId !== null || identity.hasInitialAccountState) {
      throw new Error('Only an anonymous local profile can be reset here. Account and cloud progress were not changed.');
    }
    if (!hydrated) throw new Error('Wait until the local profile has finished loading before resetting it.');
    if (localResetInProgress.current) throw new Error('A local profile reset is already in progress.');
    const currentOwner = storageOwner.current;
    if (!currentOwner || currentOwner.key !== STORAGE_KEY
      || !isStudyStorageOwnerCurrent(STORAGE_KEY, currentOwner.owner)) {
      throw new Error('The local profile storage owner changed. No profile data was reset.');
    }
    const isCurrentLocalOwner = () => {
      const activeIdentity = activeProfileIdentity.current;
      const activeOwner = storageOwner.current;
      return activeIdentity.key === STORAGE_KEY
        && activeIdentity.accountUserId === null
        && !activeIdentity.hasInitialAccountState
        && activeOwner?.key === STORAGE_KEY
        && activeOwner.owner === currentOwner.owner
        && isStudyStorageOwnerCurrent(STORAGE_KEY, currentOwner.owner);
    };

    localResetInProgress.current = true;
    setLocalResetPending(true);
    try {
      const reset = await withStudyStorageQueue(STORAGE_KEY, async () => {
        if (!isCurrentLocalOwner()) throw new Error('The local profile owner changed. No profile data was reset.');
        const existingState = await AsyncStorage.getItem(STORAGE_KEY);
        if (!isCurrentLocalOwner()) throw new Error('The local profile owner changed. No profile data was reset.');
        if (existingState !== null) {
          const archiveKey = `${STORAGE_KEY}:dev-reset-archive:${Date.now()}:${localResetArchiveSequence.current++}`;
          if (await AsyncStorage.getItem(archiveKey) !== null) {
            throw new Error('A local recovery archive already uses this reset ID. No profile data was reset.');
          }
          if (!isCurrentLocalOwner()) throw new Error('The local profile owner changed. No profile data was reset.');
          await AsyncStorage.setItem(archiveKey, existingState);
        }
        if (!isCurrentLocalOwner()) throw new Error('The local profile owner changed. No profile data was reset.');
        await AsyncStorage.removeItem(STORAGE_KEY);
      }, currentOwner.owner);
      if (!reset.ran || !isCurrentLocalOwner()) {
        throw new Error('The local profile owner changed. No profile data was reset.');
      }

      const cleanState = createCleanAccountStudyState();
      setStoredState(cleanState);
      setStateIdentity({ key: STORAGE_KEY, initialState: undefined });
      setHydratedStorage({ key: STORAGE_KEY, initialState: undefined });
      setLevelUp(null);
      setRpgError(null);
      setLoadError(null);
      setSaveError(false);
      setLocalResetVersion((version) => version + 1);
    } finally {
      localResetInProgress.current = false;
      setLocalResetPending(false);
    }
  }, [hydrated]);
  const [localResetVersion, setLocalResetVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let owner: number | undefined;
    const isCurrentLoad = () => {
      const currentOwner = storageOwner.current;
      return owner !== undefined
        && active
        && currentOwner?.key === storageKey
        && currentOwner.owner === owner
        && isStudyStorageOwnerCurrent(storageKey, owner);
    };
    setHydratedStorage(null);
    setLoadError(null);
    setSaveError(false);
    const load = async () => {
      owner = await claimStudyStorageOwner(storageKey);
      if (active && isStudyStorageOwnerCurrent(storageKey, owner)) {
        storageOwner.current = { key: storageKey, owner };
      }
      let loadedState: StudyState | undefined;
      let savedBeforePrepare: SavedStudyState | undefined;
      if (accountUserId) {
        if (!isCurrentLoad()) return;
        savedBeforePrepare = (initialAccountState ?? createCleanAccountStudyState()) as SavedStudyState;
        // Account-vault reads remain transactional with account storage operations.
        const read = await withStudyStorageQueue(storageKey, async () => {
          await AsyncStorage.getItem(storageKey);
          return {
            state: prepareStateForToday(
              savedBeforePrepare!,
            ),
          };
        }, owner);
        if (!read.ran || !isCurrentLoad()) return;
        loadedState = read.value?.state;
      } else {
        // Let prior writes finish, but never hold the mutation queue across a
        // cancellable device read: a replayed mount must be able to claim ownership.
        await drainStudyStorageQueue(storageKey);
        // Start an already-cancelled read too; its result is fenced below, while
        // allowing the live replay to perform its own independent storage read.
        const stored = await AsyncStorage.getItem(storageKey);
        if (!isCurrentLoad()) return;
        if (stored !== null) {
          const saved: unknown = JSON.parse(stored);
          if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
            throw new Error('Stored study progress is not a valid object.');
          }
          savedBeforePrepare = saved as SavedStudyState;
          loadedState = prepareStateForToday(savedBeforePrepare);
          // Keep the original payload intact before the additive, one-time migration.
          // Check and write together on the mutation queue, after the cancellable read.
          if (!Array.isArray((saved as SavedStudyState).batches)) {
            const backup = await withStudyStorageQueue(storageKey, async () => {
              if (!isCurrentLoad()) return false;
              const existingBackup = await AsyncStorage.getItem(LEGACY_BACKUP_KEY);
              if (!isCurrentLoad()) return false;
              if (existingBackup === null) {
                await AsyncStorage.setItem(LEGACY_BACKUP_KEY, stored);
              }
              return true;
            }, owner);
            if (!backup.ran || !backup.value || !isCurrentLoad()) return;
          }
        }
      }
      if (!isCurrentLoad()) return;
      if (loadedState && savedBeforePrepare?.date && savedBeforePrepare.date !== loadedState.date) {
        const rolloverTicket = createProgressHistoryTicket();
        loadedState = {
          ...loadedState,
          progressHistory: captureMissedQuestRollover(
            savedBeforePrepare,
            loadedState.date,
            loadedState.progressHistory,
            rolloverTicket,
          ),
        };
      }
      setStoredState(loadedState ?? fallbackState);
      setStateIdentity({ key: storageKey, initialState: initialAccountState });
      setHydratedStorage({ key: storageKey, initialState: initialAccountState });
    };
    load().catch(() => {
      if (isCurrentLoad()) {
        setLoadError('Your saved progress could not be loaded. It has not been reset or overwritten.');
      }
    });
    return () => {
      active = false;
    };
  }, [accountUserId, fallbackState, initialAccountState, loadAttempt, storageKey]);

  useEffect(() => {
    if (!storageWritesEnabled || !hydrated) return;
    if (localResetPending || localResetInProgress.current) return;
    if (accountUserId && !accountPersistenceAllowed) return;
    const payload = JSON.stringify(state);
    const currentOwner = storageOwner.current;
    if (!currentOwner || currentOwner.key !== storageKey) return;
    if (accountUserId && accountPayloadMetadata) {
      const metadata = accountPayloadMetadata(payload);
      void persistAccountStudyVaultSnapshot(
        storageKey,
        payload,
        metadata,
        currentOwner.owner,
      )
        .then(({ ran }) => {
          if (ran && isStudyStorageOwnerCurrent(storageKey, currentOwner.owner)) setSaveError(false);
        })
        .catch(() => {
          if (isStudyStorageOwnerCurrent(storageKey, currentOwner.owner)) setSaveError(true);
        });
      return;
    }
    void withStudyStorageQueue(storageKey, async () => {
      await AsyncStorage.setItem(storageKey, payload);
    }, currentOwner.owner)
      .then(({ ran }) => {
        if (ran && isStudyStorageOwnerCurrent(storageKey, currentOwner.owner)) setSaveError(false);
      })
      .catch(() => {
        if (isStudyStorageOwnerCurrent(storageKey, currentOwner.owner)) setSaveError(true);
      });
  }, [
    accountPayloadMetadata,
    accountPersistenceAllowed,
    accountUserId,
    hydrated,
    localResetPending,
    localResetVersion,
    saveAttempt,
    state,
    storageKey,
    storageWritesEnabled,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const refreshDailyVocabularyAssignment = () => {
      const today = dateKey();
      setState((current) => {
        if (current.date !== today) return prepareStateForToday(current);
        if (current.vocabularyDailyDate === today) return current;
        const progress = prepareVocabularyDailyProgress(current.vocabularySections, current, today);
        return { ...current, ...progress };
      });
    };

    refreshDailyVocabularyAssignment();
    const timer = setInterval(refreshDailyVocabularyAssignment, 60_000);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refreshDailyVocabularyAssignment();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [hydrated]);

  const activeBatch = state.batches.find((batch) => batch.id === state.activeBatchId)
    ?? state.batches[0]
    ?? createInitialStudyBatch(initialMathsTopics);
  const activeBatchProgress = getBatchProgress(activeBatch);
  const mathsProgress = activeBatchProgress.find((subject) => subject.subjectId === 'maths')
    ?? activeBatchProgress.find((subject) => subject.name.toLowerCase() === 'maths')
    ?? { subjectId: 'maths', name: 'Maths', completed: 0, total: 0, progress: 0 };
  const completedCount = state.quests.filter((quest) => quest.completed).length;
  const todayXp = state.quests.reduce((total, quest) => total + (quest.completed ? quest.xp : 0), 0)
    + lectureXpEarnedOn(state.batches, state.date);
  const level = levelFromXp(state.totalXp);
  const nextLevelXp = level * XP_PER_LEVEL;
  const previousLevelXp = (level - 1) * XP_PER_LEVEL;
  const levelProgress = Math.min(1, Math.max(0, (state.totalXp - previousLevelXp) / (nextLevelXp - previousLevelXp)));
  const rank = rankForProgress(state.totalXp, state.progressHistory);
  const rankId = rankDefinitionForProgress(state.totalXp, state.progressHistory).id;
  const rpg = useMemo(() => normalizeRpgState(state.rpg, state.totalXp, new Date().toISOString(), rankId),
    [state.rpg, state.totalXp, state.progressHistory, rankId]);
  const phaseTwoUnlocked = isPhaseOneComplete(mathsProgress, {
    completed: state.ncertCompleted,
    total: state.ncertTotal,
  });
  const nextLecture = getNextLecture({
    ...activeBatch,
    subjects: activeBatch.subjects.filter((subject) => phaseTwoUnlocked || !isPhaseTwoSubject(subject)),
  });

  const isSubjectLockedInState = (current: StudyState, subjectId: string) => {
    const batch = current.batches.find((item) => item.id === current.activeBatchId);
    const subject = batch?.subjects.find((item) => item.id === subjectId);
    const progress = batch ? getBatchProgress(batch) : [];
    const maths = progress.find((item) => item.subjectId === 'maths')
      ?? progress.find((item) => item.name.toLowerCase() === 'maths');
    return !!subject && isPhaseTwoSubject(subject) && !isPhaseOneComplete(
      maths ?? { total: 0, completed: 0 },
      { total: current.ncertTotal, completed: current.ncertCompleted },
    );
  };
  const isSubjectLocked = (subjectId: string) => isSubjectLockedInState(state, subjectId);
  const refreshStudyDay = () => setState((current) => prepareStateForToday(current));
  const runRpgCommand = (command: RpgCommand) => {
    const ticket = createProgressHistoryTicket();
    setRpgError(null);
    setState((current) => {
      try {
        return applyRpgCommand(current, command, ticket);
      } catch (error) {
        setRpgError(error instanceof Error ? error.message : String(error));
        return current;
      }
    }, ticket);
  };
  const enterGate = (gateId: string) => runRpgCommand({ type: 'enter-gate', gateId });
  const abandonGate = (attemptId: string) => runRpgCommand({ type: 'abandon-gate', attemptId });
  const useInventoryItem = (itemId: string) => runRpgCommand({ type: 'use-item', itemId });
  const equipItem = (itemId: string) => runRpgCommand({ type: 'equip-item', itemId });
  const unequipSlot = (slot: EquipmentSlot) => runRpgCommand({ type: 'unequip-slot', slot });
  const acknowledgeRpgPresentation = (eventId: string) => runRpgCommand({ type: 'ack-presentation', eventId });
  const refreshRpgClock = () => runRpgCommand({ type: 'refresh-clock' });
  const awardQuest = (current: StudyState, questId: string): StudyState => {
    const next = completeQuestInState(current, questId);
    if (levelFromXp(next.totalXp) > levelFromXp(current.totalXp)) setLevelUp(levelFromXp(next.totalXp));
    return next;
  };
  const completeQuest = (questId: string) => setState((previous) => {
    const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
    return awardQuest(current, questId);
  });

  const recordProgressActivity = (
    type: ProgressHistoryEventType,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ) => {
    const ticket = createProgressHistoryTicket();
    setState((current) => {
      const progressHistory = appendProgressHistoryEvent(
        current.progressHistory,
        ticket,
        type,
        idempotencyKey,
        metadata,
        current.date,
      );
      return progressHistory === current.progressHistory
        ? current
        : { ...current, progressHistory };
    }, ticket);
  };

  const toggleQuest = (questId: string) => {
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const quest = current.quests.find((item) => item.id === questId);
      if (!quest) return current;
      const nextCompleted = !quest.completed;
      const delta = nextCompleted ? quest.xp : -quest.xp;
      const hadCompletedQuest = current.quests.some((item) => item.completed);
      const willHaveCompletedQuest = current.quests.some((item) => item.id === questId ? nextCompleted : item.completed);
      let nextStreak = current.streak;
      if (!hadCompletedQuest && willHaveCompletedQuest) {
        const gap = dateDifference(current.lastActiveDate, current.date);
        nextStreak = gap === 1 ? current.streak + 1 : current.streak || 1;
      }
      const nextTotalXp = Math.max(0, current.totalXp + delta);
      const oldLevel = levelFromXp(current.totalXp);
      const newLevel = levelFromXp(nextTotalXp);
      if (newLevel > oldLevel) {
        setLevelUp(newLevel);
        playProfileHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      } else {
        playProfileHaptic(() => Haptics.impactAsync(nextCompleted ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft));
      }
      return {
        ...current,
        totalXp: nextTotalXp,
        lastActiveDate: willHaveCompletedQuest ? current.date : current.lastActiveDate,
        streak: nextStreak,
        quests: current.quests.map((item) => item.id === questId ? { ...item, completed: nextCompleted } : item),
      };
    });
  };

  const acceptRecoveryQuest = () => {
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const id = `recovery-${current.date}`;
      if (!current.recoveryAvailable || current.quests.some((quest) => quest.id === id)) return current;
      playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      return {
        ...current,
        recoveryAvailable: false,
        recoveryXp: 0,
        quests: [...current.quests, {
          id,
          title: 'Recovery Quest',
          subtitle: `Review missed study goals · regain ${current.recoveryXp || 80} XP safely`,
          category: 'RECOVERY',
          xp: current.recoveryXp || 80,
          completed: false,
          isRecovery: true,
        }],
      };
    });
  };

  const setActiveBatch = (batchId: string) => {
    setState((current) => {
      if (!current.batches.some((batch) => batch.id === batchId)) return current;
      return {
        ...current,
        activeBatchId: batchId,
        batches: current.batches.map((batch) => ({ ...batch, isActive: batch.id === batchId })),
      };
    });
  };

  const createBatch = (details: { name: string; source: string; startDate: string }) => {
    const name = details.name.trim();
    if (!name) return;
    const batch = makeStudyBatch(name, details.source, details.startDate);
    setState((current) => ({
      ...current,
      activeBatchId: batch.id,
      batches: [...current.batches.map((item) => ({ ...item, isActive: false })), batch],
    }));
    playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  };

  const updateBatch = (
    batchId: string,
    details: { name: string; source: string; startDate: string },
  ) => {
    const name = details.name.trim();
    if (!name) return;
    setState((current) => updateBatchInState(current, batchId, (batch) => ({
      ...batch,
      name,
      source: details.source.trim(),
      startDate: details.startDate.trim(),
    })));
  };

  const addBatchSubject = (name: string) => {
    const cleanName = name.trim();
    const currentBatch = state.batches.find((batch) => batch.id === state.activeBatchId);
    if (!cleanName || !currentBatch || currentBatch.subjects.some((subject) => subject.name.toLowerCase() === cleanName.toLowerCase())) {
      return null;
    }
    const subject: StudySubject = { id: createRecordId('subject'), name: cleanName, topics: [] };
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: [...batch.subjects, subject],
    })));
    return subject.id;
  };

  const updateBatchSubject = (subjectId: string, name: string) => {
    const cleanName = name.trim();
    const currentBatch = state.batches.find((batch) => batch.id === state.activeBatchId);
    if (!cleanName || !currentBatch || currentBatch.subjects.some(
      (subject) => subject.id !== subjectId && subject.name.toLowerCase() === cleanName.toLowerCase(),
    )) {
      return null;
    }
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: batch.subjects.map((subject) => subject.id === subjectId
        ? { ...subject, name: cleanName }
        : subject),
    })));
    return subjectId;
  };

  const addBatchTopic = (subjectId: string, title: string, category: string, lectureCount = 0) => {
    const cleanTitle = title.trim();
    const subject = activeBatch.subjects.find((item) => item.id === subjectId);
    if (!cleanTitle || !subject || !Number.isInteger(lectureCount) || lectureCount < 0 || lectureCount > MAX_TOPIC_LECTURES) return null;
    const topic = resizeTopicLectures({
      id: createRecordId('topic'),
      title: cleanTitle,
      category: category.trim(),
      lectures: [],
      isArchived: false,
    }, lectureCount);
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: batch.subjects.map((subject) => subject.id === subjectId
        ? { ...subject, topics: [...subject.topics, topic] }
        : subject),
    })));
    return topic.id;
  };

  const updateBatchTopic = (
    subjectId: string,
    topicId: string,
    details: { title: string; category: string; isArchived: boolean; lectureCount?: number },
  ) => {
    const title = details.title.trim();
    const savedTopic = activeBatch.subjects.find((subject) => subject.id === subjectId)
      ?.topics.find((topic) => topic.id === topicId);
    const count = details.lectureCount;
    if (!title || !savedTopic || (count !== undefined && (
      !Number.isInteger(count) || count < getProtectedLectureCount(savedTopic) || count > MAX_TOPIC_LECTURES
    ))) return false;
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: batch.subjects.map((subject) => subject.id === subjectId
        ? {
          ...subject,
          topics: subject.topics.map((topic) => topic.id === topicId
            ? {
              ...(count === undefined ? topic : resizeTopicLectures(topic, count)),
              title,
              category: details.category.trim(),
              isArchived: details.isArchived,
            }
            : topic),
        }
        : subject),
    })));
    return true;
  };

  const addBatchLecture = (
    subjectId: string,
    topicId: string,
    details: { title: string; link: string; xpReward: number },
  ) => {
    const title = details.title.trim();
    if (!title) return null;
    const lecture: StudyLecture = {
      id: createRecordId('lecture'),
      title,
      link: details.link.trim(),
      status: 'not-started',
      xpReward: Math.max(0, Math.floor(details.xpReward)),
      sessionCount: 0,
      firstStartedAt: null,
      lastStartedAt: null,
      completedAt: null,
      xpEarnedOn: null,
      xpAwarded: false,
      isArchived: false,
    };
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: batch.subjects.map((subject) => subject.id === subjectId
        ? {
          ...subject,
          topics: subject.topics.map((topic) => topic.id === topicId
            ? { ...topic, lectures: [...topic.lectures, lecture] }
            : topic),
        }
        : subject),
    })));
    return lecture.id;
  };

  const updateBatchLecture = (
    subjectId: string,
    topicId: string,
    lectureId: string,
    details: { title: string; link: string; xpReward: number; isArchived: boolean },
  ) => {
    const title = details.title.trim();
    if (!title) return;
    setState((current) => updateBatchInState(current, current.activeBatchId, (batch) => ({
      ...batch,
      subjects: batch.subjects.map((subject) => subject.id === subjectId
        ? {
          ...subject,
          topics: subject.topics.map((topic) => topic.id === topicId
            ? {
              ...topic,
              lectures: topic.lectures.map((lecture) => lecture.id === lectureId
                ? {
                  ...lecture,
                  title,
                  link: details.link.trim(),
                  xpReward: lecture.xpAwarded ? lecture.xpReward : Math.max(0, Math.floor(details.xpReward)),
                  isArchived: details.isArchived,
                  // Renaming or linking a count-archived placeholder must not
                  // turn it into a manual archive that can no longer be restored.
                  archivedByCount: details.isArchived === lecture.isArchived ? lecture.archivedByCount : false,
                }
                : lecture),
            }
            : topic),
        }
        : subject),
    })));
  };

  const startLecture = (subjectId: string, topicId: string, lectureId: string) => {
    const now = new Date().toISOString();
    const ticket = createProgressHistoryTicket(now);
    setState((current) => {
      if (isSubjectLockedInState(current, subjectId)) return current;
      const batch = current.batches.find((item) => item.id === current.activeBatchId);
      const topic = batch?.subjects.find((subject) => subject.id === subjectId)
        ?.topics.find((item) => item.id === topicId);
      const lecture = topic?.lectures.find((item) => item.id === lectureId);
      if (!batch || !topic || topic.isArchived || !lecture || lecture.isArchived || lecture.status === 'completed') return current;
      playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      return updateBatchInState(current, batch.id, (item) => ({
        ...item,
        subjects: item.subjects.map((subject) => subject.id === subjectId
          ? {
            ...subject,
            topics: subject.topics.map((topic) => topic.id === topicId
              ? {
                ...topic,
                lectures: topic.lectures.map((entry) => entry.id === lectureId
                  ? {
                    ...entry,
                    status: 'in-progress',
                    firstStartedAt: entry.firstStartedAt ?? now,
                    lastStartedAt: now,
                    sessionCount: entry.sessionCount + 1,
                  }
                  : entry),
              }
              : topic),
          }
          : subject),
      }));
    }, ticket);
  };

  const completeLecture = (subjectId: string, topicId: string, lectureId: string) => {
    const now = new Date().toISOString();
    const ticket = createProgressHistoryTicket(now);
    const earnedDate = dateKey(new Date(now));
    setState((previous) => {
      const current = previous.date === earnedDate ? previous : prepareStateForToday(previous);
      if (isSubjectLockedInState(current, subjectId)) return current;
      const batch = current.batches.find((item) => item.id === current.activeBatchId);
      const topic = batch?.subjects.find((subject) => subject.id === subjectId)
        ?.topics.find((item) => item.id === topicId);
      const lecture = topic?.lectures.find((item) => item.id === lectureId);
      if (!batch || !topic || topic.isArchived || !lecture || lecture.isArchived || lecture.status === 'completed') return current;
      const xp = lecture.xpAwarded ? 0 : lecture.xpReward;
      const totalXp = Math.max(0, current.totalXp + xp);
      const oldLevel = levelFromXp(current.totalXp);
      const newLevel = levelFromXp(totalXp);
      if (newLevel > oldLevel) {
        setLevelUp(newLevel);
        playProfileHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      } else {
        playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      }
      const updated = updateBatchInState(current, batch.id, (item) => ({
        ...item,
        subjects: item.subjects.map((subject) => subject.id === subjectId
          ? {
            ...subject,
            topics: subject.topics.map((topic) => topic.id === topicId
              ? {
                ...topic,
                lectures: topic.lectures.map((entry) => entry.id === lectureId
                  ? {
                    ...entry,
                    status: 'completed',
                    completedAt: now,
                    xpAwarded: true,
                    xpEarnedOn: xp > 0 ? earnedDate : null,
                  }
                  : entry),
              }
              : topic),
          }
          : subject),
      }));
      const next = { ...updated, totalXp };
      const mathsSubject = subjectId === 'maths'
        || batch.subjects.some((subject) => subject.id === subjectId && subject.name.toLowerCase() === 'maths');
      return mathsSubject ? awardQuest(next, 'maths-lecture') : next;
    }, ticket);
  };

  const advanceNcertBookSession = (bookId: string) => {
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const target = current.ncertBooks.find((book) => book.id === bookId);
      if (!target || target.completedSessions >= target.totalSessions) return current;
      const books = current.ncertBooks.map((book) =>
        book.id === bookId ? { ...book, completedSessions: book.completedSessions + 1 } : book,
      );
      const ncertProgress = summarizeNcertProgress(
        books,
        current.ncertShelves,
        current.ncertProgressLedger,
      );
      const shelves = ncertProgress.shelves;
      return awardQuest({
        ...current,
        ncertBooks: books,
        ncertShelves: shelves,
        ncertProgressLedger: ncertProgress.ledger,
        ncertCompleted: ncertCompletedFrom(shelves),
        ncertTotal: ncertTotalFrom(shelves),
      }, 'ncert-reading');
    });
    playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  };

  const advanceNcertShelf = (shelfId: string) => {
    const nextBook = state.ncertBooks.find((book) => book.classId === shelfId && book.completedSessions < book.totalSessions);
    if (nextBook) advanceNcertBookSession(nextBook.id);
  };

  const addNcertVocabulary = (bookId: string, word: string) => {
    const cleanWord = word.trim();
    if (!cleanWord) return;
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const target = current.ncertBooks.find((book) => book.id === bookId);
      if (!target || target.vocabulary.some((item) => item.toLowerCase() === cleanWord.toLowerCase())) return current;
      const books = current.ncertBooks.map((book) =>
        book.id === bookId ? { ...book, vocabulary: [...book.vocabulary, cleanWord] } : book,
      );
      const ncertProgress = summarizeNcertProgress(
        books,
        current.ncertShelves,
        current.ncertProgressLedger,
      );
      return awardQuest({
        ...current,
        ncertBooks: books,
        ncertShelves: ncertProgress.shelves,
        ncertProgressLedger: ncertProgress.ledger,
      }, 'ncert-vocabulary');
    });
    playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  };

  const selectVocabularySection = (sectionId: string) => {
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const today = dateKey();
      const progress = selectVocabularyDailyCategory(
        current.vocabularySections,
        current,
        sectionId,
        today,
      );
      if (
        progress.currentVocabularySectionId === current.currentVocabularySectionId &&
        progress.currentVocabularyPage === current.currentVocabularyPage &&
        progress.vocabularyDailyDate === current.vocabularyDailyDate &&
        progress.vocabularyDailyCompleted === current.vocabularyDailyCompleted
      ) return current;
      return {
        ...current,
        ...progress,
      };
    });
  };

  const completeVocabularyPage = (sectionId: string) => {
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const result = completeDailyVocabularyPage(
        current.vocabularySections,
        current,
        sectionId,
        dateKey(),
      );
      if (!result.completed) return current;
      return awardQuest({
        ...current,
        ...result.progress,
        vocabularySections: result.sections,
        blackBookPage: vocabularyCompletedFrom(result.sections),
        blackBookTotal: vocabularyTotalFrom(result.sections),
      }, 'black-book');
    });
    playProfileHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  };

  const addCalculationSession = (session: Omit<CalculationSession, 'id' | 'date'>) => {
    if (![session.questions, session.correct, session.duration, session.accuracy].every(Number.isFinite)
      || !Number.isInteger(session.questions) || !Number.isInteger(session.correct)
      || session.questions < 0 || session.correct < 0 || session.correct > session.questions
      || session.duration < 0 || session.accuracy < 0 || session.accuracy > 100) return;
    const today = dateKey();
    const answers = validateCalculationAnswers(session.answers, session.questions, session.correct, session.duration);
    const record = { ...session, ...(answers === undefined ? {} : { answers }), id: createRecordId('calculation'), date: today };
    setState((previous) => {
      const current = previous.date === today ? previous : prepareStateForToday(previous);
      const next = {
        ...current,
        calculationHistory: [record, ...current.calculationHistory].slice(0, 20),
      };
      return session.questions > 0 ? awardQuest(next, 'timed-calculation') : next;
    });
  };

  const updateNcertBookTarget = (bookId: string, totalSessions: number) => {
    const book = state.ncertBooks.find((item) => item.id === bookId);
    if (!book || !Number.isInteger(totalSessions) || totalSessions < Math.max(1, book.completedSessions)
      || totalSessions > 10000 || book.completedSessions >= book.totalSessions) return false;
    setState((current) => {
      const target = current.ncertBooks.find((item) => item.id === bookId);
      if (!target || target.completedSessions >= target.totalSessions || totalSessions < target.completedSessions) return current;
      const books = current.ncertBooks.map((item) => item.id === bookId ? { ...item, totalSessions } : item);
      const progress = summarizeNcertProgress(books, current.ncertShelves, current.ncertProgressLedger);
      return { ...current, ncertBooks: books, ncertShelves: progress.shelves,
        ncertProgressLedger: progress.ledger, ncertTotal: ncertTotalFrom(progress.shelves),
        ncertCompleted: ncertCompletedFrom(progress.shelves) };
    });
    return true;
  };

  const updateTools = (
    update: (tools: StudyToolsState, current: StudyState) => StudyToolsState,
    questId?: string,
  ) => setState((previous) => {
    const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
    const tools = current.studyTools;
    const nextTools = update(tools, current);
    if (nextTools === tools) return current;
    const next = { ...current, studyTools: nextTools };
    return questId ? awardQuest(next, questId) : next;
  });

  const recordQuestionBankAttempt: StudyContextValue['recordQuestionBankAttempt'] = (details) => {
    const bank = getPublishedQuestionBank(details.bankId);
    const question = getPublishedQuestion(details.bankId, details.questionId);
    const selectedOption = question?.options.find((option) => option.label === details.selectedOptionLabel);
    if (!bank || !question || !selectedOption
      || !Number.isFinite(details.timeTakenSeconds) || details.timeTakenSeconds < 0
      || details.timeTakenSeconds > 86_400) return false;

    const isCorrect = details.selectedOptionLabel === question.sourceProvidedAnswer.optionLabel;
    const id = createRecordId('question-bank-attempt');
    updateTools((tools, current) => {
      const attempts = tools.questionBankAttempts;
      const sameQuestionAttempts = attempts.filter((attempt) =>
        attempt.bankId === bank.id && attempt.questionId === question.id);
      const latestAttempt = sameQuestionAttempts[sameQuestionAttempts.length - 1];
      const mistakeStatus = !isCorrect
        ? 'OPEN'
        : latestAttempt?.mistakeStatus === 'OPEN'
          ? 'CLEARED'
          : 'NONE';
      const record: QuestionBankAttempt = {
        id,
        bankId: bank.id,
        questionId: question.id,
        subject: bank.subject,
        chapter: bank.chapter,
        classOrLecture: bank.classOrLecture,
        topic: question.topicLabel,
        date: current.date,
        attemptNumber: sameQuestionAttempts.length + 1,
        selectedOptionLabel: details.selectedOptionLabel,
        selectedOptionText: selectedOption.text,
        sourceAnswerResult: question.sourceProvidedAnswer.result,
        correctOptionLabel: question.sourceProvidedAnswer.optionLabel,
        isCorrect,
        timeTakenSeconds: details.timeTakenSeconds,
        mistakeStatus,
        sourceSha256: bank.source.sha256,
      };
      return { ...tools, questionBankAttempts: [...attempts, record] };
    });
    return true;
  };

  const saveReviewCard = (details: Omit<ReviewCard, 'id' | 'createdAt'>) => {
    const question = details.question.trim();
    const answer = details.answer.trim();
    const topicTitle = details.topicTitle.trim();
    if (!question || !answer || !topicTitle || question.length > 4000 || answer.length > 10000) return;
    updateTools((tools, current) => {
      const batch = current.batches.find((item) => item.id === details.batchId);
      if (!batch?.subjects.some((subject) => subject.id === details.subjectId)) return tools;
      if (tools.reviewCards.some((card) => card.batchId === details.batchId
        && card.subjectId === details.subjectId && card.question === question && card.answer === answer)) return tools;
      return { ...tools, reviewCards: [...tools.reviewCards, {
        ...details, question, answer, topicTitle, id: createRecordId('review'), createdAt: new Date().toISOString(),
      }] };
    });
  };

  const saveBossTest = (details: Omit<BossTestRecord, 'id'>) => updateTools((tools, current) => {
    const weekStart = getWeekStart(current.date);
    if (details.weekStart !== weekStart || !details.results.length
      || tools.bossTests.some((item) => !item.gateAttemptId && item.batchId === details.batchId && item.weekStart === weekStart)) return tools;
    const cards = getWeeklyReviewCards(tools.reviewCards, details.batchId, current.date);
    const ids = new Set<string>();
    if (details.results.some((item) => !cards.some((card) => card.id === item.cardId)
      || typeof item.correct !== 'boolean' || ids.has(item.cardId) || !ids.add(item.cardId))) return tools;
    const results = details.results.map((result) => {
      const card = cards.find((item) => item.id === result.cardId)!;
      return { ...result, question: card.question, expectedAnswer: card.answer,
        topicTitle: card.topicTitle, subjectId: card.subjectId };
    });
    return { ...tools, bossTests: [...tools.bossTests, {
      ...details, results, weekStart, date: current.date, id: createRecordId('boss'),
      weakTopics: Array.from(new Set(results.filter((item) => !item.correct).map((item) => item.topicTitle))),
    }] };
  });

  const saveGateBossTest = (details: Omit<BossTestRecord, 'id' | 'gateAttemptId'>) => {
    const ticket = createProgressHistoryTicket();
    const id = createRecordId('gate-boss');
    setRpgError(null);
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const attempt = current.rpg?.attempts.find((entry) => entry.id === current.rpg?.activeAttemptId);
      if (!attempt || attempt.status !== 'active' || getGateDefinition(attempt.gateId)?.type !== 'boss'
        || attempt.batchId !== details.batchId || attempt.batchId !== current.activeBatchId) {
        setRpgError('This Boss challenge requires its active Gate and bound study batch.');
        return previous;
      }
      if (Date.parse(ticket.timestamp) >= Date.parse(attempt.deadlineAt)) {
        setRpgError('The Boss Gate timer has expired. This attempt cannot receive completion rewards.');
        return applyRpgCommand(current, { type: 'refresh-clock' }, ticket);
      }
      // Gate practice uses actual saved cards, but has its own durable record.
      // It neither replaces nor locks the official Saturday/week Boss test.
      const cards = current.studyTools.reviewCards.filter((card) => card.batchId === attempt.batchId);
      const seen = new Set<string>();
      if (!Array.isArray(details.results) || details.results.length < 5
        || details.results.some((result) => !cards.some((card) => card.id === result.cardId)
          || typeof result.correct !== 'boolean' || typeof result.answer !== 'string'
          || seen.has(result.cardId) || !seen.add(result.cardId))) {
        setRpgError('Record at least five distinct, real saved review cards for the Boss Gate.');
        return previous;
      }
      const results = details.results.map((result) => {
        const card = cards.find((entry) => entry.id === result.cardId)!;
        return { ...result, question: card.question, expectedAnswer: card.answer,
          topicTitle: card.topicTitle, subjectId: card.subjectId };
      });
      return {
        ...current,
        studyTools: {
          ...current.studyTools,
          bossTests: [...current.studyTools.bossTests, {
            ...details, id, date: current.date, weekStart: getWeekStart(current.date),
            gateAttemptId: attempt.id, results,
            weakTopics: [...new Set(results.filter((result) => !result.correct).map((result) => result.topicTitle))],
          }],
        },
      };
    }, ticket);
  };

  const logWorkout = (duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) return;
    updateTools((tools, current) => tools.workoutSessions.some((item) => item.date === current.date) ? tools : ({
      ...tools, workoutSessions: [...tools.workoutSessions, {
        id: createRecordId('workout'), date: current.date, duration: Math.floor(duration),
      }],
    }), 'morning-workout');
  };

  const logRevision = (cardIds: string[], batchId: string) => {
    const ids = Array.from(new Set(cardIds));
    if (!ids.length) return;
    setState((previous) => {
      const current = previous.date === dateKey() ? previous : prepareStateForToday(previous);
      const tools = current.studyTools;
      if (!ids.every((id) => tools.reviewCards.some((card) => card.id === id && card.batchId === batchId))) return current;
      const next = {
        ...current,
        studyTools: { ...tools, revisionHistory: [...tools.revisionHistory, {
          id: createRecordId('revision'), date: current.date, batchId, cardIds: ids,
        }] },
      };
      const reviewed = awardQuest(next, `recovery-${current.date}`);
      const batch = current.batches.find((item) => item.id === batchId);
      const maths = batch && (getBatchProgress(batch).find((item) => item.subjectId === 'maths')
        ?? getBatchProgress(batch).find((item) => item.name.toLowerCase() === 'maths'));
      const mathsRevision = batchId === current.activeBatchId && maths && maths.total > 0 && maths.completed === maths.total
        && tools.reviewCards.some((card) => ids.includes(card.id) && card.subjectId === maths.subjectId && card.batchId === batchId);
      return mathsRevision ? awardQuest(reviewed, 'maths-lecture') : reviewed;
    });
  };

  const startExperiment = (target: string) => {
    const cleanTarget = target.trim();
    if (!cleanTarget || cleanTarget.length > 500) return;
    updateTools((tools, current) => tools.experiments.some((item) =>
      dateDifference(item.startDate, current.date) >= 0 && dateDifference(item.startDate, current.date) < 7) ? tools : ({
      ...tools, experiments: [...tools.experiments, {
        id: createRecordId('experiment'), startDate: current.date, target: cleanTarget, checkIns: [],
      }],
    }));
  };
  const checkInExperiment = (id: string) => updateTools((tools, current) => {
    const experiment = tools.experiments.find((item) => item.id === id);
    if (!experiment || experiment.checkIns.includes(current.date)
      || dateDifference(experiment.startDate, current.date) < 0 || dateDifference(experiment.startDate, current.date) >= 7) return tools;
    return { ...tools, experiments: tools.experiments.map((item) => item.id === id
      ? { ...item, checkIns: [...item.checkIns, current.date] } : item) };
  });
  const setWindDownHour = (hour: number) => {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    updateTools((tools) => tools.windDownHour === hour ? tools : { ...tools, windDownHour: hour });
  };

  const finishExperiment = (id: string, reflection: string, decision: 'continue' | 'change' | 'finish', nextTarget?: string) => {
    if (!reflection.trim() || !['continue', 'change', 'finish'].includes(decision)) throw new Error('Add a reflection and choose a valid next step.');
    if (decision === 'change' && !nextTarget?.trim()) throw new Error('Add your changed strategy.');
    updateTools((tools, current) => {
      const experiment = tools.experiments.find((item) => item.id === id);
      if (!experiment || experiment.result || (dateDifference(experiment.startDate, current.date) < 7 && experiment.checkIns.length < 7)) return tools;
      const result: NonNullable<StudyExperiment['result']> = { date: current.date, reflection: reflection.trim(), decision };
      const experiments = tools.experiments.map((item) => item.id === id ? { ...item, result } : item);
      if (decision !== 'finish' && !tools.experiments.some((item) => item.id !== id && !item.result && dateDifference(item.startDate, current.date) >= 0 && dateDifference(item.startDate, current.date) < 7)) experiments.push({ id: createRecordId('experiment'), startDate: current.date, target: decision === 'continue' ? experiment.target : nextTarget!.trim(), checkIns: [] });
      return { ...tools, experiments };
    });
  };
  const saveWordAttempt = (bookId: string, word: string, meaning: string, attempt: Omit<WordEvidence['attempts'][number], 'date'>) => {
    if (!meaning.trim() || !attempt.response.trim() || !['learn', 'recall', 'practice', 'revision'].includes(attempt.stage) || typeof attempt.correct !== 'boolean') throw new Error('Add a meaning and your response before recording word evidence.');
    updateTools((tools, current) => {
      if (!current.ncertBooks.some((book) => book.id === bookId && book.vocabulary.includes(word))) return tools;
      const evidence = tools.wordEvidence ?? [];
      const existing = evidence.find((item) => item.bookId === bookId && item.word === word);
      const stages = ['learn', 'recall', 'practice', 'revision'];
      const index = stages.indexOf(attempt.stage);
      if (index > 0 && !existing?.attempts.some((item) => item.stage === stages[index - 1] && item.correct)) return tools;
      const entry: WordEvidence = { bookId, word, meaning: meaning.trim(), attempts: [...(existing?.attempts ?? []), { ...attempt, response: attempt.response.trim(), date: current.date }] };
      return { ...tools, wordEvidence: [...evidence.filter((item) => item !== existing), entry] };
    });
  };
  const saveWindDownReview = (details: Pick<WindDownRecord, 'review' | 'tomorrowPriority' | 'preparation'>) => {
    if (!details.review.trim() || !details.tomorrowPriority.trim()) throw new Error('Add a day review and tomorrow priority.');
    updateTools((tools, current) => ({ ...tools, windDownReviews: [...(tools.windDownReviews ?? []).filter((item) => item.date !== current.date), { date: current.date, completedQuestIds: current.quests.filter((quest) => quest.completed).map((quest) => quest.id), review: details.review.trim(), tomorrowPriority: details.tomorrowPriority.trim(), preparation: details.preparation.trim() }] }));
  };
  const addConceptLink = (fromCardId: string, toCardId: string) => updateTools((tools, current) => {
    const cards = tools.reviewCards.filter((card) => card.batchId === current.activeBatchId);
    if (fromCardId === toCardId || ![fromCardId, toCardId].every((id) => cards.some((card) => card.id === id))) return tools;
    const links = tools.conceptLinks ?? [];
    if (links.some((link) => link.batchId === current.activeBatchId && ((link.fromCardId === fromCardId && link.toCardId === toCardId) || (link.fromCardId === toCardId && link.toCardId === fromCardId)))) return tools;
    return { ...tools, conceptLinks: [...links, { id: createRecordId('concept'), batchId: current.activeBatchId, fromCardId, toCardId }] };
  });
  const removeConceptLink = (id: string) => updateTools((tools) => ({ ...tools, conceptLinks: (tools.conceptLinks ?? []).filter((link) => link.id !== id) }));
  const logFocusSession = (details: Omit<FocusSession, 'id' | 'date'>) => {
    if (!['focus', 'break'].includes(details.kind) || ![25, 50, 5, 10].includes(details.presetMinutes) || !Number.isFinite(details.durationSeconds) || details.durationSeconds < 0 || typeof details.completed !== 'boolean' || typeof details.task !== 'string') throw new Error('Focus session is invalid.');
    updateTools((tools, current) => ({ ...tools, focusHistory: [...(tools.focusHistory ?? []), { ...details, id: createRecordId('focus'), date: current.date }] }));
  };
  const saveBossRetest = (details: Omit<BossRetest, 'id'>) => updateTools((tools, current) => {
    const source = tools.bossTests.find((test) => test.id === details.sourceTestId && test.batchId === details.batchId && !test.gateAttemptId);
    if (!source || details.date !== current.date || !details.results.length) return tools;
    const ids = new Set<string>();
    for (const result of details.results) {
      const original = source.results.find((item) => item.cardId === result.cardId && !item.correct);
      if (!original || ids.has(result.cardId) || result.question !== original.question || result.expectedAnswer !== original.expectedAnswer || result.subjectId !== original.subjectId || result.topicTitle !== original.topicTitle || typeof result.answer !== 'string' || typeof result.correct !== 'boolean') throw new Error('Retest must use actual missed questions from the selected official test.');
      ids.add(result.cardId);
    }
    return { ...tools, bossRetests: [...(tools.bossRetests ?? []), { ...details, id: createRecordId('retest') }] };
  });

  const value = useMemo(
    () => ({
      state,
      hydrated,
      todayXp,
      level,
      nextLevelXp,
      levelProgress,
      rank,
      completedCount,
      phaseTwoUnlocked,
      studyTools: state.studyTools,
      rpg,
      rpgError,
      resetLocalProfile,
      clearRpgError: () => setRpgError(null),
      enterGate,
      abandonGate,
      useInventoryItem,
      equipItem,
      unequipSlot,
      acknowledgeRpgPresentation,
      refreshRpgClock,
      completeQuest,
      refreshStudyDay,
      isSubjectLocked,
      updateNcertBookTarget,
      saveReviewCard,
      saveBossTest,
      saveGateBossTest,
      logWorkout,
      logRevision,
      startExperiment,
      checkInExperiment,
      finishExperiment,
      saveWordAttempt,
      saveWindDownReview,
      addConceptLink,
      removeConceptLink,
      logFocusSession,
      saveBossRetest,
      setWindDownHour,
      levelUp,
      activeBatch,
      activeBatchProgress,
      nextLecture,
      toggleQuest,
      acceptRecoveryQuest,
      dismissLevelUp: () => setLevelUp(null),
      setActiveBatch,
      createBatch,
      updateBatch,
      addBatchSubject,
      updateBatchSubject,
      addBatchTopic,
      updateBatchTopic,
      addBatchLecture,
      updateBatchLecture,
      startLecture,
      completeLecture,
      advanceNcertShelf,
      advanceNcertBookSession,
      addNcertVocabulary,
      selectVocabularySection,
      completeVocabularyPage,
      addCalculationSession,
      recordQuestionBankAttempt,
      recordProgressActivity,
    }),
    [
      state,
      hydrated,
      todayXp,
      level,
      nextLevelXp,
      levelProgress,
      rank,
      completedCount,
      phaseTwoUnlocked,
      levelUp,
      activeBatch,
      activeBatchProgress,
      nextLecture,
      recordProgressActivity,
      rpg,
      rpgError,
      resetLocalProfile,
    ],
  );

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.background }}>
        {loadError ? (
          <>
            <Text accessibilityRole="alert" style={{ color: colors.foreground, textAlign: 'center', lineHeight: 22 }}>{loadError}</Text>
            <Pressable onPress={() => setLoadAttempt((attempt) => attempt + 1)} style={{ marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: colors.primary }}>
              <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Retry loading progress</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Loading your study progress…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <StudyContext.Provider value={value}>
      {children}
      {saveError ? (
        <View style={{ position: 'absolute', top: 70, left: 16, right: 16, zIndex: 1000, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderColor: colors.accent, borderWidth: 1 }}>
          <Text accessibilityRole="alert" style={{ color: colors.foreground }}>Your latest progress could not be saved. Retry before closing the app.</Text>
          <Pressable onPress={() => setSaveAttempt((attempt) => attempt + 1)} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Retry saving</Text>
          </Pressable>
        </View>
      ) : null}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  const context = useContext(StudyContext);
  if (!context) throw new Error('useStudy must be used within StudyProvider');
  return context;
}