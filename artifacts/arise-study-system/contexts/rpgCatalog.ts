import type { EquipmentSlot, GateDefinition, GateRecord, ItemDefinition, RpgState, RpgRewardTable } from '@/contexts/rpgTypes';
import {
  levelFromTotalXp,
  rankDefinitionFor,
  rankDefinitionForLevel,
  rankProgressionIndex,
} from '@/contexts/rankSystem';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = Object.freeze([
  'xp-boost', 'quest-modifier', 'revision', 'boss-entry', 'study-boost', 'achievement-relic',
]);

export const GATE_DEFINITIONS: readonly GateDefinition[] = Object.freeze([
  {
    id: 'gate-maths-lecture', name: 'The Arithmetic Antechamber', type: 'normal',
    subject: 'Maths', topic: 'Core arithmetic', description: 'Complete one newly recorded Maths lecture.',
    difficulty: 1, requiredLevel: 1, requiredRankId: 'rank-e', timeLimitSeconds: 20 * 60,
    objective: { kind: 'maths-lecture', target: 1, label: 'Complete 1 Maths lecture' },
    rewards: { xp: 120, items: [
      { itemId: 'revision-token', quantity: 2 }, { itemId: 'gate-key', quantity: 1 },
      { itemId: 'study-coins', quantity: 15 }, { itemId: 'training-quest', quantity: 1 },
    ] }, artVariant: 'original-portal-amber', color: '#42d9ff',
  },
  {
    id: 'gate-ncert-depths', name: 'The Scholar’s Deep', type: 'difficult',
    subject: 'NCERT', topic: 'Focused session study', description: 'Record two new NCERT sessions.',
    difficulty: 3, requiredLevel: 6, requiredRankId: 'rank-b', timeLimitSeconds: 30 * 60,
    objective: { kind: 'ncert-session', target: 2, label: 'Complete 2 NCERT sessions' },
    rewards: { xp: 180, items: [
      { itemId: 'scholar-core', quantity: 1 }, { itemId: 'relic-fragment', quantity: 2 },
      { itemId: 'life-potion', quantity: 1 }, { itemId: 'revision-relic', quantity: 1 },
    ] }, artVariant: 'original-portal-violet', color: '#a87bff',
  },
  {
    id: 'gate-calculation-citadel', name: 'The Calculation Citadel', type: 'special',
    subject: 'Maths', topic: 'Precision calculations', description: 'Record a new session with at least 10 questions and 80% accuracy.',
    difficulty: 4, requiredLevel: 3, requiredRankId: 'rank-c', timeLimitSeconds: 10 * 60,
    objective: { kind: 'calculation', target: 1, minimumQuestions: 10, minimumAccuracy: 80,
      label: '10+ questions at 80% accuracy' },
    rewards: { xp: 150, items: [
      { itemId: 'calculation-gauntlet', quantity: 1 }, { itemId: 'xp-crystal', quantity: 2 },
      { itemId: 'focus-crystal', quantity: 1 }, { itemId: 'sentinel-sigil', quantity: 1 },
    ] }, artVariant: 'original-portal-cyan', color: '#ffbd59',
  },
  {
    id: 'gate-boss-record', name: 'The Recordkeeper', type: 'boss',
    subject: 'Boss challenge', topic: 'Weekly review record', description: 'Set a new boss record with at least five questions and 80% accuracy.',
    difficulty: 5, requiredLevel: 12, requiredRankId: 'rank-a', timeLimitSeconds: 30 * 60,
    objective: { kind: 'boss', target: 1, minimumQuestions: 5, minimumAccuracy: 80,
      label: '5+ questions at 80% accuracy' },
    rewards: { xp: 250, items: [
      { itemId: 'reward-chest', quantity: 1 }, { itemId: 'study-coins', quantity: 50 },
    ] }, artVariant: 'original-portal-crimson', color: '#ff667e',
  },
]);

