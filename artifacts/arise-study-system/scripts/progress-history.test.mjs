import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORAGE_KEY, batchPayload, controlledClock, legacyPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

const yesterday = '2026-10-01';
const nextDay = '2026-10-02';
const plain = (value) => JSON.parse(JSON.stringify(value));

const singleLecture = (overrides = {}) => batchPayload({
  batches: [{
    id: 'saved-batch',
    name: 'Saved batch',
    source: 'Saved course',
    startDate: yesterday,
    isActive: true,
    subjects: [{
      id: 'maths',
      name: 'Maths',
      topics: [{
        id: 'saved-topic',
        title: 'Saved topic',
        category: 'ARITHMETIC',
        isArchived: false,
        lectures: [{
          id: 'lecture-210',
          title: 'A real lecture',
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
        }],
      }],
    }],
  }],
  ...overrides,
});

const lectureBatch = (batchId, lectureStatus = 'not-started', xpAwarded = false) => ({
  id: batchId,
  name: `Batch ${batchId}`,
  source: 'Saved course',
  startDate: yesterday,
  isActive: batchId === 'batch-a',
  subjects: [{
    id: 'maths',
    name: 'Maths',
    topics: [{
      id: 'shared-topic',
      title: 'Shared topic',
      category: 'ARITHMETIC',
      isArchived: false,
      lectures: [{
        id: 'shared-lecture',
        title: 'Shared lecture ID',
        link: '',
        status: lectureStatus,
        xpReward: 50,
        sessionCount: lectureStatus === 'completed' ? 1 : 0,
        firstStartedAt: lectureStatus === 'completed' ? `${yesterday}T10:00:00.000Z` : null,
        lastStartedAt: lectureStatus === 'completed' ? `${yesterday}T10:00:00.000Z` : null,
        completedAt: lectureStatus === 'completed' ? `${yesterday}T10:05:00.000Z` : null,
        xpEarnedOn: xpAwarded ? yesterday : null,
        xpAwarded,
        isArchived: false,
      }],
    }],
  }],
});

test('legacy hydration creates empty unknown records and no invented XP or activity', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, legacyPayload()]]);
  const provider = await mountProvider(t, storage);
  const history = provider.current.state.progressHistory;
  assert.equal(history.version, 1);
  assert.equal(history.trackingStartedAt, null);
  assert.equal(history.systemEvents.length, 0);
  assert.equal(history.xpEvents.length, 0);
  assert.equal(history.personalRecords.highestDailyNetXp, null);
  assert.equal(history.personalRecords.longestActiveDayStreak, null);
  assert.equal(history.personalRecords.mostLecturesCompleted, null);
  assert.equal(history.personalRecords.mostNCERTSessions, null);
  assert.equal(history.personalRecords.mostNCERTPages, null);
  assert.deepEqual(plain(history.dailyObservations), {});
  assert.equal(provider.current.state.totalXp, 4321, 'Canonical legacy XP remains unchanged');
});

test('malformed optional history is salvaged and retained without rejecting canonical progress', async (t) => {
  const malformed = {
    version: 1,
    trackingStartedAt: null,
    systemEvents: [{
      id: 'valid-prior',
      type: 'system.notification',
      timestamp: '2026-10-01T10:00:00.000Z',
      idempotencyKey: 'valid-prior',
      metadata: { message: 'preserved valid sibling' },
    }, { id: '', type: 'not-a-real-event' }],
    xpEvents: 'damaged-xp-list',
    personalRecords: { scope: 'incorrect', highestDailyNetXp: 900000 },
    dailyObservations: { 'not-a-date': { active: true } },
  };
  const storage = mockStorage([[STORAGE_KEY, batchPayload({
    progressHistory: malformed,
  })]]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.state.totalXp, 4321);
  const history = provider.current.state.progressHistory;
  assert.deepEqual(plain(history.systemEvents.map((event) => event.id)), ['valid-prior']);
  assert.equal(history.xpEvents.length, 0);
  assert.equal(history.personalRecords.highestDailyNetXp, null);
  assert.equal(JSON.stringify(history.malformedRaw), JSON.stringify(malformed));
  assert.deepEqual(JSON.parse(provider.snapshot()).progressHistory.malformedRaw, malformed);
});

