import type { StudyAccountInput } from '@workspace/api-client-react';
import { normalizeStudyTools } from '@/contexts/learningTools';
import { validateSavedStudyState } from '@/contexts/savedStudyValidation';
import type { StudyState } from '@/contexts/StudyContext';

export type AccountCloudSnapshot = {
  ownerId: string;
  state: StudyState | null;
  revision: number;
  updatedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateCloudStudyState(value: unknown): StudyState {
  if (!isRecord(value)) {
    throw new Error('Cloud study progress is malformed. It has been retained and was not loaded.');
  }
  try {
    validateSavedStudyState(value);
    const requiredStrings = [
      'date',
      'lastActiveDate',
      'activeBatchId',
      'currentVocabularySectionId',
      'vocabularyDailyDate',
    ];
    for (const key of requiredStrings) {
      if (value[key] === undefined) throw new Error(`Missing ${key}`);
      if (typeof value[key] !== 'string') throw new Error(`Invalid ${key}`);
    }
    const requiredCounts = [
      'streak',
      'totalXp',
      'recoveryXp',
      'ncertCompleted',
      'ncertTotal',
      'blackBookPage',
      'blackBookTotal',
      'ncertCatalogVersion',
      'currentVocabularyPage',
    ];
    for (const key of requiredCounts) {
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || (value[key] as number) < 0) {
        throw new Error(`Invalid ${key}`);
      }
    }
    for (const key of ['ncertCatalogVersion', 'currentVocabularyPage']) {
      if (!Number.isInteger(value[key])) throw new Error(`Invalid ${key}`);
    }
    for (const key of ['recoveryAvailable', 'vocabularyDailyCompleted']) {
      if (typeof value[key] !== 'boolean') throw new Error(`Invalid ${key}`);
    }
    for (const key of [
      'quests',
      'batches',
      'ncertShelves',
      'ncertBooks',
      'vocabularySections',
      'calculationHistory',
    ]) {
      if (!Array.isArray(value[key])) throw new Error(`Missing ${key}`);
    }
    if (typeof value.vocabularyDailyCompleted !== 'boolean') throw new Error('Invalid vocabulary completion state');
    validateBatchState(value.batches);
    if (!Array.isArray(value.batches) || value.batches.length === 0
      || !(value.batches as Record<string, unknown>[]).some((batch) => batch.id === value.activeBatchId)) {
      throw new Error('The active study batch is missing.');
    }
    const studyTools = value.studyTools;
    if (!isRecord(studyTools)
      || !['reviewCards', 'bossTests', 'workoutSessions', 'revisionHistory', 'experiments']
        .every((key) => Array.isArray(studyTools[key]))
      || !Number.isInteger(studyTools.windDownHour)
      || (studyTools.windDownHour as number) < 0
      || (studyTools.windDownHour as number) > 23) {
      throw new Error('Missing or invalid study tools data.');
    }
    normalizeStudyTools(studyTools);
    if (value.ncertProgressLedger === undefined) throw new Error('Missing NCERT progress ledger');
    validateNcertLedger(value.ncertProgressLedger);
    return value as StudyState;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid saved fields';
    throw new Error(`Cloud study progress is malformed (${detail}). It has been retained and was not loaded.`);
  }
}

function validateBatchState(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('Invalid batch collection');
  for (const batch of value) {
    if (!isRecord(batch)
      || !['id', 'name', 'source', 'startDate', 'createdAt'].every((key) => typeof batch[key] === 'string')
      || typeof batch.isActive !== 'boolean'
      || !Array.isArray(batch.subjects)) throw new Error('Invalid batch');
    for (const subject of batch.subjects) {
      if (!isRecord(subject)
        || typeof subject.id !== 'string'
        || typeof subject.name !== 'string'
        || !Array.isArray(subject.topics)) throw new Error('Invalid batch subject');
      for (const topic of subject.topics) {
        if (!isRecord(topic)
          || !['id', 'title', 'category'].every((key) => typeof topic[key] === 'string')
          || typeof topic.isArchived !== 'boolean'
          || !Array.isArray(topic.lectures)) throw new Error('Invalid study topic');
        for (const lecture of topic.lectures) {
          if (!isRecord(lecture)
            || !['id', 'title', 'link'].every((key) => typeof lecture[key] === 'string')
            || !['not-started', 'in-progress', 'completed'].includes(lecture.status as string)
            || typeof lecture.xpReward !== 'number' || !Number.isFinite(lecture.xpReward) || lecture.xpReward < 0
            || typeof lecture.sessionCount !== 'number' || !Number.isInteger(lecture.sessionCount) || lecture.sessionCount < 0
            || typeof lecture.xpAwarded !== 'boolean'
            || typeof lecture.isArchived !== 'boolean') throw new Error('Invalid study lecture');
          for (const key of ['firstStartedAt', 'lastStartedAt', 'completedAt', 'xpEarnedOn']) {
            if (lecture[key] !== null && typeof lecture[key] !== 'string') throw new Error('Invalid lecture history');
          }
        }
      }
    }
  }
}

