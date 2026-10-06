export type LectureStatus = 'not-started' | 'in-progress' | 'completed';

export type StudyLecture = {
  id: string;
  title: string;
  link: string;
  status: LectureStatus;
  xpReward: number;
  sessionCount: number;
  firstStartedAt: string | null;
  lastStartedAt: string | null;
  completedAt: string | null;
  xpEarnedOn: string | null;
  xpAwarded: boolean;
  isArchived: boolean;
  archivedByCount?: boolean;
};

export type StudyTopic = {
  id: string;
  title: string;
  category: string;
  lectures: StudyLecture[];
  isArchived: boolean;
};

export type StudySubject = {
  id: string;
  name: string;
  topics: StudyTopic[];
};

export type StudyBatch = {
  id: string;
  name: string;
  source: string;
  startDate: string;
  createdAt: string;
  isActive: boolean;
  subjects: StudySubject[];
};

export type SubjectProgress = {
  subjectId: string;
  name: string;
  completed: number;
  total: number;
  remaining: number;
  progress: number;
};

export type NextLecture = {
  batchId: string;
  batchName: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
  lecture: StudyLecture;
};

export type LegacyMathsTopic = {
  id: string;
  section: string;
  title: string;
  total: number;
  completed: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const readCount = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

export const createRecordId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const MAX_TOPIC_LECTURES = 1000;

const hasLectureHistory = (lecture: StudyLecture) =>
  lecture.status !== 'not-started' || lecture.sessionCount > 0
  || lecture.xpAwarded || lecture.firstStartedAt !== null
  || lecture.lastStartedAt !== null || lecture.completedAt !== null || lecture.xpEarnedOn !== null;

export const getProtectedLectureCount = (topic: StudyTopic) =>
  topic.lectures.filter((lecture) => !lecture.isArchived && hasLectureHistory(lecture)).length;

export const resizeTopicLectures = (topic: StudyTopic, count: number): StudyTopic => {
  if (!Number.isInteger(count) || count < 0 || count > MAX_TOPIC_LECTURES) {
    throw new Error(`Enter a whole lecture count between 0 and ${MAX_TOPIC_LECTURES}.`);
  }
  if (count < getProtectedLectureCount(topic)) {
    throw new Error('The total cannot remove started or completed lectures.');
  }
  const lectures = topic.lectures.map((lecture) => ({ ...lecture }));
  let total = lectures.filter((lecture) => !lecture.isArchived).length;
  // Reduce only untouched records; completed XP and all session history remain.
  for (let index = lectures.length - 1; total > count && index >= 0; index -= 1) {
    const lecture = lectures[index];
    if (!lecture.isArchived && !hasLectureHistory(lecture)) {
      lecture.isArchived = true;
      lecture.archivedByCount = true;
      total -= 1;
    }
  }
  for (const lecture of lectures) {
    if (total >= count) break;
    if (lecture.isArchived && lecture.archivedByCount && !hasLectureHistory(lecture)) {
      lecture.isArchived = false;
      lecture.archivedByCount = false;
      total += 1;
    }
  }
  while (total < count) {
    lectures.push({
      id: createRecordId('lecture'),
      title: `Lecture ${lectures.length + 1}`,
      link: '',
      status: 'not-started',
      xpReward: 50,
      sessionCount: 0,
      firstStartedAt: null,
      lastStartedAt: null,
      completedAt: null,
      xpEarnedOn: null,
      xpAwarded: false,
      isArchived: false,
    });
    total += 1;
  }
  return { ...topic, lectures };
};

const normalizeStatus = (value: unknown): LectureStatus => {
  if (typeof value !== 'string') return 'not-started';
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'completed') return 'completed';
  if (normalized === 'inprogress') return 'in-progress';
  return 'not-started';
};

const normalizeLecture = (value: unknown, index: number): StudyLecture | null => {
  if (!isRecord(value)) return null;
  const status = normalizeStatus(value.status);
  return {
    ...value,
    id: readString(value.id) || createRecordId('lecture'),
    title: readString(value.title).trim() || `Lecture ${index + 1}`,
    link: readString(value.link),
    status,
    xpReward: readCount(value.xpReward),
    sessionCount: readCount(value.sessionCount),
    firstStartedAt: readString(value.firstStartedAt) || null,
    lastStartedAt: readString(value.lastStartedAt) || null,
    completedAt: readString(value.completedAt) || null,
    xpEarnedOn: readString(value.xpEarnedOn) || null,
    xpAwarded: typeof value.xpAwarded === 'boolean' ? value.xpAwarded : status === 'completed',
    isArchived: value.isArchived === true,
  };
};

