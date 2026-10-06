import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mobileRoot = fileURLToPath(new URL('..', import.meta.url));
const contextsRoot = join(mobileRoot, 'contexts');
const servicesRoot = join(mobileRoot, 'services');

function createLoader({ storage, appState } = {}) {
  const modules = new Map();
  const nativeAppState = appState ?? {
    currentState: 'active',
    listeners: new Set(),
    addEventListener(_name, listener) {
      this.listeners.add(listener);
      return { remove: () => this.listeners.delete(listener) };
    },
  };
  const asyncStorage = storage ?? {
    async getItem() { return null; },
    async setItem() {},
    async removeItem() {},
  };
  const native = {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    AppState: nativeAppState,
  };
  const mocks = new Map([
    ['react', React],
    ['react-native', native],
    ['@react-native-async-storage/async-storage', asyncStorage],
    ['expo-haptics', {
      impactAsync: async () => {},
      notificationAsync: async () => {},
      ImpactFeedbackStyle: { Light: 'light', Soft: 'soft', Medium: 'medium' },
      NotificationFeedbackType: { Success: 'success' },
    }],
    ['@/hooks/useColors', {
      useColors: () => ({
        background: '#000',
        foreground: '#fff',
        mutedForeground: '#aaa',
        primary: '#0ff',
        primaryForeground: '#000',
        card: '#111',
        accent: '#f0f',
      }),
    }],
  ]);

  function load(request) {
    if (mocks.has(request)) return mocks.get(request);
    if (modules.has(request)) return modules.get(request);
    if (request === '@/contexts/questionBank') {
      const questionBankStub = {
        getPublishedQuestion: () => undefined,
        getPublishedQuestionBank: () => undefined,
      };
      modules.set(request, questionBankStub);
      return questionBankStub;
    }
    const isPersistenceService = request === '@/services/accountStudyVaultPersistence';
    assert.ok(
      request.startsWith('@/contexts/') || isPersistenceService,
      `Unexpected module dependency: ${request}`,
    );
    const name = isPersistenceService
      ? 'accountStudyVaultPersistence'
      : request.slice('@/contexts/'.length);
    const extension = name === 'StudyContext' || name === 'MissionContext' ? 'tsx' : 'ts';
    const path = join(
      isPersistenceService ? servicesRoot : contextsRoot,
      `${name}.${extension}`,
    );
    const source = readFileSync(path, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    });
    const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
    const exports = {};
    modules.set(request, exports);
    vm.runInNewContext(compiled.outputText, {
      exports,
      require: load,
      Date,
      Math,
      Promise,
      setInterval,
      clearInterval,
      console,
    }, { filename: path });
    return exports;
  }

  return { load, appState: nativeAppState };
}

function makeLecture(id, status = 'not-started') {
  return {
    id,
    title: id,
    link: '',
    status,
    xpReward: 25,
    sessionCount: status === 'in-progress' ? 1 : 0,
    firstStartedAt: null,
    lastStartedAt: null,
    completedAt: status === 'completed' ? '2026-10-01T10:00:00.000Z' : null,
    xpEarnedOn: null,
    xpAwarded: status === 'completed',
    isArchived: false,
  };
}

function makeTopic(id, title, lectures = [makeLecture(`${id}-lecture`)]) {
  return { id, title, category: '', lectures, isArchived: false };
}

function makeBatch(id, subjects = []) {
  return {
    id,
    name: `${id} batch`,
    source: 'real saved source',
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    subjects,
  };
}

function baseState(batches, activeBatchId = batches[0]?.id ?? '') {
  return {
    date: '2026-10-01',
    lastActiveDate: '2026-10-01',
    streak: 7,
    totalXp: 2400,
    quests: [],
    recoveryAvailable: false,
    recoveryXp: 0,
    ncertCompleted: 1,
    ncertTotal: 3,
    blackBookPage: 2,
    blackBookTotal: 5,
    batches,
    activeBatchId,
    ncertShelves: [],
    ncertBooks: [],
    ncertCatalogVersion: 1,
    vocabularySections: [],
    currentVocabularySectionId: '',
    currentVocabularyPage: 0,
    vocabularyDailyDate: '2026-10-01',
    vocabularyDailyCompleted: false,
    calculationHistory: [],
    studyTools: {
      reviewCards: [],
      bossTests: [],
      workoutSessions: [],
      revisionHistory: [],
      experiments: [],
      windDownHour: 21,
    },
  };
}

