/** Pure canonical StudyState-diff capture for durable progress-history events. */
import { normalizeProgressHistory } from '@/contexts/progressHistorySchema';
import type {
  ProgressHistory,
  ProgressHistoryEventType,
  ProgressHistoryTicket,
  ProgressPersonalRecords,
} from '@/contexts/progressHistorySchema';
import {
  addProgressDateDays,
  alreadyHasEvent,
  appendProgressSystemEvent,
  appendProgressXpEvent,
  dateFromTimestamp,
  isProgressDateKey,
  lectureRows,
  levelFromTotal,
  observationFor,
  phaseComplete,
  questAwardCount,
  updateBestBossRecord,
  updateBestCalculationRecord,
  updateProgressRecords,
} from '@/contexts/progressHistoryRecords';
import { rankDefinitionForProgress, rankEvidenceFromHistory } from '@/contexts/rankSystem';
import type { RpgEvent } from '@/contexts/rpgTypes';

/**
 * Append evidence from one canonical before→after transition. It is pure and
 * replay-safe: the ticket is supplied by the caller before React invokes an
 * updater, and stable idempotency keys make repeated evaluation harmless.
 */
export function captureProgressHistoryTransition(
  previousState: any,
  nextState: any,
  previousValue: unknown,
  ticket: ProgressHistoryTicket,
  options: { deferRpgAndRank?: boolean } = {},
): ProgressHistory {
  const history = normalizeProgressHistory(previousValue);
  if (previousState === nextState) return history;
  const previousDate = isProgressDateKey(String(previousState?.date))
    ? previousState.date
    : dateFromTimestamp(ticket.timestamp);
  const activityDate = isProgressDateKey(String(nextState?.date))
    ? nextState.date
    : dateFromTimestamp(ticket.timestamp);
  const previousQuests = Array.isArray(previousState?.quests) ? previousState.quests : [];
  const nextQuests = Array.isArray(nextState?.quests) ? nextState.quests : [];

  for (const quest of nextQuests) {
    if (!quest?.isRecovery || previousQuests.some((item: any) => item?.id === quest.id)) continue;
    appendProgressSystemEvent(history, ticket, 'quest.started',
      `recovery-quest:${activityDate}:${quest.id}:started`, {
        questId: quest.id, questTitle: quest.title, questDate: activityDate, source: 'recovery-acceptance',
      }, activityDate);
    appendProgressSystemEvent(history, ticket, 'recovery.activity',
      `recovery:${activityDate}:${quest.id}:accepted`, {
        questId: quest.id, action: 'accepted',
      }, activityDate);
  }

  // Only quests with an observed start can be marked missed. Use the actual
  // rollover-action timestamp, never a fabricated end-of-day timestamp.
  if (previousDate !== activityDate && history.trackingStartedAt) {
    const startedQuestIds = new Set(history.systemEvents
      .filter((event) => event.type === 'quest.started' && event.metadata.questDate === previousDate)
      .map((event) => String(event.metadata.questId ?? '')));
    for (const quest of previousQuests) {
      if (!quest || quest.completed || quest.isRecovery || !startedQuestIds.has(String(quest.id))) continue;
      const key = `quest:${previousDate}:${quest.id}:missed`;
      appendProgressSystemEvent(history, ticket, 'quest.missed', key, {
        questId: quest.id, questTitle: quest.title, questDate: previousDate,
      }, activityDate, false);
    }
  }

  // A newly completed or unchecked canonical quest owns the quest component of
  // a combined lecture+quest award and preserves the existing reversal behavior.
  // On a date boundary, the next day's default quest state is a fresh,
  // unchecked baseline: old-day completion must neither reverse XP nor mark
  // the new day active. A completion already present in that new-day state is
  // instead its own positive award.
  for (const quest of nextQuests) {
    const oldQuest = previousQuests.find((item: any) => item?.id === quest?.id);
    if (!oldQuest) continue;
    const completedOnThisDate = quest.completed
      && (previousDate !== activityDate || !oldQuest.completed);
    const uncheckedOnThisDate = previousDate === activityDate && oldQuest.completed && !quest.completed;
    if (!completedOnThisDate && !uncheckedOnThisDate) continue;
    const recovery = !!quest.isRecovery || String(quest.id).startsWith('recovery-');
    if (completedOnThisDate) {
      const completionKey = `quest:${activityDate}:${quest.id}:completed`;
      const recordedCompletion = appendProgressSystemEvent(history, ticket, 'quest.completed', completionKey, {
        questId: quest.id, questTitle: quest.title, questDate: activityDate, xp: quest.xp,
        ...(recovery ? { recovery: true } : {}),
      }, activityDate);
      const awardOrdinal = questAwardCount(history, activityDate, String(quest.id)) + 1;
      appendProgressXpEvent(history, ticket, Math.abs(Number(quest.xp) || 0), 'quest', String(quest.id),
        `quest:${activityDate}:${quest.id}:award:${awardOrdinal}`, activityDate, {
          questId: quest.id, questTitle: quest.title, reversal: false,
        });
      if (recordedCompletion) {
        const daily = observationFor(history, activityDate);
        history.dailyObservations[activityDate] = {
          ...daily, questsCompleted: daily.questsCompleted + 1,
        };
      }
      if (recovery) appendProgressSystemEvent(history, ticket, 'recovery.activity',
        `recovery:${activityDate}:${quest.id}:completed`, {
          questId: quest.id, action: 'completed',
        }, activityDate);
    } else {
      const awardOrdinal = questAwardCount(history, activityDate, String(quest.id));
      appendProgressXpEvent(history, ticket, -Math.abs(Number(quest.xp) || 0), 'quest-reversal', String(quest.id),
        `quest:${activityDate}:${quest.id}:reversal:${awardOrdinal}`, activityDate, {
          questId: quest.id, questTitle: quest.title, reversal: true,
        });
      if (recovery) appendProgressSystemEvent(history, ticket, 'recovery.activity',
        `recovery:${activityDate}:${quest.id}:unchecked:${awardOrdinal}`, {
          questId: quest.id, action: 'unchecked',
        }, activityDate, false);
    }
  }

  const lectureIdentity = (row: ReturnType<typeof lectureRows>[number]) =>
    JSON.stringify([row.batchId, row.subjectId, row.topicId, String(row.lecture.id)]);
  const oldLectures = new Map(lectureRows(previousState).map((row) => [lectureIdentity(row), row]));
  for (const row of lectureRows(nextState)) {
    const lecture = row.lecture;
    const identity = lectureIdentity(row);
    const identityKey = encodeURIComponent(identity);
    const before = oldLectures.get(identity)?.lecture;
    if (!before) continue;
    const lectureId = String(lecture.id);
    if (Number(lecture.sessionCount) > Number(before.sessionCount)) {
      for (let count = Number(before.sessionCount) + 1; count <= Number(lecture.sessionCount); count += 1) {
        appendProgressSystemEvent(history, ticket, 'lecture.started', `lecture:${identityKey}:start:${count}`, {
          lectureId, lectureTitle: lecture.title, batchId: row.batchId, subjectId: row.subjectId,
          topicId: row.topicId, sessionCount: count, lectureIdentity: identity,
        }, activityDate);
        const questId = row.subjectId === 'maths' || row.subjectName.toLowerCase() === 'maths'
          ? 'maths-lecture'
          : lectureId;
        appendProgressSystemEvent(history, ticket, 'quest.started',
          `lecture-quest:${activityDate}:${identityKey}:start:${count}`, {
            questId, questTitle: lecture.title, questDate: activityDate, source: 'lecture-start',
            lectureId, batchId: row.batchId, subjectId: row.subjectId, topicId: row.topicId,
            lectureIdentity: identity,
          }, activityDate);
      }
    }
    if (before.status !== 'completed' && lecture.status === 'completed') {
      const key = `lecture:${identityKey}:completed`;
      appendProgressSystemEvent(history, ticket, 'lecture.completed', key, {
        lectureId, lectureTitle: lecture.title, batchId: row.batchId, subjectId: row.subjectId,
        topicId: row.topicId, topicTitle: row.topicTitle, lectureIdentity: identity,
      }, activityDate);
      const daily = observationFor(history, activityDate);
      history.dailyObservations[activityDate] = { ...daily, lecturesCompleted: daily.lecturesCompleted + 1 };
      if (lecture.xpAwarded && Number(lecture.xpReward) > 0 && !before.xpAwarded) {
        appendProgressXpEvent(history, ticket, Number(lecture.xpReward), 'lecture', lectureId,
          `lecture:${identityKey}:xp-award`, activityDate, {
            lectureId, lectureTitle: lecture.title, batchId: row.batchId, subjectId: row.subjectId,
            topicId: row.topicId, lectureIdentity: identity,
          });
      }
      appendProgressSystemEvent(history, ticket, 'study.activity',
        `study:lecture:${identityKey}:completed`, {
          activity: 'lecture-completed', lectureId, title: lecture.title,
          batchId: row.batchId, subjectId: row.subjectId, topicId: row.topicId, lectureIdentity: identity,
      }, activityDate);
    }
  }

  const oldBooks = new Map((Array.isArray(previousState?.ncertBooks) ? previousState.ncertBooks : [])
    .map((book: any) => [String(book.id), book]));
  for (const book of Array.isArray(nextState?.ncertBooks) ? nextState.ncertBooks : []) {
    const before = oldBooks.get(String(book.id)) as any;
    if (!before) continue;
    const beforeCount = Number(before.completedSessions) || 0;
    const afterCount = Number(book.completedSessions) || 0;
    for (let count = beforeCount + 1; count <= afterCount; count += 1) {
      appendProgressSystemEvent(history, ticket, 'ncert.session', `ncert:${book.id}:session:${count}`, {
        bookId: book.id, bookTitle: book.title, classId: book.classId, sessionNumber: count,
      }, activityDate);
      const daily = observationFor(history, activityDate);
      history.dailyObservations[activityDate] = { ...daily, ncertSessions: daily.ncertSessions + 1 };
      if (count === Number(book.totalSessions) && beforeCount < Number(book.totalSessions)) {
        appendProgressSystemEvent(history, ticket, 'ncert.book.completed', `ncert:${book.id}:completed:${count}`, {
          bookId: book.id, bookTitle: book.title, sessionCount: count,
        }, activityDate);
        const afterDaily = observationFor(history, activityDate);
        history.dailyObservations[activityDate] = {
          ...afterDaily, ncertBooksCompleted: afterDaily.ncertBooksCompleted + 1,
        };
      }
    }
  }
  const nextBooks = Array.isArray(nextState?.ncertBooks) ? nextState.ncertBooks : [];
  for (const book of nextBooks) {
    const before = oldBooks.get(String(book.id)) as any;
    if (!before) continue;
    const oldWords = new Set((Array.isArray(before.vocabulary) ? before.vocabulary : [])
      .map((word: unknown) => String(word).trim().toLocaleLowerCase()));
    const words = (Array.isArray(book.vocabulary) ? book.vocabulary : [])
      .filter((word: unknown) => !oldWords.has(String(word).trim().toLocaleLowerCase()));
    for (const word of words) {
      const normalizedWord = String(word).trim().toLocaleLowerCase();
      const key = `vocabulary:ncert:${book.id}:${normalizedWord}`;
      appendProgressSystemEvent(history, ticket, 'vocabulary.activity', key, {
        source: 'ncert', bookId: book.id, word: String(word),
      }, activityDate);
      const daily = observationFor(history, activityDate);
      history.dailyObservations[activityDate] = {
        ...daily, vocabularyActivities: daily.vocabularyActivities + 1,
      };
    }
  }
  const oldVocabulary = new Map((Array.isArray(previousState?.vocabularySections) ? previousState.vocabularySections : [])
    .map((section: any) => [String(section.id), section]));
  for (const section of Array.isArray(nextState?.vocabularySections) ? nextState.vocabularySections : []) {
    const before = oldVocabulary.get(String(section.id)) as any;
    if (!before || Number(section.completed) <= Number(before.completed)) continue;
    for (let page = Number(before.completed) + 1; page <= Number(section.completed); page += 1) {
      appendProgressSystemEvent(history, ticket, 'vocabulary.activity', `vocabulary:${section.id}:page:${page}`, {
        source: 'vocabulary-page', sectionId: section.id, sectionTitle: section.title, page,
      }, activityDate);
      const daily = observationFor(history, activityDate);
      history.dailyObservations[activityDate] = {
        ...daily, vocabularyActivities: daily.vocabularyActivities + 1,
      };
    }
  }

  const oldCalculations = new Set((Array.isArray(previousState?.calculationHistory) ? previousState.calculationHistory : [])
    .map((session: any) => String(session.id)));
  for (const session of Array.isArray(nextState?.calculationHistory) ? nextState.calculationHistory : []) {
    if (oldCalculations.has(String(session.id))) continue;
    appendProgressSystemEvent(history, ticket, 'calculation.session', `calculation:${session.id}`, {
      activityId: session.id, questions: session.questions, correct: session.correct,
      accuracy: session.accuracy, duration: session.duration,
    }, activityDate);
    const daily = observationFor(history, activityDate);
    history.dailyObservations[activityDate] = { ...daily, calculationSessions: daily.calculationSessions + 1 };
    history.personalRecords.bestCalculationResult = updateBestCalculationRecord(
      history.personalRecords.bestCalculationResult,
      session,
      ticket.timestamp,
    );
    appendProgressSystemEvent(history, ticket, 'study.activity', `study:calculation:${session.id}`, {
      activity: 'calculation-session', activityId: session.id,
    }, activityDate);
  }

  const oldBosses = new Set((previousState?.studyTools?.bossTests ?? []).map((test: any) => String(test.id)));
  for (const test of nextState?.studyTools?.bossTests ?? []) {
    if (oldBosses.has(String(test.id))) continue;
    const results = Array.isArray(test.results) ? test.results : [];
    const correct = results.filter((result: any) => result.correct === true).length;
    const total = results.length;
    appendProgressSystemEvent(history, ticket, 'boss.activity', `boss:${test.id}`, {
      activityId: test.id, batchId: test.batchId, correct, total,
      score: total ? (correct / total) * 100 : null,
      ...(test.gateAttemptId ? { gateAttemptId: test.gateAttemptId } : {}),
    }, activityDate);
    const daily = observationFor(history, activityDate);
    history.dailyObservations[activityDate] = { ...daily, bossSessions: daily.bossSessions + 1 };
    history.personalRecords.bestBossResult = updateBestBossRecord(
      history.personalRecords.bestBossResult,
      test,
      ticket.timestamp,
    );
    appendProgressSystemEvent(history, ticket, 'study.activity', `study:boss:${test.id}`, {
      activity: 'boss-test', activityId: test.id,
    }, activityDate);
  }

  const oldWorkoutIds = new Set((previousState?.studyTools?.workoutSessions ?? []).map((item: any) => String(item.id)));
  for (const workout of nextState?.studyTools?.workoutSessions ?? []) {
    if (oldWorkoutIds.has(String(workout.id))) continue;
    appendProgressSystemEvent(history, ticket, 'study.activity', `study:workout:${workout.id}`, {
      activity: 'workout', activityId: workout.id, duration: workout.duration,
    }, activityDate);
  }
  const oldRevisions = new Set((previousState?.studyTools?.revisionHistory ?? []).map((item: any) => String(item.id)));
  for (const revision of nextState?.studyTools?.revisionHistory ?? []) {
    if (oldRevisions.has(String(revision.id))) continue;
    const recovery = nextQuests.find((quest: any) => quest.id === `recovery-${activityDate}`);
    appendProgressSystemEvent(history, ticket, recovery ? 'recovery.activity' : 'study.activity',
      `revision:${revision.id}`, {
        activity: 'revision', activityId: revision.id, batchId: revision.batchId,
        cardIds: revision.cardIds, ...(recovery ? { questId: recovery.id } : {}),
      }, activityDate);
  }

  const oldExperiments = new Map((previousState?.studyTools?.experiments ?? []).map((item: any) => [item.id, item]));
  for (const experiment of nextState?.studyTools?.experiments ?? []) {
    const before = oldExperiments.get(experiment.id) as any;
    if (!before) {
      appendProgressSystemEvent(history, ticket, 'recovery.activity', `experiment:${experiment.id}:started`, {
        activity: 'experiment-started', experimentId: experiment.id, target: experiment.target,
      }, activityDate);
      continue;
    }
    for (const date of experiment.checkIns ?? []) {
      if (!(before.checkIns ?? []).includes(date)) appendProgressSystemEvent(
        history,
        ticket,
        'recovery.activity',
        `experiment:${experiment.id}:check-in:${date}`,
        { activity: 'experiment-check-in', experimentId: experiment.id, checkInDate: date },
        activityDate,
      );
    }
  }

  const oldAchievements = new Set(previousState?.achievementHistory?.earnedRelicIds ?? []);
  const nextAchievements = nextState?.achievementHistory?.earnedRelicIds ?? [];
  for (const achievementId of nextAchievements) {
    if (oldAchievements.has(achievementId)) continue;
    appendProgressSystemEvent(history, ticket, 'achievement.unlocked', `achievement:${achievementId}`, {
      achievementId,
    }, activityDate);
  }

  if (!options.deferRpgAndRank) appendRpgAndRankEvents(history, previousState, nextState, ticket, activityDate);

  if (!phaseComplete(previousState) && phaseComplete(nextState)) {
    appendProgressSystemEvent(history, ticket, 'phase.unlocked', `phase-two:${activityDate}`, {
      phase: 2, reason: 'canonical phase-one completion',
    }, activityDate);
  }

  updateProgressRecords(history);
  return history;
}

