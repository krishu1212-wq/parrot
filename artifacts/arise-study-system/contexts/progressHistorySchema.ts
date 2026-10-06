/**
 * Durable progress-history contracts, empty defaults, timestamps, and tolerant
 * normalization. This module has no StudyContext or persistence dependencies.
 */
export type ProgressHistoryEventType =
  | 'quest.started'
  | 'quest.completed'
  | 'quest.missed'
  | 'xp.awarded'
  | 'level.up'
  | 'rank.changed'
  | 'achievement.unlocked'
  | 'study.activity'
  | 'lecture.started'
  | 'lecture.completed'
  | 'ncert.session'
  | 'ncert.book.completed'
  | 'vocabulary.activity'
  | 'calculation.session'
  | 'boss.activity'
  | 'recovery.activity'
  | 'mission.started'
  | 'mission.completed'
  | 'phase.unlocked'
  | 'gate.unlocked' | 'gate.entered' | 'gate.progress' | 'gate.cleared' | 'gate.failed'
  | 'item.acquired' | 'item.used' | 'chest.opened'
  | 'equipment.equipped' | 'equipment.unequipped' | 'equipment.bonus' | 'equipment.bonus-reversed'
  | 'system.notification';

export type ProgressHistoryTicket = {
  timestamp: string;
  ticketId: string;
};