function makeStudyView(state, {
  phaseTwoUnlocked = false,
  quests = state.quests,
} = {}) {
  const batch = state.batches.find((item) => item.id === state.activeBatchId) ?? state.batches[0];
  const activeBatchProgress = batch ? getBatchProgress(batch) : [];
  const maths = activeBatchProgress.find((item) => item.subjectId === 'maths')
    ?? activeBatchProgress.find((item) => item.name.toLowerCase() === 'maths');
  const phaseSubject = (subject) => ['english', 'reasoning'].includes(subject.id)
    || /^(english|reasoning)\b/i.test(subject.name.trim());
  const nextLecture = batch ? getNextLecture({
    ...batch,
    subjects: batch.subjects.filter((subject) => phaseTwoUnlocked || !phaseSubject(subject)),
  }) : null;
  return {
    state: { ...state, quests },
    activeBatch: batch,
    activeBatchProgress,
    nextLecture,
    phaseTwoUnlocked,
    todayXp: 180,
    level: 3,
    rank: 'E-RANK',
    isSubjectLocked: (subjectId) => {
      const subject = batch?.subjects.find((item) => item.id === subjectId);
      return !!subject && phaseSubject(subject) && !phaseTwoUnlocked;
    },
  };
}

const { load: loadPure } = createLoader();
const masterProgress = loadPure('@/contexts/masterProgress');
const { getBatchProgress, getNextLecture } = loadPure('@/contexts/batchSystem');

test('Boss weakness findings stay scoped to real batch, subject, custom topic title, and result cards', () => {
  const batch = makeBatch('batch-current', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('topic-fractions', 'Fractions')],
  }]);
  const state = baseState([batch]);
  state.studyTools.bossTests = [{
    id: 'boss-1',
    batchId: batch.id,
    date: '2026-10-01',
    weekStart: '2026-09-28',
    weakTopics: [],
    results: [
      { cardId: 'card-1', subjectId: 'maths', topicTitle: 'Fractions', correct: false },
      { cardId: 'card-2', subjectId: 'maths', topicTitle: 'Fractions', correct: true },
      { cardId: 'card-custom', subjectId: 'maths', topicTitle: 'Coach supplied custom label', correct: false },
    ],
  }];
  state.calculationHistory = [{
    id: 'calc-1', date: state.date, questions: 10, correct: 8, accuracy: 80, duration: 90,
  }];
  const radar = masterProgress.deriveWeaknessRadar(state);
  const custom = radar.findings.find((finding) => finding.topicTitle === 'Coach supplied custom label');
  const matched = radar.findings.find((finding) => finding.topicTitle === 'Fractions');

  assert.equal(radar.status, 'available');
  assert.equal(custom.batchId, batch.id);
  assert.equal(custom.subjectId, 'maths');
  assert.equal(custom.topicId, null, 'custom Boss topic remains visible without a fabricated lecture-topic id');
  assert.deepEqual([...custom.evidenceCards].map((item) => item.cardId), ['card-custom']);
  assert.equal(custom.accuracy.source, 'boss-results');
  assert.equal(custom.accuracy.numerator, 0);
  assert.equal(custom.accuracy.denominator, 1);
  assert.equal(matched.topicId, 'topic-fractions');
  assert.equal(matched.accuracy.numerator, 1);
  assert.equal(matched.accuracy.denominator, 2);
  assert.equal(custom.recommendations.some((item) => item.kind === 'lecture'), false);
  assert.equal(custom.recommendations.find((item) => item.kind === 'practice').scope, 'general');
  assert.equal(radar.calculationHistoryAccuracy.source, 'calculation-history');
  assert.equal(radar.calculationHistoryAccuracy.numerator, 8);
  assert.equal(radar.calculationHistoryAccuracy.denominator, 10);
});

test('calculation history alone is aggregate accuracy, not topic evidence', () => {
  const state = baseState([makeBatch('empty', [])]);
  state.calculationHistory = [
    { id: 'one', date: state.date, questions: 3, correct: 2, accuracy: 67, duration: 45 },
    { id: 'zero', date: state.date, questions: 0, correct: 0, accuracy: 0, duration: 0 },
  ];

  const radar = masterProgress.deriveWeaknessRadar(state);
  assert.equal(radar.status, 'insufficient-data');
  assert.equal(radar.insufficientData, true);
  assert.equal(radar.reason, 'no-boss-results');
  assert.equal(radar.findings.length, 0);
  assert.equal(radar.calculationHistoryAccuracy.numerator, 2);
  assert.equal(radar.calculationHistoryAccuracy.denominator, 3);
});

