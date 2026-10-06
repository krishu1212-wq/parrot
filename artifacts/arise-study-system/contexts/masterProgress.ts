import {
  getBatchProgress,
  isPhaseOneComplete,
} from '@/contexts/batchSystem';
import type { NextLecture, StudyBatch, StudySubject } from '@/contexts/batchSystem';
import { getWeeklyBossTest, getWeeklyReviewCards } from '@/contexts/learningTools';
import { isPhaseTwoSubject } from '@/contexts/studyActivityRules';
import type { StudyState, useStudy } from '@/contexts/StudyContext';

export type AccuracySummary = {
  source: 'boss-results' | 'calculation-history';
  numerator: number;
  denominator: number;
  percent: number;
};

export type WeaknessEvidenceCard = {
  cardId: string;
  correct: boolean;
};

export type WeaknessActionKind = 'lecture' | 'review' | 'practice';

export type WeaknessRecommendation = {
  id: string;
  kind: WeaknessActionKind;
  title: string;
  route: string;
  routeParams?: Record<string, string>;
  scope: 'topic' | 'general';
  target: {
    batchId: string;
    subjectId: string;
    topicId: string | null;
    topicTitle: string;
    cardIds: string[];
    lectureId: string | null;
  };
};

export type WeaknessFinding = {
  id: string;
  batchId: string;
  batchName: string | null;
  isActiveBatch: boolean;
  subjectId: string;
  subjectName: string | null;
  topicId: string | null;
  topicTitle: string;
  accuracy: AccuracySummary;
  evidenceBand: EvidenceBand;
  incorrectCount: number;
  evidenceCards: WeaknessEvidenceCard[];
  recommendations: WeaknessRecommendation[];
};

export type WeaknessRadar = {
  status: 'available' | 'insufficient-data';
  insufficientData: boolean;
  reason: 'no-boss-results' | null;
  activeBatchId: string;
  findings: WeaknessFinding[];
  calculationHistoryAccuracy: AccuracySummary | null;
  calculationEvidenceBand: EvidenceBand;
};

export type EvidenceBand = 'strong' | 'developing' | 'weak' | 'insufficient-data';

/** A descriptive signal, not a mastery claim. Small samples remain unknown. */
export function classifyAccuracyEvidence(accuracy: AccuracySummary | null): EvidenceBand {
  if (!accuracy || accuracy.denominator < 5) return 'insufficient-data';
  return accuracy.percent >= 80 ? 'strong' : accuracy.percent >= 60 ? 'developing' : 'weak';
}

export type JourneyStageStatus =
  | 'locked'
  | 'available'
  | 'in-progress'
  | 'complete'
  | 'insufficient-data';

export type JourneyStage = {
  id: 'foundation' | 'maths' | 'ncert' | 'vocabulary' | 'phase-two' | 'reasoning' | 'english' | 'revision' | 'boss-tests';
  title: string;
  status: JourneyStageStatus;
  progressPercent: number | null;
  progress: { completed: number; total: number } | null;
  batchId: string | null;
  subjectId: string | null;
  activityCount: number | null;
  note: string | null;
};

export type MissionAction =
  | 'lecture'
  | 'reading'
  | 'vocabulary'
  | 'ncert-vocabulary'
  | 'practice'
  | 'workout'
  | 'review'
  | 'boss-test'
  | 'unsupported';

export type MissionGoalUnit = 'saved-session' | 'vocabulary-page' | 'word' | 'review-card';

export type MissionGoal = {
  count: number;
  unit: MissionGoalUnit;
};

export type MissionTarget = {
  batchId: string | null;
  subjectId: string | null;
  topicId: string | null;
  topicTitle: string | null;
  lectureId: string | null;
  cardIds: string[];
  bookId: string | null;
  sectionId: string | null;
  questId: string | null;
  goal?: MissionGoal;
};

export type MissionDescriptor = {
  id: string;
  title: string;
  subtitle: string;
  action: MissionAction;
  route: string;
  routeParams?: Record<string, string>;
  source: 'daily-quest' | 'next-lecture' | 'weekly-boss' | 'weakness-radar';
  target: MissionTarget;
  xpReward: number | null;
};

