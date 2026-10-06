import type { StudyState } from '@/contexts/StudyContext';
import type { ProgressSystemEvent } from '@/contexts/progressHistorySchema';

export type LogCategory = 'all' | 'quests' | 'xp' | 'levels' | 'ranks' | 'gates' | 'boss' | 'achievements' | 'study';
export type EvidenceLogEntry = {
  id: string;
  category: Exclude<LogCategory, 'all'>;
  type: string;
  timestamp: string;
  date: string;
  dateOnly?: boolean;
  title: string;
  detail: string;
};

export const LOG_FILTERS: readonly LogCategory[] = ['all', 'quests', 'xp', 'levels', 'ranks', 'gates', 'boss', 'achievements', 'study'];
const label = (value: string) => value.replace(/[._-]/g, ' ');
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const dateFor = (event: ProgressSystemEvent) => text(event.metadata.activityDate) || event.timestamp.slice(0, 10);
const categoryFor = (type: string): Exclude<LogCategory, 'all'> => {
  if (type.startsWith('quest.') || type.startsWith('mission.')) return 'quests';
  if (type.startsWith('level.')) return 'levels';
  if (type.startsWith('rank.')) return 'ranks';
  if (type.startsWith('gate.')) return 'gates';
  if (type.startsWith('boss.')) return 'boss';
  if (type.startsWith('achievement.')) return 'achievements';
  return 'study';
};
const details = (metadata: Record<string, unknown>) => {
  // Deliberately do not show answer text, unknown objects or raw metadata.
  const keys = ['questTitle', 'title', 'lectureTitle', 'subjectName', 'topicTitle', 'bookTitle', 'sectionTitle', 'activity', 'questId', 'itemId', 'quantity',
    'achievementId', 'gateId', 'source', 'level', 'previousRank', 'nextRank', 'rank',
    'correct', 'questions', 'total', 'duration', 'xp'];
  const summary = keys.flatMap((key) => {
    const value = text(metadata[key]);
    return value ? [`${label(key)}: ${value}${key === 'duration' ? ' s' : ''}`] : [];
  });
  const rewards = metadata.rewards;
  if (rewards && typeof rewards === 'object') {
    const reward = rewards as { xp?: unknown; items?: unknown };
    if (typeof reward.xp === 'number' && Number.isFinite(reward.xp)) summary.push(`reward: ${reward.xp} base XP`);
    if (Array.isArray(reward.items)) for (const item of reward.items) {
      if (item && typeof item.itemId === 'string' && typeof item.quantity === 'number') summary.push(`${label(item.itemId)} ×${item.quantity}`);
    }
  }
  return summary.join(' · ');
};

/** Read-only projection: XP rows replace xp.awarded mirrors; dated legacy sessions
 * are included once without manufacturing timestamps, rewards or missing history. */
export function buildEvidenceLog(state: StudyState): EvidenceLogEntry[] {
  const rows: EvidenceLogEntry[] = [];
  const keys = new Set<string>();
  const activities = new Set<string>();
  const rpgIds = new Set<string>();
  for (const event of state.progressHistory?.systemEvents ?? []) {
    if (event.type === 'xp.awarded' || keys.has(event.idempotencyKey)) continue;
    keys.add(event.idempotencyKey);
    const activityId = text(event.metadata.activityId);
    if (activityId) activities.add(`${event.type}:${activityId}`);
    if (typeof event.metadata.rpgEventId === 'string') rpgIds.add(event.metadata.rpgEventId);
    rows.push({
      id: `system:${event.id}`, type: event.type, category: categoryFor(event.type),
      timestamp: event.timestamp, date: dateFor(event), title: label(event.type), detail: details(event.metadata),
    });
  }
  for (const event of state.progressHistory?.xpEvents ?? []) {
    rows.push({ id: `xp:${event.id}`, type: 'xp.awarded', category: 'xp',
      timestamp: event.timestamp, date: event.activityDate,
      title: `${event.amount > 0 ? '+' : ''}${event.amount} XP`, detail: label(event.source) });
  }
  for (const event of state.rpg?.events ?? []) {
    if (keys.has(event.idempotencyKey) || keys.has(`rpg-history:${event.idempotencyKey}`) || rpgIds.has(event.id)) continue;
    keys.add(event.idempotencyKey);
    rows.push({ id: `rpg:${event.id}`, type: event.type, category: categoryFor(event.type),
      timestamp: event.timestamp, date: event.timestamp.slice(0, 10),
      title: label(event.type), detail: details(event.metadata) });
  }
  const legacy = (id: string, type: string, date: string, detail: string) => {
    if (activities.has(`${type}:${id}`) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    rows.push({ id: `saved:${type}:${id}`, type, category: categoryFor(type), date,
      timestamp: `${date}T00:00:00`, dateOnly: true, title: label(type), detail: `${detail} · saved session; exact time not tracked` });
  };
  for (const session of state.calculationHistory) {
    legacy(session.id, 'calculation.session', session.date, `${session.correct}/${session.questions} correct · ${session.duration} s`);
  }
  for (const session of state.studyTools.bossTests) {
    legacy(session.id, 'boss.activity', session.date, `${session.results.filter((r) => r.correct).length}/${session.results.length} correct`);
  }
  for (const session of state.studyTools.revisionHistory) {
    if (!activities.has(`study.activity:${session.id}`)) legacy(session.id, 'recovery.activity', session.date, `${session.cardIds.length} cards reviewed`);
  }
  for (const session of state.studyTools.workoutSessions) {
    legacy(session.id, 'study.activity', session.date, `Workout · ${session.duration} s`);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));
}