function appendRpgAndRankEvents(
  history: ProgressHistory,
  previousState: any,
  nextState: any,
  ticket: ProgressHistoryTicket,
  activityDate: string,
) {
  // RPG receipts are explicit sources, not an inferred residual XP delta.
  // Entry/equip/inspection effects do not count as study activity by themselves.
  const previousRpgEventIds = new Set((previousState?.rpg?.events ?? []).map((event: RpgEvent) => event.id));
  for (const event of (nextState?.rpg?.events ?? []) as RpgEvent[]) {
    if (previousRpgEventIds.has(event.id)) continue;
    const observedTicket = { ticketId: ticket.ticketId, timestamp: event.timestamp };
    const metadata = {
      ...event.metadata,
      rpgEventId: event.id,
      ...(event.rewards ? { rewards: event.rewards } : {}),
    };
    appendProgressSystemEvent(history, observedTicket, event.type,
      `rpg-history:${event.idempotencyKey}`, metadata, activityDate, false);
    if (event.xpDelta && event.xpSource) {
      appendProgressXpEvent(history, observedTicket, event.xpDelta, event.xpSource, event.id,
        `rpg-xp:${event.idempotencyKey}`, activityDate, metadata);
    }
  }

  const oldLevel = levelFromTotal(previousState?.totalXp);
  const newLevel = levelFromTotal(nextState?.totalXp);
  if (newLevel > oldLevel) appendProgressSystemEvent(history, ticket, 'level.up',
    `level:${newLevel}:${ticket.ticketId}`, { previousLevel: oldLevel, level: newLevel }, activityDate);
  const oldRank = rankDefinitionForProgress(previousState?.totalXp, previousState?.progressHistory);
  const newRank = rankDefinitionForProgress(nextState?.totalXp, history);
  if (oldRank.id !== newRank.id) appendProgressSystemEvent(history, ticket, 'rank.changed',
    `rank:${oldRank.id}:${newRank.id}:${activityDate}:${ticket.ticketId}`, {
      previousRank: oldRank.displayName,
      rank: newRank.displayName,
      previousRankId: oldRank.id,
      rankId: newRank.id,
      previousLevel: oldLevel,
      level: newLevel,
      previousTotalXp: previousState.totalXp,
      totalXp: nextState.totalXp,
      progressionValue: nextState.totalXp,
      progressionUnit: 'rank-evidence',
      previousEvidence: rankEvidenceFromHistory(previousState?.progressHistory),
      evidence: rankEvidenceFromHistory(history),
    }, activityDate, false);

}

