import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  STORAGE_KEY, assertBlocked, batchPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

const stateOf = (provider) => JSON.parse(provider.snapshot());
const questOf = (provider, id) => stateOf(provider).quests.find((quest) => quest.id === id);

const vocabularySource = readFileSync(new URL('../contexts/vocabularyProgress.ts', import.meta.url), 'utf8');
const vocabularyExports = {};
vm.runInNewContext(ts.transpileModule(vocabularySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: vocabularyExports, Date, Math });
const { prepareVocabularyDailyProgress } = vocabularyExports;

test('Maths lecture XP and daily quest XP are each awarded at most once', async (t) => {
  const first = await mountProvider(t, mockStorage());
  const initialXp = first.current.state.totalXp;
  await first.edit(({ completeLecture }) => completeLecture('maths', 'percentage', 'percentage-lecture-4'));

  assert.equal(first.current.state.totalXp, initialXp + 50 + 160 + 25,
    'First-lecture achievement XP is a separate receipt from canonical lecture and quest XP.');
  assert.equal(first.current.todayXp, 210);
  assert.equal(questOf(first, 'maths-lecture').completed, true);
  const completed = first.current.activeBatch.subjects[0].topics
    .find((topic) => topic.id === 'percentage').lectures.find((lecture) => lecture.id === 'percentage-lecture-4');
  assert.equal(completed.xpReward, 50);
  assert.equal(completed.xpAwarded, true);

  await first.edit(({ completeLecture }) => completeLecture('maths', 'percentage', 'percentage-lecture-4'));
  assert.equal(first.current.state.totalXp, initialXp + 235);
  assert.equal(first.current.todayXp, 210);

  const second = await mountProvider(t, mockStorage());
  const secondInitialXp = second.current.state.totalXp;
  await second.edit(({ completeQuest, completeLecture }) => {
    completeQuest('maths-lecture');
    completeLecture('maths', 'percentage', 'percentage-lecture-4');
  });
  assert.equal(second.current.state.totalXp, secondInitialXp + 160 + 50 + 25);
  assert.equal(second.current.todayXp, 210);
});

test('calculation attempts log valid records but award their quest only once for positive attempts', async (t) => {
  const provider = await mountProvider(t, mockStorage());
  const initialXp = provider.current.state.totalXp;
  const positiveAttempt = { questions: 8, correct: 6, accuracy: 75, duration: 90 };
  await provider.edit(({ addCalculationSession }) => addCalculationSession(positiveAttempt));
  assert.equal(provider.current.state.calculationHistory.length, 1);
  assert.equal(provider.current.state.calculationHistory[0].questions, 8);
  assert.equal(provider.current.state.totalXp, initialXp + 120 + 25,
    'The first qualifying practice award includes its separate achievement receipt.');

  await provider.edit(({ addCalculationSession }) => addCalculationSession(positiveAttempt));
  await provider.edit(({ addCalculationSession }) => addCalculationSession({
    questions: 0, correct: 0, accuracy: 0, duration: 30,
  }));
  await provider.edit(({ addCalculationSession }) => addCalculationSession({
    questions: 2, correct: 3, accuracy: 150, duration: 30,
  }));
  assert.equal(provider.current.state.calculationHistory.length, 3,
    'Repeated positive attempts and valid zero-question attempts are retained; invalid data is rejected.');
  assert.equal(provider.current.state.calculationHistory[0].questions, 0);
  assert.equal(provider.current.state.totalXp, initialXp + 120 + 25);
  assert.equal(questOf(provider, 'timed-calculation').completed, true);
});