const normalizeTopic = (value: unknown): StudyTopic | null => {
  if (!isRecord(value)) return null;
  const lectures = Array.isArray(value.lectures)
    ? value.lectures.map((lecture, index) => normalizeLecture(lecture, index)).filter((lecture): lecture is StudyLecture => lecture !== null)
    : [];
  return {
    ...value,
    id: readString(value.id) || createRecordId('topic'),
    title: readString(value.title).trim() || 'Untitled topic',
    category: readString(value.category),
    lectures,
    isArchived: value.isArchived === true,
  };
};

const normalizeSubject = (value: unknown): StudySubject | null => {
  if (!isRecord(value)) return null;
  const topics = Array.isArray(value.topics)
    ? value.topics.map(normalizeTopic).filter((topic): topic is StudyTopic => topic !== null)
    : [];
  return {
    ...value,
    id: readString(value.id) || createRecordId('subject'),
    name: readString(value.name).trim() || 'Untitled subject',
    topics,
  };
};

const normalizeBatch = (value: unknown): StudyBatch | null => {
  if (!isRecord(value)) return null;
  const subjects = Array.isArray(value.subjects)
    ? value.subjects.map(normalizeSubject).filter((subject): subject is StudySubject => subject !== null)
    : [];
  return {
    ...value,
    id: readString(value.id) || createRecordId('batch'),
    name: readString(value.name).trim() || 'Untitled batch',
    source: readString(value.source),
    startDate: readString(value.startDate),
    createdAt: readString(value.createdAt),
    isActive: value.isActive === true,
    subjects,
  };
};

export const createStudyBatch = (
  name: string,
  source: string,
  startDate: string,
  id = createRecordId('batch'),
): StudyBatch => ({
  id,
  name: name.trim(),
  source: source.trim(),
  startDate: startDate.trim(),
  createdAt: new Date().toISOString(),
  isActive: true,
  subjects: [
    { id: 'maths', name: 'Maths', topics: [] },
    { id: 'english', name: 'English', topics: [] },
    { id: 'reasoning', name: 'Reasoning', topics: [] },
  ],
});

export const createInitialStudyBatch = (legacyTopics: LegacyMathsTopic[]): StudyBatch => {
  const mathsTopics: StudyTopic[] = legacyTopics.map((topic) => {
    const total = readCount(topic.total);
    const completed = Math.min(total, readCount(topic.completed));
    return {
      id: topic.id,
      title: topic.title,
      category: topic.section,
      isArchived: false,
      lectures: Array.from({ length: total }, (_, index) => ({
        id: `${topic.id}-lecture-${index + 1}`,
        title: `Lecture ${index + 1}`,
        link: '',
        status: index < completed ? 'completed' : 'not-started',
        xpReward: 50,
        sessionCount: 0,
        firstStartedAt: null,
        lastStartedAt: null,
        completedAt: null,
        xpEarnedOn: null,
        // Legacy completion already belongs to the old progress record. Migration must not award XP again.
        xpAwarded: index < completed,
        isArchived: false,
      })),
    };
  });

  return {
    id: 'current-batch',
    name: 'Current batch',
    source: '',
    startDate: '',
    createdAt: '',
    isActive: true,
    subjects: [
      { id: 'maths', name: 'Maths', topics: mathsTopics },
      { id: 'english', name: 'English', topics: [] },
      { id: 'reasoning', name: 'Reasoning', topics: [] },
    ],
  };
};

