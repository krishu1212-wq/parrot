/** Authoritative ARISE rank progression. Levels still use 1,000 XP each. */
export const XP_PER_LEVEL = 1_000;

export const FUTURE_RANK_HOOKS = ['gates', 'inventory', 'equipment'] as const;
export type FutureRankHook = (typeof FUTURE_RANK_HOOKS)[number];

export type RankId =
  | 'rank-e'
  | 'rank-d'
  | 'rank-c'
  | 'rank-b'
  | 'rank-a'
  | 'rank-s'
  | 'rank-ss'
  | 'rank-sss'
  | 'rank-hidden'
  | 'rank-transcendent'
  | 'rank-hidden-transcendent';

export type ActiveRankId = 'rank-e' | 'rank-d' | 'rank-c' | 'rank-b' | 'rank-a' | 'rank-s' | 'rank-ss' | 'rank-sss';
export type RankVisualTier = 'foundation' | 'S' | 'SS' | 'SSS' | 'hidden' | 'transcendent';
export type RankCrownVariant =
  | 'iron-crown'
  | 'signal-crown'
  | 'prism-crown'
  | 'winged-crown'
  | 'solar-crown'
  | 'halo-crown'
  | 'double-halo-crown'
  | 'triple-halo-crown'
  | 'eclipse-crown'
  | 'void-crown';

export type RankDefinition = {
  id: RankId;
  displayName: string;
  minimumLevel: number;
  minimumXp: number;
  crownVariant: RankCrownVariant;
  visualTier: RankVisualTier;
  colors: readonly [string, string];
  announcement: string;
  /** Metadata hooks only; no gate, inventory, or equipment behavior is implemented here. */
  futureUnlockHooks: readonly FutureRankHook[];
};

export type RankRequirements = {
  minimumXp: number;
  minimumActiveDays: number;
  minimumStudyActivities: number;
};

export type RankEvidence = {
  activeDays: number;
  completedStudyActivities: number;
  firstActiveDate: string | null;
  lastActiveDate: string | null;
};

export type RankReadiness = {
  currentRank: RankDefinition;
  nextRank: RankDefinition | null;
  evidence: RankEvidence;
  progress: { xp: number; activeDays: number; completedStudyActivities: number };
  requirements: RankRequirements | null;
};

const hooks = FUTURE_RANK_HOOKS;

const definitions: RankDefinition[] = [
  {
    id: 'rank-e',
    displayName: 'E-RANK',
    minimumLevel: 1,
    minimumXp: 0,
    crownVariant: 'iron-crown',
    visualTier: 'foundation',
    colors: ['#9FB4CF', '#5A7494'],
    announcement: 'Your first rank is established. Keep building your study record.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-d',
    displayName: 'D-RANK',
    minimumLevel: 4,
    minimumXp: 3_000,
    crownVariant: 'signal-crown',
    visualTier: 'foundation',
    colors: ['#8FD9F2', '#4C93B8'],
    announcement: 'A new signal is forming. Your consistency has advanced your rank.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-c',
    displayName: 'C-RANK',
    minimumLevel: 9,
    minimumXp: 8_500,
    crownVariant: 'prism-crown',
    visualTier: 'foundation',
    colors: ['#70E7FF', '#3E8BFF'],
    announcement: 'Your focus is taking shape. C-Rank has been reached.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-b',
    displayName: 'B-RANK',
    minimumLevel: 21,
    minimumXp: 20_000,
    crownVariant: 'winged-crown',
    visualTier: 'foundation',
    colors: ['#7FB2FF', '#7C6BFF'],
    announcement: 'Your study record has crossed into B-Rank.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-a',
    displayName: 'A-RANK',
    minimumLevel: 43,
    minimumXp: 42_000,
    crownVariant: 'solar-crown',
    visualTier: 'foundation',
    colors: ['#E4C27A', '#B8893A'],
    announcement: 'A-Rank reached. Your sustained work is paying off.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-s',
    displayName: 'S-RANK',
    minimumLevel: 86,
    minimumXp: 85_000,
    crownVariant: 'halo-crown',
    visualTier: 'S',
    colors: ['#FFE3A0', '#E4A04A'],
    announcement: 'S-Rank reached. Your progress now carries an ascendant mark.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-ss',
    displayName: 'SS-RANK',
    minimumLevel: 141,
    minimumXp: 140_000,
    crownVariant: 'double-halo-crown',
    visualTier: 'SS',
    colors: ['#F5F6FF', '#A77BFF'],
    announcement: 'SS-Rank reached. Two halos now mark your record.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-sss',
    displayName: 'SSS-RANK',
    minimumLevel: 221,
    minimumXp: 220_000,
    crownVariant: 'triple-halo-crown',
    visualTier: 'SSS',
    colors: ['#E8FCFF', '#51DDED'],
    announcement: 'SSS-Rank reached. Your record has entered the mythic tier.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-hidden',
    displayName: 'Hidden',
    minimumLevel: 45,
    minimumXp: 44_000,
    crownVariant: 'eclipse-crown',
    visualTier: 'hidden',
    colors: ['#D7BEFF', '#543F91'],
    announcement: 'Hidden rank revealed. Your record has crossed the eclipse.',
    futureUnlockHooks: hooks,
  },
  {
    id: 'rank-transcendent',
    displayName: 'Transcendent',
    minimumLevel: 50,
    minimumXp: 49_000,
    crownVariant: 'void-crown',
    visualTier: 'transcendent',
    colors: ['#F7E9FF', '#8F55D9'],
    announcement: 'Transcendent rank reached. This is the highest recorded tier.',
    futureUnlockHooks: hooks,
  },
];