test('NCERT reading and vocabulary quests award once while saved shelf aggregates survive reload', async (t) => {
  const storage = mockStorage();
  const provider = await mountProvider(t, storage);
  const book = provider.current.state.ncertBooks.find((item) => item.completedSessions < item.totalSessions);
  const shelfBefore = provider.current.state.ncertShelves.find((item) => item.id === book.classId);
  const xpBefore = provider.current.state.totalXp;

  await provider.edit(({ advanceNcertBookSession }) => advanceNcertBookSession(book.id));
  await provider.edit(({ advanceNcertBookSession }) => advanceNcertBookSession(book.id));
  assert.equal(provider.current.state.totalXp, xpBefore + 100);
  assert.equal(questOf(provider, 'ncert-reading').completed, true);
  assert.equal(provider.current.state.ncertShelves.find((item) => item.id === book.classId).sessions,
    shelfBefore.sessions + 2, 'Both real reading sessions remain in the aggregate.');

  await provider.edit(({ addNcertVocabulary }) => addNcertVocabulary(book.id, 'A saved word'));
  await provider.edit(({ addNcertVocabulary }) => addNcertVocabulary(book.id, ' a SAVED word '));
  assert.equal(provider.current.state.totalXp, xpBefore + 200);
  assert.equal(questOf(provider, 'ncert-vocabulary').completed, true);
  assert.equal(provider.current.state.ncertShelves.find((item) => item.id === book.classId).vocabulary,
    shelfBefore.vocabulary + 1);

  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  const savedShelf = reloaded.current.state.ncertShelves.find((item) => item.id === book.classId);
  assert.equal(savedShelf.sessions, shelfBefore.sessions + 2);
  assert.equal(savedShelf.vocabulary, shelfBefore.vocabulary + 1);
  assert.equal(reloaded.current.state.totalXp, xpBefore + 200);
});

test('Black Book daily pages use canonical order, refresh on a new day, and resist duplicate completion', async (t) => {
  const reversedSections = [
    { id: 'idioms', title: 'Idioms', pages: 4, completed: 1 },
    { id: 'one-word', title: 'One Word', pages: 4, completed: 2 },
  ];
  const nextDay = prepareVocabularyDailyProgress(reversedSections, {
    currentVocabularySectionId: 'idioms',
    currentVocabularyPage: 2,
    vocabularyDailyDate: '2026-09-30',
    vocabularyDailyCompleted: true,
  }, '2026-10-01');
  assert.equal(nextDay.currentVocabularySectionId, 'one-word',
    'The next assignment follows canonical category order rather than saved array order.');
  assert.equal(nextDay.currentVocabularyPage, 3);
  assert.equal(nextDay.vocabularyDailyCompleted, false);

  const provider = await mountProvider(t, mockStorage());
  const sectionId = provider.current.state.currentVocabularySectionId;
  const before = provider.current.state.vocabularySections.find((section) => section.id === sectionId).completed;
  const initialXp = provider.current.state.totalXp;
  await provider.edit(({ completeVocabularyPage }) => completeVocabularyPage(sectionId));
  await provider.edit(({ completeVocabularyPage }) => completeVocabularyPage(sectionId));
  assert.equal(provider.current.state.vocabularySections.find((section) => section.id === sectionId).completed, before + 1);
  assert.equal(provider.current.state.vocabularyDailyCompleted, true);
  assert.equal(provider.current.state.totalXp, initialXp + 100 + 25,
    'The first Black Book completion also grants its achievement receipt.');
  assert.equal(questOf(provider, 'black-book').completed, true);
});

test('NCERT book targets preserve earned sessions and XP, reject completed books, and persist', async (t) => {
  const storage = mockStorage();
  const provider = await mountProvider(t, storage);
  const seedBook = provider.current.state.ncertBooks[0];
  assert.ok(seedBook, 'The seeded NCERT catalog contains books.');
  await provider.edit(({ advanceNcertBookSession }) => {
    for (let session = seedBook.completedSessions; session < seedBook.totalSessions; session += 1) {
      advanceNcertBookSession(seedBook.id);
    }
  });
  const completedBook = provider.current.state.ncertBooks.find((book) => book.completedSessions >= book.totalSessions);
  const activeBook = provider.current.state.ncertBooks.find((book) => book.id !== completedBook?.id
    && book.completedSessions < book.totalSessions);
  assert.ok(completedBook, 'The completed-book guard is exercised with recorded sessions.');
  assert.ok(activeBook, 'Another active NCERT book remains available for the target-change check.');

  await provider.edit(({ advanceNcertBookSession }) => advanceNcertBookSession(activeBook.id));
  const xpAfterSession = provider.current.state.totalXp;
  const sessionCount = provider.current.state.ncertBooks.find((book) => book.id === activeBook.id).completedSessions;
  let accepted;
  await provider.edit(({ updateNcertBookTarget }) => {
    accepted = updateNcertBookTarget(activeBook.id, activeBook.totalSessions + 2);
  });
  assert.equal(accepted, true);
  assert.equal(provider.current.state.totalXp, xpAfterSession);
  assert.equal(provider.current.state.ncertBooks.find((book) => book.id === activeBook.id).completedSessions, sessionCount);

  let completedTargetAccepted;
  await provider.edit(({ updateNcertBookTarget }) => {
    completedTargetAccepted = updateNcertBookTarget(completedBook.id, completedBook.totalSessions + 1);
  });
  assert.equal(completedTargetAccepted, false);

  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  const savedBook = reloaded.current.state.ncertBooks.find((book) => book.id === activeBook.id);
  assert.equal(savedBook.totalSessions, activeBook.totalSessions + 2);
  assert.equal(savedBook.completedSessions, sessionCount);
  assert.equal(reloaded.current.state.totalXp, xpAfterSession);
});