export const normalizeBatchCollection = (
  batchesValue: unknown,
  activeBatchIdValue: unknown,
  legacyMathsTopics: unknown,
  fallbackMathsTopics: LegacyMathsTopic[],
): { batches: StudyBatch[]; activeBatchId: string } => {
  // A damaged existing collection must never be mistaken for a fresh install.
  // The provider retains the original payload and offers a retry on this error.
  if (batchesValue !== undefined) {
    if (!Array.isArray(batchesValue) || batchesValue.length === 0) {
      throw new Error('The saved batch collection is invalid.');
    }
    for (const batch of batchesValue) {
      if (!isRecord(batch) || !Array.isArray(batch.subjects)) throw new Error('Invalid saved batch.');
      for (const subject of batch.subjects) {
        if (!isRecord(subject) || !Array.isArray(subject.topics)) throw new Error('Invalid saved subject.');
        for (const topic of subject.topics) {
          if (!isRecord(topic) || !Array.isArray(topic.lectures)) throw new Error('Invalid saved topic.');
          if (topic.lectures.some((lecture) => !isRecord(lecture))) throw new Error('Invalid saved lecture.');
        }
      }
    }
  }
  if (batchesValue === undefined && legacyMathsTopics !== undefined) {
    if (!Array.isArray(legacyMathsTopics) || legacyMathsTopics.some((topic) =>
      !isRecord(topic) || typeof topic.id !== 'string'
      || typeof topic.total !== 'number' || !Number.isFinite(topic.total)
      || typeof topic.completed !== 'number' || !Number.isFinite(topic.completed))) {
      throw new Error('The saved Maths progress is invalid.');
    }
  }
  const normalizedBatches = Array.isArray(batchesValue)
    ? batchesValue.map(normalizeBatch).filter((batch): batch is StudyBatch => batch !== null)
    : [];

  if (normalizedBatches.length === 0) {
    const topics = Array.isArray(legacyMathsTopics)
      ? legacyMathsTopics.filter((topic): topic is LegacyMathsTopic => isRecord(topic) && typeof topic.id === 'string')
      : fallbackMathsTopics;
    const batch = createInitialStudyBatch(topics);
    return { batches: [batch], activeBatchId: batch.id };
  }

  const requestedId = typeof activeBatchIdValue === 'string' ? activeBatchIdValue : '';
  const activeBatch = normalizedBatches.find((batch) => batch.id === requestedId)
    ?? normalizedBatches.find((batch) => batch.isActive)
    ?? normalizedBatches[0];
  return {
    batches: normalizedBatches.map((batch) => ({ ...batch, isActive: batch.id === activeBatch.id })),
    activeBatchId: activeBatch.id,
  };
};

const summarizeLectures = (lectures: StudyLecture[]) => {
  const total = lectures.length;
  const completed = lectures.filter((lecture) => lecture.status === 'completed').length;
  return {
    completed,
    total,
    remaining: total - completed,
    progress: total === 0 ? 0 : completed / total,
  };
};

export const getTopicProgress = (topic: StudyTopic) =>
  summarizeLectures(topic.lectures.filter((lecture) => !lecture.isArchived));

export const getSubjectProgress = (subject: StudySubject): SubjectProgress => {
  const topics = subject.topics.filter((topic) => !topic.isArchived);
  const lectures = topics.flatMap((topic) => topic.lectures.filter((lecture) => !lecture.isArchived));
  return {
    subjectId: subject.id,
    name: subject.name,
    ...summarizeLectures(lectures),
  };
};

export const getBatchProgress = (batch: StudyBatch): SubjectProgress[] =>
  batch.subjects.map(getSubjectProgress);

export const getNextLecture = (batch: StudyBatch | undefined): NextLecture | null => {
  if (!batch) return null;
  // Resume existing work before suggesting a different untouched lecture.
  for (const status of ['in-progress', 'not-started'] as const) {
    for (const subject of batch.subjects) {
      for (const topic of subject.topics) {
        if (topic.isArchived) continue;
        const lecture = topic.lectures.find((item) => !item.isArchived && item.status === status);
        if (lecture) {
          return {
            batchId: batch.id,
            batchName: batch.name,
            subjectId: subject.id,
            subjectName: subject.name,
            topicId: topic.id,
            topicTitle: topic.title,
            lecture,
          };
        }
      }
    }
  }
  return null;
};

export const getNextLectureForSubject = (batch: StudyBatch, subjectId: string): NextLecture | null =>
  getNextLecture({ ...batch, subjects: batch.subjects.filter((subject) => subject.id === subjectId) });

export const isPhaseOneComplete = (
  maths: { total: number; completed: number },
  ncert: { total: number; completed: number },
) => maths.total > 0 && ncert.total > 0
  && maths.completed >= maths.total && ncert.completed >= ncert.total;