test('one lecture completion records independent exactly-once lecture and quest XP events', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, singleLecture()]]);
  const provider = await mountProvider(t, storage);
  const beforeXp = provider.current.state.totalXp;
  await provider.edit((study) => {
    study.startLecture('maths', 'saved-topic', 'lecture-210');
    study.completeLecture('maths', 'saved-topic', 'lecture-210');
    study.completeLecture('maths', 'saved-topic', 'lecture-210');
  });
  const state = provider.current.state;
  const history = state.progressHistory;
  assert.equal(state.totalXp - beforeXp, 235,
    'The 210 canonical lecture/quest XP and 25 first-lecture achievement XP are separately attributable.');
  assert.deepEqual(plain(
    history.xpEvents.map((event) => [event.amount, event.source]).sort((a, b) => a[1].localeCompare(b[1])),
  ), [[25, 'achievement'], [50, 'lecture'], [160, 'quest']]);
  assert.equal(new Set(history.xpEvents.map((event) => event.idempotencyKey)).size, 3);
  assert.equal(history.systemEvents.filter((event) => event.type === 'lecture.completed').length, 1);
  assert.equal(history.systemEvents.filter((event) => event.type === 'quest.completed'
    && event.metadata.questId === 'maths-lecture').length, 1);
  assert.equal(history.dailyObservations[yesterday].questsCompleted, 1);
  assert.equal(history.dailyObservations[yesterday].lecturesCompleted, 1);
  assert.equal(history.personalRecords.mostLecturesCompleted, 1);
  assert.equal(history.personalRecords.highestDailyNetXp, 235);
});

test('duplicate lecture IDs in separate batches keep completions and XP path-specific', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload({
    activeBatchId: 'batch-a',
    batches: [lectureBatch('batch-a'), lectureBatch('batch-b')],
  })]]);
  const provider = await mountProvider(t, storage);
  const beforeXp = provider.current.state.totalXp;
  await provider.edit((study) => study.completeLecture('maths', 'shared-topic', 'shared-lecture'));
  let state = provider.current.state;
  let history = state.progressHistory;
  assert.equal(state.totalXp, beforeXp + 235,
    'The first lecture retains its 50 XP, one 160 XP quest award, and one 25 XP achievement receipt.');
  assert.equal(history.systemEvents.filter((event) => event.type === 'lecture.completed').length, 1);

  const afterFirstCompletion = plain(history);
  await provider.edit((study) => study.setActiveBatch('batch-b'));
  state = provider.current.state;
  history = state.progressHistory;
  assert.equal(state.activeBatchId, 'batch-b');
  assert.deepEqual(plain(history), afterFirstCompletion,
    'Switching batches with a duplicate lecture ID does not fabricate a transition');

  await provider.edit((study) => study.completeLecture('maths', 'shared-topic', 'shared-lecture'));
  state = provider.current.state;
  history = state.progressHistory;
  const lectureXp = history.xpEvents.filter((event) => event.source === 'lecture');
  assert.equal(state.totalXp, beforeXp + 285);
  assert.deepEqual(plain(lectureXp.map((event) => event.amount)), [50, 50]);
  assert.equal(new Set(lectureXp.map((event) => event.idempotencyKey)).size, 2);
  assert.equal(history.xpEvents.filter((event) => event.source === 'quest').length, 1,
    'Completing both Maths lectures still awards the canonical quest XP only once');
  const completed = history.systemEvents.filter((event) => event.type === 'lecture.completed');
  assert.equal(completed.length, 2);
  assert.deepEqual(new Set(completed.map((event) => event.metadata.batchId)), new Set(['batch-a', 'batch-b']));
  assert.equal(history.personalRecords.trackedLectureCompletions, 2);
  assert.equal(history.personalRecords.mostLecturesCompleted, 2);
  assert.equal(history.dailyObservations[yesterday].lecturesCompleted, 2);
  assert.equal(history.dailyObservations[yesterday].questsCompleted, 1);
});