export type DailyBriefing = {
  date: string;
  quests: { id: string; title: string; subtitle: string; category: string; xp: number; completed: boolean }[];
  pendingQuestIds: string[];
  priorityOrder: string[];
  estimatedStudyTime: {
    minutes: number | null;
    status: 'available' | 'partial' | 'no-pending-quests';
    estimateSource: 'recorded-duration' | 'planning-budget' | 'mixed' | 'no-pending-quests' | 'partial';
    tasks: {
      questId: string;
      title: string;
      action: MissionAction;
      minutes: number;
      estimateSource: 'recorded-duration' | 'planning-budget';
      averageRecordedSeconds: number | null;
      recordedSamples: number;
    }[];
    reason: string | null;
    disclaimer: string;
  };
  streak: number;
  totalXp: number;
  todayXp: number;
  level: number;
  rank: string;
  phaseTwoUnlocked: boolean;
  nextMission: MissionDescriptor | null;
  importantPendingMission: MissionDescriptor | null;
  weaknessRadar: WeaknessRadar;
};

type StudyView = ReturnType<typeof useStudy>;

type MutableFinding = {
  batchId: string;
  subjectId: string;
  topicTitle: string;
  numerator: number;
  denominator: number;
  evidenceCards: WeaknessEvidenceCard[];
};

const emptyTarget = (): MissionTarget => ({
  batchId: null,
  subjectId: null,
  topicId: null,
  topicTitle: null,
  lectureId: null,
  cardIds: [],
  bookId: null,
  sectionId: null,
  questId: null,
});

const isValidCount = (value: number) => Number.isFinite(value) && Number.isInteger(value) && value >= 0;

const accuracySummary = (
  source: AccuracySummary['source'],
  numerator: number,
  denominator: number,
): AccuracySummary => ({
  source,
  numerator,
  denominator,
  percent: (numerator / denominator) * 100,
});

const calculationHistoryAccuracy = (study: StudyState): AccuracySummary | null => {
  let correct = 0;
  let questions = 0;
  for (const session of study.calculationHistory) {
    if (!isValidCount(session.questions) || !isValidCount(session.correct)
      || session.correct > session.questions || session.questions === 0) continue;
    correct += session.correct;
    questions += session.questions;
  }
  return questions > 0 ? accuracySummary('calculation-history', correct, questions) : null;
};

const matchingTopicId = (batch: StudyBatch | undefined, subjectId: string, topicTitle: string) => {
  const subject = batch?.subjects.find((item) => item.id === subjectId);
  if (!subject) return null;
  const matches = subject.topics.filter((topic) => !topic.isArchived && topic.title === topicTitle);
  return matches.length === 1 ? matches[0].id : null;
};

const isPhaseTwoLocked = (batch: StudyBatch | undefined, study: StudyState, subject: StudySubject) => {
  if (!isPhaseTwoSubject(subject)) return false;
  const progress = batch ? getBatchProgress(batch) : [];
  const maths = progress.find((item) => item.subjectId === 'maths')
    ?? progress.find((item) => item.name.trim().toLowerCase() === 'maths');
  return !isPhaseOneComplete(
    maths ?? { total: 0, completed: 0 },
    { total: study.ncertTotal, completed: study.ncertCompleted },
  );
};

const findTopicRecommendations = (
  study: StudyState,
  batch: StudyBatch,
  finding: MutableFinding,
  topicId: string | null,
): WeaknessRecommendation[] => {
  if (batch.id !== study.activeBatchId) return [];
  const subject = batch.subjects.find((item) => item.id === finding.subjectId);
  if (!subject) return [];

  const recommendations: WeaknessRecommendation[] = [];
  const target = {
    batchId: batch.id,
    subjectId: subject.id,
    topicId,
    topicTitle: finding.topicTitle,
  };
  if (isPhaseTwoLocked(batch, study, subject)) return recommendations;

  const resultCardIds = new Set(finding.evidenceCards.map((item) => item.cardId));
  const reviewCardIds = study.studyTools.reviewCards
    .filter((card) => card.batchId === batch.id && card.subjectId === subject.id
      && resultCardIds.has(card.id) && card.topicTitle === finding.topicTitle)
    .map((card) => card.id);

  if (topicId !== null && reviewCardIds.length) {
    recommendations.push({
      id: `review:${batch.id}:${subject.id}:${finding.topicTitle}`,
      kind: 'review',
      title: 'Review saved cards from this topic',
      route: '/rituals',
      routeParams: {
        mode: 'recovery',
        batchId: batch.id,
        subjectId: subject.id,
        topicId,
        topicTitle: finding.topicTitle,
        cardIds: reviewCardIds.join(','),
      },
      scope: 'topic',
      target: { ...target, cardIds: reviewCardIds, lectureId: null },
    });
  }

  if (topicId !== null) {
    const topic = subject.topics.find((item) => item.id === topicId && !item.isArchived);
    const nextLecture = (topic && topic.lectures.find((lecture) =>
      !lecture.isArchived && lecture.status === 'in-progress'))
      ?? topic?.lectures.find((lecture) => !lecture.isArchived && lecture.status === 'not-started');
    if (nextLecture) {
      recommendations.push({
        id: `lecture:${batch.id}:${subject.id}:${topicId}:${nextLecture.id}`,
        kind: 'lecture',
        title: `Continue ${finding.topicTitle}`,
        route: '/(tabs)/maths',
        routeParams: {
          batchId: batch.id,
          subject: subject.id,
          topicId,
          topicTitle: finding.topicTitle,
          lectureId: nextLecture.id,
        },
        scope: 'topic',
        target: { ...target, cardIds: [], lectureId: nextLecture.id },
      });
    }
  }

  // The current practice screen records aggregate calculation history only. Keep
  // this route explicitly general instead of attributing its score to this topic.
  recommendations.push({
    id: `practice:${batch.id}:${subject.id}:${finding.topicTitle}`,
    kind: 'practice',
    title: 'General calculation practice · not topic-specific',
    route: '/practice',
    scope: 'general',
    target: { ...target, cardIds: [], lectureId: null },
  });
  return recommendations;
};