test('old-batch Boss findings never recommend a new batch topic with the same title', () => {
  const oldBatch = makeBatch('old-batch', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('old-topic', 'Same title')],
  }]);
  const activeBatch = makeBatch('new-batch', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('new-topic', 'Same title')],
  }]);
  const state = baseState([oldBatch, activeBatch], activeBatch.id);
  state.studyTools.bossTests = [{
    id: 'old-test',
    batchId: oldBatch.id,
    date: state.date,
    weekStart: '2026-09-28',
    weakTopics: [],
    results: [{ cardId: 'old-card', subjectId: 'maths', topicTitle: 'Same title', correct: false }],
  }];

  const finding = masterProgress.deriveWeaknessRadar(state).findings[0];
  assert.equal(finding.batchId, oldBatch.id);
  assert.equal(finding.topicId, 'old-topic');
  assert.equal(finding.isActiveBatch, false);
  assert.equal(finding.recommendations.length, 0);
});

test('journey uses current batch progress and the existing Phase 2 gate', () => {
  const maths = {
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('first', 'First', [makeLecture('done', 'completed')]), makeTopic('second', 'Second')],
  };
  const english = { id: 'english', name: 'English', topics: [makeTopic('eng-topic', 'English topic')] };
  const batch = makeBatch('journey-batch', [maths, english]);
  const state = baseState([batch]);
  state.quests = [{ id: 'daily', title: 'Daily', subtitle: '', category: '', xp: 10, completed: true }];
  const view = makeStudyView(state, { phaseTwoUnlocked: false });
  const journey = masterProgress.deriveJourney(view);
  const mathsStage = journey.find((stage) => stage.id === 'maths');
  const phaseTwo = journey.find((stage) => stage.id === 'phase-two');
  const englishStage = journey.find((stage) => stage.id === 'english');

  assert.equal(mathsStage.progress.completed, 1);
  assert.equal(mathsStage.progress.total, 2);
  assert.equal(mathsStage.progressPercent, 50);
  assert.equal(phaseTwo.status, 'locked');
  assert.equal(phaseTwo.progressPercent, 0);
  assert.equal(englishStage.status, 'locked');
});

test('daily mission priority keeps unfinished Home quests ahead of lecture suggestions', () => {
  const batch = makeBatch('active', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('percent', 'Percentage')],
  }]);
  const state = baseState([batch]);
  const quest = {
    id: 'morning-workout',
    title: 'Morning Workout',
    subtitle: 'Wake the body.',
    category: 'FOUNDATION',
    xp: 80,
    completed: false,
  };
  const view = makeStudyView(state, { quests: [quest] });
  const mission = masterProgress.getNextMission(view);
  const briefing = masterProgress.buildDailyBriefing(view);

  assert.equal(mission.source, 'daily-quest');
  assert.equal(mission.target.questId, quest.id);
  assert.deepEqual(briefing.pendingQuestIds, [quest.id]);
  assert.equal(briefing.priorityOrder[0], quest.id);
  assert.equal(briefing.estimatedStudyTime.status, 'available');
  assert.equal(briefing.estimatedStudyTime.minutes, 5);
  assert.equal(briefing.estimatedStudyTime.estimateSource, 'planning-budget');
  assert.match(briefing.estimatedStudyTime.disclaimer, /not recorded performance/);
});