test('legacy duplicate lecture IDs do not fabricate a completion when switching batches', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload({
    activeBatchId: 'batch-a',
    totalXp: 4321,
    batches: [
      lectureBatch('batch-a', 'completed', true),
      lectureBatch('batch-b'),
    ],
  })]]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.state.progressHistory.xpEvents.length, 0);
  assert.equal(provider.current.state.progressHistory.systemEvents.length, 0);
  await provider.edit((study) => study.setActiveBatch('batch-b'));
  const state = provider.current.state;
  assert.equal(state.totalXp, 4321);
  assert.equal(state.progressHistory.xpEvents.length, 0);
  assert.equal(state.progressHistory.systemEvents.length, 0);
  assert.equal(state.progressHistory.personalRecords.trackedLectureCompletions, 0);
});

test('React updater replay keeps history timestamps and IDs stable', async (t) => {
  const clock = controlledClock(new Date(2026, 9, 1, 15, 20, 0));
  const storage = mockStorage([[STORAGE_KEY, singleLecture()]]);
  const provider = await mountProvider(t, storage, { strictMode: true, clock });
  await provider.edit((study) => study.completeLecture('maths', 'saved-topic', 'lecture-210'));
  const history = provider.current.state.progressHistory;
  const xpEvents = history.xpEvents;
  assert.equal(xpEvents.length, 3);
  assert.equal(new Set(xpEvents.map((event) => event.id)).size, 3);
  assert.ok(xpEvents.every((event) => event.timestamp === new Date(2026, 9, 1, 15, 20, 0).toISOString()));
  assert.equal(history.systemEvents.filter((event) => event.type === 'lecture.completed').length, 1);
});

test('quest checkbox undo/recheck records signed XP history once per toggle cycle and nets daily XP', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage);
  const beforeXp = provider.current.state.totalXp;
  await provider.edit((study) => {
    study.toggleQuest('morning-workout');
    study.toggleQuest('morning-workout');
    study.toggleQuest('morning-workout');
  });
  const history = provider.current.state.progressHistory;
  assert.equal(provider.current.state.totalXp, beforeXp + 80);
  const workoutXp = history.xpEvents.filter((event) => event.relatedActivityId === 'morning-workout');
  assert.deepEqual(plain(workoutXp.map((event) => event.amount)), [80, -80, 80]);
  assert.equal(new Set(workoutXp.map((event) => event.idempotencyKey)).size, 3);
  assert.equal(history.systemEvents.filter((event) => event.type === 'quest.completed'
    && event.metadata.questId === 'morning-workout').length, 1);
  assert.equal(history.dailyObservations[yesterday].netXp, 80);
  assert.equal(history.personalRecords.highestDailyNetXp, 80);
});

test('legacy quest undo keeps its negative ledger without inventing tracked activity or records', async (t) => {
  const completedQuest = {
    id: 'morning-workout',
    title: 'Morning Workout',
    subtitle: 'Wake the body. Start the system.',
    category: 'FOUNDATION',
    xp: 80,
    completed: true,
  };
  const storage = mockStorage([[STORAGE_KEY, batchPayload({
    totalXp: 4321,
    quests: [completedQuest],
  })]]);
  let provider = await mountProvider(t, storage);
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  let state = provider.current.state;
  let history = state.progressHistory;
  assert.equal(state.totalXp, 4241, 'Canonical undo still reverses the legacy reward');
  assert.deepEqual(plain(history.xpEvents.map((event) => event.amount)), [-80]);
  assert.equal(history.dailyObservations[yesterday].netXp, -80);
  assert.equal(history.dailyObservations[yesterday].active, false);
  assert.equal(history.trackingStartedAt, null);
  assert.equal(history.personalRecords.trackedActiveDays, 0);
  assert.equal(history.personalRecords.longestActiveDayStreak, null);
  assert.equal(history.personalRecords.highestDailyNetXp, null);
  assert.equal(Object.hasOwn(history, 'malformedRaw'), false);

  await provider.unmount();
  provider = await mountProvider(t, storage);
  state = provider.current.state;
  history = state.progressHistory;
  assert.equal(state.totalXp, 4241);
  assert.deepEqual(plain(history.xpEvents.map((event) => event.amount)), [-80]);
  assert.equal(history.personalRecords.highestDailyNetXp, null);
  assert.equal(Object.hasOwn(history, 'malformedRaw'), false,
    'A signed legacy reversal remains valid history after reload');

  const recoveryStorage = mockStorage([[STORAGE_KEY, batchPayload({
    totalXp: 4321,
    quests: [{
      ...completedQuest,
      id: `recovery-${yesterday}`,
      title: 'Recovery Quest',
      isRecovery: true,
    }],
  })]]);
  const recoveryProvider = await mountProvider(t, recoveryStorage);
  await recoveryProvider.edit((study) => study.toggleQuest(`recovery-${yesterday}`));
  const recoveryHistory = recoveryProvider.current.state.progressHistory;
  assert.deepEqual(plain(recoveryHistory.xpEvents.map((event) => event.amount)), [-80]);
  assert.equal(recoveryHistory.dailyObservations[yesterday].active, false);
  assert.equal(recoveryHistory.personalRecords.trackedActiveDays, 0);
  assert.equal(recoveryHistory.personalRecords.highestDailyNetXp, null);
});

