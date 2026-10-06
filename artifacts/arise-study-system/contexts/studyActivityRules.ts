type DailyState = {
  date: string;
  lastActiveDate: string;
  streak: number;
  totalXp: number;
  quests: { id: string; xp: number; completed: boolean }[];
};

export function completeQuestInState<T extends DailyState>(current: T, questId: string): T {
  const quest = current.quests.find((item) => item.id === questId);
  if (!quest || quest.completed) return current;
  const alreadyActive = current.quests.some((item) => item.completed);
  const gap = Math.round((new Date(`${current.date}T12:00:00`).getTime()
    - new Date(`${current.lastActiveDate}T12:00:00`).getTime()) / 86400000);
  return {
    ...current,
    quests: current.quests.map((item) => item.id === questId ? { ...item, completed: true } : item),
    totalXp: current.totalXp + quest.xp,
    lastActiveDate: current.date,
    streak: alreadyActive ? current.streak : gap === 1 ? current.streak + 1 : current.streak || 1,
  };
}

export const isPhaseTwoSubject = (subject: { id: string; name: string }) =>
  ['english', 'reasoning'].includes(subject.id)
  || /^(english|reasoning)\b/i.test(subject.name.trim());