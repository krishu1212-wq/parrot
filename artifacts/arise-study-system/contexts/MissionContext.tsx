import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useStudy, type StudyState } from '@/contexts/StudyContext';
import { getWeeklyBossTest, getWeeklyReviewCards } from '@/contexts/learningTools';
import { advanceFocusClock, focusSecondsRemaining, type FocusClock, type FocusPreset } from '@/contexts/focusClock';
import {
  getNextMission,
  type AccuracySummary,
  type MissionDescriptor,
  type MissionGoal,
  type MissionTarget,
} from '@/contexts/masterProgress';

export type MissionProgressStatus = 'waiting' | 'in-progress' | 'complete' | 'blocked' | 'unavailable';

export type MissionProgress = {
  status: MissionProgressStatus;
  target: MissionTarget;
  value: number | null;
  rawCount: number | null;
  total: number | null;
  unit: 'lecture' | 'saved-session' | 'vocabulary-page' | 'word' | 'question' | 'second' | 'review-card' | 'boss-result' | null;
  actualDelta: number | null;
  completed: boolean;
  detail: string;
};

export type MissionProof = {
  source: 'canonical-state' | 'canonical-record';
  target: MissionTarget;
  recordId: string | null;
  recordIds?: string[];
};

export type MissionSummary = {
  missionId: string;
  target: MissionTarget;
  proof: MissionProof;
  progress: MissionProgress;
  elapsedSeconds: number;
  completedTask: string;
  actualXpDelta: number;
  accuracy: AccuracySummary | null;
  nextMission: MissionDescriptor | null;
};

type MissionSession = {
  mission: MissionDescriptor;
  baseline: StudyState;
  baselineXp: number;
  completed: boolean;
  startedAt: string;
};

type MissionContextValue = {
  focusClock: FocusClock | null;
  focusError: string | null;
  focusRemainingSeconds: number | null;
  startFocus: (presetMinutes: FocusPreset) => boolean;
  stopFocus: () => void;
  activeMission: MissionDescriptor | null;
  elapsedSeconds: number;
  progress: MissionProgress | null;
  startMission: (mission: MissionDescriptor, goal?: MissionGoal) => boolean;
  finishMission: () => boolean;
  cancelMission: () => void;
  summary: MissionSummary | null;
  dismissSummary: () => void;
};

type CompletionEvidence = {
  completedTask: string;
  accuracy: AccuracySummary | null;
  proof: MissionProof;
  progress: MissionProgress;
};

const MissionContext = createContext<MissionContextValue | null>(null);

const goalUnitForAction: Partial<Record<MissionDescriptor['action'], MissionGoal['unit']>> = {
  reading: 'saved-session',
  vocabulary: 'vocabulary-page',
  'ncert-vocabulary': 'word',
  review: 'review-card',
};

const defaultMissionGoal = (mission: MissionDescriptor): MissionGoal | null => {
  const unit = goalUnitForAction[mission.action];
  if (!unit) return null;
  return {
    count: mission.action === 'review' ? Math.max(1, mission.target.cardIds.length) : 1,
    unit,
  };
};

const missionGoal = (mission: MissionDescriptor, requested?: MissionGoal): MissionGoal | null => {
  const fallback = defaultMissionGoal(mission);
  if (requested && (!fallback || !Number.isInteger(requested.count)
    || requested.count < 1 || requested.unit !== fallback.unit)) return null;
  if (!fallback) return null;
  const goal = requested ?? mission.target.goal;
  if (!goal || !Number.isInteger(goal.count) || goal.count < 1 || goal.unit !== fallback.unit) return fallback;
  return {
    count: mission.action === 'review'
      ? Math.max(goal.count, mission.target.cardIds.length)
      : goal.count,
    unit: fallback.unit,
  };
};

const getLecture = (state: StudyState, target: MissionTarget) => {
  if (!target.batchId || !target.subjectId || !target.topicId || !target.lectureId) return null;
  return state.batches.find((batch) => batch.id === target.batchId)
    ?.subjects.find((subject) => subject.id === target.subjectId)
    ?.topics.find((topic) => topic.id === target.topicId)
    ?.lectures.find((lecture) => lecture.id === target.lectureId) ?? null;
};

