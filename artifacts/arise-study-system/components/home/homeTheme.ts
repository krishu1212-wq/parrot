export type QuestIdentity = { color: string; glow: string; icon: 'book-open' | 'edit-3' | 'type' | 'activity' | 'rotate-ccw' | 'cpu' | 'layers'; tier: string };

/** Contextual colour from the real quest category / recovery flag; tier is derived from the real XP value. */
export function questIdentity(q: { category: string; title: string; xp: number; isRecovery?: boolean }): QuestIdentity {
  const t = `${q.category} ${q.title}`.toLowerCase();
  const tier = q.xp >= 120 ? 'TIER S' : q.xp >= 80 ? 'TIER A' : q.xp >= 50 ? 'TIER B' : q.xp >= 25 ? 'TIER C' : 'TIER D';
  if (q.isRecovery) return { color: '#FF7A5C', glow: 'rgba(255,90,70,0.28)', icon: 'rotate-ccw', tier };
  if (/ncert|black|vocab|synonym|antonym/.test(t)) return { color: '#D58CFF', glow: 'rgba(190,100,255,0.26)', icon: 'type', tier };
  if (/calc|practice/.test(t)) return { color: '#58B6FF', glow: 'rgba(60,150,255,0.26)', icon: 'cpu', tier };
  if (/workout|ritual/.test(t)) return { color: '#FFB454', glow: 'rgba(255,170,60,0.24)', icon: 'activity', tier };
  if (/reason/.test(t)) return { color: '#9A8CFF', glow: 'rgba(130,110,255,0.26)', icon: 'layers', tier };
  if (/english/.test(t)) return { color: '#4FE3D0', glow: 'rgba(60,220,200,0.24)', icon: 'edit-3', tier };
  return { color: '#58B6FF', glow: 'rgba(60,150,255,0.26)', icon: 'book-open', tier };
}