test('daily time estimates use valid saved durations and only count unfinished quests', () => {
  const batch = makeBatch('estimate-batch', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('topic', 'Topic')],
  }]);
  const state = baseState([batch]);
  state.quests = [
    { id: 'morning-workout', title: 'Workout', subtitle: '', category: '', xp: 10, completed: false },
    { id: 'timed-calculation', title: 'Practice', subtitle: '', category: '', xp: 10, completed: false },
    { id: 'black-book', title: 'Vocabulary', subtitle: '', category: '', xp: 10, completed: false },
    { id: 'already-done', title: 'Done', subtitle: '', category: '', xp: 10, completed: true },
  ];
  state.studyTools.workoutSessions = [
    { id: 'workout-short', date: '2026-09-29', duration: 600 },
    { id: 'workout-long', date: '2026-09-30', duration: 1200 },
    { id: 'invalid-duration', date: '2026-09-30', duration: 0 },
  ];
  state.calculationHistory = [
    { id: 'calc-short', date: '2026-09-29', questions: 2, correct: 1, accuracy: 50, duration: 80 },
    { id: 'calc-long', date: '2026-09-30', questions: 5, correct: 4, accuracy: 80, duration: 100 },
    { id: 'calc-zero', date: '2026-09-30', questions: 0, correct: 0, accuracy: 0, duration: 900 },
  ];

  const briefing = masterProgress.buildDailyBriefing(makeStudyView(state));
  const estimates = briefing.estimatedStudyTime;
  assert.equal(estimates.status, 'available');
  assert.equal(estimates.estimateSource, 'mixed');
  assert.equal(estimates.minutes, 27, '15-minute recorded workout, 2-minute practice, and 10-minute vocabulary planning budget');
  assert.deepEqual([...estimates.tasks].map((item) => item.questId), ['morning-workout', 'timed-calculation', 'black-book']);
  assert.equal(estimates.tasks[0].averageRecordedSeconds, 900);
  assert.equal(estimates.tasks[0].recordedSamples, 2);
  assert.equal(estimates.tasks[1].averageRecordedSeconds, 90);
  assert.equal(estimates.tasks[1].recordedSamples, 2);
  assert.equal(estimates.tasks[2].estimateSource, 'planning-budget');
  assert.equal(estimates.tasks[2].minutes, 10);
  assert.equal(estimates.tasks.some((item) => item.action === 'lecture'), false);
});

test('unsupported pending quest estimates are explicit rather than silently undercounted', () => {
  const state = baseState([makeBatch('unknown-estimate', [])]);
  state.quests = [{
    id: 'future-kind',
    title: 'Future unsupported quest',
    subtitle: '',
    category: 'UNKNOWN',
    xp: 10,
    completed: false,
  }];
  const estimate = masterProgress.buildDailyBriefing(makeStudyView(state)).estimatedStudyTime;
  assert.equal(estimate.status, 'partial');
  assert.equal(estimate.estimateSource, 'partial');
  assert.equal(estimate.minutes, null);
  assert.match(estimate.reason, /no supported real activity kind/);
});

test('next-lecture missions follow the dynamically selected batch', () => {
  const first = makeBatch('batch-one', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('one-topic', 'One', [makeLecture('one-lecture')])],
  }]);
  const second = makeBatch('batch-two', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('two-topic', 'Two', [makeLecture('two-lecture')])],
  }]);
  const state = baseState([first, second], second.id);
  const mission = masterProgress.getNextMission(makeStudyView(state));

  assert.equal(mission.action, 'lecture');
  assert.equal(mission.target.batchId, second.id);
  assert.equal(mission.target.topicId, 'two-topic');
  assert.equal(mission.target.lectureId, 'two-lecture');
});

test('daily missions carry explicit currentGoal counts without parsing task titles', () => {
  const batch = makeBatch('goal-batch', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('topic', 'Topic')],
  }]);
  const state = baseState([batch]);
  state.ncertBooks = [{
    id: 'book-three-sessions',
    classId: 'class-1',
    classLabel: 'Class 1',
    title: 'Actual book',
    totalSessions: 4,
    completedSessions: 0,
    vocabulary: [],
  }];
  state.quests = [{
    id: 'ncert-reading',
    title: 'Read 3 chapters',
    subtitle: 'Current daily reading target',
    category: 'GENERAL',
    xp: 100,
    completed: false,
    currentGoal: 3,
  }];
  let view = makeStudyView(state);
  const reading = masterProgress.getMissionActionForQuest(view, 'ncert-reading');
  assert.ok(reading);
  assert.equal(reading.target.goal.count, 3);
  assert.equal(reading.target.goal.unit, 'saved-session');

  state.quests = [{
    ...state.quests[0],
    title: 'Read 3 chapters',
    currentGoal: { count: 3, unit: 'chapters' },
  }];
  view = makeStudyView(state);
  const structured = masterProgress.getMissionActionForQuest(view, 'ncert-reading');
  assert.ok(structured);
  assert.equal(structured.target.goal.count, 3, 'structured currentGoal data cannot fall back to the one-session default');
  assert.equal(structured.target.goal.unit, 'saved-session', 'the goal uses the actual saved-session metric');

  state.quests = [{
    ...state.quests[0],
    currentGoal: '3 chapters',
  }];
  const untargeted = masterProgress.getMissionActionForQuest(makeStudyView(state), 'ncert-reading');
  assert.ok(untargeted);
  assert.equal(untargeted.target.goal.count, 1, 'numeric task titles are never treated as goal data');
});