const savedLecture = (id, status = 'not-started') => ({
  id, title: id, link: '', status, xpReward: 50, sessionCount: status === 'completed' ? 1 : 0,
  firstStartedAt: status === 'completed' ? '2026-09-30T08:00:00.000Z' : null,
  lastStartedAt: status === 'completed' ? '2026-09-30T08:00:00.000Z' : null,
  completedAt: status === 'completed' ? '2026-09-30T08:30:00.000Z' : null,
  xpEarnedOn: status === 'completed' ? '2026-10-01' : null,
  xpAwarded: status === 'completed', isArchived: false,
});

test('Phase 2 progress stays locked until Maths and NCERT are fully complete', async (t) => {
  const payload = JSON.parse(batchPayload({
    totalXp: 4321,
    batches: [{
      id: 'saved-batch', name: 'Saved batch', source: '', startDate: '2026-10-01',
      createdAt: '2026-10-01T08:00:00.000Z', isActive: true,
      subjects: [
        { id: 'maths', name: 'Maths', topics: [{
          id: 'math-topic', title: 'Maths topic', category: 'Maths', isArchived: false,
          lectures: [savedLecture('old-maths-completion', 'completed'), savedLecture('last-maths-lecture')],
        }] },
        { id: 'english', name: 'English', topics: [{
          id: 'english-topic', title: 'English topic', category: 'English', isArchived: false,
          lectures: [savedLecture('english-lecture')],
        }] },
        { id: 'reasoning', name: 'Reasoning', topics: [{
          id: 'reasoning-topic', title: 'Reasoning topic', category: 'Reasoning', isArchived: false,
          lectures: [savedLecture('reasoning-lecture')],
        }] },
      ],
    }],
    ncertCatalogVersion: 1,
    ncertShelves: [{ id: 'one-class', classLabel: 'ONE CLASS', bookCount: 1, completed: 0, sessions: 0, vocabulary: 0 }],
    ncertBooks: [{
      id: 'one-book', classId: 'one-class', classLabel: 'ONE CLASS', title: 'One book',
      totalSessions: 1, completedSessions: 0, vocabulary: [],
    }],
  }));
  const storage = mockStorage([[STORAGE_KEY, JSON.stringify(payload)]]);
  const provider = await mountProvider(t, storage);
  const baselineXp = provider.current.state.totalXp;
  const oldCompletion = provider.current.state.batches[0].subjects[0].topics[0].lectures[0];
  assert.equal(provider.current.phaseTwoUnlocked, false);
  assert.equal(provider.current.isSubjectLocked('english'), true);
  assert.equal(provider.current.isSubjectLocked('reasoning'), true);

  let setupTopic;
  await provider.edit(({ addBatchTopic }) => {
    setupTopic = addBatchTopic('english', 'Setup remains available', 'Grammar', 1);
  });
  assert.ok(setupTopic, 'Setup actions remain available before unlock.');
  await provider.edit(({ startLecture, completeLecture }) => {
    startLecture('english', 'english-topic', 'english-lecture');
    completeLecture('english', 'english-topic', 'english-lecture');
    startLecture('reasoning', 'reasoning-topic', 'reasoning-lecture');
    completeLecture('reasoning', 'reasoning-topic', 'reasoning-lecture');
  });
  assert.equal(provider.current.state.totalXp, baselineXp);
  assert.equal(provider.current.state.batches[0].subjects[1].topics[0].lectures[0].status, 'not-started');
  assert.equal(provider.current.state.batches[0].subjects[2].topics[0].lectures[0].status, 'not-started');
  assert.equal(provider.current.state.batches[0].subjects[0].topics[0].lectures[0].xpAwarded, true);
  assert.equal(provider.current.todayXp, 50, 'Previously earned completion XP remains attributed to today.');

  await provider.edit(({ completeLecture, advanceNcertBookSession }) => {
    completeLecture('maths', 'math-topic', 'last-maths-lecture');
    advanceNcertBookSession('one-book');
  });
  assert.equal(provider.current.phaseTwoUnlocked, true);
  assert.equal(provider.current.isSubjectLocked('english'), false);
  assert.equal(provider.current.isSubjectLocked('reasoning'), false);

  await provider.edit(({ startLecture, completeLecture }) => {
    startLecture('english', 'english-topic', 'english-lecture');
    completeLecture('english', 'english-topic', 'english-lecture');
    startLecture('reasoning', 'reasoning-topic', 'reasoning-lecture');
    completeLecture('reasoning', 'reasoning-topic', 'reasoning-lecture');
  });
  assert.equal(provider.current.state.batches[0].subjects[1].topics[0].lectures[0].status, 'completed');
  assert.equal(provider.current.state.batches[0].subjects[2].topics[0].lectures[0].status, 'completed');
  assert.equal(provider.current.state.batches[0].subjects[0].topics[0].lectures[0].xpAwarded, true);
  assert.ok(provider.current.state.totalXp > baselineXp);
});