test('system events and records reload durably with the same storage snapshot', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  let provider = await mountProvider(t, storage);
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  const before = JSON.parse(provider.snapshot()).progressHistory;
  await provider.unmount();
  provider = await mountProvider(t, storage);
  assert.equal(JSON.stringify(provider.current.state.progressHistory), JSON.stringify(before));
  assert.equal(provider.current.state.totalXp, 4321 + 80);
});

test('explicit mission, quest-start, and notification events persist once through the provider API', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  let provider = await mountProvider(t, storage);
  const activities = [
    ['mission.started', 'mission:focus-1:started', { missionId: 'focus-1' }],
    ['mission.completed', 'mission:focus-1:completed', { missionId: 'focus-1' }],
    ['quest.started', 'quest:morning-workout:started', { questId: 'morning-workout', questDate: yesterday }],
    ['system.notification', 'notification:streak-reminder', { message: 'Keep your streak going' }],
  ];
  await provider.edit((study) => {
    for (const [type, key, metadata] of activities) {
      study.recordProgressActivity(type, key, metadata);
      study.recordProgressActivity(type, key, metadata);
    }
  });

  const beforeReload = provider.current.state.progressHistory;
  assert.deepEqual(plain(beforeReload.systemEvents.map((event) => event.type)), activities.map(([type]) => type));
  assert.deepEqual(plain(beforeReload.systemEvents.map((event) => event.idempotencyKey)),
    activities.map(([, key]) => key));
  assert.ok(storage.data.has(STORAGE_KEY), 'Provider persisted the explicit history update');
  assert.deepEqual(JSON.parse(storage.data.get(STORAGE_KEY)).progressHistory, plain(beforeReload));

  await provider.unmount();
  provider = await mountProvider(t, storage);
  assert.deepEqual(plain(provider.current.state.progressHistory), plain(beforeReload));
  for (const [type, key] of activities) {
    assert.equal(provider.current.state.progressHistory.systemEvents.filter(
      (event) => event.type === type && event.idempotencyKey === key,
    ).length, 1);
  }
});

test('real rollover records a started quest as missed using the observed rollover timestamp', async (t) => {
  const clock = controlledClock(new Date(2026, 9, 1, 23, 59, 30));
  const storage = mockStorage([[STORAGE_KEY, singleLecture()]]);
  const provider = await mountProvider(t, storage, { clock });
  await provider.edit((study) => study.startLecture('maths', 'saved-topic', 'lecture-210'));
  clock.setTime(new Date(2026, 9, 2, 0, 0, 30));
  await clock.fireIntervals();
  const missed = provider.current.state.progressHistory.systemEvents
    .filter((event) => event.type === 'quest.missed');
  assert.equal(missed.length, 1);
  assert.equal(missed[0].metadata.questId, 'maths-lecture');
  assert.equal(missed[0].metadata.questDate, yesterday);
  assert.equal(missed[0].timestamp, new Date(2026, 9, 2, 0, 0, 30).toISOString());
  assert.equal(provider.current.state.progressHistory.xpEvents.length, 0);
});