test('per-quest mission selector uses the full state and preserves the exact Maths target under the Phase 2 gate', () => {
  const batch = makeBatch('selection-batch', [
    { id: 'maths', name: 'Maths', topics: [makeTopic('maths-topic', 'Maths topic', [makeLecture('exact-maths-lecture')])] },
    { id: 'english', name: 'English', topics: [makeTopic('english-topic', 'English topic', [makeLecture('locked-english-lecture')])] },
  ]);
  const state = baseState([batch]);
  state.quests = [{
    id: 'maths-lecture',
    title: 'Maths · 1 Lecture',
    subtitle: 'Advance the current topic',
    category: 'MATHS',
    xp: 160,
    completed: false,
  }, {
    id: 'completed-workout',
    title: 'Workout',
    subtitle: '',
    category: 'FOUNDATION',
    xp: 80,
    completed: true,
  }];
  const study = makeStudyView(state, { phaseTwoUnlocked: false });
  const legacyNext = masterProgress.getNextMission(study);
  const selectedQuest = masterProgress.getMissionActionForQuest(study, 'maths-lecture');

  assert.ok(selectedQuest);
  assert.equal(selectedQuest.action, 'lecture');
  assert.equal(selectedQuest.target.batchId, state.activeBatchId);
  assert.equal(selectedQuest.target.subjectId, 'maths');
  assert.equal(selectedQuest.target.topicId, 'maths-topic');
  assert.equal(selectedQuest.target.lectureId, 'exact-maths-lecture');
  assert.equal(selectedQuest.target.questId, 'maths-lecture');
  assert.equal(selectedQuest.id, legacyNext.id);
  assert.equal(selectedQuest.target.topicId, legacyNext.target.topicId);
  assert.equal(selectedQuest.target.lectureId, legacyNext.target.lectureId);
  assert.equal(study.isSubjectLocked('english'), true, 'selecting the Maths quest does not unlock Phase 2');
  assert.equal(masterProgress.getMissionActionForQuest(study, 'completed-workout'), null);
  assert.equal(masterProgress.getMissionActionForQuest(study, 'unknown-quest'), null);
});

test('per-quest availability uses the canonical current date for workouts', () => {
  const batch = makeBatch('availability-batch', [{
    id: 'maths',
    name: 'Maths',
    topics: [makeTopic('topic', 'Topic')],
  }]);
  const state = baseState([batch]);
  state.quests = [{
    id: 'morning-workout',
    title: 'Morning Workout',
    subtitle: '',
    category: 'FOUNDATION',
    xp: 80,
    completed: false,
  }];
  state.studyTools.workoutSessions = [{ id: 'today', date: state.date, duration: 30 }];
  assert.equal(masterProgress.getMissionActionForQuest(makeStudyView(state), 'morning-workout'), null);

  state.studyTools.workoutSessions = [{ id: 'yesterday', date: '2026-09-30', duration: 30 }];
  assert.ok(masterProgress.getMissionActionForQuest(makeStudyView(state), 'morning-workout'));
});

async function mountProviders(t) {
  const runtime = createLoader();
  const { StudyProvider, useStudy } = runtime.load('@/contexts/StudyContext');
  const { MissionProvider, useMission } = runtime.load('@/contexts/MissionContext');
  let current = null;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(
      StudyProvider,
      null,
      React.createElement(
        MissionProvider,
        null,
        React.createElement(function Capture() {
          current = { study: useStudy(), mission: useMission() };
          return null;
        }),
      ),
    ));
  });
  t.after(async () => {
    if (renderer) await act(async () => renderer.unmount());
  });
  return {
    get current() { return current; },
    async edit(action) {
      await act(async () => action(current));
    },
    async call(action) {
      let result;
      await act(async () => { result = action(current); });
      return result;
    },
  };
}

