import type {
  EquipmentSlot, GateAttempt, ItemDefinition, RpgCommand,
  RpgEffects, RpgEvent, RpgEventType, RpgItemAcquisition, RpgState,
} from '@/contexts/rpgTypes';
import type { ProgressHistoryTicket } from '@/contexts/progressHistorySchema';
import {
  EQUIPMENT_SLOTS, GATE_DEFINITIONS, ITEM_DEFINITIONS, emptyGateRecords, getGateDefinition,
  getGateEligibility, getItemDefinition,
  ACHIEVEMENT_REWARDS, ORDINARY_QUEST_REWARDS, OFFICIAL_BOSS_REWARD, COMBO_REWARD,
} from '@/contexts/rpgCatalog';
import { newlyRecordedStudyActivities, questChangesBetween } from '@/contexts/rpgStudyTransitions';
import { deriveCurrentAchievementIds } from '@/contexts/achievementHistory';
import { rankDefinitionForProgress, rankProgressionIndex } from '@/contexts/rankSystem';

const slots = EQUIPMENT_SLOTS as readonly EquipmentSlot[];
const record = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const uniq = (values: string[]) => [...new Set(values)];
const blankEffects = (): RpgEffects => ({
  ncertXpPercent: 0, calculationXpPercent: 0, questXpPercent: 0, gateXpPercent: 0,
  revisionTimeMultiplier: 1, bossTimeBonusSeconds: 0, labels: [],
});

export function createEmptyRpgState(totalXp: number, now = new Date().toISOString(), currentRankId?: unknown): RpgState {
  return {
    version: 1, gates: emptyGateRecords(totalXp, currentRankId), attempts: [], activeAttemptId: null,
    inventory: {}, acquisitions: [], loadout: Object.fromEntries(slots.map((slot) => [slot, null])) as RpgState['loadout'],
    effects: blankEffects(), events: [], presentationQueue: [], claimedRewardKeys: [],
  };
}

export function computeLoadoutEffects(rpg: RpgState): RpgEffects {
  const equipped = slots.map((slot) => {
    const itemId = rpg.loadout?.[slot];
    const item = typeof itemId === 'string' ? getItemDefinition(itemId) : undefined;
    return item && item.equipmentSlot === slot && (rpg.inventory?.[item.id]?.quantity ?? 0) > 0 ? item : undefined;
  }).filter((item): item is ItemDefinition => !!item);
  const effects = blankEffects();
  for (const item of equipped) {
    if (item.id === 'scholar-core') effects.ncertXpPercent += 5;
    if (item.id === 'calculation-gauntlet') effects.calculationXpPercent += 5;
    if (item.id === 'quest-lens') effects.questXpPercent += 2;
    if (item.id === 'focus-crystal') effects.gateXpPercent += 3;
    if (item.id === 'achievement-relic') effects.gateXpPercent += 2;
    if (item.id === 'revision-relic') effects.revisionTimeMultiplier = 2;
    if (item.id === 'sentinel-sigil') effects.bossTimeBonusSeconds = 60;
    if (item.effectLabel) effects.labels.push(item.effectLabel);
  }
  effects.gateXpPercent = Math.min(10, effects.gateXpPercent);
  effects.questXpPercent = Math.min(10, effects.questXpPercent);
  return effects;
}