const hasReviewCards = (state: StudyState, target: MissionTarget) =>
  (target.cardIds.length
    ? target.cardIds.every((id) => state.studyTools.reviewCards.some((card) =>
      card.id === id && card.batchId === target.batchId
        && (!target.subjectId || card.subjectId === target.subjectId)
        && !!card.question.trim() && !!card.answer.trim()))
    : state.studyTools.reviewCards.some((card) =>
    card.batchId === target.batchId
    && (!target.subjectId || card.subjectId === target.subjectId)
    && !!card.question.trim() && !!card.answer.trim()));

const canStartMission = (
  mission: MissionDescriptor,
  study: ReturnType<typeof useStudy>,
) => {
  const { state } = study;
  const target = mission.target;
  if (mission.action === 'unsupported') return false;
  if (target.questId && state.quests.some((quest) => quest.id === target.questId && quest.completed)) return false;

  switch (mission.action) {
    case 'lecture': {
      const lecture = getLecture(state, target);
      return !!lecture && target.batchId === state.activeBatchId
        && lecture.status !== 'completed' && !lecture.isArchived
        && !study.isSubjectLocked(target.subjectId!);
    }
    case 'reading': {
      const book = state.ncertBooks.find((item) => item.id === target.bookId);
      return !!book && book.completedSessions < book.totalSessions;
    }
    case 'vocabulary': {
      const section = state.vocabularySections.find((item) => item.id === target.sectionId);
      return !!section && !state.vocabularyDailyCompleted
        && state.currentVocabularySectionId === section.id
        && state.currentVocabularyPage > 0 && section.completed < section.pages;
    }
    case 'ncert-vocabulary':
      return state.ncertBooks.length > 0;
    case 'practice':
      return true;
    case 'workout':
      return !state.studyTools.workoutSessions.some((session) => session.date === state.date);
    case 'review':
      return !!target.batchId && target.batchId === state.activeBatchId && hasReviewCards(state, target);
    case 'boss-test': {
      if (!target.batchId || target.batchId !== state.activeBatchId) return false;
      if (new Date(`${state.date}T12:00:00`).getDay() !== 6) return false;
      const cards = getWeeklyReviewCards(state.studyTools.reviewCards, target.batchId, state.date);
      return cards.some((card) => target.cardIds.includes(card.id))
        && !getWeeklyBossTest(state.studyTools.bossTests, target.batchId, state.date);
    }
    default:
      return false;
  }
};

const addedCalculationSession = (baseline: StudyState, current: StudyState) => {
  const baselineIds = new Set(baseline.calculationHistory.map((item) => item.id));
  return current.calculationHistory.find((item) =>
    !baselineIds.has(item.id) && item.questions > 0
      && Number.isInteger(item.questions) && Number.isInteger(item.correct)
      && item.correct >= 0 && item.correct <= item.questions) ?? null;
};

const addedRevisions = (session: MissionSession, current: StudyState) => {
  const target = session.mission.target;
  if (!target.batchId || target.batchId !== current.activeBatchId) return [];
  const oldIds = new Set(session.baseline.studyTools.revisionHistory.map((item) => item.id));
  return current.studyTools.revisionHistory.filter((record) =>
    !oldIds.has(record.id) && record.batchId === target.batchId && record.cardIds.length > 0
      && record.cardIds.some((id) =>
        (!target.cardIds.length || target.cardIds.includes(id))
        && session.baseline.studyTools.reviewCards.some((card) =>
          card.id === id && card.batchId === target.batchId
            && (!target.subjectId || card.subjectId === target.subjectId)
            && !!card.question.trim() && !!card.answer.trim())));
};

const reviewedTargetCardIds = (session: MissionSession, current: StudyState) => {
  const target = session.mission.target;
  const savedIds = new Set(session.baseline.studyTools.reviewCards
    .filter((card) => card.batchId === target.batchId
      && (!target.subjectId || card.subjectId === target.subjectId)
      && !!card.question.trim() && !!card.answer.trim())
    .map((card) => card.id));
  const requestedIds = target.cardIds.length ? new Set(target.cardIds) : null;
  return [...new Set(addedRevisions(session, current).flatMap((record) => record.cardIds))]
    .filter((id) => savedIds.has(id) && (!requestedIds || requestedIds.has(id)));
};