export function deriveWeaknessRadar(study: StudyState): WeaknessRadar {
  const batches = Array.isArray(study.batches) ? study.batches : [];
  const grouped = new Map<string, MutableFinding>();
  const bossTests = study.studyTools?.bossTests ?? [];

  for (const test of bossTests) {
    if (!test.batchId || !Array.isArray(test.results)) continue;
    for (const result of test.results) {
      if (!result.subjectId || typeof result.topicTitle !== 'string' || !result.topicTitle.trim()
        || typeof result.correct !== 'boolean' || !result.cardId) continue;
      const key = JSON.stringify([test.batchId, result.subjectId, result.topicTitle]);
      let finding = grouped.get(key);
      if (!finding) {
        finding = {
          batchId: test.batchId,
          subjectId: result.subjectId,
          topicTitle: result.topicTitle,
          numerator: 0,
          denominator: 0,
          evidenceCards: [],
        };
        grouped.set(key, finding);
      }
      finding.denominator += 1;
      if (result.correct) finding.numerator += 1;
      finding.evidenceCards.push({ cardId: result.cardId, correct: result.correct });
    }
  }

  const findings = [...grouped.values()].map((finding): WeaknessFinding => {
    const batch = batches.find((item) => item.id === finding.batchId);
    const subject = batch?.subjects.find((item) => item.id === finding.subjectId);
    const topicId = matchingTopicId(batch, finding.subjectId, finding.topicTitle);
    return {
      id: `boss:${finding.batchId}:${finding.subjectId}:${finding.topicTitle}`,
      batchId: finding.batchId,
      batchName: batch?.name ?? null,
      isActiveBatch: finding.batchId === study.activeBatchId,
      subjectId: finding.subjectId,
      subjectName: subject?.name ?? null,
      topicId,
      topicTitle: finding.topicTitle,
      accuracy: accuracySummary('boss-results', finding.numerator, finding.denominator),
      evidenceBand: classifyAccuracyEvidence(accuracySummary('boss-results', finding.numerator, finding.denominator)),
      incorrectCount: finding.denominator - finding.numerator,
      evidenceCards: finding.evidenceCards,
      recommendations: batch
        ? findTopicRecommendations(study, batch, finding, topicId)
        : [],
    };
  }).sort((left, right) => {
    if (left.isActiveBatch !== right.isActiveBatch) return left.isActiveBatch ? -1 : 1;
    const leftRate = left.accuracy.numerator / left.accuracy.denominator;
    const rightRate = right.accuracy.numerator / right.accuracy.denominator;
    return leftRate - rightRate
      || right.accuracy.denominator - left.accuracy.denominator
      || left.topicTitle.localeCompare(right.topicTitle);
  });

  return {
    status: findings.length ? 'available' : 'insufficient-data',
    insufficientData: findings.length === 0,
    reason: findings.length ? null : 'no-boss-results',
    activeBatchId: study.activeBatchId,
    findings,
    calculationHistoryAccuracy: calculationHistoryAccuracy(study),
    calculationEvidenceBand: classifyAccuracyEvidence(calculationHistoryAccuracy(study)),
  };
}

const measuredStage = (
  id: JourneyStage['id'],
  title: string,
  completed: number,
  total: number,
  batchId: string | null = null,
  subjectId: string | null = null,
  activityCount: number | null = null,
): JourneyStage => {
  const validCounts = isValidCount(completed) && isValidCount(total) && completed <= total;
  const hasData = validCounts && total > 0;
  return {
    id,
    title,
    status: !hasData ? 'insufficient-data' : completed >= total ? 'complete' : 'in-progress',
    progressPercent: hasData ? (completed / total) * 100 : null,
    progress: hasData ? { completed, total } : null,
    batchId,
    subjectId,
    activityCount,
    note: hasData ? null : 'Progress is not available from the current records.',
  };
};