test('malformed saved quests, vocabulary, calculations, or NCERT data fail closed without writes', async (t) => {
  const damaged = [
    ['quests', [{}]],
    ['quests', [{
      id: 'bad-recovery-flag', title: 'Damaged quest', subtitle: 'Invalid optional recovery flag',
      category: 'RECOVERY', xp: 320, completed: false, isRecovery: 'true',
    }]],
    ['batches', [{ id: '', subjects: [] }]],
    ['vocabularySections', [{ id: 'one-word', title: 'One Word', pages: 10, completed: 11 }]],
    ['calculationHistory', [{ id: 'bad-session', date: '2026-10-01', questions: 1, correct: 2, accuracy: 50, duration: 30 }]],
    ['ncertShelves', [{ id: 'bad-shelf', classLabel: 'Broken', bookCount: 1, completed: 2, sessions: 0, vocabulary: 0 }]],
    ['ncertBooks', [{ id: 'bad-book', classId: 'class-1', title: 'Broken', totalSessions: 1, completedSessions: 2, vocabulary: [] }]],
  ];
  for (const [field, value] of damaged) {
    const original = JSON.stringify({ ...JSON.parse(batchPayload()), [field]: value });
    const storage = mockStorage([[STORAGE_KEY, original]]);
    const provider = await mountProvider(t, storage);
    assertBlocked(provider, storage, original);
    assert.equal(storage.writes.length, 0, `${field} corruption must not trigger a default-state save.`);
  }
});

test('review cards are isolated by batch and only one weekly test is saved per batch', async (t) => {
  const provider = await mountProvider(t, mockStorage());
  const firstBatchId = provider.current.activeBatch.id;
  const cardDetails = {
    batchId: firstBatchId, subjectId: 'maths', topicTitle: 'Fractions',
    question: '  What is 1/2 + 1/2? ', answer: '1',
  };
  await provider.edit(({ saveReviewCard }) => saveReviewCard(cardDetails));
  await provider.edit(({ saveReviewCard }) => saveReviewCard({ ...cardDetails, question: 'What is 1/2 + 1/2?' }));
  assert.equal(provider.current.studyTools.reviewCards.length, 1, 'Normalized duplicate cards are ignored.');

  await provider.edit(({ createBatch }) => createBatch({ name: 'Second batch', source: 'Course', startDate: '2026-10-01' }));
  const secondBatchId = provider.current.activeBatch.id;
  await provider.edit(({ saveReviewCard }) => saveReviewCard({ ...cardDetails, batchId: secondBatchId }));
  assert.equal(provider.current.studyTools.reviewCards.length, 2);
  const [firstCard, secondCard] = provider.current.studyTools.reviewCards;
  const weekStart = '2026-09-28';
  const attempt = (batchId, cardId) => ({
    batchId, date: '2026-10-01', weekStart, weakTopics: [],
    results: [{ cardId, question: '', expectedAnswer: '', answer: 'wrong', correct: false, topicTitle: '', subjectId: '' }],
  });

  await provider.edit(({ saveBossTest }) => saveBossTest(attempt(firstBatchId, firstCard.id)));
  await provider.edit(({ saveBossTest }) => saveBossTest(attempt(firstBatchId, firstCard.id)));
  await provider.edit(({ saveBossTest }) => saveBossTest(attempt(secondBatchId, secondCard.id)));
  assert.equal(provider.current.studyTools.bossTests.length, 2);
  assert.deepEqual(Array.from(provider.current.studyTools.bossTests, (record) => record.batchId).sort(),
    [firstBatchId, secondBatchId].sort());
});

