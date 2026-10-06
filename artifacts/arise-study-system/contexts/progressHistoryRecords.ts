/** Shared append and observation/record helpers for progress-history transitions. */
import type {
  ProgressHistory,
  ProgressHistoryTicket,
  ProgressPersonalRecords,
  ProgressSystemEvent,
  ProgressXpEvent,
  ProgressHistoryEventType,
  ProgressDailyObservation,
} from '@/contexts/progressHistorySchema';
export { levelFromTotalXp as levelFromTotal } from '@/contexts/rankSystem';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());

const eventId = (key: string) => `progress-event:${encodeURIComponent(key)}`;
const xpId = (key: string) => `progress-xp:${encodeURIComponent(key)}`;

export const observationFor = (history: ProgressHistory, date: string): ProgressDailyObservation =>
  history.dailyObservations[date] ?? {
    active: false,
    netXp: 0,
    questsCompleted: 0,
    lecturesCompleted: 0,
    ncertSessions: 0,
    ncertBooksCompleted: 0,
    vocabularyActivities: 0,
    calculationSessions: 0,
    bossSessions: 0,
    studyActivities: 0,
  };

export const dateFromTimestamp = (timestamp: string) => timestamp.slice(0, 10);
export const isProgressDateKey = isDateKey;

export const addProgressDateDays = (date: string, amount: number) => {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + amount);
  const year = parsed.getFullYear();
  return `${String(year).padStart(4, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

export const lectureRows = (state: any) => {
  const rows: {
    batchId: string;
    subjectId: string;
    subjectName: string;
    topicId: string;
    topicTitle: string;
    lecture: any;
  }[] = [];
  for (const batch of Array.isArray(state?.batches) ? state.batches : []) {
    for (const subject of Array.isArray(batch?.subjects) ? batch.subjects : []) {
      for (const topic of Array.isArray(subject?.topics) ? subject.topics : []) {
        for (const lecture of Array.isArray(topic?.lectures) ? topic.lectures : []) {
          rows.push({
            batchId: batch.id,
            subjectId: subject.id,
            subjectName: String(subject.name ?? ''),
            topicId: topic.id,
            topicTitle: topic.title,
            lecture,
          });
        }
      }
    }
  }
  return rows;
};

export const phaseComplete = (state: any) => {
  const batches = Array.isArray(state?.batches) ? state.batches : [];
  const batch = batches.find((item: any) => item.id === state.activeBatchId) ?? batches[0];
  const maths = batch?.subjects?.find((subject: any) => subject.id === 'maths'
    || String(subject.name ?? '').toLowerCase() === 'maths');
  const lectures = (maths?.topics ?? []).flatMap((topic: any) => topic.lectures ?? [])
    .filter((lecture: any) => !lecture.isArchived);
  return lectures.length > 0 && lectures.every((lecture: any) => lecture.status === 'completed')
    && Number(state.ncertTotal) > 0 && Number(state.ncertCompleted) >= Number(state.ncertTotal);
};

export const alreadyHasEvent = (history: ProgressHistory, key: string) =>
  history.systemEvents.some((event) => event.idempotencyKey === key);
const alreadyHasXp = (history: ProgressHistory, key: string) =>
  history.xpEvents.some((event) => event.idempotencyKey === key);

const observationDelta = (
  history: ProgressHistory,
  activityDate: string,
  timestamp: string,
  updates: Partial<ProgressDailyObservation>,
  isActivity = true,
) => {
  const previous = observationFor(history, activityDate);
  history.dailyObservations[activityDate] = {
    ...previous,
    ...updates,
    active: previous.active || isActivity,
    studyActivities: previous.studyActivities + (isActivity ? 1 : 0),
  };
  if (isActivity && history.trackingStartedAt === null) history.trackingStartedAt = timestamp;
};

export const updateProgressRecords = (history: ProgressHistory) => {
  const records = history.personalRecords;
  const observations = Object.entries(history.dailyObservations)
    .sort(([a], [b]) => a.localeCompare(b));
  const activeDates = observations.filter(([, item]) => item.active).map(([date]) => date);
  let longest = 0;
  let run = 0;
  let previousDate: string | null = null;
  for (const date of activeDates) {
    run = previousDate && addProgressDateDays(previousDate, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previousDate = date;
  }
  const xpNetByDate = new Map<string, number>();
  const positiveAwardDates = new Set<string>();
  for (const event of history.xpEvents) {
    xpNetByDate.set(event.activityDate, (xpNetByDate.get(event.activityDate) ?? 0) + event.amount);
    if (event.amount > 0) positiveAwardDates.add(event.activityDate);
  }
  const lectureTotal = observations.reduce((sum, [, item]) => sum + item.lecturesCompleted, 0);
  const ncertSessions = observations.reduce((sum, [, item]) => sum + item.ncertSessions, 0);
  records.trackedActiveDays = activeDates.length;
  records.trackedLectureCompletions = lectureTotal;
  records.longestActiveDayStreak = activeDates.length ? longest : null;
  records.mostLecturesCompleted = lectureTotal > 0 ? lectureTotal : null;
  records.mostNCERTSessions = ncertSessions > 0 ? ncertSessions : null;
  const maxDailyXp = [...xpNetByDate.entries()]
    .filter(([date]) => positiveAwardDates.has(date))
    .reduce((max, [, value]) => Math.max(max, Math.max(0, value)), Number.NEGATIVE_INFINITY);
  records.highestDailyNetXp = Number.isFinite(maxDailyXp) ? maxDailyXp : null;
  records.mostNCERTPages = null;
};

export const appendProgressSystemEvent = (
  history: ProgressHistory,
  ticket: ProgressHistoryTicket,
  type: ProgressHistoryEventType,
  key: string,
  metadata: Record<string, unknown> = {},
  activityDate = dateFromTimestamp(ticket.timestamp),
  isActivity = true,
) => {
  if (alreadyHasEvent(history, key)) return false;
  const event: ProgressSystemEvent = {
    id: eventId(key),
    type,
    timestamp: ticket.timestamp,
    idempotencyKey: key,
    metadata: { ...metadata, activityDate },
  };
  history.systemEvents.push(event);
  if (isActivity) observationDelta(history, activityDate, ticket.timestamp, {}, true);
  return true;
};

export const appendProgressXpEvent = (
  history: ProgressHistory,
  ticket: ProgressHistoryTicket,
  amount: number,
  source: string,
  relatedActivityId: string | null,
  key: string,
  activityDate: string,
  metadata: Record<string, unknown>,
) => {
  if (!Number.isFinite(amount) || amount === 0 || alreadyHasXp(history, key)) return false;
  const event: ProgressXpEvent = {
    id: xpId(key),
    amount,
    source,
    relatedActivityId,
    timestamp: ticket.timestamp,
    idempotencyKey: key,
    activityDate,
    metadata,
  };
  history.xpEvents.push(event);
  const daily = observationFor(history, activityDate);
  history.dailyObservations[activityDate] = {
    ...daily,
    active: daily.active || amount > 0,
    netXp: daily.netXp + amount,
  };
  if (amount > 0 && history.trackingStartedAt === null) history.trackingStartedAt = ticket.timestamp;
  appendProgressSystemEvent(history, ticket, 'xp.awarded', `xp-log:${key}`, {
    amount, source, relatedActivityId, xpEventId: xpId(key), ...metadata,
  }, activityDate, false);
  return true;
};

export const questAwardCount = (history: ProgressHistory, date: string, questId: string) =>
  history.xpEvents.filter((event) => event.source === 'quest' && event.activityDate === date
    && event.relatedActivityId === questId && event.amount > 0).length;

export const updateBestCalculationRecord = (
  previous: ProgressPersonalRecords['bestCalculationResult'],
  session: any,
  timestamp: string,
) => {
  const accuracy = session.accuracy;
  if (!isFiniteNumber(accuracy) || !isFiniteNumber(session.questions) || !isFiniteNumber(session.correct)) return previous;
  if (previous && accuracy <= previous.accuracy) return previous;
  return {
    score: accuracy,
    label: 'canonical calculation accuracy',
    accuracy,
    questions: session.questions,
    correct: session.correct,
    activityId: String(session.id),
    achievedAt: timestamp,
  };
};

export const updateBestBossRecord = (
  previous: ProgressPersonalRecords['bestBossResult'],
  record: any,
  timestamp: string,
) => {
  const results = Array.isArray(record.results) ? record.results : [];
  if (!results.length || results.some((result: any) => typeof result.correct !== 'boolean')) return previous;
  const correct = results.filter((result: any) => result.correct).length;
  const score = (correct / results.length) * 100;
  if (previous && score <= previous.score) return previous;
  return {
    score,
    label: 'canonical Boss test score',
    correct,
    total: results.length,
    activityId: String(record.id),
    achievedAt: timestamp,
  };
};