function descriptorForLecture(lecture) {
  return {
    id: `lecture:${lecture.batchId}:${lecture.subjectId}:${lecture.topicId}:${lecture.lecture.id}`,
    title: lecture.lecture.title,
    subtitle: lecture.topicTitle,
    action: 'lecture',
    route: '/(tabs)/maths',
    routeParams: { subject: lecture.subjectId },
    source: 'next-lecture',
    target: {
      batchId: lecture.batchId,
      subjectId: lecture.subjectId,
      topicId: lecture.topicId,
      topicTitle: lecture.topicTitle,
      lectureId: lecture.lecture.id,
      cardIds: [],
      bookId: null,
      sectionId: null,
      questId: null,
    },
    xpReward: lecture.lecture.xpReward,
  };
}

test('MissionProvider does not finish from elapsed time and observes one canonical workout reward', async (t) => {
  const providers = await mountProviders(t);
  const initialXp = providers.current.study.state.totalXp;
  const mission = masterProgress.getNextMission(providers.current.study);
  assert.equal(mission.action, 'workout');
  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), true);
  assert.equal(providers.current.mission.progress.status, 'waiting');
  assert.equal(providers.current.mission.progress.value, null, 'timer time is not presented as task progress');
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);
  assert.equal(providers.current.mission.summary, null);

  await providers.edit(({ study }) => study.logWorkout(45));
  assert.equal(providers.current.mission.activeMission, null);
  assert.equal(providers.current.mission.summary.completedTask, 'Workout session · 45 seconds recorded');
  assert.equal(providers.current.mission.summary.actualXpDelta, 80);
  assert.equal(providers.current.mission.summary.target.questId, 'morning-workout');
  assert.equal(providers.current.mission.summary.proof.recordId, providers.current.study.state.studyTools.workoutSessions[0].id);
  assert.equal(providers.current.mission.summary.progress.value, 45);
  assert.equal(providers.current.mission.summary.progress.actualDelta, 45);
  assert.equal(providers.current.study.state.totalXp, initialXp + 80);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false, 'a second finish cannot summarize or reward again');
  assert.equal(providers.current.study.state.totalXp, initialXp + 80);
});

test('an already-completed quest without its target activity cannot start or prove a mission', async (t) => {
  const providers = await mountProviders(t);
  const originalMission = masterProgress.getNextMission(providers.current.study);
  await providers.edit(({ study }) => study.completeQuest('morning-workout'));

  assert.equal(providers.current.study.state.quests.find((quest) => quest.id === 'morning-workout').completed, true);
  assert.equal(await providers.call(({ mission }) => mission.startMission(originalMission)), false);
  assert.equal(providers.current.mission.activeMission, null);
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.study.state.studyTools.workoutSessions.length, 0);
});

test('MissionProvider guards a lecture with the exact active batch', async (t) => {
  const providers = await mountProviders(t);
  const lecture = providers.current.study.nextLecture;
  assert.ok(lecture);
  const mission = descriptorForLecture(lecture);
  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), true);

  await providers.edit(({ study }) => study.createBatch({
    name: 'Replacement batch',
    source: 'new source',
    startDate: '2026-10-01',
  }));
  assert.notEqual(providers.current.study.state.activeBatchId, lecture.batchId);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.mission.activeMission.id, mission.id);
});

test('lecture mission progress reports canonical in-progress and complete state for its exact lecture', async (t) => {
  const providers = await mountProviders(t);
  const lecture = providers.current.study.nextLecture;
  assert.ok(lecture);
  const mission = descriptorForLecture(lecture);
  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), true);

  await providers.edit(({ study }) => study.startLecture(lecture.subjectId, lecture.topicId, lecture.lecture.id));
  assert.equal(providers.current.mission.progress.status, 'in-progress');
  assert.equal(providers.current.mission.progress.value, null, 'lecture start is not a watched-time percentage');
  assert.match(providers.current.mission.progress.detail, /watched-time progress is not recorded/);
  assert.equal(providers.current.mission.summary, null);

  await providers.edit(({ study }) => study.completeLecture(lecture.subjectId, lecture.topicId, lecture.lecture.id));
  const summary = providers.current.mission.summary;
  assert.equal(summary.progress.status, 'complete');
  assert.equal(summary.progress.unit, 'lecture');
  assert.equal(summary.target.batchId, lecture.batchId);
  assert.equal(summary.target.subjectId, lecture.subjectId);
  assert.equal(summary.target.topicId, lecture.topicId);
  assert.equal(summary.target.lectureId, lecture.lecture.id);
  assert.equal(summary.proof.recordId, lecture.lecture.id);
  assert.match(summary.progress.detail, /changed from not-started to completed/);
});