function validateNcertLedger(value: unknown): void {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.byShelf)) {
    throw new Error('Invalid NCERT progress ledger');
  }
  const validTotals = (totals: unknown) => isRecord(totals)
    && ['completed', 'sessions', 'vocabulary'].every((key) =>
      typeof totals[key] === 'number' && Number.isFinite(totals[key]) && (totals[key] as number) >= 0);
  for (const entry of Object.values(value.byShelf)) {
    if (!isRecord(entry) || !validTotals(entry.aggregate) || !validTotals(entry.bookBaseline)) {
      throw new Error('Invalid NCERT progress ledger entry');
    }
    if (entry.observedBooks !== undefined
      && (!isRecord(entry.observedBooks) || !Object.values(entry.observedBooks).every(validTotals))) {
      throw new Error('Invalid NCERT book ledger');
    }
  }
}

export function validateCloudAccount(value: unknown, expectedOwnerId: string): AccountCloudSnapshot {
  if (!expectedOwnerId.trim()) {
    throw new Error('A verified account ID is required to validate cloud progress ownership.');
  }
  if (!isRecord(value)
    || value.ownerId !== expectedOwnerId
    || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0
    || !(value.updatedAt === null || typeof value.updatedAt === 'string')) {
    throw new Error('The cloud account response is malformed or belongs to a different account. Local progress was not replaced.');
  }
  const state = value.state === null ? null : validateCloudStudyState(value.state);
  if (state === null && ((value.revision as number) !== 0 || value.updatedAt !== null)) {
    throw new Error('The cloud account response has an invalid empty-state revision. Local progress was not replaced.');
  }
  if (state !== null && ((value.revision as number) < 1 || typeof value.updatedAt !== 'string'
    || Number.isNaN(Date.parse(value.updatedAt)))) {
    throw new Error('The cloud account response has invalid saved-state metadata. Local progress was not replaced.');
  }
  return {
    ownerId: expectedOwnerId,
    state,
    revision: value.revision as number,
    updatedAt: value.updatedAt as string | null,
  };
}

export function createCloudSaveInput(
  userId: string,
  expectedRevision: number,
  state: StudyState,
): StudyAccountInput {
  if (!userId.trim()) throw new Error('A verified ARISE profile ID is required to save cloud progress.');
  const input: StudyAccountInput = {
    expectedOwnerId: userId,
    expectedRevision,
    state: state as unknown as Record<string, unknown>,
  };
  return input;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function areStudyStatesEqual(left: StudyState | null, right: StudyState | null): boolean {
  return left === right || (left !== null && right !== null && stableJson(left) === stableJson(right));
}

export function safelyMergeStudyStates(
  base: StudyState,
  local: StudyState,
  cloud: StudyState,
): StudyState | null {
  const merged: Record<string, unknown> = {};
  const fields = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(cloud),
  ]);
  for (const field of fields) {
    const baseValue = base[field as keyof StudyState];
    const localValue = local[field as keyof StudyState];
    const cloudValue = cloud[field as keyof StudyState];
    const baseJson = stableJson(baseValue);
    const localJson = stableJson(localValue);
    const cloudJson = stableJson(cloudValue);
    if (localJson === baseJson) merged[field] = cloudValue;
    else if (cloudJson === baseJson || localJson === cloudJson) merged[field] = localValue;
    else return null;
  }
  try {
    return validateCloudStudyState(merged);
  } catch {
    return null;
  }
}

export function isCloudCompareAndSwapConflict(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'status' in error && error.status === 409;
}