const completedEvidence = (details: {
  completedTask: string;
  accuracy: AccuracySummary | null;
  target: MissionTarget;
  source: MissionProof['source'];
  recordId: string | null;
  value: number;
  total: number | null;
  unit: NonNullable<MissionProgress['unit']>;
  actualDelta: number | null;
  rawCount?: number | null;
  recordIds?: string[];
  detail: string;
}): CompletionEvidence => ({
  completedTask: details.completedTask,
  accuracy: details.accuracy,
  proof: {
    source: details.source,
    target: details.target,
    recordId: details.recordId,
    ...(details.recordIds?.length ? { recordIds: details.recordIds } : {}),
  },
  progress: {
    status: 'complete',
    target: details.target,
    value: details.value,
    rawCount: details.rawCount ?? details.value,
    total: details.total,
    unit: details.unit,
    actualDelta: details.actualDelta,
    completed: true,
    detail: details.detail,
  },
});

const completionEvidence = (
  session: MissionSession,
  current: StudyState,
): CompletionEvidence | null => {
  const { mission, baseline } = session;
  const target = mission.target;
  const goal = missionGoal(mission);

  switch (mission.action) {
    case 'lecture': {
      if (!target.batchId || current.activeBatchId !== target.batchId) return null;
      const before = getLecture(baseline, target);
      const after = getLecture(current, target);
      if (!before || before.status === 'completed' || !after || after.status !== 'completed') return null;
      return completedEvidence({
        completedTask: after.title,
        accuracy: null,
        target,
        source: 'canonical-state',
        recordId: target.lectureId,
        value: 1,
        total: 1,
        unit: 'lecture',
        actualDelta: 1,
        detail: `The exact ${target.topicTitle ?? 'target'} lecture changed from ${before.status} to completed.`,
      });
    }
    case 'reading': {
      if (!target.bookId) return null;
      const before = baseline.ncertBooks.find((book) => book.id === target.bookId);
      const after = current.ncertBooks.find((book) => book.id === target.bookId);
      const actualDelta = before && after ? after.completedSessions - before.completedSessions : 0;
      if (!before || !after || !goal || actualDelta < goal.count) return null;
      return completedEvidence({
        completedTask: `${after.title} reading · ${actualDelta} saved session(s)`,
        accuracy: null,
        target,
        source: 'canonical-state',
        recordId: after.id,
        value: actualDelta,
        rawCount: actualDelta,
        total: goal.count,
        unit: 'saved-session',
        actualDelta,
        detail: `${after.title}: ${actualDelta}/${goal.count} saved session(s) for this mission; ${after.completedSessions}/${after.totalSessions} total book sessions recorded.`,
      });
    }
    case 'vocabulary': {
      if (!target.sectionId || !current.vocabularyDailyCompleted
        || current.vocabularyDailyDate !== current.date) return null;
      const before = baseline.vocabularySections.find((section) => section.id === target.sectionId);
      const after = current.vocabularySections.find((section) => section.id === target.sectionId);
      const actualDelta = before && after ? after.completed - before.completed : 0;
      if (!before || !after || !goal || actualDelta < goal.count) return null;
      return completedEvidence({
        completedTask: `${after.title} vocabulary · ${actualDelta} page(s)`,
        accuracy: null,
        target,
        source: 'canonical-state',
        recordId: after.id,
        value: actualDelta,
        rawCount: actualDelta,
        total: goal.count,
        unit: 'vocabulary-page',
        actualDelta,
        detail: `${after.title}: ${actualDelta}/${goal.count} new vocabulary page(s) for this mission; ${after.completed}/${after.pages} total pages recorded.`,
      });
    }
    case 'ncert-vocabulary': {
      if (!goal) return null;
      const addedWords: { bookId: string; title: string; word: string }[] = [];
      for (const before of baseline.ncertBooks) {
        const after = current.ncertBooks.find((book) => book.id === before.id);
        if (!after || (target.bookId && target.bookId !== after.id)) continue;
        const oldWords = new Set(before.vocabulary.map((word) => word.trim().toLocaleLowerCase()));
        after.vocabulary.forEach((word) => {
          const normalized = word.trim().toLocaleLowerCase();
          if (normalized && !oldWords.has(normalized)) addedWords.push({ bookId: after.id, title: after.title, word });
        });
      }
      if (addedWords.length < goal.count) return null;
      const books = [...new Set(addedWords.map((item) => item.bookId))];
      const actualTarget = { ...target, bookId: target.bookId ?? (books.length === 1 ? books[0] : null) };
      return completedEvidence({
        completedTask: `Added ${addedWords.length} new NCERT vocabulary word(s)`,
        accuracy: null,
        target: actualTarget,
        source: 'canonical-state',
        recordId: null,
        value: addedWords.length,
        rawCount: addedWords.length,
        total: goal.count,
        unit: 'word',
        actualDelta: addedWords.length,
        detail: `${addedWords.length}/${goal.count} new NCERT vocabulary word(s) recorded.`,
      });
    }
    case 'practice': {
      const sessionRecord = addedCalculationSession(baseline, current);
      if (!sessionRecord) return null;
      return completedEvidence({
        completedTask: `Calculation practice · ${sessionRecord.correct}/${sessionRecord.questions} correct`,
        accuracy: {
          source: 'calculation-history',
          numerator: sessionRecord.correct,
          denominator: sessionRecord.questions,
          percent: (sessionRecord.correct / sessionRecord.questions) * 100,
        },
        target,
        source: 'canonical-record',
        recordId: sessionRecord.id,
        value: sessionRecord.correct,
        total: sessionRecord.questions,
        unit: 'question',
        actualDelta: sessionRecord.questions,
        detail: `${sessionRecord.questions} questions were recorded in practice session ${sessionRecord.id}.`,
      });
    }
    case 'workout': {
      const previousIds = new Set(baseline.studyTools.workoutSessions.map((item) => item.id));
      const record = current.studyTools.workoutSessions.find((item) =>
        !previousIds.has(item.id) && item.date === current.date && item.duration > 0);
      return record ? completedEvidence({
        completedTask: `Workout session · ${record.duration} seconds recorded`,
        accuracy: null,
        target,
        source: 'canonical-record',
        recordId: record.id,
        value: record.duration,
        total: null,
        unit: 'second',
        actualDelta: record.duration,
        detail: `Workout record ${record.id} saved ${record.duration} seconds.`,
      }) : null;
    }
    case 'review': {
      if (!goal) return null;
      const reviewedIds = reviewedTargetCardIds(session, current);
      const selectedIds = target.cardIds;
      const completedIds = selectedIds.length ? selectedIds : reviewedIds.slice(0, goal.count);
      if (completedIds.length < goal.count
        || selectedIds.some((id) => !reviewedIds.includes(id))) return null;
      const recordIds = addedRevisions(session, current)
        .filter((record) => record.cardIds.some((id) => completedIds.includes(id)))
        .map((record) => record.id);
      const cards = completedIds.map((id) =>
        baseline.studyTools.reviewCards.find((card) => card.id === id && card.batchId === target.batchId));
      const subjectIds = [...new Set(cards.filter((card) => !!card).map((card) => card.subjectId))];
      const actualTarget: MissionTarget = {
        ...target,
        batchId: target.batchId,
        subjectId: target.subjectId ?? (subjectIds.length === 1 ? subjectIds[0] : null),
        cardIds: [...completedIds],
      };
      return completedEvidence({
        completedTask: `Reviewed ${completedIds.length} saved card${completedIds.length === 1 ? '' : 's'}`,
        accuracy: null,
        target: actualTarget,
        source: 'canonical-record',
        recordId: recordIds[0] ?? null,
        recordIds,
        value: completedIds.length,
        rawCount: completedIds.length,
        total: goal.count,
        unit: 'review-card',
        actualDelta: completedIds.length,
        detail: `${completedIds.length}/${goal.count} selected saved card(s) were included in canonical revision record(s) ${recordIds.join(', ')}.`,
      });
    }
    case 'boss-test': {
      if (!target.batchId || current.activeBatchId !== target.batchId) return null;
      const previousIds = new Set(baseline.studyTools.bossTests.map((item) => item.id));
      const record = current.studyTools.bossTests.find((test) =>
        !previousIds.has(test.id) && !test.gateAttemptId
          && test.batchId === target.batchId && test.results.length > 0
          && test.results.every((result) => baseline.studyTools.reviewCards.some((card) =>
            card.id === result.cardId && card.batchId === target.batchId
              && card.subjectId === result.subjectId)));
      if (!record) return null;
      const numerator = record.results.filter((result) => result.correct).length;
      const denominator = record.results.length;
      const resultSubjects = [...new Set(record.results.map((result) => result.subjectId))];
      const actualTarget: MissionTarget = {
        ...target,
        batchId: record.batchId,
        subjectId: target.subjectId ?? (resultSubjects.length === 1 ? resultSubjects[0] : null),
        topicId: null,
        topicTitle: null,
        cardIds: record.results.map((result) => result.cardId),
      };
      return completedEvidence({
        completedTask: `Boss Test · ${numerator}/${denominator} recalled`,
        accuracy: {
          source: 'boss-results',
          numerator,
          denominator,
          percent: (numerator / denominator) * 100,
        },
        target: actualTarget,
        source: 'canonical-record',
        recordId: record.id,
        value: numerator,
        total: denominator,
        unit: 'boss-result',
        actualDelta: denominator,
        detail: `Boss test record ${record.id} contains ${denominator} actual result(s).`,
      });
    }
    default:
      return null;
  }
};