test('reading mission summary reports the actual target book and saved session delta', async (t) => {
  const providers = await mountProviders(t);
  const book = providers.current.study.state.ncertBooks.find((item) =>
    item.completedSessions < item.totalSessions);
  assert.ok(book);
  const mission = {
    id: `reading:${book.id}`,
    title: book.title,
    subtitle: 'Read one saved NCERT session.',
    action: 'reading',
    route: '/(tabs)/library',
    source: 'daily-quest',
    target: {
      batchId: null,
      subjectId: null,
      topicId: null,
      topicTitle: null,
      lectureId: null,
      cardIds: [],
      bookId: book.id,
      sectionId: null,
      questId: null,
    },
    xpReward: null,
  };
  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), true);
  await providers.edit(({ study }) => study.advanceNcertBookSession(book.id));

  const summary = providers.current.mission.summary;
  assert.equal(summary.target.bookId, book.id);
  assert.equal(summary.proof.source, 'canonical-state');
  assert.equal(summary.proof.recordId, book.id);
  assert.equal(summary.progress.status, 'complete');
  assert.equal(summary.progress.actualDelta, 1);
  assert.equal(summary.progress.rawCount, 1);
  assert.equal(summary.progress.total, 1);
  assert.equal(summary.progress.completed, true);
  assert.equal(summary.progress.unit, 'saved-session');
  assert.equal(summary.progress.value, 1);
  assert.match(summary.progress.detail, /1\/1 saved session/);
});

test('three-session reading goal remains partial after one and completes idempotently at three', async (t) => {
  const providers = await mountProviders(t);
  const book = providers.current.study.state.ncertBooks.find((item) =>
    item.totalSessions - item.completedSessions >= 3);
  assert.ok(book);
  const mission = {
    id: `reading-three:${book.id}`,
    title: 'Read three chapters',
    subtitle: 'Complete the real target of three saved sessions.',
    action: 'reading',
    route: '/(tabs)/library',
    source: 'daily-quest',
    target: {
      batchId: null,
      subjectId: null,
      topicId: null,
      topicTitle: null,
      lectureId: null,
      cardIds: [],
      bookId: book.id,
      sectionId: null,
      questId: null,
    },
    xpReward: null,
  };
  const startingXp = providers.current.study.state.totalXp;
  assert.equal(await providers.call(({ mission: context }) =>
    context.startMission(mission, { count: 3, unit: 'saved-session' })), true);

  await providers.edit(({ study }) => study.advanceNcertBookSession(book.id));
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.mission.activeMission.target.goal.count, 3);
  assert.equal(providers.current.mission.progress.status, 'in-progress');
  assert.equal(providers.current.mission.progress.actualDelta, 1);
  assert.equal(providers.current.mission.progress.rawCount, 1);
  assert.equal(providers.current.mission.progress.value, 1);
  assert.equal(providers.current.mission.progress.total, 3);
  assert.equal(providers.current.mission.progress.completed, false);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);

  await providers.edit(({ study }) => study.advanceNcertBookSession(book.id));
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.mission.progress.rawCount, 2);
  assert.equal(providers.current.mission.progress.total, 3);
  await providers.edit(({ study }) => study.advanceNcertBookSession(book.id));

  const summary = providers.current.mission.summary;
  assert.equal(summary.progress.status, 'complete');
  assert.equal(summary.progress.rawCount, 3);
  assert.equal(summary.progress.actualDelta, 3);
  assert.equal(summary.progress.total, 3);
  assert.equal(summary.progress.completed, true);
  assert.equal(summary.proof.target.goal.count, 3);
  assert.equal(summary.actualXpDelta, providers.current.study.state.totalXp - startingXp);
  const xpAfterCompletion = providers.current.study.state.totalXp;
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);
  assert.equal(providers.current.study.state.totalXp, xpAfterCompletion);
});