const subjectByName = (batch: StudyBatch, name: string) =>
  batch.subjects.find((subject) => subject.id === name)
    ?? batch.subjects.find((subject) => subject.name.trim().toLowerCase() === name);

export function deriveJourney(study: StudyView): JourneyStage[] {
  const state = study.state;
  const batch = study.activeBatch;
  const progressBySubject = new Map(study.activeBatchProgress.map((item) => [item.subjectId, item]));
  const getSubjectStage = (name: string, title: string, locked: boolean): JourneyStage => {
    const subject = subjectByName(batch, name);
    const progress = subject ? progressBySubject.get(subject.id) : undefined;
    const stage = measuredStage(
      name as 'maths' | 'reasoning' | 'english',
      title,
      progress?.completed ?? 0,
      progress?.total ?? 0,
      batch.id,
      subject?.id ?? null,
    );
    return locked ? { ...stage, status: 'locked', note: 'Locked by the existing Phase 2 gate.' } : stage;
  };

  const foundation = measuredStage(
    'foundation',
    'Foundation',
    state.quests.filter((quest) => quest.completed).length,
    state.quests.length,
    null,
    null,
    state.quests.filter((quest) => quest.completed).length,
  );
  const ncert = measuredStage('ncert', 'NCERT', state.ncertCompleted, state.ncertTotal);
  const vocabulary = measuredStage('vocabulary', 'Vocabulary', state.blackBookPage, state.blackBookTotal);
  const revisionCards = state.studyTools.reviewCards.filter((card) => card.batchId === batch.id);
  const revisions = state.studyTools.revisionHistory.filter((record) => record.batchId === batch.id);
  const revision: JourneyStage = {
    id: 'revision',
    title: 'Revision',
    status: revisionCards.length ? 'available' : 'insufficient-data',
    progressPercent: null,
    progress: null,
    batchId: batch.id,
    subjectId: null,
    activityCount: revisions.length,
    note: revisionCards.length
      ? `${revisionCards.length} saved review card${revisionCards.length === 1 ? '' : 's'}; no fixed completion target is defined.`
      : 'No saved review cards exist for the active batch.',
  };

  const weeklyCards = getWeeklyReviewCards(state.studyTools.reviewCards, batch.id, state.date);
  const weeklyBoss = getWeeklyBossTest(state.studyTools.bossTests, batch.id, state.date);
  const bossTests: JourneyStage = {
    id: 'boss-tests',
    title: 'Boss Tests',
    status: !weeklyCards.length ? 'insufficient-data' : weeklyBoss ? 'complete' : 'available',
    progressPercent: weeklyCards.length ? (weeklyBoss ? 100 : 0) : null,
    progress: weeklyCards.length ? { completed: weeklyBoss ? 1 : 0, total: 1 } : null,
    batchId: batch.id,
    subjectId: null,
    activityCount: state.studyTools.bossTests.filter((test) => test.batchId === batch.id).length,
    note: weeklyCards.length
      ? weeklyBoss ? 'This week’s official test is recorded.' : 'Saved cards are available for this week’s official test.'
      : 'A current-week Boss Test needs saved review cards.',
  };

  return [
    foundation,
    getSubjectStage('maths', 'Maths', false),
    ncert,
    vocabulary,
    {
      id: 'phase-two',
      title: 'Phase 2',
      status: study.phaseTwoUnlocked ? 'available' : 'locked',
      progressPercent: study.phaseTwoUnlocked ? 100 : 0,
      progress: { completed: study.phaseTwoUnlocked ? 1 : 0, total: 1 },
      batchId: batch.id,
      subjectId: null,
      activityCount: null,
      note: study.phaseTwoUnlocked
        ? 'Unlocked by the existing Phase 2 prerequisites.'
        : 'Finish the selected batch’s Maths course and NCERT goals to unlock.',
    },
    getSubjectStage('reasoning', 'Reasoning', !study.phaseTwoUnlocked),
    getSubjectStage('english', 'English', !study.phaseTwoUnlocked),
    revision,
    bossTests,
  ];
}