const waitingProgress = (
  target: MissionTarget,
  details: Omit<MissionProgress, 'status' | 'target' | 'rawCount' | 'completed'>
    & { status?: MissionProgressStatus; rawCount?: number | null; completed?: boolean },
): MissionProgress => ({
  status: details.status ?? 'waiting',
  target,
  value: details.value,
  rawCount: details.rawCount ?? details.value,
  total: details.total,
  unit: details.unit,
  actualDelta: details.actualDelta,
  completed: details.completed ?? details.status === 'complete',
  detail: details.detail,
});

const missionProgress = (session: MissionSession, current: StudyState): MissionProgress => {
  const complete = completionEvidence(session, current);
  if (complete) return complete.progress;

  const { mission, baseline } = session;
  const target = mission.target;
  const goal = missionGoal(mission);
  switch (mission.action) {
    case 'lecture': {
      if (!target.batchId || current.activeBatchId !== target.batchId) {
        return waitingProgress(target, {
          status: 'blocked', value: null, total: null, unit: 'lecture', actualDelta: null,
          detail: 'The exact target batch is not active; no lecture progress is credited.',
        });
      }
      const lecture = getLecture(current, target);
      const before = getLecture(baseline, target);
      if (!lecture || !before) {
        return waitingProgress(target, {
          status: 'unavailable', value: null, total: null, unit: 'lecture', actualDelta: null,
          detail: 'The exact target lecture is no longer available.',
        });
      }
      return waitingProgress(target, {
        status: lecture.status === 'in-progress' ? 'in-progress' : 'waiting',
        value: null,
        total: null,
        unit: 'lecture',
        actualDelta: lecture.sessionCount - before.sessionCount,
        detail: lecture.status === 'in-progress'
          ? `The exact lecture is marked in progress (${lecture.sessionCount} recorded start(s)); watched-time progress is not recorded.`
          : `Waiting for a canonical completion record for ${lecture.title}.`,
      });
    }
    case 'reading': {
      const before = baseline.ncertBooks.find((book) => book.id === target.bookId);
      const book = current.ncertBooks.find((item) => item.id === target.bookId);
      if (!before || !book) {
        return waitingProgress(target, {
          status: 'unavailable', value: null, total: null, unit: 'saved-session', actualDelta: null,
          detail: 'The exact target book is no longer available.',
        });
      }
      const delta = book.completedSessions - before.completedSessions;
      const required = goal?.count ?? 1;
      return waitingProgress(target, {
        status: delta > 0 ? 'in-progress' : 'waiting',
        value: delta,
        rawCount: delta,
        total: required,
        unit: 'saved-session',
        actualDelta: delta,
        detail: `${book.title}: ${delta}/${required} saved session(s) for this mission; ${book.completedSessions}/${book.totalSessions} total book sessions recorded.`,
      });
    }
    case 'vocabulary': {
      const before = baseline.vocabularySections.find((section) => section.id === target.sectionId);
      const section = current.vocabularySections.find((item) => item.id === target.sectionId);
      if (!before || !section) {
        return waitingProgress(target, {
          status: 'unavailable', value: null, total: null, unit: 'vocabulary-page', actualDelta: null,
          detail: 'The exact target vocabulary section is no longer available.',
        });
      }
      const delta = section.completed - before.completed;
      const required = goal?.count ?? 1;
      return waitingProgress(target, {
        status: delta > 0 ? 'in-progress' : 'waiting',
        value: delta,
        rawCount: delta,
        total: required,
        unit: 'vocabulary-page',
        actualDelta: delta,
        detail: `${section.title}: ${delta}/${required} new vocabulary page(s) for this mission; ${section.completed}/${section.pages} total pages recorded.`,
      });
    }
    case 'ncert-vocabulary': {
      const newWords = current.ncertBooks.reduce((sum, book) => {
        if (target.bookId && target.bookId !== book.id) return sum;
        const before = baseline.ncertBooks.find((item) => item.id === book.id);
        if (!before) return sum;
        const oldWords = new Set(before.vocabulary.map((word) => word.trim().toLocaleLowerCase()));
        return sum + book.vocabulary.filter((word) => !oldWords.has(word.trim().toLocaleLowerCase())).length;
      }, 0);
      const required = goal?.count ?? 1;
      return waitingProgress(target, {
        status: newWords ? 'in-progress' : 'waiting',
        value: newWords,
        rawCount: newWords,
        total: required,
        unit: 'word',
        actualDelta: newWords,
        detail: `${newWords}/${required} new NCERT vocabulary word(s) recorded during this mission.`,
      });
    }
    case 'practice': {
      const record = addedCalculationSession(baseline, current);
      return waitingProgress(target, {
        status: record ? 'in-progress' : 'waiting',
        value: record?.correct ?? 0,
        total: record?.questions ?? null,
        unit: 'question',
        actualDelta: record?.questions ?? 0,
        detail: record
          ? `Practice session ${record.id} recorded ${record.correct}/${record.questions} correct.`
          : 'Waiting for a saved practice result; the mission timer is not activity proof.',
      });
    }
    case 'workout':
      return waitingProgress(target, {
        status: 'waiting', value: null, total: null, unit: 'second', actualDelta: null,
        detail: 'Waiting for the canonical workout session record; elapsed mission time is not workout proof.',
      });
    case 'review': {
      const reviewedIds = reviewedTargetCardIds(session, current);
      const required = goal?.count ?? 1;
      const rawCount = target.cardIds.length
        ? reviewedIds.filter((id) => target.cardIds.includes(id)).length
        : Math.min(reviewedIds.length, required);
      return waitingProgress(target, {
        status: rawCount > 0 ? 'in-progress' : 'waiting',
        value: rawCount,
        rawCount,
        total: required,
        unit: 'review-card',
        actualDelta: rawCount,
        detail: `${rawCount}/${required} target saved card(s) have canonical revision records.`,
      });
    }
    case 'boss-test':
      return waitingProgress(target, {
        status: 'waiting', value: null, total: null, unit: 'boss-result', actualDelta: null,
        detail: 'Waiting for a saved Boss Test result record for the target batch.',
      });
    default:
      return waitingProgress(target, {
        status: 'unavailable', value: null, total: null, unit: null, actualDelta: null,
        detail: 'This mission has no supported canonical completion record.',
      });
  }
};

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const study = useStudy();
  const studyRef = useRef(study);
  studyRef.current = study;

  const [activeMission, setActiveMission] = useState<MissionDescriptor | null>(null);
  const activeMissionRef = useRef<MissionDescriptor | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const appIsActiveRef = useRef(AppState.currentState === 'active');
  const elapsedMillisecondsRef = useRef(0);
  const lastTickAtRef = useRef<number | null>(null);
  const sessionRef = useRef<MissionSession | null>(null);
  const focusRef = useRef<FocusClock | null>(null);
  const [focusClock, setFocusClock] = useState<FocusClock | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);

  const stopFocus = () => {
    const clock = focusRef.current;
    if (!clock) return;
    const updated = advanceFocusClock(clock, Date.now());
    // Clear before committing: rerenders and repeated taps cannot duplicate a record.
    focusRef.current = null;
    setFocusClock(null);
    try {
      studyRef.current.logFocusSession({
        kind: updated.kind,
        durationSeconds: Math.floor(updated.elapsedMilliseconds / 1000),
        presetMinutes: updated.presetMinutes,
        task: updated.task,
        completed: focusSecondsRemaining(updated) === 0,
      });
      setFocusError(null);
    } catch {
      focusRef.current = { ...updated, lastTickAt: null };
      setFocusClock(focusRef.current);
      setFocusError('The timer record could not be saved. Tap end timer to retry.');
    }
  };

  const startFocus = (presetMinutes: FocusPreset) => {
    if (focusRef.current || !studyRef.current.hydrated) return false;
    const kind = presetMinutes === 5 || presetMinutes === 10 ? 'break' : 'focus';
    const clock: FocusClock = {
      kind, presetMinutes,
      task: kind === 'break' ? 'Rest break' : activeMissionRef.current?.title ?? 'Independent study focus',
      elapsedMilliseconds: 0,
      lastTickAt: appIsActiveRef.current ? Date.now() : null,
    };
    focusRef.current = clock;
    setFocusClock(clock);
    setFocusError(null);
    return true;
  };

  useEffect(() => {
    if (!focusClock || !appIsActive) return;
    const timer = setInterval(() => {
      if (!focusRef.current) return;
      const updated = advanceFocusClock(focusRef.current, Date.now());
      focusRef.current = updated;
      setFocusClock(updated);
      if (focusSecondsRemaining(updated) === 0) stopFocus();
    }, 1000);
    return () => clearInterval(timer);
  }, [!!focusClock, appIsActive]);

  const updateElapsed = () => {
    if (lastTickAtRef.current !== null) {
      elapsedMillisecondsRef.current += Math.max(0, Date.now() - lastTickAtRef.current);
      lastTickAtRef.current = Date.now();
    }
    setElapsedSeconds(Math.floor(elapsedMillisecondsRef.current / 1000));
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const isActive = nextState === 'active';
      if (focusRef.current) {
        focusRef.current = {
          ...advanceFocusClock(focusRef.current, Date.now()),
          lastTickAt: isActive ? Date.now() : null,
        };
        setFocusClock(focusRef.current);
      }
      if (isActive) {
        appIsActiveRef.current = true;
        if (sessionRef.current && lastTickAtRef.current === null) lastTickAtRef.current = Date.now();
      } else {
        updateElapsed();
        appIsActiveRef.current = false;
        lastTickAtRef.current = null;
      }
      setAppIsActive(isActive);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!activeMission || !appIsActive) return undefined;
    if (lastTickAtRef.current === null) lastTickAtRef.current = Date.now();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [!!activeMission, appIsActive]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || session.completed) return;
    const evidence = completionEvidence(session, study.state);
    if (!evidence) return;
    updateElapsed();
    session.completed = true;
    study.recordProgressActivity('mission.completed', `mission:${session.mission.id}:completed:${session.startedAt}`, {
      missionId: session.mission.id,
      action: session.mission.action,
      targetId: evidence.proof.recordId,
      proofSource: evidence.proof.source,
    });
    const missionSummary: MissionSummary = {
      missionId: session.mission.id,
      target: evidence.proof.target,
      proof: evidence.proof,
      progress: evidence.progress,
      elapsedSeconds: Math.floor(elapsedMillisecondsRef.current / 1000),
      completedTask: evidence.completedTask,
      actualXpDelta: study.state.totalXp - session.baselineXp,
      accuracy: evidence.accuracy,
      nextMission: getNextMission(study),
    };
    sessionRef.current = null;
    activeMissionRef.current = null;
    setActiveMission(null);
    setSummary(missionSummary);
  }, [study.state]);

  useEffect(() => () => {
    sessionRef.current = null;
    activeMissionRef.current = null;
    lastTickAtRef.current = null;
  }, []);

  const startMission = (mission: MissionDescriptor, requestedGoal?: MissionGoal) => {
    if (sessionRef.current || activeMissionRef.current || !canStartMission(mission, studyRef.current)) return false;
    const resolvedGoal = missionGoal(mission, requestedGoal);
    if (requestedGoal && !resolvedGoal) return false;
    const missionWithGoal = resolvedGoal
      ? { ...mission, target: { ...mission.target, goal: resolvedGoal } }
      : mission;
    elapsedMillisecondsRef.current = 0;
    lastTickAtRef.current = appIsActiveRef.current ? Date.now() : null;
    setElapsedSeconds(0);
    setSummary(null);
    const startedAt = new Date().toISOString();
    const nextSession: MissionSession = {
      mission: missionWithGoal,
      baseline: studyRef.current.state,
      baselineXp: studyRef.current.state.totalXp,
      completed: false,
      startedAt,
    };
    const questId = missionWithGoal.target.questId ?? missionWithGoal.target.lectureId ?? missionWithGoal.id;
    const questDate = studyRef.current.state.date;
    studyRef.current.recordProgressActivity(
      'mission.started',
      `mission:${missionWithGoal.id}:started:${startedAt}`,
      { missionId: missionWithGoal.id, action: missionWithGoal.action, questId },
    );
    studyRef.current.recordProgressActivity(
      'quest.started',
      `mission-quest:${questDate}:${questId}:${startedAt}`,
      { questId, questTitle: missionWithGoal.title, questDate, source: 'mission-start' },
    );
    sessionRef.current = nextSession;
    activeMissionRef.current = missionWithGoal;
    setActiveMission(missionWithGoal);
    return true;
  };

  const finishMission = () => {
    const session = sessionRef.current;
    if (!session || session.completed) return false;
    const currentStudy = studyRef.current;
    const evidence = completionEvidence(session, currentStudy.state);
    if (!evidence) return false;
    updateElapsed();
    session.completed = true;
    currentStudy.recordProgressActivity('mission.completed', `mission:${session.mission.id}:completed:${session.startedAt}`, {
      missionId: session.mission.id,
      action: session.mission.action,
      targetId: evidence.proof.recordId,
      proofSource: evidence.proof.source,
    });
    const missionSummary: MissionSummary = {
      missionId: session.mission.id,
      target: evidence.proof.target,
      proof: evidence.proof,
      progress: evidence.progress,
      elapsedSeconds: Math.floor(elapsedMillisecondsRef.current / 1000),
      completedTask: evidence.completedTask,
      actualXpDelta: currentStudy.state.totalXp - session.baselineXp,
      accuracy: evidence.accuracy,
      nextMission: getNextMission(currentStudy),
    };
    sessionRef.current = null;
    activeMissionRef.current = null;
    setActiveMission(null);
    setSummary(missionSummary);
    return true;
  };

  const cancelMission = () => {
    sessionRef.current = null;
    activeMissionRef.current = null;
    lastTickAtRef.current = null;
    elapsedMillisecondsRef.current = 0;
    setElapsedSeconds(0);
    setActiveMission(null);
    setSummary(null);
  };

  const dismissSummary = () => setSummary(null);
  const progress = activeMission && sessionRef.current
    ? missionProgress(sessionRef.current, study.state)
    : null;

  return (
    <MissionContext.Provider value={{
      focusClock,
      focusError,
      focusRemainingSeconds: focusClock ? focusSecondsRemaining(focusClock) : null,
      startFocus,
      stopFocus,
      activeMission,
      elapsedSeconds,
      progress,
      startMission,
      finishMission,
      cancelMission,
      summary,
      dismissSummary,
    }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const context = useContext(MissionContext);
  if (!context) throw new Error('useMission must be used within MissionProvider');
  return context;
}