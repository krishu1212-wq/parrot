export const ACHIEVEMENT_IDS = [
  'first-lecture',
  'ten-lectures',
  'practice',
  'blackbook',
  'streak-7',
  'streak-30',
  'first-boss',
  'hundred-lectures',
  'ncert-master',
  'vocab-master',
  'calculation-master',
  'rank-ascendant',
  'gate-conqueror',
  'combo-3',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export type AchievementEvidenceSources = {
  streak: boolean;
  batches: boolean;
  calculationHistory: boolean;
  vocabulary: boolean;
  bossTests: boolean;
  ncertBooks: boolean;
};

export type AchievementHistory = {
  highestObservedStreak: number;
  earnedRelicIds: string[];
  evidenceSources?: AchievementEvidenceSources;
  observedCompletedLectureIds?: string[];
  observedVocabularyPageCount?: number;
  observedMasterCalculationIds?: string[];
  [futureField: string]: unknown;
};

/** Structural input keeps this domain helper independent of React and Root state types. */
export type AchievementEvidence = {
  streak?: unknown;
  batches?: unknown;
  calculationHistory?: unknown;
  blackBookPage?: unknown;
  blackBookTotal?: unknown;
  bossTests?: unknown;
  ncertBooks?: unknown;
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;

const emptyHistory = (): AchievementHistory => ({
  highestObservedStreak: 0,
  earnedRelicIds: [],
});

/**
 * Missing history is a supported legacy payload. Explicitly malformed history
 * is not: callers validating a saved root should let this error abort hydration.
 */
export function readAchievementHistory(value: unknown): AchievementHistory {
  if (value === undefined) return emptyHistory();
  if (!record(value)
    || !validCount(value.highestObservedStreak)
    || !Array.isArray(value.earnedRelicIds)
    || value.earnedRelicIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Saved achievement history is invalid. Your stored progress has not been replaced.');
  }

  const ids = value.earnedRelicIds as string[];
  const sources = value.evidenceSources;
  const observedLectures = value.observedCompletedLectureIds;
  if ((sources !== undefined && (!record(sources)
    || !['streak', 'batches', 'calculationHistory', 'vocabulary', 'bossTests', 'ncertBooks']
      .every((key) => typeof sources[key] === 'boolean')))
    || (observedLectures !== undefined && (!Array.isArray(observedLectures)
      || observedLectures.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(observedLectures).size !== observedLectures.length))
    || (value.observedVocabularyPageCount !== undefined && !validCount(value.observedVocabularyPageCount))
    || (value.observedMasterCalculationIds !== undefined && (!Array.isArray(value.observedMasterCalculationIds)
      || value.observedMasterCalculationIds.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(value.observedMasterCalculationIds).size !== value.observedMasterCalculationIds.length))) {
    throw new Error('Saved achievement history is invalid. Your stored progress has not been replaced.');
  }
  if (new Set(ids).size !== ids.length
    || (ids.includes('streak-7') && value.highestObservedStreak < 7)
    || (ids.includes('streak-30') && value.highestObservedStreak < 30)) {
    throw new Error('Saved achievement history is invalid. Your stored progress has not been replaced.');
  }

  // Keep unrecognized fields so a newer client can round-trip them.
  return {
    ...value,
    highestObservedStreak: value.highestObservedStreak,
    earnedRelicIds: [...ids],
  };
}

export function isAchievementHistory(value: unknown): value is AchievementHistory {
  try {
    readAchievementHistory(value);
    return value !== undefined;
  } catch {
    return false;
  }
}

export const createEmptyAchievementHistory = (): AchievementHistory => emptyHistory();

const completedLectureCount = (batches: unknown): number => {
  if (!Array.isArray(batches)) return 0;
  let completed = 0;
  for (const batch of batches) {
    if (!record(batch) || !Array.isArray(batch.subjects)) continue;
    for (const subject of batch.subjects) {
      if (!record(subject) || !Array.isArray(subject.topics)) continue;
      for (const topic of subject.topics) {
        if (!record(topic) || !Array.isArray(topic.lectures)) continue;
        // Archived lecture records remain genuine completion history.
        for (const lecture of topic.lectures) {
          if (record(lecture) && lecture.status === 'completed') completed += 1;
        }
      }
    }
  }
  return completed;
};

const hasBossDefeat = (bossTests: unknown): boolean => {
  if (!Array.isArray(bossTests)) return false;
  return bossTests.some((test) => {
    if (!record(test) || !Array.isArray(test.results) || test.results.length === 0
      || test.results.some((result) => !record(result) || typeof result.correct !== 'boolean')) {
      return false;
    }
    const correct = test.results.filter((result) => (result as Record<string, unknown>).correct === true).length;
    return correct / test.results.length >= 0.7;
  });
};

const hasNcertMaster = (ncertBooks: unknown): boolean =>
  Array.isArray(ncertBooks)
  && ncertBooks.length > 0
  && ncertBooks.every((book) => record(book)
    && validCount(book.totalSessions)
    && book.totalSessions > 0
    && validCount(book.completedSessions)
    && book.completedSessions >= book.totalSessions);

/** Derives current achievements only from saved activity records and exact existing badge criteria. */
export function deriveCurrentAchievementIds(evidence: AchievementEvidence): AchievementId[] {
  const done = completedLectureCount(evidence.batches);
  const streak = validCount(evidence.streak) ? evidence.streak : 0;
  const blackBookPage = validCount(evidence.blackBookPage) ? evidence.blackBookPage : 0;
  const blackBookTotal = validCount(evidence.blackBookTotal) ? evidence.blackBookTotal : 0;
  const calculationHistoryCount = Array.isArray(evidence.calculationHistory)
    ? evidence.calculationHistory.length
    : 0;
  const current = new Set<AchievementId>();

  if (done >= 1) current.add('first-lecture');
  if (done >= 10) current.add('ten-lectures');
  if (calculationHistoryCount >= 1) current.add('practice');
  if (blackBookPage >= 1) current.add('blackbook');
  if (streak >= 7) current.add('streak-7');
  if (streak >= 30) current.add('streak-30');
  if (hasBossDefeat(evidence.bossTests)) current.add('first-boss');
  if (done >= 100) current.add('hundred-lectures');
  if (hasNcertMaster(evidence.ncertBooks)) current.add('ncert-master');
  if (blackBookTotal > 0 && blackBookPage >= blackBookTotal) current.add('vocab-master');

  return ACHIEVEMENT_IDS.filter((id) => current.has(id));
}

/**
 * Additive, idempotent history capture. Pass the raw saved streak before day
 * rollover so an already-earned streak relic is not lost when today's state
 * subsequently resets the active streak.
 */
export function updateAchievementHistory(
  previousValue: unknown,
  evidence: AchievementEvidence,
  rawObservedStreak: unknown = evidence.streak,
): AchievementHistory {
  const previous = readAchievementHistory(previousValue);
  const observedStreak = validCount(rawObservedStreak) ? rawObservedStreak : 0;
  const highestObservedStreak = Math.max(previous.highestObservedStreak, observedStreak);
  const currentlyEarned = deriveCurrentAchievementIds({ ...evidence, streak: observedStreak });
  const earnedRelicIds = new Set([...previous.earnedRelicIds, ...currentlyEarned]);
  if (highestObservedStreak >= 7) earnedRelicIds.add('streak-7');
  if (highestObservedStreak >= 30) earnedRelicIds.add('streak-30');
  const orderedEarnedRelicIds: string[] = ACHIEVEMENT_IDS.filter((id) => earnedRelicIds.has(id));
  for (const id of previous.earnedRelicIds) {
    if (!(ACHIEVEMENT_IDS as readonly string[]).includes(id)) orderedEarnedRelicIds.push(id);
  }

  return {
    ...previous,
    highestObservedStreak,
    earnedRelicIds: orderedEarnedRelicIds,
  };
}