export type CalculationAnswer = { prompt: string; expectedAnswer: number; answer: number; correct: boolean; elapsedSeconds: number };

// Legacy aggregates intentionally stay aggregates; never reconstruct their questions.
export function validateCalculationAnswers(value: unknown, questions: number, correct: number, duration: number): CalculationAnswer[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== questions) throw new Error('Calculation question evidence does not match attempted count.');
  let elapsed = 0;
  let score = 0;
  const answers = value.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.prompt !== 'string' || !item.prompt.trim()
      || ![item.expectedAnswer, item.answer, item.elapsedSeconds].every((n) => typeof n === 'number' && Number.isFinite(n))
      || item.elapsedSeconds < 0 || typeof item.correct !== 'boolean'
      || item.correct !== (item.answer === item.expectedAnswer)) throw new Error('Calculation answer evidence is invalid.');
    elapsed += item.elapsedSeconds;
    score += Number(item.correct);
    return { prompt: item.prompt, expectedAnswer: item.expectedAnswer, answer: item.answer, correct: item.correct, elapsedSeconds: item.elapsedSeconds };
  });
  if (score !== correct || elapsed > duration + 0.01) throw new Error('Calculation question evidence does not match score or duration.');
  return answers;
}

export function calculationTrend(sessions: { questions: number; duration: number; accuracy: number }[]) {
  const usable = sessions.filter((s) => s.questions > 0 && s.duration > 0);
  const recent = usable.slice(0, 5);
  const earlier = usable.slice(5, 10);
  const average = (rows: typeof sessions) => rows.reduce((sum, s) => sum + s.accuracy, 0) / rows.length;
  return { speed: recent.length ? recent.reduce((sum, s) => sum + s.questions, 0) * 60 / recent.reduce((sum, s) => sum + s.duration, 0) : null, accuracyChange: earlier.length ? average(recent) - average(earlier) : null, recentCount: recent.length, earlierCount: earlier.length };
}