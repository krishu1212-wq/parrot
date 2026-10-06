/** Presentation-only policy: never owns XP, rewards, or domain persistence. */
export type SystemSound = 'xp' | 'quest' | 'level' | 'rank' | 'unlock' | 'streak' | 'boss' | 'achievement' | 'notification' | 'reward';
export const SOUND_PREFERENCE_KEY = 'arise.system-sound.v1';
export const ACTIVATION_COMPLETE_KEY = 'arise.system-activation.v1';
export type SoundPreference = { enabled: boolean; volume: number };
export const DEFAULT_SOUND: SoundPreference = { enabled: false, volume: 0.5 };
export function normalizeSoundPreference(raw: unknown): SoundPreference {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SOUND };
  const value = raw as Partial<SoundPreference>;
  return {
    enabled: value.enabled === true,
    volume: typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume)) : DEFAULT_SOUND.volume,
  };
}
export type SoundEvent = {
  id: string; type: string; timestamp: string; metadata?: Record<string, unknown>;
};
/** Mirrored RPG receipts must retain one presentation identity across both ledgers. */
export function canonicalSoundEvents(canonical: SoundEvent[], rpg: SoundEvent[]): SoundEvent[] {
  const mirrored = new Set(canonical.map((event) => event.metadata?.rpgEventId));
  return [
    ...canonical.map((event) => typeof event.metadata?.rpgEventId === 'string'
      ? { ...event, id: `rpg:${event.metadata.rpgEventId}` } : event),
    ...rpg.filter((event) => !mirrored.has(event.id)).map((event) => ({ ...event, id: `rpg:${event.id}` })),
  ];
}
export function soundForEvent(event: SoundEvent): SystemSound | null {
  switch (event.type) {
    case 'xp.awarded': return typeof event.metadata?.amount === 'number' && event.metadata.amount > 0 ? 'xp' : null;
    case 'quest.completed': case 'mission.completed': return 'quest';
    case 'level.up': return 'level';
    case 'rank.changed': return 'rank';
    case 'phase.unlocked': case 'gate.unlocked': return 'unlock';
    case 'gate.entered': case 'gate.cleared': case 'boss.activity': return 'boss';
    case 'achievement.unlocked': return 'achievement';
    case 'chest.opened': case 'item.acquired': return 'reward';
    case 'system.notification':
      return event.metadata?.kind === 'streak' ? 'streak' : 'notification';
    case 'quest.started': case 'equipment.equipped': case 'equipment.unequipped': return 'notification';
    default: return null;
  }
}
const priority: SystemSound[] = ['rank', 'level', 'achievement', 'reward', 'boss', 'unlock', 'quest', 'streak', 'notification', 'xp'];
/** Coalesce one domain action's receipts; rank-up wins over its accompanying XP. */
export function chooseSound(events: SoundEvent[]): SystemSound | null {
  const sounds = new Set(events.map(soundForEvent).filter(Boolean));
  return priority.find((sound) => sounds.has(sound)) ?? null;
}
export class FreshSystemEventCursor {
  private owner: string | null = null;
  private ids = new Set<string>();
  private since = 0;
  reset() { this.owner = null; this.ids.clear(); }
  observe(owner: string, events: SoundEvent[], now: number): SoundEvent[] {
    if (this.owner !== owner) {
      this.owner = owner;
      this.ids = new Set(events.map((event) => event.id));
      this.since = now;
      return [];
    }
    const fresh = events.filter((event) => !this.ids.has(event.id));
    for (const event of events) this.ids.add(event.id);
    // Baseline every mounted owner, reject imported/old receipts and stale resume events.
    return fresh.filter((event) => {
      const timestamp = Date.parse(event.timestamp);
      return Number.isFinite(timestamp) && timestamp >= this.since && timestamp <= now + 1000
        && now - timestamp < 5000;
    });
  }
}