const routeForQuest = (
  quest: StudyState['quests'][number],
  study: StudyView,
): {
  action: MissionAction;
  route: string;
  routeParams?: Record<string, string>;
  target: MissionTarget;
} => {
  const state = study.state;
  const activeBatch = study.activeBatch;
  const mathsProgress = study.activeBatchProgress.find((item) => item.subjectId === 'maths')
    ?? study.activeBatchProgress.find((item) => item.name.trim().toLowerCase() === 'maths');
  const mathsComplete = !!mathsProgress && mathsProgress.total > 0 && mathsProgress.remaining === 0;
  const topic = (subjectId: string, topicId: string) =>
    activeBatch.subjects.find((subject) => subject.id === subjectId)?.topics.find((item) => item.id === topicId);

  if (quest.isRecovery) {
    return {
      action: 'review' as const,
      route: '/rituals?mode=recovery',
      routeParams: { batchId: activeBatch.id },
      target: { ...emptyTarget(), batchId: activeBatch.id, questId: quest.id },
    };
  }
  if (quest.id === 'maths-lecture' && mathsComplete) {
    const mathsSubject = subjectByName(activeBatch, 'maths');
    const cardIds = mathsSubject
      ? state.studyTools.reviewCards.filter((card) =>
        card.batchId === activeBatch.id && card.subjectId === mathsSubject.id).map((card) => card.id)
      : [];
    return {
      action: 'review' as const,
      route: '/rituals?mode=recovery',
      routeParams: {
        batchId: activeBatch.id,
        subjectId: mathsSubject?.id ?? 'maths',
        cardIds: cardIds.join(','),
      },
      target: {
        ...emptyTarget(),
        batchId: activeBatch.id,
        subjectId: mathsSubject?.id ?? null,
        cardIds,
        questId: quest.id,
      },
    };
  }
  if (quest.id === 'maths-lecture') {
    const next = study.nextLecture;
    const nextTopic = next ? topic(next.subjectId, next.topicId) : undefined;
    return {
      action: next && next.batchId === activeBatch.id ? 'lecture' as const : 'unsupported' as const,
      route: '/(tabs)/maths',
      routeParams: next ? {
        batchId: next.batchId,
        subject: next.subjectId,
        topicId: next.topicId,
        topicTitle: next.topicTitle,
        lectureId: next.lecture.id,
      } : undefined,
      target: next && nextTopic && next.batchId === activeBatch.id ? {
        ...emptyTarget(),
        batchId: next.batchId,
        subjectId: next.subjectId,
        topicId: next.topicId,
        topicTitle: next.topicTitle,
        lectureId: next.lecture.id,
        questId: quest.id,
      } : { ...emptyTarget(), batchId: activeBatch.id, questId: quest.id },
    };
  }

  const search = `${quest.category} ${quest.title}`.toLowerCase();
  if (quest.id === 'morning-workout' || /workout|ritual/.test(search)) {
    return { action: 'workout' as const, route: '/rituals?mode=workout', target: { ...emptyTarget(), questId: quest.id } };
  }
  if (quest.id === 'ncert-reading' || /ncert.*read|reading.*ncert/.test(search)) {
    const requiredSessions = goalFromQuestCurrentGoal(quest, 'reading', emptyTarget())?.count ?? 1;
    const book = state.ncertBooks.find((item) =>
      item.totalSessions - item.completedSessions >= requiredSessions);
    return {
      action: book ? 'reading' as const : 'unsupported' as const,
      route: '/(tabs)/library',
      routeParams: book ? { mode: 'ncert', bookId: book.id } : { mode: 'ncert' },
      target: { ...emptyTarget(), bookId: book?.id ?? null, questId: quest.id },
    };
  }
  if (quest.id === 'ncert-vocabulary') {
    return {
      action: state.ncertBooks.length ? 'ncert-vocabulary' as const : 'unsupported' as const,
      route: '/(tabs)/library',
      routeParams: { mode: 'ncert' },
      target: { ...emptyTarget(), questId: quest.id },
    };
  }
  if (quest.id === 'black-book' || /black|vocab|synonym|antonym/.test(search)) {
    return {
      action: 'vocabulary' as const,
      route: '/(tabs)/library',
      routeParams: { mode: 'vocabulary' },
      target: { ...emptyTarget(), sectionId: state.currentVocabularySectionId, questId: quest.id },
    };
  }
  if (quest.id === 'timed-calculation' || /calc|practice/.test(search)) {
    return { action: 'practice' as const, route: '/practice', target: { ...emptyTarget(), questId: quest.id } };
  }
  // Keep the Home fallback route for unknown quest ids but never treat navigation
  // or a quest checkbox as completion evidence.
  return { action: 'unsupported' as const, route: '/(tabs)/maths', target: { ...emptyTarget(), batchId: activeBatch.id, questId: quest.id } };
};