export type ProgressSystemEvent = {
  id: string;
  type: ProgressHistoryEventType;
  timestamp: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

export type ProgressXpEvent = {
  id: string;
  amount: number;
  source: string;
  relatedActivityId: string | null;
  timestamp: string;
  idempotencyKey: string;
  activityDate: string;
  metadata: Record<string, unknown>;
};

export type ProgressDailyObservation = {
  active: boolean;
  netXp: number;
  questsCompleted: number;
  lecturesCompleted: number;
  ncertSessions: number;
  ncertBooksCompleted: number;
  vocabularyActivities: number;
  calculationSessions: number;
  bossSessions: number;
  studyActivities: number;
  [futureField: string]: unknown;
};

export type ProgressPersonalRecords = {
  scope: 'observed-since-tracking-start';
  highestDailyNetXp: number | null;
  longestActiveDayStreak: number | null;
  mostLecturesCompleted: number | null;
  bestCalculationResult: {
    score: number;
    label: string;
    accuracy: number;
    questions: number;
    correct: number;
    activityId: string;
    achievedAt: string;
  } | null;
  bestBossResult: {
    score: number;
    label: string;
    correct: number;
    total: number;
    activityId: string;
    achievedAt: string;
  } | null;
  mostNCERTSessions: number | null;
  mostNCERTPages: null;
  trackedActiveDays: number;
  trackedLectureCompletions: number;
  [futureField: string]: unknown;
};

export type ProgressHistory = {
  version: 1;
  trackingStartedAt: string | null;
  systemEvents: ProgressSystemEvent[];
  xpEvents: ProgressXpEvent[];
  personalRecords: ProgressPersonalRecords;
  dailyObservations: Record<string, ProgressDailyObservation>;
  /** Original invalid subfields are retained atomically alongside the salvage. */
  malformedRaw?: unknown;
  [futureField: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const validTimestamp = (value: unknown): value is string =>
  isText(value) && !Number.isNaN(Date.parse(value));

export const createEmptyProgressPersonalRecords = (): ProgressPersonalRecords => ({
  scope: 'observed-since-tracking-start',
  highestDailyNetXp: null,
  longestActiveDayStreak: null,
  mostLecturesCompleted: null,
  bestCalculationResult: null,
  bestBossResult: null,
  mostNCERTSessions: null,
  // This app records sessions, never page counts.
  mostNCERTPages: null,
  trackedActiveDays: 0,
  trackedLectureCompletions: 0,
});

export const createEmptyProgressHistory = (): ProgressHistory => ({
  version: 1,
  trackingStartedAt: null,
  systemEvents: [],
  xpEvents: [],
  personalRecords: createEmptyProgressPersonalRecords(),
  dailyObservations: {},
});

/** Generate the action ticket before entering a functional React state updater. */
let ticketSequence = 0;
export const createProgressHistoryTicket = (timestamp = new Date().toISOString()): ProgressHistoryTicket => ({
  timestamp,
  ticketId: `${timestamp}#${++ticketSequence}`,
});

const isHistoryEventType = (value: unknown): value is ProgressHistoryEventType =>
  typeof value === 'string' && [
    'quest.started', 'quest.completed', 'quest.missed', 'xp.awarded', 'level.up', 'rank.changed',
    'achievement.unlocked', 'study.activity', 'lecture.started', 'lecture.completed',
    'ncert.session', 'ncert.book.completed', 'vocabulary.activity', 'calculation.session',
    'boss.activity', 'recovery.activity', 'mission.started', 'mission.completed',
    'phase.unlocked', 'system.notification',
    'gate.unlocked', 'gate.entered', 'gate.progress', 'gate.cleared', 'gate.failed',
    'item.acquired', 'item.used', 'chest.opened',
    'equipment.equipped', 'equipment.unequipped', 'equipment.bonus', 'equipment.bonus-reversed',
  ].includes(value);

const normalizeEvent = (value: unknown): ProgressSystemEvent | null => {
  if (!isRecord(value) || !isText(value.id) || !isHistoryEventType(value.type)
    || !validTimestamp(value.timestamp) || !isText(value.idempotencyKey)
    || (value.metadata !== undefined && !isRecord(value.metadata))) return null;
  return {
    ...value,
    id: value.id,
    type: value.type,
    timestamp: value.timestamp,
    idempotencyKey: value.idempotencyKey,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
};

const normalizeXpEvent = (value: unknown): ProgressXpEvent | null => {
  if (!isRecord(value) || !isText(value.id) || !isFiniteNumber(value.amount)
    || value.amount === 0 || !isText(value.source)
    || (value.relatedActivityId !== null && !isText(value.relatedActivityId))
    || !validTimestamp(value.timestamp) || !isText(value.idempotencyKey)
    || !isDateKey(String(value.activityDate))
    || (value.metadata !== undefined && !isRecord(value.metadata))) return null;
  return {
    ...value,
    id: value.id,
    amount: value.amount,
    source: value.source,
    relatedActivityId: value.relatedActivityId as string | null,
    timestamp: value.timestamp,
    idempotencyKey: value.idempotencyKey,
    activityDate: value.activityDate as string,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
};

const normalizeDailyObservation = (value: unknown): ProgressDailyObservation | null => {
  if (!isRecord(value) || typeof value.active !== 'boolean' || !isFiniteNumber(value.netXp)
    || ['questsCompleted', 'lecturesCompleted', 'ncertSessions', 'ncertBooksCompleted',
      'vocabularyActivities', 'calculationSessions', 'bossSessions', 'studyActivities']
      .some((key) => !Number.isInteger(value[key]) || (value[key] as number) < 0)) return null;
  return {
    ...value,
    active: value.active,
    netXp: value.netXp,
    questsCompleted: value.questsCompleted as number,
    lecturesCompleted: value.lecturesCompleted as number,
    ncertSessions: value.ncertSessions as number,
    ncertBooksCompleted: value.ncertBooksCompleted as number,
    vocabularyActivities: value.vocabularyActivities as number,
    calculationSessions: value.calculationSessions as number,
    bossSessions: value.bossSessions as number,
    studyActivities: value.studyActivities as number,
  };
};

const validCalculationRecord = (value: unknown): ProgressPersonalRecords['bestCalculationResult'] =>
  isRecord(value) && isFiniteNumber(value.score) && isText(value.label)
    && isFiniteNumber(value.accuracy) && isFiniteNumber(value.questions)
    && isFiniteNumber(value.correct) && isText(value.activityId) && validTimestamp(value.achievedAt)
    ? {
      score: value.score,
      label: value.label,
      accuracy: value.accuracy,
      questions: value.questions,
      correct: value.correct,
      activityId: value.activityId,
      achievedAt: value.achievedAt,
    }
    : null;

const validBossRecord = (value: unknown): ProgressPersonalRecords['bestBossResult'] =>
  isRecord(value) && isFiniteNumber(value.score) && isText(value.label)
    && isFiniteNumber(value.correct) && isFiniteNumber(value.total)
    && isText(value.activityId) && validTimestamp(value.achievedAt)
    ? {
      score: value.score,
      label: value.label,
      correct: value.correct,
      total: value.total,
      activityId: value.activityId,
      achievedAt: value.achievedAt,
    }
    : null;

const normalizePersonalRecords = (value: unknown): ProgressPersonalRecords => {
  const empty = createEmptyProgressPersonalRecords();
  if (!isRecord(value) || value.scope !== 'observed-since-tracking-start') return empty;
  const nullableCount = (key: string): number | null => {
    const item = value[key];
    return item === null || item === undefined
      ? null
      : isFiniteNumber(item) && item >= 0 ? item : null;
  };
  return {
    ...empty,
    ...value,
    highestDailyNetXp: nullableCount('highestDailyNetXp'),
    longestActiveDayStreak: nullableCount('longestActiveDayStreak'),
    mostLecturesCompleted: nullableCount('mostLecturesCompleted'),
    bestCalculationResult: validCalculationRecord(value.bestCalculationResult),
    bestBossResult: validBossRecord(value.bestBossResult),
    mostNCERTSessions: nullableCount('mostNCERTSessions'),
    // A purported page high-water mark is intentionally not trusted or kept.
    mostNCERTPages: null,
    trackedActiveDays: Number.isInteger(value.trackedActiveDays) && (value.trackedActiveDays as number) >= 0
      ? value.trackedActiveDays as number : 0,
    trackedLectureCompletions: Number.isInteger(value.trackedLectureCompletions)
      && (value.trackedLectureCompletions as number) >= 0
      ? value.trackedLectureCompletions as number : 0,
  };
};

/**
 * Tolerant additive migration. Invalid new fields are not fatal to core progress;
 * valid siblings survive and the original malformed value is retained for repair.
 */
export function normalizeProgressHistory(value: unknown): ProgressHistory {
  if (value === undefined) return createEmptyProgressHistory();
  if (value === null) return { ...createEmptyProgressHistory(), malformedRaw: null };
  if (!isRecord(value)) return { ...createEmptyProgressHistory(), malformedRaw: value };

  const rawEvents = value.systemEvents;
  const rawXpEvents = value.xpEvents;
  const rawDaily = value.dailyObservations;
  const validEvents = Array.isArray(rawEvents) ? rawEvents.map(normalizeEvent).filter(
    (item): item is ProgressSystemEvent => item !== null,
  ) : [];
  const validXp = Array.isArray(rawXpEvents) ? rawXpEvents.map(normalizeXpEvent).filter(
    (item): item is ProgressXpEvent => item !== null,
  ) : [];
  const dailyObservations: Record<string, ProgressDailyObservation> = {};
  if (isRecord(rawDaily)) {
    for (const [date, observation] of Object.entries(rawDaily)) {
      const normalized = isDateKey(date) ? normalizeDailyObservation(observation) : null;
      if (normalized) dailyObservations[date] = normalized;
    }
  }
  const startedAt = value.trackingStartedAt === null || value.trackingStartedAt === undefined
    ? null
    : validTimestamp(value.trackingStartedAt) ? value.trackingStartedAt : null;
  const normalizedRecords = normalizePersonalRecords(value.personalRecords);
  const duplicateIds = <T extends { id: string; idempotencyKey: string }>(items: T[]) =>
    new Set(items.map((item) => item.id)).size !== items.length
    || new Set(items.map((item) => item.idempotencyKey)).size !== items.length;
  const rawRecords = isRecord(value.personalRecords) ? value.personalRecords : {};
  const invalidRecordValue = ['highestDailyNetXp', 'longestActiveDayStreak', 'mostLecturesCompleted',
    'mostNCERTSessions'].some((key) => rawRecords[key] !== undefined && rawRecords[key] !== null
      && (!isFiniteNumber(rawRecords[key]) || rawRecords[key] < 0))
    || (rawRecords.bestCalculationResult !== undefined && rawRecords.bestCalculationResult !== null
      && normalizedRecords.bestCalculationResult === null)
    || (rawRecords.bestBossResult !== undefined && rawRecords.bestBossResult !== null
      && normalizedRecords.bestBossResult === null)
    || (rawRecords.mostNCERTPages !== undefined && rawRecords.mostNCERTPages !== null);
  const malformed = value.version !== 1
    || (value.trackingStartedAt !== null && value.trackingStartedAt !== undefined && startedAt === null)
    || !Array.isArray(rawEvents) || validEvents.length !== rawEvents.length
    || !Array.isArray(rawXpEvents) || validXp.length !== rawXpEvents.length
    || duplicateIds(validEvents) || duplicateIds(validXp)
    || !isRecord(rawDaily) || Object.keys(dailyObservations).length !== Object.keys(rawDaily ?? {}).length
    || !isRecord(value.personalRecords)
    || (isRecord(value.personalRecords) && value.personalRecords.scope !== 'observed-since-tracking-start')
    || invalidRecordValue;
  const dedupe = <T extends { id: string; idempotencyKey: string }>(items: T[]) => {
    const seenIds = new Set<string>();
    const seenIdempotencyKeys = new Set<string>();
    return items.filter((item) => {
      if (seenIds.has(item.id) || seenIdempotencyKeys.has(item.idempotencyKey)) return false;
      seenIds.add(item.id);
      seenIdempotencyKeys.add(item.idempotencyKey);
      return true;
    });
  };
  const hasMalformedRaw = Object.prototype.hasOwnProperty.call(value, 'malformedRaw');
  return {
    ...value,
    version: 1,
    trackingStartedAt: startedAt,
    systemEvents: dedupe(validEvents),
    xpEvents: dedupe(validXp),
    personalRecords: normalizedRecords,
    dailyObservations,
    ...(malformed || hasMalformedRaw
      ? { malformedRaw: hasMalformedRaw ? value.malformedRaw : value }
      : {}),
  };
}