test('day rollover resets completed quests without reversal, then records a fresh positive award', async (t) => {
  const clock = controlledClock(new Date(2026, 9, 1, 23, 59, 30));
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage, { clock });
  const beforeXp = provider.current.state.totalXp;
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  assert.equal(provider.current.state.totalXp, beforeXp + 80);

  clock.setTime(new Date(2026, 9, 2, 0, 0, 30));
  await provider.edit((study) => study.refreshStudyDay());
  let history = provider.current.state.progressHistory;
  assert.equal(provider.current.state.totalXp, beforeXp + 80, 'Refresh preserves canonical total XP');
  assert.deepEqual(plain(history.xpEvents.map((event) => event.amount)), [80],
    'Resetting yesterday’s completed quest does not record an XP reversal');
  assert.equal(history.dailyObservations[nextDay], undefined,
    'Quest reset alone does not mark the new day active');
  assert.equal(history.personalRecords.trackedActiveDays, 1);

  await provider.edit((study) => study.toggleQuest('morning-workout'));
  history = provider.current.state.progressHistory;
  assert.equal(provider.current.state.totalXp, beforeXp + 160);
  assert.deepEqual(plain(history.xpEvents.map((event) => event.amount)), [80, 80]);
  assert.deepEqual(plain(history.xpEvents.map((event) => event.activityDate)), [yesterday, nextDay]);
  assert.equal(history.dailyObservations[yesterday].netXp, 80);
  assert.equal(history.dailyObservations[nextDay].netXp, 80);
  assert.equal(history.personalRecords.trackedActiveDays, 2);
  assert.equal(history.personalRecords.longestActiveDayStreak, 2);
  assert.equal(history.personalRecords.highestDailyNetXp, 80);
});

test('a legacy rollover without previously tracked starts does not fabricate missed quests', async (t) => {
  const clock = controlledClock(new Date(2026, 9, 1, 23, 59, 30));
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage, { clock });
  clock.setTime(new Date(2026, 9, 2, 0, 0, 30));
  await clock.fireIntervals();
  assert.equal(provider.current.state.progressHistory.systemEvents.length, 0);
  assert.equal(provider.current.state.progressHistory.xpEvents.length, 0);
});

test('Boss achievement XP is separately attributed, and NCERT sessions are never converted to pages', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, singleLecture({
    batches: [{
      id: 'saved-batch',
      name: 'Saved batch',
      source: 'Saved course',
      startDate: yesterday,
      isActive: true,
      subjects: [{
        id: 'maths',
        name: 'Maths',
        topics: [{
          id: 'saved-topic',
          title: 'Saved topic',
          category: 'ARITHMETIC',
          isArchived: false,
          lectures: [],
        }],
      }],
    }],
  })]]);
  const provider = await mountProvider(t, storage);
  const xpBefore = provider.current.state.totalXp;
  await provider.edit((study) => study.saveReviewCard({
    batchId: 'saved-batch', subjectId: 'maths', topicTitle: 'Saved topic',
    question: 'What is 2 + 2?', answer: '4',
  }));
  assert.equal(provider.current.state.totalXp, xpBefore);
  assert.equal(provider.current.state.progressHistory.personalRecords.mostNCERTPages, null);
  const savedCard = provider.current.state.studyTools.reviewCards[0];
  await provider.edit((study) => study.saveBossTest({
    batchId: 'saved-batch',
    weekStart: '2026-09-28',
    results: [{
      cardId: savedCard.id, question: '', expectedAnswer: '', answer: '4',
      correct: true, topicTitle: '', subjectId: 'maths',
    }],
    weakTopics: [],
  }));
  assert.equal(provider.current.state.totalXp, xpBefore + 100);
  assert.equal(provider.current.state.progressHistory.personalRecords.bestBossResult.score, 100);
  assert.equal(provider.current.state.progressHistory.personalRecords.bestBossResult.label, 'canonical Boss test score');
  assert.deepEqual(plain(provider.current.state.progressHistory.xpEvents.map((event) => [
    event.amount, event.source,
  ])), [[100, 'achievement']]);

  const beforeSessions = provider.current.state.progressHistory.personalRecords.mostNCERTSessions;
  await provider.edit((study) => study.advanceNcertBookSession('class-1-book-03'));
  const history = provider.current.state.progressHistory;
  assert.equal(history.systemEvents.filter((event) => event.type === 'ncert.session').length, 1);
  assert.equal(history.personalRecords.mostNCERTSessions, (beforeSessions ?? 0) + 1);
  assert.equal(history.personalRecords.mostNCERTPages, null);
});

