import {
  deriveCurrentAchievementIds,
  isAchievementHistory,
  readAchievementHistory,
} from '@/contexts/achievementHistory';

export type EarnedBadge = { id: string; title: string; detail: string; earned: boolean };

type Lec = { status?: string };
type Topic = { lectures?: Lec[] };
type Subject = { topics?: Topic[] };
type Batch = { subjects?: Subject[] };

type StructuralAchievementHistory = {
  highestObservedStreak: number;
  earnedRelicIds: string[];
  [futureField: string]: unknown;
};

export type BadgeExtras = {
  streak?: number;
  bossTests?: { results: { correct: boolean }[] }[];
  ncertBooks?: { totalSessions: number; completedSessions: number }[];
  blackBookTotal?: number;
  achievementHistory?: StructuralAchievementHistory;
};

/** Combines persisted earned history with achievements supported by current canonical records. Awards no XP. */
export function deriveBadges(
  batches: Batch[],
  blackBookPage: number,
  calculationHistoryCount: number,
  extras: BadgeExtras = {},
): EarnedBadge[] {
  let done = 0;
  for (const b of batches) for (const s of b.subjects ?? []) for (const t of s.topics ?? []) for (const l of t.lectures ?? []) if (l.status === 'completed') done += 1;
  const streak = extras.streak ?? 0;
  const bbTotal = extras.blackBookTotal ?? 0;
  const currentIds = new Set(deriveCurrentAchievementIds({
    batches,
    streak,
    blackBookPage,
    blackBookTotal: bbTotal,
    calculationHistory: calculationHistoryCount >= 1 ? [{}] : [],
    bossTests: extras.bossTests,
    ncertBooks: extras.ncertBooks,
  }));
  const savedHistory = extras.achievementHistory;
  const history = savedHistory && isAchievementHistory(savedHistory)
    ? readAchievementHistory(savedHistory)
    : undefined;
  const earnedIds = new Set([...currentIds, ...(history?.earnedRelicIds ?? [])]);
  const highestStreak = Math.max(streak, history?.highestObservedStreak ?? 0);
  const streakDetail = `Highest observed streak ${highestStreak} day${highestStreak === 1 ? '' : 's'} · current streak ${streak} day${streak === 1 ? '' : 's'}`;
  return [
    { id: 'first-lecture', title: 'First Lecture', detail: 'Completed one lecture', earned: earnedIds.has('first-lecture') },
    { id: 'ten-lectures', title: '10 Lectures', detail: `${Math.min(done, 10)}/10 lectures completed`, earned: earnedIds.has('ten-lectures') },
    { id: 'practice', title: 'Practice Started', detail: 'Logged a calculation practice session', earned: earnedIds.has('practice') },
    { id: 'blackbook', title: 'Black Book Progress', detail: 'Completed a Black Book page', earned: earnedIds.has('blackbook') },
    { id: 'streak-7', title: '7-Day Streak', detail: streakDetail, earned: earnedIds.has('streak-7') },
    { id: 'streak-30', title: '30-Day Streak', detail: streakDetail, earned: earnedIds.has('streak-30') },
    { id: 'first-boss', title: 'First Boss Defeat', detail: 'A recorded Boss Test with 70% or more recalled', earned: earnedIds.has('first-boss') },
    { id: 'hundred-lectures', title: '100 Lectures', detail: `${Math.min(done, 100)}/100 lectures completed`, earned: earnedIds.has('hundred-lectures') },
    { id: 'ncert-master', title: 'NCERT Master', detail: 'Every NCERT book fully read', earned: earnedIds.has('ncert-master') },
    { id: 'vocab-master', title: 'Vocabulary Master', detail: 'Black Book completed', earned: earnedIds.has('vocab-master') },
    { id: 'calculation-master', title: 'Calculation Master', detail: '10 newly observed sessions · 10+ questions at 80% accuracy', earned: earnedIds.has('calculation-master') },
    { id: 'rank-ascendant', title: 'Rank Ascendant', detail: 'Reach S-Rank through new progression', earned: earnedIds.has('rank-ascendant') },
    { id: 'gate-conqueror', title: 'Gate Conqueror', detail: 'Clear a newly entered Gate', earned: earnedIds.has('gate-conqueror') },
    { id: 'combo-3', title: 'Quest Combo', detail: '3 distinct rewarded study quests in one day', earned: earnedIds.has('combo-3') },
  ];
}