export function normalizeRpgState(
  value: unknown, totalXp: number, now = new Date().toISOString(), currentRankId?: unknown,
): RpgState {
  const empty = createEmptyRpgState(totalXp, now, currentRankId);
  if (!record(value)) return value === undefined ? empty : { ...empty, malformedRaw: value };
  let malformed = value.version !== 1;
  const mark = () => { malformed = true; };
  const events: RpgEvent[] = [];
  if (Array.isArray(value.events)) {
    for (const e of value.events) {
      if (!record(e) || typeof e.id !== 'string' || typeof e.idempotencyKey !== 'string'
        || !validTime(e.timestamp) || typeof e.type !== 'string'
        || !['gate.unlocked', 'gate.entered', 'gate.progress', 'gate.cleared', 'gate.failed',
          'item.acquired', 'item.used', 'chest.opened', 'equipment.equipped', 'equipment.unequipped',
           'equipment.bonus', 'equipment.bonus-reversed', 'achievement.unlocked', 'system.notification'].includes(e.type)
        || (e.metadata !== undefined && !record(e.metadata))
         || (e.rewards !== undefined && (!record(e.rewards) || !Number.isFinite(e.rewards.xp)
           || e.rewards.xp < 0 || !Array.isArray(e.rewards.items)
           || e.rewards.items.some((item: unknown) => !record(item) || !getItemDefinition(item.itemId)
             || !Number.isInteger(item.quantity) || item.quantity < 1)))
         || (e.xpDelta !== undefined && (!Number.isFinite(e.xpDelta) || !['gate', 'inventory', 'equipment', 'equipment-reversal', 'achievement', 'boss', 'combo', 'combo-reversal'].includes(e.xpSource)))) {
        mark(); continue;
      }
      events.push({ ...e, metadata: record(e.metadata) ? e.metadata : {} } as RpgEvent);
    }
  } else if (value.events !== undefined) mark();
  const uniqueEvents = events.filter((e, i) => events.findIndex((x) => x.id === e.id || x.idempotencyKey === e.idempotencyKey) === i);
  if (uniqueEvents.length !== events.length) mark();

  const gates = emptyGateRecords(totalXp, currentRankId);
  if (record(value.gates)) {
    for (const id of Object.keys(value.gates)) if (!getGateDefinition(id)) mark();
    for (const gate of GATE_DEFINITIONS) {
    const raw = value.gates[gate.id];
    if (!record(raw)) { if (raw !== undefined) mark(); continue; }
    if (raw.gateId !== undefined && raw.gateId !== gate.id
      || raw.unlocked !== undefined && typeof raw.unlocked !== 'boolean'
      || raw.completed !== undefined && typeof raw.completed !== 'boolean'
      || raw.progress !== undefined && (!Number.isFinite(raw.progress) || raw.progress < 0)) { mark(); continue; }
    const unlockEvent = uniqueEvents.some((event) => event.type === 'gate.unlocked' && event.metadata.gateId === gate.id);
    gates[gate.id] = {
      gateId: gate.id, unlocked: unlockEvent || gates[gate.id].unlocked,
      unlockedAt: (unlockEvent || gates[gate.id].unlocked) && validTime(raw.unlockedAt) ? raw.unlockedAt : null,
      completed: raw.completed === true, completedAt: validTime(raw.completedAt) ? raw.completedAt : null,
      progress: Number.isFinite(raw.progress) && raw.progress >= 0 ? Math.floor(raw.progress) : 0,
    };
    }
  } else if (value.gates !== undefined) mark();

  const inventory: RpgState['inventory'] = {};
  if (record(value.inventory)) for (const [id, raw] of Object.entries(value.inventory)) {
    if (!getItemDefinition(id) || !record(raw) || raw.itemId !== id
      || !Number.isInteger(raw.quantity) || raw.quantity < 1) { mark(); continue; }
    inventory[id] = { itemId: id, quantity: raw.quantity };
  } else if (value.inventory !== undefined) mark();
  const acquisitions: RpgItemAcquisition[] = [];
  if (Array.isArray(value.acquisitions)) for (const a of value.acquisitions) {
    if (!record(a) || typeof a.id !== 'string' || !getItemDefinition(a.itemId)
      || !Number.isInteger(a.quantity) || a.quantity < 1 || typeof a.source !== 'string'
      || typeof a.sourceId !== 'string' || !validTime(a.timestamp) || typeof a.idempotencyKey !== 'string') {
      mark(); continue;
    }
    acquisitions.push(a as RpgItemAcquisition);
  } else if (value.acquisitions !== undefined) mark();
  const attempts: GateAttempt[] = [];
  if (Array.isArray(value.attempts)) for (const a of value.attempts) {
    if (!record(a) || typeof a.id !== 'string' || !getGateDefinition(a.gateId)
      || typeof a.batchId !== 'string' || !validTime(a.startedAt) || !validTime(a.deadlineAt)
      || !['active', 'cleared', 'failed', 'abandoned'].includes(a.status)
      || !Number.isFinite(a.progress) || a.progress < 0 || !Number.isInteger(a.goal) || a.goal < 1
      || !Array.isArray(a.processedActivityIds) || a.processedActivityIds.some((id: unknown) => typeof id !== 'string')
      || !Array.isArray(a.usedItemIds) || a.usedItemIds.some((id: unknown) => typeof id !== 'string')) {
      mark(); continue;
    }
    attempts.push({
      ...a, progress: Math.floor(a.progress),
      processedActivityIds: [...a.processedActivityIds], usedItemIds: [...a.usedItemIds],
      completedAt: validTime(a.completedAt) ? a.completedAt : null,
    } as GateAttempt);
  } else if (value.attempts !== undefined) mark();
  const active = attempts.filter((a) => a.status === 'active');
  if (active.length > 1) {
    mark();
    for (const extra of active.slice(1)) extra.status = 'failed';
  }
  const activeAttemptId = active[0]?.id ?? null;
  if (value.activeAttemptId !== undefined && value.activeAttemptId !== activeAttemptId) mark();

  const loadout = { ...empty.loadout };
  if (record(value.loadout)) {
    for (const key of Object.keys(value.loadout)) if (!slots.includes(key as EquipmentSlot)) mark();
    for (const slot of slots) {
    const id = value.loadout[slot];
    const item = typeof id === 'string' ? getItemDefinition(id) : undefined;
    if (id === null || id === undefined) continue;
    if (!item || item.equipmentSlot !== slot || !inventory[id]) { mark(); continue; }
    loadout[slot] = id;
    }
  } else if (value.loadout !== undefined) mark();
  const validEventIds = new Set(uniqueEvents.map((event) => event.id));
  const queue = Array.isArray(value.presentationQueue)
    ? value.presentationQueue.filter((id: unknown) => typeof id === 'string' && validEventIds.has(id)) : [];
  if (value.presentationQueue !== undefined && (!Array.isArray(value.presentationQueue) || queue.length !== value.presentationQueue.length)) mark();
  const claims = Array.isArray(value.claimedRewardKeys)
    ? value.claimedRewardKeys.filter((id: unknown) => typeof id === 'string') : [];
  if (value.claimedRewardKeys !== undefined && (!Array.isArray(value.claimedRewardKeys) || claims.length !== value.claimedRewardKeys.length)) mark();
  const state: RpgState = {
    version: 1, gates, attempts, activeAttemptId, inventory, acquisitions, loadout,
    effects: blankEffects(), events: uniqueEvents, presentationQueue: uniq(queue),
    claimedRewardKeys: uniq(claims),
    ...(malformed || Object.hasOwn(value, 'malformedRaw') ? { malformedRaw: Object.hasOwn(value, 'malformedRaw') ? value.malformedRaw : value } : {}),
  };
  if (value.rewardTracking !== undefined) {
    const tracking = value.rewardTracking;
    if (record(tracking) && tracking.version === 1
      && ['processedActivityKeys', 'observedActiveDates', 'masteredCalculationIds', 'suppressedAchievementIds']
        .every((key) => Array.isArray(tracking[key])
          && tracking[key].every((id: unknown) => typeof id === 'string' && id.length > 0)
          && new Set(tracking[key]).size === tracking[key].length)
      && tracking.observedActiveDates.every((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
        && Number.isFinite(Date.parse(`${date}T12:00:00Z`)))) {
      state.rewardTracking = {
        version: 1, processedActivityKeys: [...tracking.processedActivityKeys],
        observedActiveDates: [...tracking.observedActiveDates],
        masteredCalculationIds: [...tracking.masteredCalculationIds],
        suppressedAchievementIds: [...tracking.suppressedAchievementIds],
      };
    } else state.malformedRaw = value;
  }
  for (const gate of GATE_DEFINITIONS) {
    const completedAttempt = attempts.some((attempt) => attempt.gateId === gate.id && attempt.status === 'cleared');
    const clearedEvent = uniqueEvents.some((event) => event.type === 'gate.cleared' && event.metadata.gateId === gate.id);
    if (completedAttempt || clearedEvent || claims.includes(`gate:${gate.id}:clear`)) {
      gates[gate.id].completed = true;
      gates[gate.id].completedAt = gates[gate.id].completedAt
        ?? [...uniqueEvents].reverse().find((event) => event.type === 'gate.cleared' && event.metadata.gateId === gate.id)?.timestamp
        ?? attempts.find((attempt) => attempt.gateId === gate.id && attempt.status === 'cleared')?.completedAt
        ?? null;
    }
  }
  state.effects = computeLoadoutEffects(state);
  return state;
}

export function getActiveGateAttempt(rpg: RpgState): GateAttempt | null {
  return rpg.attempts.find((attempt) => attempt.id === rpg.activeAttemptId && attempt.status === 'active') ?? null;
}

function eventExists(rpg: RpgState, key: string) {
  return rpg.events.some((event) => event.idempotencyKey === key);
}
function appendEvent(rpg: RpgState, type: RpgEventType, key: string, timestamp: string,
  metadata: Record<string, unknown> = {}, extra: Partial<RpgEvent> = {}, present = false): RpgEvent {
  const event: RpgEvent = { id: `rpg:${key}`, type, timestamp, idempotencyKey: key, metadata, ...extra };
  rpg.events.push(event);
  if (present) rpg.presentationQueue.push(event.id);
  return event;
}
function changeXp<T extends object>(state: T, rpg: RpgState, amount: number) {
  const snapshot = state as any;
  return { ...snapshot, totalXp: Math.max(0, (Number(snapshot.totalXp) || 0) + amount), rpg };
}
function acquire(rpg: RpgState, itemId: string, quantity: number, source: string, sourceId: string, timestamp: string) {
  const key = `acquire:${source}:${sourceId}:${itemId}`;
  if (rpg.acquisitions.some((item) => item.idempotencyKey === key)) return;
  rpg.inventory[itemId] = { itemId, quantity: (rpg.inventory[itemId]?.quantity ?? 0) + quantity };
  const receipt = { id: `receipt:${key}`, itemId, quantity, source, sourceId, timestamp, idempotencyKey: key };
  rpg.acquisitions.push(receipt);
  appendEvent(rpg, 'item.acquired', key, timestamp, { itemId, quantity, source, sourceId });
}
function enqueueFailure(rpg: RpgState, attempt: GateAttempt, at: string, reason: string) {
  attempt.status = 'failed';
  attempt.completedAt = at;
  rpg.activeAttemptId = null;
  appendEvent(rpg, 'gate.failed', `attempt:${attempt.id}:failed`, at, { attemptId: attempt.id, gateId: attempt.gateId, reason }, {}, true);
}
function expireActive(rpg: RpgState, now: string) {
  const active = getActiveGateAttempt(rpg);
  if (active && Date.parse(now) >= Date.parse(active.deadlineAt)) {
    enqueueFailure(rpg, active, now, 'deadline-expired');
    return true;
  }
  return false;
}
export function getItemUseAvailability(rpg: RpgState, itemId: string, now: string) {
  const item = getItemDefinition(itemId);
  if (!item) return { usable: false, reason: 'Unknown item.' };
  if (!item.usable) return { usable: false, reason: 'This item is inspectable but cannot be used.' };
  if (item.useKind === 'xp' || item.useKind === 'chest') {
    return (rpg.inventory[itemId]?.quantity ?? 0) > 0
      ? { usable: true, reason: null } : { usable: false, reason: 'You do not own this item.' };
  }
  const active = getActiveGateAttempt(rpg);
  if (!active) return { usable: false, reason: 'An active Gate attempt is required.' };
  if (Date.parse(now) >= Date.parse(active.deadlineAt)) return { usable: false, reason: 'The active Gate attempt has expired.' };
  if (active.usedItemIds.includes(itemId)) return { usable: false, reason: 'This item was already used during this attempt.' };
  if ((rpg.inventory[itemId]?.quantity ?? 0) < 1) return { usable: false, reason: 'You do not own this item.' };
  return { usable: true, reason: null };
}

function addRewards(rpg: RpgState, gateId: string, attemptId: string, timestamp: string) {
  const definition = getGateDefinition(gateId)!;
  const key = `gate:${gateId}:clear`;
  if (rpg.claimedRewardKeys.includes(key)) return 0;
  rpg.claimedRewardKeys.push(key);
  const bonus = Math.min(10, rpg.effects.gateXpPercent);
  const xp = definition.rewards.xp + Math.floor(definition.rewards.xp * bonus / 100);
  for (const reward of definition.rewards.items) acquire(rpg, reward.itemId, reward.quantity, 'gate', attemptId, timestamp);
  appendEvent(rpg, 'gate.cleared', key, timestamp, { gateId, attemptId, baseXp: definition.rewards.xp, xpBonusPercent: bonus },
    { xpDelta: xp, xpSource: 'gate', rewards: { xp, items: definition.rewards.items } }, true);
  return xp;
}

export function applyRpgCommand<T extends object>(
  state: T, command: RpgCommand, ticket: ProgressHistoryTicket,
): T {
  const snapshot = state as any;
  const currentRankId = rankDefinitionForProgress(snapshot.totalXp, snapshot.progressHistory).id;
  const rpg = normalizeRpgState(snapshot.rpg, Number(snapshot.totalXp) || 0, ticket.timestamp, currentRankId);
  const expired = expireActive(rpg, ticket.timestamp);
  if (expired) return { ...snapshot, rpg } as T;
  const timestamp = ticket.timestamp;
  const cmdKey = `${command.type}:${ticket.ticketId}`;
  if (eventExists(rpg, cmdKey)) return state;
  switch (command.type) {
    case 'enter-gate': {
      const gate = getGateDefinition(command.gateId);
      if (!gate) throw new Error(`Cannot enter unknown Gate "${command.gateId}".`);
      if (getActiveGateAttempt(rpg)) throw new Error('A Gate attempt is already active.');
      if (rpg.gates[gate.id]?.completed || rpg.claimedRewardKeys.includes(`gate:${gate.id}:clear`)
        || eventExists(rpg, `gate:${gate.id}:clear`)) {
        throw new Error(`Gate "${gate.name}" has already been cleared permanently.`);
      }
      const eligibility = getGateEligibility(gate, Number(snapshot.totalXp) || 0, currentRankId);
      if (!eligibility.eligible) throw new Error(eligibility.reason ?? 'Gate requirements are not met.');
      const batchId = typeof snapshot.activeBatchId === 'string' ? snapshot.activeBatchId : '';
      if (!batchId) throw new Error('An active study batch is required to enter a Gate.');
      const id = `attempt:${ticket.ticketId}`;
      const duration = gate.timeLimitSeconds + (gate.type === 'boss' ? rpg.effects.bossTimeBonusSeconds : 0);
      const attempt: GateAttempt = {
        id, gateId: gate.id, batchId, startedAt: timestamp,
        deadlineAt: new Date(Date.parse(timestamp) + duration * 1000).toISOString(),
        status: 'active', progress: 0, goal: gate.objective.target, completedAt: null,
        processedActivityIds: [], usedItemIds: [],
      };
      rpg.attempts.push(attempt); rpg.activeAttemptId = id;
      appendEvent(rpg, 'gate.entered', cmdKey, timestamp, { gateId: gate.id, attemptId: id, batchId }, {}, true);
      return { ...snapshot, rpg } as T;
    }
    case 'abandon-gate': {
      const attempt = getActiveGateAttempt(rpg);
      if (!attempt || attempt.id !== command.attemptId) throw new Error('The requested active Gate attempt was not found.');
      attempt.status = 'abandoned'; attempt.completedAt = timestamp; rpg.activeAttemptId = null;
      appendEvent(rpg, 'gate.failed', cmdKey, timestamp, { gateId: attempt.gateId, attemptId: attempt.id, reason: 'abandoned' }, {}, true);
      return { ...snapshot, rpg } as T;
    }
    case 'use-item': {
      const item = getItemDefinition(command.itemId);
      if (!item) throw new Error(`Unknown inventory item "${command.itemId}".`);
      const availability = getItemUseAvailability(rpg, item.id, timestamp);
      if (!availability.usable) throw new Error(availability.reason ?? 'Item cannot be used.');
      const stock = rpg.inventory[item.id]!;
      stock.quantity -= 1;
      if (stock.quantity < 1) delete rpg.inventory[item.id];
      let xpDelta = 0;
      if (item.useKind === 'xp') xpDelta = 25;
      if (item.useKind === 'potion' || item.useKind === 'revision' || item.useKind === 'key') {
        const attempt = getActiveGateAttempt(rpg)!;
        const seconds = item.useKind === 'potion' ? 60 : item.useKind === 'key' ? 120
          : 30 * rpg.effects.revisionTimeMultiplier;
        attempt.deadlineAt = new Date(Date.parse(attempt.deadlineAt) + seconds * 1000).toISOString();
        attempt.usedItemIds.push(item.id);
      }
      if (item.useKind === 'chest') {
        const contents = [
          { itemId: 'achievement-relic', quantity: 1 }, { itemId: 'quest-lens', quantity: 1 },
          { itemId: 'xp-crystal', quantity: 2 }, { itemId: 'relic-fragment', quantity: 3 },
          { itemId: 'life-potion', quantity: 1 },
        ];
        for (const reward of contents) acquire(rpg, reward.itemId, reward.quantity, 'chest', cmdKey, timestamp);
        appendEvent(rpg, 'chest.opened', cmdKey, timestamp, { itemId: item.id, contents }, { rewards: { xp: 0, items: contents } }, true);
      } else {
        appendEvent(rpg, 'item.used', cmdKey, timestamp, { itemId: item.id, quantity: 1 },
          xpDelta ? { xpDelta, xpSource: 'inventory' } : {}, item.useKind !== 'xp');
      }
      return (xpDelta ? changeXp(snapshot, rpg, xpDelta) : { ...snapshot, rpg }) as T;
    }
    case 'equip-item': {
      const item = getItemDefinition(command.itemId);
      if (!item?.equipmentSlot) throw new Error(`"${command.itemId}" is not equippable.`);
      if (!rpg.inventory[item.id]) throw new Error(`You do not own "${item.name}".`);
      if (rpg.loadout[item.equipmentSlot] === item.id) return state;
      const replacedItemId = rpg.loadout[item.equipmentSlot];
      rpg.loadout[item.equipmentSlot] = item.id; rpg.effects = computeLoadoutEffects(rpg);
      appendEvent(rpg, 'equipment.equipped', cmdKey, timestamp,
        { itemId: item.id, slot: item.equipmentSlot, replacedItemId }, {}, true);
      return { ...snapshot, rpg } as T;
    }
    case 'unequip-slot': {
      if (!slots.includes(command.slot)) throw new Error(`Unknown equipment slot "${command.slot}".`);
      const itemId = rpg.loadout[command.slot];
      if (!itemId) return state;
      rpg.loadout[command.slot] = null; rpg.effects = computeLoadoutEffects(rpg);
      appendEvent(rpg, 'equipment.unequipped', cmdKey, timestamp, { itemId, slot: command.slot }, {}, true);
      return { ...snapshot, rpg } as T;
    }
    case 'ack-presentation': {
      if (!rpg.presentationQueue.includes(command.eventId)) return state;
      rpg.presentationQueue = rpg.presentationQueue.filter((id) => id !== command.eventId);
      return { ...snapshot, rpg } as T;
    }
    case 'refresh-clock': return expired ? { ...state, rpg } as T : state;
  }
  throw new Error('Unsupported RPG command.');
}

function completeAttempt<T extends object>(next: T, rpg: RpgState, attempt: GateAttempt, timestamp: string) {
  const snapshot = next as any;
  const gate = rpg.gates[attempt.gateId];
  attempt.status = 'cleared'; attempt.completedAt = timestamp; rpg.activeAttemptId = null;
  gate.completed = true; gate.completedAt = timestamp; gate.progress = attempt.goal;
  const delta = addRewards(rpg, attempt.gateId, attempt.id, timestamp);
  return delta ? { ...snapshot, totalXp: (Number(snapshot.totalXp) || 0) + delta, rpg } : { ...snapshot, rpg };
}

const eventAccuracy = (metadata: Record<string, any>) => {
  if (Number.isFinite(metadata.accuracy)) return Number(metadata.accuracy);
  const total = Number(metadata.total ?? metadata.questions);
  const correct = Number(metadata.correct);
  return total > 0 && Number.isFinite(correct) ? correct / total * 100 : 0;
};
function qualifyingActivity(gateId: string, event: any, snapshot: any, attemptBatchId: string, attemptId: string): boolean {
  const activeBatchId = snapshot.activeBatchId;
  if (activeBatchId !== attemptBatchId || !record(event.metadata)) return false;
  const metadata = event.metadata;
  if (gateId === 'gate-maths-lecture') {
    return event.type === 'lecture.completed' && metadata.batchId === attemptBatchId
      && (metadata.subjectId === 'maths' || String(metadata.subjectName ?? '').toLowerCase() === 'maths'
        || snapshot.batches?.find((batch: any) => batch.id === attemptBatchId)?.subjects
          ?.some((subject: any) => subject.id === metadata.subjectId && String(subject.name).toLowerCase() === 'maths'));
  }
  if (gateId === 'gate-ncert-depths') return event.type === 'ncert.session';
  if (gateId === 'gate-calculation-citadel') {
    const gate = getGateDefinition(gateId)!;
    return event.type === 'calculation.session' && Number(metadata.questions) >= (gate.objective.minimumQuestions ?? 0)
      && eventAccuracy(metadata) >= (gate.objective.minimumAccuracy ?? 0);
  }
  if (gateId === 'gate-boss-record') {
    const gate = getGateDefinition(gateId)!;
    return event.type === 'boss.activity' && metadata.batchId === attemptBatchId
      && (metadata.gateAttemptId === undefined || metadata.gateAttemptId === attemptId)
      && Number(metadata.total ?? metadata.questions) >= (gate.objective.minimumQuestions ?? 0)
      && eventAccuracy(metadata) >= (gate.objective.minimumAccuracy ?? 0);
  }
  return false;
}
function unlockEligible(rpg: RpgState, totalXp: number, timestamp: string, progressHistory?: unknown) {
  const currentRankId = rankDefinitionForProgress(totalXp, progressHistory).id;
  for (const gate of GATE_DEFINITIONS) {
    const record = rpg.gates[gate.id];
    if (!record.unlocked && getGateEligibility(gate, totalXp, currentRankId).eligible) {
      record.unlocked = true; record.unlockedAt = timestamp;
      const key = `gate:${gate.id}:unlocked`;
      if (!eventExists(rpg, key)) appendEvent(rpg, 'gate.unlocked', key, timestamp, { gateId: gate.id }, {}, true);
    }
  }
}

export function advanceRpgStudyState<T extends object>(
  previous: T, next: T, ticket: ProgressHistoryTicket, includeRewardBridge = false,
): T {
  if (previous === next) return next;
  const before = previous as any;
  const after = next as any;
  const priorRankId = rankDefinitionForProgress(before.totalXp, before.progressHistory).id;
  const nextRankId = rankDefinitionForProgress(after.totalXp, after.progressHistory).id;
  const priorRpg = normalizeRpgState(before.rpg, Number(before.totalXp) || 0, ticket.timestamp, priorRankId);
  const rpg = normalizeRpgState(after.rpg ?? before.rpg, Number(before.totalXp) || 0, ticket.timestamp, nextRankId);
  for (const gate of GATE_DEFINITIONS) {
    if (priorRpg.gates[gate.id]?.unlocked === false
      && !eventExists(rpg, `gate:${gate.id}:unlocked`)) {
      rpg.gates[gate.id].unlocked = false;
      rpg.gates[gate.id].unlockedAt = null;
    }
  }
  let changed = false;
  const active = getActiveGateAttempt(rpg);
  if (active && Date.parse(ticket.timestamp) >= Date.parse(active.deadlineAt)) {
    enqueueFailure(rpg, active, ticket.timestamp, 'deadline-expired');
    changed = true;
  }
  unlockEligible(rpg, Number(after.totalXp) || 0, ticket.timestamp, after.progressHistory);
  if (rpg.events.length !== priorRpg.events.length) changed = true;
  let updated = next;
  const attempt = getActiveGateAttempt(rpg);
  const oldEvents = new Set((before.progressHistory?.systemEvents ?? []).map((event: any) => event.id));
  const incomingHistory = (after.progressHistory?.systemEvents ?? []).filter((event: any) => !oldEvents.has(event.id));
  const activityIdentity = (event: any) => {
    const metadata = event.metadata ?? {};
    if (event.type === 'lecture.completed') return String(metadata.lectureIdentity ?? metadata.activityId ?? event.id);
    if (event.type === 'ncert.session') return `ncert:${metadata.bookId}:session:${metadata.sessionNumber}`;
    if (event.type === 'calculation.session') return String(metadata.activityId ?? event.id);
    if (event.type === 'boss.activity') return String(metadata.activityId ?? event.id);
    return String(event.id);
  };
  const directActivities = newlyRecordedStudyActivities(before, after, ticket.timestamp);
  const combinedActivities = new Map<string, any>();
  for (const event of [...directActivities, ...incomingHistory]) {
    const key = `${event.type}:${activityIdentity(event)}`;
    if (!combinedActivities.has(key)) combinedActivities.set(key, event);
  }
  const incoming = [...combinedActivities.values()];
  if (attempt && after.activeBatchId === attempt.batchId) {
    const progressEvents = incoming.filter((event: any) => validTime(event.timestamp)
      && Date.parse(event.timestamp) >= Date.parse(attempt.startedAt)
      && Date.parse(event.timestamp) <= Date.parse(attempt.deadlineAt)
      && qualifyingActivity(attempt.gateId, event, after, attempt.batchId, attempt.id)
      && !attempt.processedActivityIds.includes(activityIdentity(event)));
    for (const event of progressEvents) {
      const id = activityIdentity(event);
      attempt.processedActivityIds.push(id);
      attempt.progress += 1;
      rpg.gates[attempt.gateId].progress = attempt.progress;
      appendEvent(rpg, 'gate.progress', `attempt:${attempt.id}:activity:${id}`, event.timestamp,
        { gateId: attempt.gateId, attemptId: attempt.id, activityId: id, progress: attempt.progress });
      changed = true;
      if (attempt.progress >= attempt.goal) {
        updated = completeAttempt(updated, rpg, attempt, event.timestamp);
        unlockEligible(rpg, Number((updated as any).totalXp) || 0, event.timestamp,
          (updated as any).progressHistory);
        changed = true;
        break;
      }
    }
  }
  const questBonusResult = processQuestBonuses(
    previous, updated, rpg, ticket.timestamp, questChangesBetween(before, after),
  );
  updated = questBonusResult;
  if ((updated as any).totalXp !== after.totalXp || rpg.events.length !== priorRpg.events.length) changed = true;
  const result = !changed && (after.rpg === before.rpg
    || after.rpg && JSON.stringify(rpg) === JSON.stringify(after.rpg))
    ? next : { ...updated, rpg } as T;
  return includeRewardBridge ? bridgeStudyRewards(previous, result, ticket) : result;
}

/** Read-only UI data. Reversed quest receipts do not count, and replay is not a combo. */
export function getQuestCombo(rpg: RpgState, date: string) {
  const quests = new Set(rpg.events.filter((event) => event.metadata.kind === 'quest-reward'
    && event.metadata.date === date
    && !rpg.events.some((undo) => undo.metadata.kind === 'quest-reward-reversed'
      && undo.metadata.reversalOf === event.id))
    .map((event) => String(event.metadata.questId)));
  return {
    date, count: quests.size, target: 3, questIds: [...quests],
    claimed: rpg.claimedRewardKeys.includes(`combo:${date}:3`),
    scope: 'new-rewarded-study-quests' as const,
  };
}

/**
 * Atomic supplement to canonical attribution. Only the provider's mutation
 * path calls this; hydration, inspection and normalization never pay rewards.
 * Existing achievements/records form a non-paying baseline on first mutation.
 */
export function bridgeStudyRewards<T extends object>(previous: T, next: T, ticket: ProgressHistoryTicket): T {
  if (previous === next) return next;
  const before = previous as any;
  const after = next as any;
  const currentRankId = rankDefinitionForProgress(after.totalXp, after.progressHistory).id;
  const rpg = normalizeRpgState(after.rpg, Number(after.totalXp) || 0, ticket.timestamp, currentRankId);
  const baselineIds = deriveCurrentAchievementIds({
    ...before, bossTests: before.studyTools?.bossTests,
  });
  if (record(rpg.malformedRaw) && rpg.malformedRaw.rewardTracking !== undefined && !rpg.rewardTracking) {
    throw new Error('Saved reward tracking is invalid. Rewards have not been replayed; stored evidence must be repaired.');
  }
  const tracking: NonNullable<RpgState['rewardTracking']> = rpg.rewardTracking ?? {
    version: 1 as const,
    processedActivityKeys: [
      ...(before.calculationHistory ?? []).map((s: any) => `calculation.session:calculation:${s.id}`),
      ...(before.studyTools?.bossTests ?? []).map((s: any) => `boss.activity:boss:${s.id}`),
    ],
    observedActiveDates: [], masteredCalculationIds: [],
    suppressedAchievementIds: uniq([
      ...baselineIds, ...(before.achievementHistory?.earnedRelicIds ?? []),
      ...(rankProgressionIndex(rankDefinitionForProgress(before.totalXp, before.progressHistory).id)
        >= rankProgressionIndex('rank-s') ? ['rank-ascendant'] : []),
      ...(Object.values(before.rpg?.gates ?? {}).some((gate: any) => gate.completed) ? ['gate-conqueror'] : []),
    ]),
  };
  rpg.rewardTracking = tracking;
  // Claim pre-existing checked quests, without emitting rewards or inventing dates.
  if (!before.rpg?.rewardTracking) for (const quest of before.quests ?? []) {
    if (quest.completed) {
      const key = `quest-reward:${before.date}:${quest.id}`;
      if (!rpg.claimedRewardKeys.includes(key)) rpg.claimedRewardKeys.push(key);
    }
  }
  if (!before.rpg?.rewardTracking) for (const boss of before.studyTools?.bossTests ?? []) {
    if (!boss.gateAttemptId && typeof boss.batchId === 'string' && typeof boss.weekStart === 'string') {
      const key = `official-boss:${JSON.stringify([boss.batchId, boss.weekStart])}`;
      if (!rpg.claimedRewardKeys.includes(key)) rpg.claimedRewardKeys.push(key);
    }
  }
  const observed = newlyRecordedStudyActivities(before, after, ticket.timestamp)
    .filter((activity) => !tracking.processedActivityKeys.includes(`${activity.type}:${activity.id}`));
  for (const activity of observed) tracking.processedActivityKeys.push(`${activity.type}:${activity.id}`);
  let totalXp = Number(after.totalXp) || 0;
  const earned = new Set<string>(after.achievementHistory?.earnedRelicIds ?? []);
  const oldEarned = new Set<string>(before.achievementHistory?.earnedRelicIds ?? []);
  function reward(key: string, kind: string, table: import('@/contexts/rpgTypes').RpgRewardTable,
    source: 'achievement' | 'boss' | 'combo', metadata: Record<string, unknown>) {
    if (rpg.claimedRewardKeys.includes(key) || eventExists(rpg, key)) return;
    rpg.claimedRewardKeys.push(key);
    for (const item of table.items) acquire(rpg, item.itemId, item.quantity, kind, key, ticket.timestamp);
    // Canonical attribution already owns the unlock event for existing badges.
    // This is a distinct reward receipt, not a second unlock notification.
    const canonicalUnlockExists = (after.progressHistory?.systemEvents ?? []).some((event: any) =>
      event.type === 'achievement.unlocked' && event.metadata?.achievementId === metadata.achievementId);
    appendEvent(rpg, kind === 'achievement' && !canonicalUnlockExists ? 'achievement.unlocked' : 'system.notification',
      key, ticket.timestamp, { kind: `${kind}-reward`, ...metadata },
      { rewards: table, ...(table.xp ? { xpDelta: table.xp, xpSource: source } : {}) }, true);
    totalXp += table.xp;
  }
  const questChanges = questChangesBetween(before, after);
  // Require a NEW canonical positive XP receipt, not merely a settings checkbox.
  const oldXpKeys = new Set((before.progressHistory?.xpEvents ?? []).map((e: any) => e.idempotencyKey));
  const newQuestXp = (after.progressHistory?.xpEvents ?? []).filter((e: any) => e.source === 'quest'
    && e.amount > 0 && e.activityDate === after.date && !oldXpKeys.has(e.idempotencyKey));
  for (const quest of questChanges.completed) {
    const table = ORDINARY_QUEST_REWARDS[quest.questId];
    if (quest.date !== after.date || !table || !newQuestXp.some((e: any) =>
      (e.metadata?.questId ?? e.relatedActivityId) === quest.questId)) continue;
    reward(`quest-reward:${quest.date}:${quest.questId}`, 'quest', table, 'achievement',
      { questId: quest.questId, date: quest.date });
  }
  for (const undo of questChanges.reversed) {
    const receipt = rpg.events.find((e) => e.idempotencyKey === `quest-reward:${undo.date}:${undo.questId}`);
    const key = `quest-reward-reversed:${undo.date}:${undo.questId}`;
    if (!receipt || eventExists(rpg, key)) continue;
    for (const item of receipt.rewards?.items ?? []) {
      const stock = rpg.inventory[item.itemId];
      if (!stock) continue;
      stock.quantity = Math.max(0, stock.quantity - item.quantity);
      if (!stock.quantity) delete rpg.inventory[item.itemId];
    }
    appendEvent(rpg, 'system.notification', key, ticket.timestamp,
      { kind: 'quest-reward-reversed', reversalOf: receipt.id, ...undo });
  }
  const combo = getQuestCombo(rpg, String(after.date));
  if (combo.count >= 3) {
    reward(`combo:${after.date}:3`, 'combo', COMBO_REWARD, 'combo',
      { date: after.date, count: combo.count, target: 3, questIds: combo.questIds });
    earned.add('combo-3');
  }
  // Unlike lifetime achievement relics, a daily combo is conditional on its
  // three quest receipts. Undo removes the ORIGINAL supplement, never today's
  // gear-derived value; its durable claim prevents undo/re-complete farming.
  const comboReceipt = rpg.events.find((e) => e.idempotencyKey === `combo:${after.date}:3`);
  const comboUndoKey = `combo-reversed:${after.date}:3`;
  if (combo.count < 3 && comboReceipt && questChanges.reversed.length && !eventExists(rpg, comboUndoKey)) {
    for (const item of comboReceipt.rewards?.items ?? []) {
      const stock = rpg.inventory[item.itemId];
      if (!stock) continue;
      stock.quantity = Math.max(0, stock.quantity - item.quantity);
      if (!stock.quantity) delete rpg.inventory[item.itemId];
    }
    const originalXp = comboReceipt.xpDelta ?? 0;
    totalXp -= originalXp;
    appendEvent(rpg, 'system.notification', comboUndoKey, ticket.timestamp,
      { kind: 'combo-reversed', date: after.date, reversalOf: comboReceipt.id },
      { xpDelta: -originalXp, xpSource: 'combo-reversal' });
  }
  for (const activity of observed) {
    const questions = Number(activity.metadata.questions);
    const correct = Number(activity.metadata.correct);
    if (activity.type === 'calculation.session' && Number.isInteger(questions) && questions >= 10
      && Number.isInteger(correct) && correct >= 0 && correct <= questions && correct / questions >= 0.8) {
      const id = String(activity.metadata.activityId);
      if (!tracking.masteredCalculationIds.includes(id)) tracking.masteredCalculationIds.push(id);
    }
    if (activity.type === 'boss.activity' && !activity.metadata.gateAttemptId
      && activity.metadata.batchId === after.activeBatchId && Number(activity.metadata.total) >= 5
      && eventAccuracy(activity.metadata) >= 80) {
      const boss = (after.studyTools?.bossTests ?? []).find((b: any) => b.id === activity.metadata.activityId);
      // Official identity is batch + week, never a transient ticket or test UUID.
      if (typeof boss?.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(boss.weekStart)) {
        reward(`official-boss:${JSON.stringify([boss.batchId, boss.weekStart])}`, 'boss',
          OFFICIAL_BOSS_REWARD, 'boss', { activityId: boss.id, batchId: boss.batchId, weekStart: boss.weekStart });
      }
    }
  }
  if (tracking.masteredCalculationIds.length >= 10) earned.add('calculation-master');
  const rankSIndex = rankProgressionIndex('rank-s');
  const previousRankIndex = rankProgressionIndex(
    rankDefinitionForProgress(before.totalXp, before.progressHistory).id,
  );
  const rankAscendantCrossed = previousRankIndex < rankSIndex
    && rankProgressionIndex(rankDefinitionForProgress(totalXp, after.progressHistory).id) >= rankSIndex;
  if (rankAscendantCrossed) earned.add('rank-ascendant');
  const oldRpgIds = new Set((before.rpg?.events ?? []).map((e: any) => e.id));
  const newGateClear = rpg.events.some((e) => e.type === 'gate.cleared' && !oldRpgIds.has(e.id));
  if (newGateClear) earned.add('gate-conqueror');
  // Active dates must have fresh study/quest evidence; a seeded streak is not evidence.
  if ((observed.length || newQuestXp.length) && /^\d{4}-\d{2}-\d{2}$/.test(String(after.date))
    && !tracking.observedActiveDates.includes(after.date)) tracking.observedActiveDates.push(after.date);
  const dates = [...tracking.observedActiveDates].sort();
  let run = 0;
  let peak = 0;
  dates.forEach((date, i) => {
    run = i && Date.parse(`${date}T12:00:00Z`) - Date.parse(`${dates[i - 1]}T12:00:00Z`) === 86_400_000
      ? run + 1 : 1;
    peak = Math.max(peak, run);
  });
  if (peak >= 7) earned.add('streak-7');
  if (peak >= 30) earned.add('streak-30');
  // The legacy canonical streak display can include starter defaults. Keep
  // genuinely persisted relics, but a NEW unlock requires observed active days.
  if (peak < 7 && !oldEarned.has('streak-7')) earned.delete('streak-7');
  if (peak < 30 && !oldEarned.has('streak-30')) earned.delete('streak-30');
  const oldSystemIds = new Set((before.progressHistory?.systemEvents ?? []).map((e: any) => e.id));
  const validatedSystemEvents = (after.progressHistory?.systemEvents ?? []).filter((event: any) =>
    oldSystemIds.has(event.id) || event.type !== 'achievement.unlocked'
      || !['streak-7', 'streak-30'].includes(event.metadata?.achievementId)
      || earned.has(event.metadata?.achievementId));
  const eligibleKinds: Record<string, boolean> = {
    'first-lecture': observed.some((e) => e.type === 'lecture.completed'),
    'ten-lectures': observed.some((e) => e.type === 'lecture.completed'),
    'hundred-lectures': observed.some((e) => e.type === 'lecture.completed'),
    practice: observed.some((e) => e.type === 'calculation.session'),
    blackbook: Number(after.blackBookPage) > Number(before.blackBookPage),
    'vocab-master': Number(after.blackBookPage) > Number(before.blackBookPage),
    'ncert-master': observed.some((e) => e.type === 'ncert.session'),
    'first-boss': observed.some((e) => e.type === 'boss.activity'),
    'streak-7': peak >= 7, 'streak-30': peak >= 30,
    'calculation-master': tracking.masteredCalculationIds.length >= 10,
    'rank-ascendant': rankAscendantCrossed,
    'gate-conqueror': newGateClear,
  };
  for (const id of earned) {
    const table = ACHIEVEMENT_REWARDS[id];
    if (!table || tracking.suppressedAchievementIds.includes(id) || !eligibleKinds[id]) continue;
    // Streak capture may have unlocked earlier from legacy streak display; only pay new observed dates.
    if (oldEarned.has(id) && id !== 'streak-7' && id !== 'streak-30') continue;
    reward(`achievement:${id}`, 'achievement', table, 'achievement', { achievementId: id });
  }
  // An achievement payout itself may cross S-Rank. Final attribution still owns
  // the single prior-to-final rank event, so no second canonical capture occurs.
  if (previousRankIndex < rankSIndex
    && rankProgressionIndex(rankDefinitionForProgress(totalXp, after.progressHistory).id) >= rankSIndex
    && !tracking.suppressedAchievementIds.includes('rank-ascendant') && !oldEarned.has('rank-ascendant')) {
    earned.add('rank-ascendant');
    reward('achievement:rank-ascendant', 'achievement', ACHIEVEMENT_REWARDS['rank-ascendant'],
      'achievement', { achievementId: 'rank-ascendant' });
  }
  unlockEligible(rpg, totalXp, ticket.timestamp, after.progressHistory);
  return {
    ...after, totalXp, rpg,
    ...(after.progressHistory ? {
      progressHistory: { ...after.progressHistory, systemEvents: validatedSystemEvents },
    } : {}),
    achievementHistory: {
      ...(after.achievementHistory ?? { highestObservedStreak: 0 }),
      highestObservedStreak: Math.max(Number(after.achievementHistory?.highestObservedStreak) || 0, peak),
      earnedRelicIds: [...earned], observedMasterCalculationIds: [...tracking.masteredCalculationIds],
    },
  } as T;
}

function processQuestBonuses<T extends object>(
  previous: T, next: T, rpg: RpgState, timestamp: string,
  questChanges: ReturnType<typeof questChangesBetween>,
): T {
  const before = previous as any;
  const after = next as any;
  let totalXp = Number(after.totalXp) || 0;
  let changed = false;
  const progressXp = after.progressHistory?.xpEvents ?? [];
  const previousXp = before.progressHistory?.xpEvents ?? [];
  const oldXpKeys = new Set(previousXp.map((event: any) => event.idempotencyKey));
  const newXp = progressXp.filter((event: any) => !oldXpKeys.has(event.idempotencyKey));
  const awards = new Map<string, { questId: string; date: string; amount: number; key: string }>();
  for (const award of newXp.filter((event: any) => event.source === 'quest' && event.amount > 0
    && event.activityDate === after.date)) {
    const questId = String(award.metadata?.questId ?? award.relatedActivityId ?? '');
    const date = String(award.activityDate ?? '');
    if (questId) awards.set(award.idempotencyKey, { questId, date, amount: Number(award.amount), key: award.idempotencyKey });
  }
  for (const quest of questChanges.completed) {
    if (quest.date !== after.date || !Number.isFinite(quest.xp) || quest.xp <= 0) continue;
    const awardCount = previousXp.filter((event: any) => event.source === 'quest'
      && event.activityDate === quest.date && event.relatedActivityId === quest.questId && event.amount > 0).length;
    const key = `quest:${quest.date}:${quest.questId}:award:${awardCount + 1}`;
    if (!awards.has(key)) awards.set(key, { ...quest, amount: quest.xp, key });
  }
  for (const award of awards.values()) {
    const questId = award.questId;
    const date = award.date;
    if (!questId) continue;
    let percent = 0;
    if (questId.toLowerCase().includes('ncert')) percent = rpg.effects.ncertXpPercent;
    else if (questId === 'timed-calculation' || questId.toLowerCase().includes('calculation')) percent = rpg.effects.calculationXpPercent;
    else percent = rpg.effects.questXpPercent;
    percent = Math.min(10, percent);
    const bonus = Math.floor(award.amount * percent / 100);
    const key = `equipment-bonus:${award.key}`;
    if (bonus > 0 && !eventExists(rpg, key)) {
      appendEvent(rpg, 'equipment.bonus', key, timestamp,
        { questId, date, sourceXpIdempotencyKey: award.key, bonusPercent: percent },
        { xpDelta: bonus, xpSource: 'equipment' });
      totalXp += bonus; changed = true;
    }
  }
  const reversals = new Map<string, { questId: string; date: string }>();
  for (const xp of newXp.filter((event: any) => event.source === 'quest-reversal' || event.metadata?.reversal === true)) {
    const questId = String(xp.metadata?.questId ?? '');
    const date = String(xp.activityDate ?? '');
    if (questId) reversals.set(`${date}:${questId}`, { questId, date });
  }
  for (const reversal of questChanges.reversed) reversals.set(`${reversal.date}:${reversal.questId}`, reversal);
  for (const { questId, date } of reversals.values()) {
    const earned = [...rpg.events].reverse().find((event) => event.type === 'equipment.bonus'
      && event.metadata.questId === questId && event.metadata.date === date
      && !rpg.events.some((candidate) => candidate.type === 'equipment.bonus-reversed'
        && candidate.metadata.reversalOf === event.id));
    if (!earned || !earned.xpDelta) continue;
    const key = `equipment-bonus-reversal:${earned.id}`;
    if (eventExists(rpg, key)) continue;
    appendEvent(rpg, 'equipment.bonus-reversed', key, timestamp,
      { questId, date, reversalOf: earned.id },
      { xpDelta: -earned.xpDelta, xpSource: 'equipment-reversal' });
    totalXp -= earned.xpDelta; changed = true;
  }
  return changed ? { ...after, totalXp } as T : next;
}