function defaultMissionGoal(action: MissionAction, target: MissionTarget): MissionGoal | undefined {
  switch (action) {
    case 'reading':
      return { count: 1, unit: 'saved-session' };
    case 'vocabulary':
      return { count: 1, unit: 'vocabulary-page' };
    case 'ncert-vocabulary':
      return { count: 1, unit: 'word' };
    case 'review':
      return { count: Math.max(1, target.cardIds.length), unit: 'review-card' };
    default:
      return undefined;
  }
}

function goalFromQuestCurrentGoal(
  quest: StudyState['quests'][number],
  action: MissionAction,
  target: MissionTarget,
): MissionGoal | undefined {
  const fallback = defaultMissionGoal(action, target);
  const questGoal = quest as typeof quest & { currentGoal?: unknown; goal?: unknown };
  const currentGoal = questGoal.currentGoal ?? questGoal.goal;
  if (typeof currentGoal === 'number') {
    return fallback && Number.isInteger(currentGoal) && currentGoal > 0
      ? { ...fallback, count: currentGoal }
      : fallback;
  }
  if (typeof currentGoal !== 'object' || currentGoal === null || Array.isArray(currentGoal)) return fallback;
  const goalObject = currentGoal as { count?: unknown; targetCount?: unknown; requiredCount?: unknown };
  const count = goalObject.count ?? goalObject.targetCount ?? goalObject.requiredCount;
  if (!fallback || !Number.isInteger(count) || (count as number) <= 0) return fallback;
  return { count: count as number, unit: fallback.unit };
}

const makeMission = (fields: {
  id: string;
  title: string;
  subtitle: string;
  action: MissionAction;
  route: string;
  routeParams?: Record<string, string>;
  source: MissionDescriptor['source'];
  target?: Partial<MissionTarget>;
  xpReward?: number | null;
}): MissionDescriptor => {
  const target = { ...emptyTarget(), ...fields.target };
  const goal = target.goal ?? defaultMissionGoal(fields.action, target);
  return {
    id: fields.id,
    title: fields.title,
    subtitle: fields.subtitle,
    action: fields.action,
    route: fields.route,
    ...(fields.routeParams ? { routeParams: fields.routeParams } : {}),
    source: fields.source,
    target: { ...target, ...(goal ? { goal } : {}) },
    xpReward: fields.xpReward ?? null,
  };
};

const missionFromQuest = (study: StudyView, quest: StudyState['quests'][number]) => {
  const route = routeForQuest(quest, study);
  const target = {
    ...route.target,
    goal: goalFromQuestCurrentGoal(quest, route.action, route.target),
  };
  return makeMission({
    id: `quest:${study.state.date}:${quest.id}`,
    title: quest.title,
    subtitle: quest.subtitle,
    action: route.action,
    route: route.route,
    routeParams: 'routeParams' in route ? route.routeParams : undefined,
    source: 'daily-quest',
    target,
    xpReward: quest.xp,
  });
};

const isMissionAvailableFromCurrentState = (study: StudyView, mission: MissionDescriptor) => {
  const { state } = study;
  const target = mission.target;
  if (target.questId && state.quests.some((quest) => quest.id === target.questId && quest.completed)) return false;

  switch (mission.action) {
    case 'lecture': {
      if (!target.batchId || target.batchId !== state.activeBatchId
        || !target.subjectId || study.isSubjectLocked(target.subjectId)) return false;
      const lecture = state.batches.find((batch) => batch.id === target.batchId)
        ?.subjects.find((subject) => subject.id === target.subjectId)
        ?.topics.find((topic) => topic.id === target.topicId)
        ?.lectures.find((item) => item.id === target.lectureId);
      return !!lecture && !lecture.isArchived && lecture.status !== 'completed';
    }
    case 'reading': {
      const book = state.ncertBooks.find((item) => item.id === target.bookId);
      const required = target.goal?.unit === 'saved-session' ? target.goal.count : 1;
      return !!book && Number.isInteger(required) && required > 0
        && book.totalSessions - book.completedSessions >= required;
    }
    case 'vocabulary': {
      const section = state.vocabularySections.find((item) => item.id === target.sectionId);
      return !!section && state.currentVocabularySectionId === section.id
        && state.currentVocabularyPage > 0 && section.completed < section.pages
        && !state.vocabularyDailyCompleted && state.vocabularyDailyDate === state.date;
    }
    case 'ncert-vocabulary':
      return target.bookId
        ? state.ncertBooks.some((book) => book.id === target.bookId)
        : state.ncertBooks.length > 0;
    case 'practice':
      return true;
    case 'workout':
      return !state.studyTools.workoutSessions.some((session) => session.date === state.date);
    case 'review': {
      if (!target.batchId || target.batchId !== state.activeBatchId) return false;
      const cards = state.studyTools.reviewCards.filter((card) =>
        card.batchId === target.batchId && (!target.subjectId || card.subjectId === target.subjectId)
          && !!card.question.trim() && !!card.answer.trim());
      return target.cardIds.length
        ? target.cardIds.every((id) => cards.some((card) => card.id === id))
        : cards.length > 0;
    }
    case 'boss-test': {
      if (!target.batchId || target.batchId !== state.activeBatchId) return false;
      const weeklyCards = getWeeklyReviewCards(state.studyTools.reviewCards, target.batchId, state.date);
      return target.cardIds.some((id) => weeklyCards.some((card) => card.id === id))
        && !getWeeklyBossTest(state.studyTools.bossTests, target.batchId, state.date);
    }
    default:
      return false;
  }
};