export function paginateEvidenceLog(rows: EvidenceLogEntry[], filter: LogCategory, page: number, pageSize = 20, from = '', to = '') {
  const filtered = rows.filter((row) => (filter === 'all' || row.category === filter)
    && (!from || row.date >= from) && (!to || row.date <= to));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.max(0, Math.min(Math.floor(page), pages - 1));
  return { rows: filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize), total: filtered.length, pages, page: currentPage };
}

const weekStart = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
};

/** Actual ledger totals, never XP inferred from current level or course completion. */
export function summarizeEvidence(state: StudyState) {
  const week = weekStart(state.date);
  const month = `${state.date.slice(0, 7)}-01`;
  const xpSince = (from: string) => (state.progressHistory?.xpEvents ?? [])
    .filter((event) => event.activityDate >= from && event.activityDate <= state.date)
    .reduce((sum, event) => sum + event.amount, 0);
  const calculations = new Map(state.calculationHistory.map((session) => [session.id, session]));
  // The retained session list is capped by the study system. Include older
  // canonical ledger samples without counting retained sessions a second time.
  for (const event of state.progressHistory?.systemEvents ?? []) {
    if (event.type !== 'calculation.session' || typeof event.metadata.activityId !== 'string'
      || calculations.has(event.metadata.activityId)) continue;
    const { questions, correct, duration } = event.metadata;
    if (typeof questions !== 'number' || typeof correct !== 'number' || typeof duration !== 'number') continue;
    calculations.set(event.metadata.activityId, { id: event.metadata.activityId, date: dateFor(event),
      questions, correct, duration, accuracy: questions > 0 ? correct / questions * 100 : 0 });
  }
  const valid = [...calculations.values()].filter((s) => Number.isInteger(s.questions) && s.questions > 0
    && Number.isInteger(s.correct) && s.correct >= 0 && s.correct <= s.questions);
  const correct = valid.reduce((sum, s) => sum + s.correct, 0);
  const questions = valid.reduce((sum, s) => sum + s.questions, 0);
  // Only calculations currently measure academic duration. Workout is not study time.
  const durations = valid.filter((s) => Number.isFinite(s.duration) && s.duration > 0 && s.duration <= 86400);
  const active = Object.entries(state.progressHistory?.dailyObservations ?? {})
    .filter(([date, record]) => date >= week && date <= state.date && record.active).length;
  const weekDays = Math.round((Date.parse(`${state.date}T12:00:00Z`) - Date.parse(`${week}T12:00:00Z`)) / 86400000) + 1;
  const trackingStartedAt = state.progressHistory?.trackingStartedAt ?? null;
  const startDate = trackingStartedAt ? (() => {
    const date = new Date(trackingStartedAt);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })() : null;
  const observedFrom = startDate && startDate > week ? startDate : week;
  const trackedWeekDays = startDate ? Math.max(0, Math.min(weekDays,
    Math.round((Date.parse(`${state.date}T12:00:00Z`) - Date.parse(`${observedFrom}T12:00:00Z`)) / 86400000) + 1)) : 0;
  const eventCount = (type: string) => new Set((state.progressHistory?.systemEvents ?? [])
    .filter((event) => event.type === type).map((event) => event.idempotencyKey)).size;
  return { weeklyXp: xpSince(week), monthlyXp: xpSince(month), weekStart: week, monthStart: month,
    calculationAccuracy: questions ? correct / questions * 100 : null, correct, questions,
    studySeconds: durations.reduce((sum, s) => sum + s.duration, 0), timedSessions: durations.length,
    activeDaysThisWeek: active, weekDays, trackedWeekDays, trackingStartedAt,
    trackedLectures: eventCount('lecture.completed'), trackedReading: eventCount('ncert.session'),
    trackedVocabulary: eventCount('vocabulary.activity') };
}