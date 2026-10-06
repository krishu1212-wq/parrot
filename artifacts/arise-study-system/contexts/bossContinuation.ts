import type { BossTestRecord, ReviewCard, RevisionRecord } from './learningTools';

export function getBossRevisionCards(test: BossTestRecord, cards: ReviewCard[]) {
  return test.results.filter((result) => !result.correct && cards.some((card) =>
    card.id === result.cardId && card.batchId === test.batchId && card.subjectId === result.subjectId));
}

export function hasBossRevision(test: BossTestRecord, cardIds: string[], history: RevisionRecord[]) {
  const reviewed = new Set(history.filter((record) =>
    record.batchId === test.batchId && record.date >= test.date).flatMap((record) => record.cardIds));
  return cardIds.length > 0 && cardIds.every((id) => reviewed.has(id));
}