export function getMissionActionForQuest(
  study: StudyView,
  questId: string,
): MissionDescriptor | null {
  const quest = study.state.quests.find((item) => item.id === questId);
  if (!quest || quest.completed) return null;
  const mission = missionFromQuest(study, quest);
  return isMissionAvailableFromCurrentState(study, mission) ? mission : null;
}

const missionFromLecture = (lecture: NextLecture): MissionDescriptor => makeMission({
  id: `lecture:${lecture.batchId}:${lecture.subjectId}:${lecture.topicId}:${lecture.lecture.id}`,
  title: lecture.lecture.title,
  subtitle: `${lecture.subjectName} · ${lecture.topicTitle} · ${lecture.lecture.status === 'in-progress' ? 'resume current lecture' : 'next lecture'}`,
  action: 'lecture',
  route: '/(tabs)/maths',
  routeParams: {
    batchId: lecture.batchId,
    subject: lecture.subjectId,
    topicId: lecture.topicId,
    topicTitle: lecture.topicTitle,
    lectureId: lecture.lecture.id,
  },
  source: 'next-lecture',
  target: {
    batchId: lecture.batchId,
    subjectId: lecture.subjectId,
    topicId: lecture.topicId,
    topicTitle: lecture.topicTitle,
    lectureId: lecture.lecture.id,
  },
  xpReward: lecture.lecture.xpReward,
});

const missionFromRecommendation = (finding: WeaknessFinding, recommendation: WeaknessRecommendation) =>
  makeMission({
    id: `weakness:${finding.id}:${recommendation.id}`,
    title: recommendation.title,
    subtitle: `${finding.subjectName ?? finding.subjectId} · ${finding.topicTitle} · ${finding.accuracy.numerator}/${finding.accuracy.denominator} Boss results`,
    action: recommendation.kind,
    route: recommendation.route,
    routeParams: recommendation.routeParams,
    source: 'weakness-radar',
    target: {
      batchId: recommendation.target.batchId,
      subjectId: recommendation.target.subjectId,
      topicId: recommendation.target.topicId,
      topicTitle: recommendation.target.topicTitle,
      lectureId: recommendation.target.lectureId,
      cardIds: recommendation.target.cardIds,
    },
  });

export function getNextMission(study: StudyView): MissionDescriptor | null {
  const pendingQuest = study.state.quests.find((quest) => !quest.completed);
  if (pendingQuest) return missionFromQuest(study, pendingQuest);

  const nextLecture = study.nextLecture;
  if (nextLecture && nextLecture.batchId === study.state.activeBatchId) return missionFromLecture(nextLecture);

  const activeBatchId = study.state.activeBatchId;
  const weeklyCards = getWeeklyReviewCards(
    study.state.studyTools.reviewCards,
    activeBatchId,
    study.state.date,
  );
  if (weeklyCards.length && !getWeeklyBossTest(study.state.studyTools.bossTests, activeBatchId, study.state.date)) {
    return makeMission({
      id: `boss:${activeBatchId}:${study.state.date}`,
      title: 'Weekly Boss Test',
      subtitle: `${weeklyCards.length} saved review cards are available for the active batch.`,
      action: 'boss-test',
      route: '/rituals?mode=boss',
      routeParams: { batchId: activeBatchId },
      source: 'weekly-boss',
      target: { batchId: activeBatchId, cardIds: weeklyCards.map((card) => card.id) },
    });
  }

  const radar = deriveWeaknessRadar(study.state);
  const activeFindings = radar.findings.filter((finding) => finding.isActiveBatch);
  for (const finding of activeFindings) {
    const recommended = finding.recommendations.find((item) => item.kind === 'review')
      ?? finding.recommendations.find((item) => item.kind === 'lecture')
      ?? finding.recommendations.find((item) => item.kind === 'practice');
    if (recommended) return missionFromRecommendation(finding, recommended);
  }
  return null;
}