export const RANK_DEFINITIONS: readonly RankDefinition[] = Object.freeze(
  definitions.map((rank) => Object.freeze({
    ...rank,
    colors: Object.freeze(rank.colors),
    futureUnlockHooks: Object.freeze(rank.futureUnlockHooks),
  })).slice(0, 8),
);

/** Historical-only artwork identities remain resolvable, but are not earnable ranks. */
export const LEGACY_RANK_DEFINITIONS: readonly RankDefinition[] = Object.freeze(
  definitions.slice(8).map((rank) => Object.freeze({
    ...rank,
    colors: Object.freeze(rank.colors),
    futureUnlockHooks: Object.freeze(rank.futureUnlockHooks),
  })),
);

const ALL_RANK_DEFINITIONS = [...RANK_DEFINITIONS, ...LEGACY_RANK_DEFINITIONS];

export const RANK_REQUIREMENTS: Readonly<Record<ActiveRankId, RankRequirements>> = Object.freeze({
  'rank-e': Object.freeze({ minimumXp: 0, minimumActiveDays: 0, minimumStudyActivities: 0 }),
  'rank-d': Object.freeze({ minimumXp: 3_000, minimumActiveDays: 7, minimumStudyActivities: 14 }),
  'rank-c': Object.freeze({ minimumXp: 8_500, minimumActiveDays: 21, minimumStudyActivities: 50 }),
  'rank-b': Object.freeze({ minimumXp: 20_000, minimumActiveDays: 60, minimumStudyActivities: 160 }),
  'rank-a': Object.freeze({ minimumXp: 42_000, minimumActiveDays: 130, minimumStudyActivities: 360 }),
  'rank-s': Object.freeze({ minimumXp: 85_000, minimumActiveDays: 260, minimumStudyActivities: 750 }),
  'rank-ss': Object.freeze({ minimumXp: 140_000, minimumActiveDays: 450, minimumStudyActivities: 1_500 }),
  'rank-sss': Object.freeze({ minimumXp: 220_000, minimumActiveDays: 700, minimumStudyActivities: 2_600 }),
});

const fallbackRank = RANK_DEFINITIONS[0];

export function levelFromTotalXp(totalXp: unknown): number {
  if (typeof totalXp !== 'number' || !Number.isFinite(totalXp) || totalXp < 0) return 1;
  return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}

export function rankDefinitionForLevel(level: unknown): RankDefinition {
  const safeLevel = typeof level === 'number' && Number.isFinite(level) && level >= 1
    ? Math.floor(level)
    : 1;
  for (let index = RANK_DEFINITIONS.length - 1; index >= 0; index -= 1) {
    if (safeLevel >= RANK_DEFINITIONS[index].minimumLevel) return RANK_DEFINITIONS[index];
  }
  return fallbackRank;
}

export function rankForLevel(level: unknown): string {
  return rankDefinitionForLevel(level).displayName;
}

export function rankFromXp(totalXp: unknown): string {
  return rankForLevel(levelFromTotalXp(totalXp));
}

const qualifyingStudyEventTypes = new Set([
  'quest.completed',
  'lecture.completed',
  'ncert.session',
  'vocabulary.activity',
  'calculation.session',
  'boss.activity',
]);

const validDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00.000Z`))
  && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value;

/** Only concrete, idempotent completed study/quest events count as rank evidence. */
export function rankEvidenceFromHistory(value: unknown): RankEvidence {
  const history = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const events = Array.isArray(history.systemEvents) ? history.systemEvents : [];
  const seen = new Set<string>();
  const activeDates = new Set<string>();

  for (const rawEvent of events) {
    if (typeof rawEvent !== 'object' || rawEvent === null) continue;
    const event = rawEvent as Record<string, unknown>;
    if (typeof event.type !== 'string' || !qualifyingStudyEventTypes.has(event.type)) continue;
    if (typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp))) continue;
    const metadata = typeof event.metadata === 'object' && event.metadata !== null
      ? event.metadata as Record<string, unknown> : {};
    const activityDate = validDateKey(metadata.activityDate)
      ? metadata.activityDate
      : event.timestamp.slice(0, 10);
    if (!validDateKey(activityDate)) continue;
    const identity = typeof event.idempotencyKey === 'string' && event.idempotencyKey.length > 0
      ? event.idempotencyKey
      : typeof event.id === 'string' && event.id.length > 0 ? event.id : null;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    activeDates.add(activityDate);
  }

  const dates = [...activeDates].sort();
  return {
    activeDays: dates.length,
    completedStudyActivities: seen.size,
    firstActiveDate: dates[0] ?? null,
    lastActiveDate: dates.at(-1) ?? null,
  };
}

const safeTotalXp = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

export function rankDefinitionForProgress(totalXp: unknown, history: unknown): RankDefinition {
  const xp = safeTotalXp(totalXp);
  const evidence = rankEvidenceFromHistory(history);
  let current = fallbackRank;
  // Advance through the ladder in order; every prior tier must be satisfied.
  for (const rank of RANK_DEFINITIONS.slice(1)) {
    const requirements = RANK_REQUIREMENTS[rank.id as ActiveRankId];
    if (xp < requirements.minimumXp
      || evidence.activeDays < requirements.minimumActiveDays
      || evidence.completedStudyActivities < requirements.minimumStudyActivities) break;
    current = rank;
  }
  return current;
}

export function rankForProgress(totalXp: unknown, history: unknown): string {
  return rankDefinitionForProgress(totalXp, history).displayName;
}

export function rankReadiness(totalXp: unknown, history: unknown): RankReadiness {
  const xp = safeTotalXp(totalXp);
  const evidence = rankEvidenceFromHistory(history);
  const currentRank = rankDefinitionForProgress(xp, history);
  const index = RANK_DEFINITIONS.findIndex((rank) => rank.id === currentRank.id);
  const nextRank = RANK_DEFINITIONS[index + 1] ?? null;
  const requirements = nextRank ? RANK_REQUIREMENTS[nextRank.id as ActiveRankId] : null;
  return {
    currentRank,
    nextRank,
    evidence,
    progress: requirements ? {
      xp: Math.min(1, xp / Math.max(1, requirements.minimumXp)),
      activeDays: Math.min(1, evidence.activeDays / Math.max(1, requirements.minimumActiveDays)),
      completedStudyActivities: Math.min(1,
        evidence.completedStudyActivities / Math.max(1, requirements.minimumStudyActivities)),
    } : { xp: 1, activeDays: 1, completedStudyActivities: 1 },
    requirements,
  };
}

/** Legacy identities compare at the endgame tier for presentation, never for earning. */
export function rankProgressionIndex(value: unknown): number {
  const id = rankDefinitionFor(value).id;
  const activeIndex = RANK_DEFINITIONS.findIndex((rank) => rank.id === id);
  return activeIndex >= 0 ? activeIndex : RANK_DEFINITIONS.length - 1;
}

const normalizeRankKey = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, '-');

export function rankDefinitionFor(value: unknown): RankDefinition {
  if (typeof value !== 'string' || !value.trim()) return fallbackRank;
  const key = normalizeRankKey(value);
  const found = ALL_RANK_DEFINITIONS.find((rank) =>
    normalizeRankKey(rank.id) === key || normalizeRankKey(rank.displayName) === key
    || normalizeRankKey(rank.id.replace(/^rank-/, '')) === key);
  if (found) return found;
  if (key === 'ss' || key === 'sss') {
    return RANK_DEFINITIONS.find((rank) => rank.id === `rank-${key}`) ?? fallbackRank;
  }
  // The former combined identity always meant the highest tier, not Hidden.
  if (key === 'rank-hidden-transcendent' || key === 'hidden/transcendent' || key === 'hidden-transcendent') {
    return LEGACY_RANK_DEFINITIONS[LEGACY_RANK_DEFINITIONS.length - 1];
  }
  return fallbackRank;
}

/** Stable, whole-rank artwork identity; never infer it from the first character. */
export function rankArtworkKey(value: unknown): RankId {
  return rankDefinitionFor(value).id;
}

export function rankUnlockMetadata(value: unknown) {
  return rankDefinitionFor(value).futureUnlockHooks;
}