test('best calculation evidence survives the canonical 20-result UI history cap', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage);
  await provider.edit((study) => {
    for (let index = 1; index <= 21; index += 1) {
      const correct = index === 21 ? 100 : index;
      study.addCalculationSession({
        questions: 100,
        correct,
        accuracy: correct,
        duration: index,
      });
    }
  });
  const state = provider.current.state;
  assert.equal(state.calculationHistory.length, 20);
  assert.equal(state.progressHistory.personalRecords.bestCalculationResult.score, 100);
  assert.equal(state.progressHistory.personalRecords.bestCalculationResult.correct, 100);
  assert.equal(state.progressHistory.systemEvents.filter((event) => event.type === 'calculation.session').length, 21);
});

test('normalization preserves event extensions, dedupes repeated keys, and retains raw null idempotently', async (t) => {
  const rawHistory = {
    version: 1,
    trackingStartedAt: null,
    systemEvents: [{
      id: 'event-with-extension',
      type: 'system.notification',
      timestamp: '2026-10-01T10:00:00.000Z',
      idempotencyKey: 'notification-1',
      metadata: { message: 'future-compatible' },
      futureEventPayload: { schema: 7, source: 'newer-client' },
    }],
    xpEvents: [{
      id: 'xp-first',
      amount: 5,
      source: 'future-source',
      relatedActivityId: null,
      timestamp: '2026-10-01T10:01:00.000Z',
      idempotencyKey: 'duplicate-xp-key',
      activityDate: yesterday,
      metadata: {},
      futureXpPayload: { preserved: true },
    }, {
      id: 'xp-second',
      amount: 9,
      source: 'future-source',
      relatedActivityId: null,
      timestamp: '2026-10-01T10:02:00.000Z',
      idempotencyKey: 'duplicate-xp-key',
      activityDate: yesterday,
      metadata: {},
    }],
    personalRecords: { scope: 'observed-since-tracking-start' },
    dailyObservations: {
      [yesterday]: {
        active: false,
        netXp: 0,
        questsCompleted: 0,
        lecturesCompleted: 0,
        ncertSessions: 0,
        ncertBooksCompleted: 0,
        vocabularyActivities: 0,
        calculationSessions: 0,
        bossSessions: 0,
        studyActivities: 0,
        futureDayPayload: { retain: 'daily-observation-extension' },
      },
    },
    futureHistoryEnvelope: { retain: 'root-extension' },
  };
  rawHistory.personalRecords.futureRecordPayload = { retain: 'personal-record-extension' };
  const storage = mockStorage([[STORAGE_KEY, batchPayload({ progressHistory: rawHistory })]]);
  let provider = await mountProvider(t, storage);
  let history = provider.current.state.progressHistory;
  assert.deepEqual(plain(history.systemEvents[0].futureEventPayload), rawHistory.systemEvents[0].futureEventPayload);
  assert.deepEqual(plain(history.xpEvents.map((event) => event.id)), ['xp-first']);
  assert.deepEqual(plain(history.xpEvents[0].futureXpPayload), { preserved: true });
  assert.deepEqual(plain(history.futureHistoryEnvelope), rawHistory.futureHistoryEnvelope);
  assert.deepEqual(plain(history.personalRecords.futureRecordPayload), rawHistory.personalRecords.futureRecordPayload);
  assert.deepEqual(plain(history.dailyObservations[yesterday].futureDayPayload),
    rawHistory.dailyObservations[yesterday].futureDayPayload);
  assert.deepEqual(plain(history.malformedRaw), rawHistory,
    'Duplicate idempotency keys preserve the original malformed snapshot');

  const nullStorage = mockStorage([[STORAGE_KEY, batchPayload({ progressHistory: null })]]);
  provider = await mountProvider(t, nullStorage);
  assert.equal(provider.current.state.progressHistory.malformedRaw, null);
  const onceNormalized = provider.snapshot();
  await provider.unmount();
  provider = await mountProvider(t, mockStorage([[STORAGE_KEY, onceNormalized]]));
  history = provider.current.state.progressHistory;
  assert.equal(history.malformedRaw, null, 'Repeated normalization must not wrap the original null');
});