const itemDefinitions: ItemDefinition[] = [
  { id: 'gate-key', name: 'Gate Key', rarity: 'common', category: 'keys', description: 'A collectible key; entry never requires spending it.', artVariant: 'key-prismatic', usable: true, useKind: 'key' },
  { id: 'life-potion', name: 'Life Potion', rarity: 'rare', category: 'potions', description: 'A fictional ARISE game item that adds 60 seconds to an active gate attempt.', artVariant: 'potion-cyan', usable: true, useKind: 'potion' },
  { id: 'revision-token', name: 'Revision Token', rarity: 'rare', category: 'revision', description: 'Adds 30 seconds to an active attempt (60 seconds with Revision Relic).', artVariant: 'token-orbit', usable: true, useKind: 'revision' },
  { id: 'training-quest', name: 'Training Quest Seal', rarity: 'common', category: 'quest-items', description: 'A record of the challenge completed; inspectable, not consumable.', artVariant: 'seal-sunrise', usable: false },
  { id: 'relic-fragment', name: 'Relic Fragment', rarity: 'common', category: 'relic-fragments', description: 'A collectible fragment from a cleared gate.', artVariant: 'fragment-shard', usable: false },
  { id: 'xp-crystal', name: 'XP Crystal', rarity: 'epic', category: 'xp-items', description: 'Consume one to gain 25 XP.', artVariant: 'crystal-blue', usable: true, useKind: 'xp' },
  { id: 'study-coins', name: 'Study Coins', rarity: 'common', category: 'special-rewards', description: 'A non-spendable collectible that records challenge rewards.', artVariant: 'coin-halo', usable: false },
  { id: 'scholar-core', name: 'Scholar Core', rarity: 'epic', category: 'special-rewards', description: 'Equipped XP boost: +5% NCERT quest XP.', artVariant: 'core-emerald', usable: false, equipmentSlot: 'xp-boost', effectLabel: '+5% NCERT quest XP' },
  { id: 'revision-relic', name: 'Revision Relic', rarity: 'legendary', category: 'special-rewards', description: 'Revision Tokens add 60 seconds instead of 30.', artVariant: 'relic-hourglass', usable: false, equipmentSlot: 'revision', effectLabel: 'Revision Token time doubled' },
  { id: 'calculation-gauntlet', name: 'Calculation Gauntlet', rarity: 'epic', category: 'special-rewards', description: 'Equipped quest modifier: +5% calculation quest XP.', artVariant: 'gauntlet-arc', usable: false, equipmentSlot: 'quest-modifier', effectLabel: '+5% calculation quest XP' },
  { id: 'focus-crystal', name: 'Focus Crystal', rarity: 'rare', category: 'special-rewards', description: 'Equipped study boost: +3% Gate XP only. It does not create Focus XP.', artVariant: 'focus-prism', usable: false, equipmentSlot: 'study-boost', effectLabel: '+3% Gate XP' },
  { id: 'sentinel-sigil', name: 'Sentinel Sigil', rarity: 'legendary', category: 'special-rewards', description: 'Equipped boss-entry item adds 60 seconds when a boss attempt begins.', artVariant: 'sigil-shield', usable: false, equipmentSlot: 'boss-entry', effectLabel: '+60 seconds to Boss attempts' },
  { id: 'achievement-relic', name: 'Achievement Relic', rarity: 'mythic', category: 'special-rewards', description: 'Equipped relic: +2% Gate XP.', artVariant: 'relic-aurora', usable: false, equipmentSlot: 'achievement-relic', effectLabel: '+2% Gate XP' },
  { id: 'quest-lens', name: 'Quest Lens', rarity: 'legendary', category: 'special-rewards', description: 'Equipped quest modifier: +2% daily quest XP.', artVariant: 'lens-spectrum', usable: false, equipmentSlot: 'quest-modifier', effectLabel: '+2% daily quest XP' },
  { id: 'reward-chest', name: 'Reward Chest', rarity: 'legendary', category: 'special-rewards', description: 'Open for deterministic, guaranteed ARISE contents.', artVariant: 'chest-starlight', usable: true, useKind: 'chest' },
];

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = Object.freeze(itemDefinitions.map((item) => Object.freeze(item)));
const gateById = new Map(GATE_DEFINITIONS.map((definition) => [definition.id, definition]));
const itemById = new Map(ITEM_DEFINITIONS.map((definition) => [definition.id, definition]));
export const getGateDefinition = (id: string) => gateById.get(id);
export const getItemDefinition = (id: string) => itemById.get(id);

