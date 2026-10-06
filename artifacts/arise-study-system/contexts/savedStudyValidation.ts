import { readAchievementHistory } from '@/contexts/achievementHistory';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value: unknown) => typeof value === 'string';
const calendarDate = (value: unknown) => {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value as string)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Missing legacy fields remain supported; explicitly damaged fields fail closed.
// The provider retains the original bytes and never saves defaults on this error.
export function validateSavedStudyState(value: unknown): asserts value is Record<string, unknown> {
  if (!record(value)) throw new Error('Saved study progress is not an object.');
  const fail = (field: string): never => { throw new Error(`Saved ${field} is invalid. Your stored progress has not been replaced.`); };
  try {
    readAchievementHistory(value.achievementHistory);
  } catch {
    fail('achievement history');
  }
  for (const key of ['totalXp', 'streak', 'recoveryXp', 'ncertCompleted', 'ncertTotal', 'blackBookPage', 'blackBookTotal', 'currentVocabularyPage']) {
    if (value[key] !== undefined && !count(value[key])) fail(key);
  }
  for (const key of ['date', 'lastActiveDate', 'vocabularyDailyDate']) {
    if (value[key] !== undefined && !calendarDate(value[key])) fail(key);
  }
  for (const key of ['recoveryAvailable', 'vocabularyDailyCompleted']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(key);
  }
  const arrays: Record<string, (item: Record<string, unknown>) => boolean> = {
    quests: (item) => text(item.id) && text(item.title) && text(item.subtitle)
      && text(item.category) && count(item.xp) && typeof item.completed === 'boolean'
      && (item.isRecovery === undefined || typeof item.isRecovery === 'boolean'),
    vocabularySections: (item) => text(item.id) && text(item.title) && count(item.pages)
      && count(item.completed) && (item.completed as number) <= (item.pages as number),
    ncertShelves: (item) => text(item.id) && text(item.classLabel)
      && ['bookCount', 'completed', 'sessions', 'vocabulary'].every((key) => count(item[key]))
      && (item.completed as number) <= (item.bookCount as number),
    ncertBooks: (item) => text(item.id) && text(item.classId) && text(item.title)
      && count(item.totalSessions) && count(item.completedSessions)
      && (item.completedSessions as number) <= (item.totalSessions as number)
      && Array.isArray(item.vocabulary) && item.vocabulary.every(text),
    calculationHistory: (item) => text(item.id) && calendarDate(item.date)
      && ['questions', 'correct', 'accuracy', 'duration'].every((key) => count(item[key]))
      && (item.correct as number) <= (item.questions as number) && (item.accuracy as number) <= 100,
  };
  for (const [key, valid] of Object.entries(arrays)) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key])) fail(key);
    const ids = new Set<string>();
    for (const item of value[key] as unknown[]) {
      if (!record(item) || !valid(item)) fail(key);
      const id = (item as Record<string, unknown>).id as string;
      if (!id.trim() || ids.has(id)) fail(`${key} record IDs`);
      ids.add(id);
    }
  }
  if (value.batches !== undefined) {
    const collection = (items: unknown, label: string): Record<string, unknown>[] => {
      if (!Array.isArray(items) || items.some((item) => !record(item))) fail(label);
      const rows = items as Record<string, unknown>[];
      const ids = new Set<string>();
      for (const item of rows) {
        if (item.id !== undefined) {
          if (!text(item.id) || !(item.id as string).trim() || ids.has(item.id as string)) fail(`${label} ID`);
          ids.add(item.id as string);
        }
      }
      return rows;
    };
    for (const batch of collection(value.batches, 'batches')) {
      for (const subject of collection(batch.subjects, 'subjects')) {
        for (const topic of collection(subject.topics, 'topics')) {
          for (const lecture of collection(topic.lectures, 'lectures')) {
            for (const key of ['xpReward', 'sessionCount']) {
              if (lecture[key] !== undefined && (!count(lecture[key]) || !Number.isInteger(lecture[key]))) fail(`lecture ${key}`);
            }
            for (const key of ['xpAwarded', 'isArchived', 'archivedByCount']) {
              if (lecture[key] !== undefined && typeof lecture[key] !== 'boolean') fail(`lecture ${key}`);
            }
            for (const key of ['firstStartedAt', 'lastStartedAt', 'completedAt', 'xpEarnedOn']) {
              if (lecture[key] !== undefined && lecture[key] !== null
                && (!text(lecture[key]) || (lecture[key] !== '' && Number.isNaN(Date.parse(lecture[key] as string))))) fail(`lecture ${key}`);
            }
            if (lecture.status !== undefined && (!text(lecture.status)
              || !['notstarted', 'inprogress', 'completed'].includes(
                (lecture.status as string).toLowerCase().replace(/[\s_-]/g, ''),
              ))) fail('lecture status');
            if (lecture.status === undefined && (lecture.xpAwarded === true || lecture.completedAt)) fail('missing completed lecture status');
          }
        }
      }
    }
  }
}