test('a vocabulary daily quest with a three-page goal does not finish on its one saved page', async (t) => {
  const providers = await mountProviders(t);
  const sectionId = providers.current.study.state.currentVocabularySectionId;
  assert.ok(sectionId);
  const mission = {
    id: `vocabulary-three:${sectionId}`,
    title: 'Vocabulary target',
    subtitle: 'Explicit goal supplied separately from the title.',
    action: 'vocabulary',
    route: '/(tabs)/library',
    source: 'daily-quest',
    target: {
      batchId: null,
      subjectId: null,
      topicId: null,
      topicTitle: null,
      lectureId: null,
      cardIds: [],
      bookId: null,
      sectionId,
      questId: null,
    },
    xpReward: null,
  };
  assert.equal(await providers.call(({ mission: context }) =>
    context.startMission(mission, { count: 3, unit: 'vocabulary-page' })), true);
  await providers.edit(({ study }) => study.completeVocabularyPage(sectionId));

  assert.equal(providers.current.study.state.vocabularyDailyCompleted, true);
  assert.equal(providers.current.mission.activeMission !== null, true);
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.mission.progress.status, 'in-progress');
  assert.equal(providers.current.mission.progress.actualDelta, 1);
  assert.equal(providers.current.mission.progress.rawCount, 1);
  assert.equal(providers.current.mission.progress.total, 3);
  assert.equal(providers.current.mission.progress.completed, false);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);
});

test('multi-card review mission requires every selected saved card to have canonical revision proof', async (t) => {
  const providers = await mountProviders(t);
  const batchId = providers.current.study.state.activeBatchId;
  const cardIds = [];
  await providers.edit(({ study }) => {
    for (let index = 0; index < 3; index += 1) {
      study.saveReviewCard({
        batchId,
        subjectId: 'maths',
        topicTitle: 'Saved topic',
        question: `Saved question ${index + 1}`,
        answer: `Saved answer ${index + 1}`,
      });
    }
  });
  cardIds.push(...providers.current.study.state.studyTools.reviewCards.map((card) => card.id));
  assert.equal(cardIds.length, 3);
  const mission = {
    id: 'review-three-saved-cards',
    title: 'Review selected cards',
    subtitle: 'All three selected cards are required.',
    action: 'review',
    route: '/rituals?mode=recovery',
    source: 'weakness-radar',
    target: {
      batchId,
      subjectId: 'maths',
      topicId: null,
      topicTitle: null,
      lectureId: null,
      cardIds,
      bookId: null,
      sectionId: null,
      questId: null,
    },
    xpReward: null,
  };
  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), true);
  assert.equal(providers.current.mission.activeMission.target.goal.count, 3);

  await providers.edit(({ study }) => study.logRevision([cardIds[0]], batchId));
  assert.equal(providers.current.mission.summary, null);
  assert.equal(providers.current.mission.progress.rawCount, 1);
  assert.equal(providers.current.mission.progress.total, 3);
  assert.equal(providers.current.mission.progress.completed, false);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);

  await providers.edit(({ study }) => study.logRevision(cardIds.slice(1), batchId));
  const summary = providers.current.mission.summary;
  assert.equal(summary.progress.completed, true);
  assert.equal(summary.progress.rawCount, 3);
  assert.equal(summary.progress.actualDelta, 3);
  assert.equal(summary.progress.total, 3);
  assert.deepEqual([...summary.target.cardIds], cardIds);
  assert.equal(summary.proof.recordIds.length, 2);
  assert.equal(await providers.call(({ mission: context }) => context.finishMission()), false);
});

test('MissionProvider refuses a Phase 2 lecture while the existing gate is locked', async (t) => {
  const providers = await mountProviders(t);
  let topicId;
  let lectureId;
  await providers.edit(({ study }) => {
    topicId = study.addBatchTopic('english', 'Phase gate topic', 'ENGLISH', 1);
  });
  assert.ok(topicId);
  await providers.edit(({ study }) => {
    lectureId = study.addBatchLecture('english', topicId, { title: 'Locked lecture', link: '', xpReward: 25 });
  });
  assert.ok(lectureId);
  assert.equal(providers.current.study.phaseTwoUnlocked, false);
  assert.equal(providers.current.study.isSubjectLocked('english'), true);
  const mission = descriptorForLecture({
    batchId: providers.current.study.state.activeBatchId,
    subjectId: 'english',
    topicId,
    topicTitle: 'Phase gate topic',
    lecture: { ...makeLecture(lectureId), title: 'Locked lecture' },
  });

  assert.equal(await providers.call(({ mission: context }) => context.startMission(mission)), false);
  assert.equal(providers.current.mission.activeMission, null);
});