/** Supplemental rewards never replace or mutate a quest's canonical base XP. */
export const ORDINARY_QUEST_REWARDS: Readonly<Record<string, RpgRewardTable>> = Object.freeze({
  'maths-lecture': { xp: 0, items: [{ itemId: 'study-coins', quantity: 3 }] },
  'ncert-reading': { xp: 0, items: [{ itemId: 'study-coins', quantity: 2 }] },
  'timed-calculation': { xp: 0, items: [{ itemId: 'relic-fragment', quantity: 1 }] },
  'black-book': { xp: 0, items: [{ itemId: 'study-coins', quantity: 2 }] },
});

export const ACHIEVEMENT_REWARDS: Readonly<Record<string, RpgRewardTable>> = Object.freeze({
  'first-lecture': { xp: 25, items: [{ itemId: 'relic-fragment', quantity: 1 }] },
  'ten-lectures': { xp: 100, items: [{ itemId: 'revision-token', quantity: 1 }] },
  practice: { xp: 25, items: [{ itemId: 'relic-fragment', quantity: 1 }] },
  blackbook: { xp: 25, items: [{ itemId: 'study-coins', quantity: 5 }] },
  'streak-7': { xp: 100, items: [{ itemId: 'revision-token', quantity: 1 }] },
  'streak-30': { xp: 300, items: [{ itemId: 'achievement-relic', quantity: 1 }] },
  'first-boss': { xp: 100, items: [{ itemId: 'relic-fragment', quantity: 2 }] },
  'hundred-lectures': { xp: 300, items: [{ itemId: 'achievement-relic', quantity: 1 }] },
  'ncert-master': { xp: 300, items: [{ itemId: 'scholar-core', quantity: 1 }] },
  'vocab-master': { xp: 300, items: [{ itemId: 'achievement-relic', quantity: 1 }] },
  'calculation-master': { xp: 200, items: [{ itemId: 'calculation-gauntlet', quantity: 1 }] },
  'rank-ascendant': { xp: 200, items: [{ itemId: 'achievement-relic', quantity: 1 }] },
  'gate-conqueror': { xp: 50, items: [{ itemId: 'relic-fragment', quantity: 1 }] },
});
export const OFFICIAL_BOSS_REWARD: RpgRewardTable = {
  xp: 150, items: [{ itemId: 'reward-chest', quantity: 1 }, { itemId: 'study-coins', quantity: 20 }],
};
export const COMBO_REWARD: RpgRewardTable = { xp: 50, items: [{ itemId: 'relic-fragment', quantity: 1 }] };

export function getGateEligibility(gate: GateDefinition, totalXp: number, currentRankId?: unknown) {
  const level = levelFromTotalXp(totalXp);
  const levelMet = level >= gate.requiredLevel;
  // UI and mutation paths pass the evidence-based rank; old callers retain the XP-only preview.
  const currentRank = typeof currentRankId === 'string'
    ? rankDefinitionFor(currentRankId)
    : rankDefinitionForLevel(level);
  const safeRankMet = rankProgressionIndex(currentRank.id) >= rankProgressionIndex(gate.requiredRankId);
  return {
    eligible: levelMet && safeRankMet,
    levelMet,
    rankMet: safeRankMet,
    reason: levelMet && safeRankMet ? null
      : !levelMet && !safeRankMet ? `Requires Level ${gate.requiredLevel} and ${gate.requiredRankId.replace('rank-', '').toUpperCase()}-Rank.`
        : !levelMet ? `Requires Level ${gate.requiredLevel}.` : `Requires ${gate.requiredRankId.replace('rank-', '').toUpperCase()}-Rank.`,
  };
}

export function emptyGateRecords(totalXp: number, currentRankId?: unknown): RpgState['gates'] {
  return Object.fromEntries(GATE_DEFINITIONS.map((gate) => [gate.id, {
    gateId: gate.id, unlocked: getGateEligibility(gate, totalXp, currentRankId).eligible, unlockedAt: null,
    completed: false, completedAt: null, progress: 0,
  } satisfies GateRecord]));
}