/** Finalize RPG receipts/ranks once, without re-attributing canonical quest XP. */
export function finalizeRpgProgressHistory(
  previousState: any,
  nextState: any,
  previousValue: unknown,
  ticket: ProgressHistoryTicket,
): ProgressHistory {
  const history = normalizeProgressHistory(previousValue);
  const activityDate = isProgressDateKey(String(nextState?.date))
    ? nextState.date : dateFromTimestamp(ticket.timestamp);
  appendRpgAndRankEvents(history, previousState, nextState, ticket, activityDate);
  updateProgressRecords(history);
  return history;
}

/** Append an explicit focus/mission/system event within a StudyState update. */
export function appendProgressHistoryEvent(
  previousValue: unknown,
  ticket: ProgressHistoryTicket,
  type: ProgressHistoryEventType,
  idempotencyKey: string,
  metadata: Record<string, unknown> = {},
  activityDate = dateFromTimestamp(ticket.timestamp),
): ProgressHistory {
  const history = normalizeProgressHistory(previousValue);
  if (alreadyHasEvent(history, idempotencyKey)) return history;
  appendProgressSystemEvent(history, ticket, type, idempotencyKey, metadata, activityDate);
  updateProgressRecords(history);
  return history;
}

/** Record only provable started-and-unfinished quests across a real rollover. */
export function captureMissedQuestRollover(
  previousState: any,
  nextDate: string,
  previousValue: unknown,
  ticket: ProgressHistoryTicket,
): ProgressHistory {
  const history = normalizeProgressHistory(previousValue);
  const previousDate = String(previousState?.date ?? '');
  if (!history.trackingStartedAt || !isProgressDateKey(previousDate) || !isProgressDateKey(nextDate)
    || previousDate === nextDate) return history;
  const startedQuestIds = new Set(history.systemEvents
    .filter((event) => event.type === 'quest.started' && event.metadata.questDate === previousDate)
    .map((event) => String(event.metadata.questId ?? '')));
  for (const quest of Array.isArray(previousState?.quests) ? previousState.quests : []) {
    if (!quest || quest.completed || quest.isRecovery || !startedQuestIds.has(String(quest.id))) continue;
    appendProgressSystemEvent(history, ticket, 'quest.missed',
      `quest:${previousDate}:${quest.id}:missed`, {
        questId: quest.id, questTitle: quest.title, questDate: previousDate,
      }, nextDate, false);
  }
  updateProgressRecords(history);
  return history;
}

/** Read-only selector for explicit observed records. */
export const selectProgressPersonalRecords = (history: unknown): ProgressPersonalRecords =>
  normalizeProgressHistory(history).personalRecords;