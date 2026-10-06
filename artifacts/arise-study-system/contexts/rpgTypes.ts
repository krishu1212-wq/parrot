import type { RankId } from '@/contexts/rankSystem';

export type GateType = 'normal' | 'difficult' | 'special' | 'boss';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type ItemCategory = 'keys' | 'potions' | 'revision' | 'quest-items' | 'relic-fragments' | 'xp-items' | 'special-rewards';
export type EquipmentSlot = 'xp-boost' | 'quest-modifier' | 'revision' | 'boss-entry' | 'study-boost' | 'achievement-relic';
export type ItemUseKind = 'xp' | 'potion' | 'revision' | 'key' | 'chest';

export type RpgRewardTable = {
  xp: number;
  items: { itemId: string; quantity: number }[];
};

export type GateDefinition = {
  id: string;
  name: string;
  type: GateType;
  subject: string;
  topic: string;
  description: string;
  difficulty: number;
  requiredLevel: number;
  requiredRankId: RankId;
  timeLimitSeconds: number;
  objective: {
    kind: 'maths-lecture' | 'ncert-session' | 'calculation' | 'boss';
    target: number;
    minimumQuestions?: number;
    minimumAccuracy?: number;
    label: string;
  };
  rewards: RpgRewardTable;
  artVariant: string;
  color: string;
};

export type ItemDefinition = {
  id: string;
  name: string;
  rarity: ItemRarity;
  category: ItemCategory;
  description: string;
  artVariant: string;
  usable: boolean;
  useKind?: ItemUseKind;
  equipmentSlot?: EquipmentSlot;
  effectLabel?: string;
};

export type GateRecord = {
  gateId: string;
  unlocked: boolean;
  unlockedAt: string | null;
  completed: boolean;
  completedAt: string | null;
  progress: number;
};

export type GateAttempt = {
  id: string;
  gateId: string;
  batchId: string;
  startedAt: string;
  deadlineAt: string;
  status: 'active' | 'cleared' | 'failed' | 'abandoned';
  progress: number;
  goal: number;
  completedAt: string | null;
  processedActivityIds: string[];
  usedItemIds: string[];
};

export type InventoryEntry = { itemId: string; quantity: number };
export type RpgItemAcquisition = {
  id: string;
  itemId: string;
  quantity: number;
  source: string;
  sourceId: string;
  timestamp: string;
  idempotencyKey: string;
};

export type RpgEffects = {
  ncertXpPercent: number;
  calculationXpPercent: number;
  questXpPercent: number;
  gateXpPercent: number;
  revisionTimeMultiplier: number;
  bossTimeBonusSeconds: number;
  labels: string[];
};

export type RpgEventType =
  | 'gate.unlocked' | 'gate.entered' | 'gate.progress' | 'gate.cleared' | 'gate.failed'
  | 'item.acquired' | 'item.used' | 'chest.opened'
  | 'achievement.unlocked' | 'system.notification'
  | 'equipment.equipped' | 'equipment.unequipped' | 'equipment.bonus' | 'equipment.bonus-reversed';

export type RpgEvent = {
  id: string;
  type: RpgEventType;
  timestamp: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  xpDelta?: number;
  xpSource?: 'gate' | 'inventory' | 'equipment' | 'equipment-reversal' | 'achievement' | 'boss' | 'combo' | 'combo-reversal';
  rewards?: RpgRewardTable;
};

export type RpgState = {
  version: 1;
  gates: Record<string, GateRecord>;
  attempts: GateAttempt[];
  activeAttemptId: string | null;
  inventory: Record<string, InventoryEntry>;
  acquisitions: RpgItemAcquisition[];
  loadout: Record<EquipmentSlot, string | null>;
  effects: RpgEffects;
  events: RpgEvent[];
  presentationQueue: string[];
  claimedRewardKeys: string[];
  /** New evidence only; legacy records are a non-paying baseline. */
  rewardTracking?: {
    version: 1;
    processedActivityKeys: string[];
    observedActiveDates: string[];
    masteredCalculationIds: string[];
    suppressedAchievementIds: string[];
  };
  malformedRaw?: unknown;
};

export type RpgCommand =
  | { type: 'enter-gate'; gateId: string }
  | { type: 'abandon-gate'; attemptId: string }
  | { type: 'use-item'; itemId: string }
  | { type: 'equip-item'; itemId: string }
  | { type: 'unequip-slot'; slot: EquipmentSlot }
  | { type: 'ack-presentation'; eventId: string }
  | { type: 'refresh-clock' };