test('workouts and experiments deduplicate daily activity and survive reload', async (t) => {
  const storage = mockStorage();
  const provider = await mountProvider(t, storage);
  const initialXp = provider.current.state.totalXp;
  await provider.edit(({ logWorkout }) => {
    logWorkout(25);
    logWorkout(40);
  });
  assert.equal(provider.current.studyTools.workoutSessions.length, 1);
  assert.equal(provider.current.studyTools.workoutSessions[0].duration, 25);
  assert.equal(provider.current.state.totalXp, initialXp + 80);
  assert.equal(questOf(provider, 'morning-workout').completed, true);

  await provider.edit(({ startExperiment }) => {
    startExperiment('Study before breakfast');
    startExperiment('A second experiment too soon');
  });
  assert.equal(provider.current.studyTools.experiments.length, 1);
  const experimentId = provider.current.studyTools.experiments[0].id;
  await provider.edit(({ checkInExperiment }) => {
    checkInExperiment(experimentId);
    checkInExperiment(experimentId);
  });
  assert.deepEqual(Array.from(provider.current.studyTools.experiments[0].checkIns), ['2026-10-01']);

  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  assert.equal(reloaded.current.studyTools.workoutSessions.length, 1);
  assert.equal(reloaded.current.studyTools.experiments.length, 1);
  assert.deepEqual(Array.from(reloaded.current.studyTools.experiments[0].checkIns), ['2026-10-01']);
  assert.equal(reloaded.current.state.totalXp, initialXp + 80);
});

test('malformed saved lecture statuses, counts, rewards, and duplicate IDs fail closed without writes', async (t) => {
  const lecture = (id = 'lecture-a') => ({
    id, title: id, link: '', status: 'completed', xpReward: 50, sessionCount: 1,
    firstStartedAt: '2026-09-30T08:00:00.000Z', lastStartedAt: '2026-09-30T08:00:00.000Z',
    completedAt: '2026-09-30T08:30:00.000Z', xpEarnedOn: '2026-09-30',
    xpAwarded: true, isArchived: false,
  });
  const malformed = [
    ['status', [lecture('bad-status')].map((item) => ({ ...item, status: 'finished' }))],
    ['count', [{ ...lecture('bad-count'), sessionCount: 1.5 }]],
    ['reward', [{ ...lecture('bad-reward'), xpReward: -1 }]],
    ['IDs', [lecture('duplicate-id'), lecture('duplicate-id')]],
  ];
  for (const [field, lectures] of malformed) {
    const original = JSON.stringify({
      ...JSON.parse(batchPayload()),
      batches: [{
        id: 'saved-batch',
        subjects: [{
          id: 'maths',
          topics: [{ id: 'saved-topic', lectures }],
        }],
      }],
    });
    const storage = mockStorage([[STORAGE_KEY, original]]);
    const provider = await mountProvider(t, storage);
    assertBlocked(provider, storage, original);
    assert.equal(storage.writes.length, 0, `Malformed lecture ${field} must not trigger a default-state save.`);
  }
});

