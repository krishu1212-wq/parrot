/**
 * Canonical activity evidence from real before/after StudyState records.
 * New rows/count increases only: hydration/imported completed rows are never
 * promoted into RPG progress.
 */
type StudyActivity = {
  id: string;
  type: 'lecture.completed' | 'ncert.session' | 'calculation.session' | 'boss.activity';
  timestamp: string;
  metadata: Record<string, unknown>;
};
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const keyed = (items: any[], key: (item: any) => string) => new Map(items.map((item) => [key(item), item]));

export function newlyRecordedStudyActivities(previous: any, next: any, timestamp: string): StudyActivity[] {
  const activities: StudyActivity[] = [];
  const oldBatches = keyed(list(previous?.batches), (batch) => String(batch?.id));
  for (const batch of list(next?.batches)) {
    const before = oldBatches.get(String(batch?.id));
    if (!before) continue;
    const oldSubjects = keyed(list(before.subjects), (subject) => String(subject?.id));
    for (const subject of list(batch.subjects)) {
      const oldSubject = oldSubjects.get(String(subject?.id));
      if (!oldSubject) continue;
      const oldTopics = keyed(list(oldSubject.topics), (topic) => String(topic?.id));
      for (const topic of list(subject.topics)) {
        const oldTopic = oldTopics.get(String(topic?.id));
        if (!oldTopic) continue;
        const oldLectures = keyed(list(oldTopic.lectures), (lecture) => String(lecture?.id));
        for (const lecture of list(topic.lectures)) {
          const oldLecture = oldLectures.get(String(lecture?.id));
          if (!oldLecture || oldLecture.status === 'completed' || lecture?.status !== 'completed') continue;
          const lectureIdentity = JSON.stringify([batch.id, subject.id, topic.id, String(lecture.id)]);
          activities.push({
            id: `lecture:${encodeURIComponent(lectureIdentity)}:completed`,
            type: 'lecture.completed', timestamp,
            metadata: {
              batchId: batch.id, subjectId: subject.id, subjectName: subject.name,
              topicId: topic.id, lectureId: lecture.id, lectureIdentity,
            },
          });
        }
      }
    }
  }

  const oldBooks = keyed(list(previous?.ncertBooks), (book) => String(book?.id));
  for (const book of list(next?.ncertBooks)) {
    const before = oldBooks.get(String(book?.id));
    if (!before) continue;
    const oldCount = Number(before.completedSessions) || 0;
    const newCount = Number(book.completedSessions) || 0;
    for (let sessionNumber = oldCount + 1; sessionNumber <= newCount; sessionNumber += 1) {
      activities.push({
        id: `ncert:${book.id}:session:${sessionNumber}`,
        type: 'ncert.session', timestamp,
        metadata: { bookId: book.id, bookTitle: book.title, classId: book.classId, sessionNumber },
      });
    }
  }

  const oldCalculations = new Set(list(previous?.calculationHistory).map((session) => String(session?.id)));
  for (const session of list(next?.calculationHistory)) {
    if (oldCalculations.has(String(session?.id))) continue;
    activities.push({
      id: `calculation:${session.id}`, type: 'calculation.session', timestamp,
      metadata: {
        activityId: session.id, questions: session.questions, correct: session.correct,
        accuracy: session.accuracy, duration: session.duration,
      },
    });
  }

  const oldBosses = new Set(list(previous?.studyTools?.bossTests).map((record) => String(record?.id)));
  for (const boss of list(next?.studyTools?.bossTests)) {
    if (oldBosses.has(String(boss?.id))) continue;
    const results = list(boss.results);
    const correct = results.filter((result) => result?.correct === true).length;
    activities.push({
      id: `boss:${boss.id}`, type: 'boss.activity', timestamp,
      metadata: {
        activityId: boss.id, batchId: boss.batchId, correct, total: results.length,
        score: results.length ? correct / results.length * 100 : null,
        gateAttemptId: boss.gateAttemptId,
      },
    });
  }
  return activities;
}

export function questChangesBetween(previous: any, next: any): {
  completed: { questId: string; date: string; xp: number }[];
  reversed: { questId: string; date: string }[];
} {
  const previousDate = String(previous?.date ?? '');
  const date = String(next?.date ?? '');
  const oldQuests = keyed(list(previous?.quests), (quest) => String(quest?.id));
  const completed: { questId: string; date: string; xp: number }[] = [];
  const reversed: { questId: string; date: string }[] = [];
  for (const quest of list(next?.quests)) {
    const questId = String(quest?.id ?? '');
    if (!questId) continue;
    const before = oldQuests.get(questId);
    if (quest.completed === true && (previousDate !== date || before?.completed !== true)) {
      completed.push({ questId, date, xp: Number(quest.xp) });
    } else if (previousDate === date && before?.completed === true && quest.completed === false) {
      reversed.push({ questId, date });
    }
  }
  return { completed, reversed };
}