const planningMinutesByAction: Partial<Record<MissionAction, number>> = {
  lecture: 45,
  reading: 30,
  vocabulary: 10,
  'ncert-vocabulary': 10,
  practice: 15,
  workout: 5,
  review: 15,
  'boss-test': 15,
};

const estimateRecordedDuration = (study: StudyState, action: MissionAction) => {
  const durations = action === 'workout'
    ? study.studyTools.workoutSessions.map((session) => session.duration)
    : action === 'practice'
      ? study.calculationHistory
        .filter((session) => session.questions > 0 && session.correct >= 0 && session.correct <= session.questions)
        .map((session) => session.duration)
      : [];
  const valid = durations.filter((duration) =>
    Number.isFinite(duration) && duration > 0 && duration <= 86400);
  if (!valid.length) return null;
  const averageSeconds = valid.reduce((sum, duration) => sum + duration, 0) / valid.length;
  return {
    minutes: Math.max(1, Math.ceil(averageSeconds / 60)),
    averageSeconds,
    sampleCount: valid.length,
  };
};

const estimatePendingQuestTime = (study: StudyView): DailyBriefing['estimatedStudyTime'] => {
  const pending = study.state.quests.filter((quest) => !quest.completed);
  const disclaimer = 'Recorded duration averages use valid saved sessions when available. Other values are clearly labeled planning budgets, not recorded performance. Only unfinished daily quests are included; lecture and weakness suggestions are excluded.';
  if (!pending.length) {
    return {
      minutes: 0,
      status: 'no-pending-quests',
      estimateSource: 'no-pending-quests',
      tasks: [],
      reason: null,
      disclaimer,
    };
  }

  const tasks: DailyBriefing['estimatedStudyTime']['tasks'] = [];
  for (const quest of pending) {
    const action = routeForQuest(quest, study).action;
    const recorded = estimateRecordedDuration(study.state, action);
    if (recorded) {
      tasks.push({
        questId: quest.id,
        title: quest.title,
        action,
        minutes: recorded.minutes,
        estimateSource: 'recorded-duration',
        averageRecordedSeconds: recorded.averageSeconds,
        recordedSamples: recorded.sampleCount,
      });
      continue;
    }
    const minutes = planningMinutesByAction[action];
    if (minutes === undefined) continue;
    tasks.push({
      questId: quest.id,
      title: quest.title,
      action,
      minutes,
      estimateSource: 'planning-budget',
      averageRecordedSeconds: null,
      recordedSamples: 0,
    });
  }

  if (tasks.length !== pending.length) {
    return {
      minutes: null,
      status: 'partial',
      estimateSource: 'partial',
      tasks,
      reason: 'At least one unfinished quest has no supported real activity kind to estimate.',
      disclaimer,
    };
  }
  const sources = new Set(tasks.map((task) => task.estimateSource));
  return {
    minutes: tasks.reduce((total, task) => total + task.minutes, 0),
    status: 'available',
    estimateSource: sources.size > 1 ? 'mixed' : tasks[0].estimateSource,
    tasks,
    reason: null,
    disclaimer,
  };
};

export function buildDailyBriefing(study: StudyView): DailyBriefing {
  const nextMission = getNextMission(study);
  const pendingQuestIds = study.state.quests.filter((quest) => !quest.completed).map((quest) => quest.id);
  const priorityOrder = [...pendingQuestIds];
  if (study.nextLecture && study.nextLecture.batchId === study.state.activeBatchId) {
    priorityOrder.push(`lecture:${study.nextLecture.batchId}:${study.nextLecture.subjectId}:${study.nextLecture.topicId}:${study.nextLecture.lecture.id}`);
  }
  return {
    date: study.state.date,
    quests: study.state.quests.map(({ id, title, subtitle, category, xp, completed }) =>
      ({ id, title, subtitle, category, xp, completed })),
    pendingQuestIds,
    priorityOrder,
    estimatedStudyTime: estimatePendingQuestTime(study),
    streak: study.state.streak,
    totalXp: study.state.totalXp,
    todayXp: study.todayXp,
    level: study.level,
    rank: study.rank,
    phaseTwoUnlocked: study.phaseTwoUnlocked,
    nextMission,
    importantPendingMission: nextMission,
    weaknessRadar: deriveWeaknessRadar(study.state),
  };
}