test('legacy lecture status aliases keep existing XP while recovery entitlement carries and awards only on completion', async (t) => {
  const aliasPayload = JSON.parse(batchPayload({
    totalXp: 3210,
    batches: [{
      id: 'saved-batch', name: 'Saved batch', source: '', startDate: '2026-10-01',
      isActive: true,
      subjects: [{
        id: 'maths', name: 'Maths', topics: [{
          id: 'alias-topic', title: 'Alias topic', category: 'Maths', isArchived: false,
          lectures: [
            { ...savedLecture('already-earned', 'completed'), status: 'Completed', xpEarnedOn: '2026-10-01' },
            { ...savedLecture('ongoing', 'in-progress'), status: 'in_progress' },
          ],
        }],
      }],
    }],
  }));
  const aliasProvider = await mountProvider(t, mockStorage([[STORAGE_KEY, JSON.stringify(aliasPayload)]]));
  assert.equal(aliasProvider.current.state.totalXp, 3210);
  const aliasLectures = aliasProvider.current.activeBatch.subjects[0].topics[0].lectures;
  assert.equal(aliasLectures[0].status, 'completed');
  assert.equal(aliasLectures[1].status, 'in-progress');
  await aliasProvider.edit(({ completeLecture }) => completeLecture('maths', 'alias-topic', 'already-earned'));
  assert.equal(aliasProvider.current.state.totalXp, 3210, 'An imported completed alias cannot award its existing XP again.');

  const ordinaryDone = {
    id: 'ordinary-done', title: 'Completed goal', subtitle: 'Done',
    category: 'GENERAL', xp: 80, completed: true,
  };
  const yesterday = (quests) => JSON.stringify({
    ...JSON.parse(batchPayload({
      date: '2026-09-30',
      lastActiveDate: '2026-09-30',
      totalXp: 1234,
      quests,
      recoveryAvailable: true,
      recoveryXp: 320,
    })),
  });
  const carryCases = [
    ['all ordinary goals completed', [ordinaryDone]],
    ['no ordinary quests', []],
    ['redundant offer and one unfinished accepted recovery record', [
      ordinaryDone,
      {
        id: 'recovery-2026-09-30', title: 'Recovery Quest', subtitle: 'Accepted yesterday',
        category: 'RECOVERY', xp: 320, completed: false, isRecovery: true,
      },
    ]],
  ];
  let acceptedProvider;
  for (const [label, quests] of carryCases) {
    const original = yesterday(quests);
    const storage = mockStorage([[STORAGE_KEY, original]]);
    const provider = await mountProvider(t, storage);
    assert.equal(provider.current.state.recoveryAvailable, true, `${label}: keep the pending recovery offer.`);
    assert.equal(provider.current.state.recoveryXp, 320, `${label}: the same 320 XP entitlement carries once.`);
    assert.equal(provider.current.state.totalXp, 1234, `${label}: rollover does not award recovery XP.`);
    if (label.startsWith('redundant')) acceptedProvider = provider;
  }

  const recovery = acceptedProvider;
  assert.ok(recovery, 'The unfinished accepted recovery case hydrated.');
  await recovery.edit(({ acceptRecoveryQuest }) => acceptRecoveryQuest());
  const acceptedQuest = recovery.current.state.quests.find((quest) => quest.id === 'recovery-2026-10-01');
  assert.equal(acceptedQuest.xp, 320);
  assert.equal(acceptedQuest.completed, false);
  assert.equal(recovery.current.state.totalXp, 1234, 'Accepting the offer alone awards no XP.');

  // An accepted recovery quest may be completed on this Thursday; the dedicated
  // Sunday offer flow does not restrict an already-accepted quest to Sunday.
  assert.equal(recovery.current.state.date, '2026-10-01');
  let batchId;
  await recovery.edit(({ createBatch }) => {
    createBatch({ name: 'Recovery review', source: '', startDate: '2026-10-01' });
  });
  batchId = recovery.current.activeBatch.id;
  await recovery.edit(({ saveReviewCard }) => saveReviewCard({
    batchId, subjectId: 'maths', topicTitle: 'Review', question: 'What is 2 + 2?', answer: '4',
  }));
  const cardId = recovery.current.studyTools.reviewCards[0].id;
  assert.equal(recovery.current.state.totalXp, 1234, 'Saving a real review card does not award recovery XP.');
  await recovery.edit(({ logRevision }) => logRevision([cardId], batchId));
  assert.equal(recovery.current.state.totalXp, 1554);
  assert.equal(recovery.current.state.quests.find((quest) => quest.id === 'recovery-2026-10-01').completed, true);
  await recovery.edit(({ logRevision }) => logRevision([cardId], batchId));
  assert.equal(recovery.current.state.totalXp, 1554, 'Repeating revision cannot award the accepted recovery quest twice.');
});

