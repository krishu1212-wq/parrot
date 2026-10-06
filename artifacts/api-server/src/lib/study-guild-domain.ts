export const GUILD_TIME_ZONE = "Asia/Kolkata";
export const GUILD_MEMBER_LIMIT = 12;
export const GUILD_MAX_SUBMISSIONS_PER_TOURNAMENT = 3;
export const GUILD_ACHIEVEMENT_KIND = "three-contributors";
export const GUILD_ACHIEVEMENT_TITLE = "Sunday Constellation";

const qualifyingEventTypes = new Set([
  "study.activity",
  "lecture.completed",
  "ncert.session",
  "ncert.book.completed",
  "vocabulary.activity",
  "calculation.session",
  "recovery.activity",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function dateKeyInTimeZone(date: Date, timeZone = GUILD_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addUtcDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getTournamentDate(now = new Date()): string {
  const today = dateKeyInTimeZone(now);
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return addUtcDays(today, (7 - weekday) % 7);
}

export function isTournamentSunday(now = new Date()): boolean {
  return dateKeyInTimeZone(now) === getTournamentDate(now);
}

export function normalizeGuildJoinCode(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return /^ARISE-[A-F0-9]{10}$/.test(normalized) ? normalized : null;
}

export type EligibleGuildStudyEvent = {
  id: string;
  eventType: string;
  eventDate: string;
  occurredAt: string;
};

export function getEligibleGuildStudyEvents(
  state: unknown,
  tournamentDate: string,
): EligibleGuildStudyEvent[] {
  if (!isRecord(state) || !isRecord(state.progressHistory)) return [];
  const events = state.progressHistory.systemEvents;
  if (!Array.isArray(events)) return [];

  const seen = new Set<string>();
  const eligible: EligibleGuildStudyEvent[] = [];
  for (const item of events) {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || item.id.length < 1
      || item.id.length > 240
      || typeof item.type !== "string"
      || !qualifyingEventTypes.has(item.type)
      || typeof item.timestamp !== "string"
      || seen.has(item.id)) continue;
    const timestamp = Date.parse(item.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    const occurredAt = new Date(timestamp).toISOString();
    const eventDate = dateKeyInTimeZone(new Date(timestamp));
    if (eventDate !== tournamentDate) continue;
    seen.add(item.id);
    eligible.push({ id: item.id, eventType: item.type, eventDate, occurredAt });
  }

  return eligible.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 20);
}

export function findEligibleGuildStudyEvent(
  state: unknown,
  eventId: string,
  tournamentDate: string,
): EligibleGuildStudyEvent | null {
  return getEligibleGuildStudyEvents(state, tournamentDate).find((event) => event.id === eventId) ?? null;
}