test('revision awards the Maths goal only for the selected completed Maths batch', async (t) => {
  const oldMathsLecture = {
    ...savedLecture('historic-maths-lecture', 'completed'),
    xpEarnedOn: '2026-09-30',
  };
  const oldBatch = {
    id: 'old-completed-batch', name: 'Old completed Maths', source: '', startDate: '2026-09-01',
    createdAt: '2026-09-01T08:00:00.000Z', isActive: true,
    subjects: [
      { id: 'maths', name: 'Maths', topics: [{
        id: 'old-maths-topic', title: 'Completed Maths', category: 'Maths', isArchived: false,
        lectures: [oldMathsLecture],
      }] },
      { id: 'english', name: 'English', topics: [{
        id: 'unfinished-english-topic', title: 'Unfinished English', category: 'English', isArchived: false,
        lectures: [savedLecture('unfinished-english-lecture')],
      }] },
      { id: 'reasoning', name: 'Reasoning', topics: [] },
    ],
  };
  const newBatch = {
    id: 'new-selected-batch', name: 'New selected course', source: '', startDate: '2026-10-01',
    createdAt: '2026-10-01T08:00:00.000Z', isActive: false,
    subjects: [
      { id: 'maths', name: 'Maths', topics: [{
        id: 'new-maths-topic', title: 'Unfinished Maths', category: 'Maths', isArchived: false,
        lectures: [savedLecture('new-maths-lecture')],
      }] },
      { id: 'english', name: 'English', topics: [] },
      { id: 'reasoning', name: 'Reasoning', topics: [] },
    ],
  };
  const payload = batchPayload({
    totalXp: 4321,
    activeBatchId: oldBatch.id,
    batches: [oldBatch, newBatch],
  });
  const provider = await mountProvider(t, mockStorage([[STORAGE_KEY, payload]]));
  const initialXp = provider.current.state.totalXp;
  const initialLecture = JSON.stringify(provider.current.state.batches[0].subjects[0].topics[0].lectures[0]);
  assert.equal(provider.current.phaseTwoUnlocked, false);
  assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture').completed, false);

  await provider.edit(({ saveReviewCard }) => {
    saveReviewCard({
      batchId: oldBatch.id, subjectId: 'english', topicTitle: 'Unfinished English',
      question: 'English review question', answer: 'English answer',
    });
    saveReviewCard({
      batchId: oldBatch.id, subjectId: 'maths', topicTitle: 'Completed Maths',
      question: 'Maths review question', answer: 'Maths answer',
    });
  });
  const englishCardId = provider.current.studyTools.reviewCards.find((card) => card.subjectId === 'english').id;
  const mathsCardId = provider.current.studyTools.reviewCards.find((card) => card.subjectId === 'maths').id;

  await provider.edit(({ logRevision }) => logRevision([englishCardId], oldBatch.id));
  assert.equal(provider.current.state.totalXp, initialXp);
  assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture').completed, false,
    'An English-only revision cannot satisfy the Maths goal.');

  await provider.edit(({ logRevision }) => logRevision([mathsCardId], oldBatch.id));
  assert.equal(provider.current.state.totalXp, initialXp + 160);
  assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture').completed, true);
  assert.equal(JSON.stringify(provider.current.state.batches[0].subjects[0].topics[0].lectures[0]), initialLecture,
    'Revision leaves lecture progress, earned XP metadata, and history unchanged.');
  await provider.edit(({ logRevision }) => logRevision([mathsCardId], oldBatch.id));
  assert.equal(provider.current.state.totalXp, initialXp + 160, 'Repeated revision cannot award the daily Maths goal twice.');
  assert.equal(JSON.stringify(provider.current.state.batches[0].subjects[0].topics[0].lectures[0]), initialLecture);

  await provider.edit(({ toggleQuest }) => toggleQuest('maths-lecture'));
  assert.equal(provider.current.state.totalXp, initialXp, 'Undo removes only the self-reported Maths quest XP.');
  assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture').completed, false);
  await provider.edit(({ setActiveBatch }) => setActiveBatch(newBatch.id));
  await provider.edit(({ logRevision }) => logRevision([mathsCardId], oldBatch.id));
  assert.equal(provider.current.state.totalXp, initialXp);
  assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture').completed, false,
    'A completed old batch cannot satisfy the daily Maths goal after a different batch is selected.');
});