import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(name) {
  const path = new URL(`../contexts/${name}.ts`, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(compiled.outputText, { exports });
  return exports;
}
const { advanceFocusClock, focusSecondsRemaining } = load('focusClock');
const { getBossRevisionCards, hasBossRevision } = load('bossContinuation');

test('25/50-minute focus and 5/10-minute break countdowns measure real time and cap completion', () => {
  for (const presetMinutes of [25, 50, 5, 10]) {
    const clock = { kind: presetMinutes < 25 ? 'break' : 'focus', presetMinutes, task: 'Study', elapsedMilliseconds: 0, lastTickAt: 1000 };
    assert.equal(focusSecondsRemaining(clock), presetMinutes * 60);
    const oneMinute = advanceFocusClock(clock, 61000);
    assert.equal(focusSecondsRemaining(oneMinute), presetMinutes * 60 - 60);
    const complete = advanceFocusClock(oneMinute, 10000000);
    assert.equal(focusSecondsRemaining(complete), 0);
    assert.equal(complete.elapsedMilliseconds, presetMinutes * 60000);
  }
});

test('background pause and backward wall clock never fabricate study time', () => {
  const clock = { kind: 'focus', presetMinutes: 25, task: 'Study', elapsedMilliseconds: 42000, lastTickAt: null };
  assert.equal(advanceFocusClock(clock, 900000).elapsedMilliseconds, 42000);
  const resumed = { ...clock, lastTickAt: 900000 };
  assert.equal(advanceFocusClock(resumed, 910000).elapsedMilliseconds, 52000);
  assert.equal(advanceFocusClock(resumed, 800000).elapsedMilliseconds, 42000);
});

const source = {
  id: 'official', batchId: 'batch-a', date: '2026-10-10',
  results: [
    { cardId: 'missed', subjectId: 'math', correct: false, question: 'Real question', expectedAnswer: 'Original answer' },
    { cardId: 'recalled', subjectId: 'math', correct: true },
    { cardId: 'deleted', subjectId: 'math', correct: false },
  ],
};
test('targeted Boss revision uses only available missed cards from its original batch', () => {
  const cards = [
    { id: 'missed', batchId: 'batch-a', subjectId: 'math', answer: 'Edited answer' },
    { id: 'recalled', batchId: 'batch-a', subjectId: 'math' },
    { id: 'deleted', batchId: 'batch-b', subjectId: 'math' },
  ];
  const missed = getBossRevisionCards(source, cards);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].cardId, 'missed');
  assert.equal(missed[0].expectedAnswer, 'Original answer');
});

test('retest unlock requires saved review evidence for all selected wrong cards', () => {
  const history = [
    { batchId: 'batch-a', date: '2026-10-09', cardIds: ['missed', 'other'] },
    { batchId: 'batch-b', date: '2026-10-11', cardIds: ['missed', 'other'] },
    { batchId: 'batch-a', date: '2026-10-11', cardIds: ['missed'] },
  ];
  assert.equal(hasBossRevision(source, ['missed'], history), true);
  assert.equal(hasBossRevision(source, ['missed', 'other'], history), false);
  assert.equal(hasBossRevision(source, [], history), false);
});

function componentLoader(study, appState, clock = Date) {
  const modules = new Map();
  const mocks = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-native': { Text: 'Text', View: 'View', TextInput: 'TextInput', AppState: appState },
    '@/contexts/StudyContext': { useStudy: () => study },
    '@/contexts/masterProgress': { getNextMission: () => null },
    '@/hooks/useColors': { useColors: () => ({ foreground: '#fff', mutedForeground: '#aaa' }) },
    './shared': { ToolPanel: 'ToolPanel', ToolButton: 'ToolButton' },
  };
  const timers = new Set();
  function requireModule(request) {
    if (mocks[request]) return mocks[request];
    if (modules.has(request)) return modules.get(request);
    let path;
    if (request.startsWith('@/contexts/')) path = `contexts/${request.slice(11)}.${request.endsWith('MissionContext') ? 'tsx' : 'ts'}`;
    else if (request === 'BossContinuation') path = 'components/study-tools/BossContinuation.tsx';
    else throw new Error(`Unexpected module: ${request}`);
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    modules.set(request, module.exports);
    vm.runInNewContext(code, {
      module, exports: module.exports, require: requireModule, Date: clock,
      setInterval: (fn) => { timers.add(fn); return fn; }, clearInterval: (fn) => timers.delete(fn),
    });
    return module.exports;
  }
  return { load: requireModule, tick: () => [...timers].forEach((fn) => fn()) };
}

test('MissionProvider saves completed and interrupted focus/break intervals once without XP', async () => {
  // Use a realistic positive epoch; zero is a sentinel in the timer snapshot.
  let now = Date.UTC(2026, 9, 1, 8, 0, 0);
  class Clock extends Date { static now() { return now; } }
  const listeners = new Set();
  const appState = { currentState: 'active', addEventListener: (_event, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const records = [];
  const study = { hydrated: true, state: { totalXp: 80 }, logFocusSession: (record) => records.push(record) };
  const runtime = componentLoader(study, appState, Clock);
  const { MissionProvider, useMission } = runtime.load('@/contexts/MissionContext');
  let mission;
  function Probe() { mission = useMission(); return null; }
  let tree;
  await act(async () => { tree = create(React.createElement(MissionProvider, null, React.createElement(Probe))); });
  await act(async () => { assert.equal(mission.startFocus(25), true); assert.equal(mission.startFocus(50), false); });
  await act(async () => { now += 60000; runtime.tick(); });
  assert.equal(mission.focusRemainingSeconds, 1440);
  await act(async () => { listeners.forEach((fn) => fn('background')); now += 540000; runtime.tick(); });
  assert.equal(mission.focusRemainingSeconds, 1440);
  await act(async () => { listeners.forEach((fn) => fn('active')); });
  await act(async () => { now += 1440000; runtime.tick(); });
  assert.equal(records.length, 1);
  assert.equal(records[0].durationSeconds, 1500);
  assert.equal(records[0].completed, true);
  await act(async () => { mission.stopFocus(); mission.startFocus(5); now += 30000; runtime.tick(); mission.stopFocus(); mission.stopFocus(); });
  assert.equal(records.length, 2);
  assert.equal(records[1].kind, 'break');
  assert.equal(records[1].durationSeconds, 30);
  assert.equal(records[1].completed, false);
  assert.equal(study.state.totalXp, 80);
  await act(async () => tree.unmount());
});

test('Boss continuation reviews stored misses then persists a separately self-marked retest', async () => {
  const official = { ...source, results: [source.results[0]], gateAttemptId: undefined };
  const revisions = [];
  const retests = [];
  const study = {
    state: { date: '2026-10-12', totalXp: 80, studyTools: {
      reviewCards: [{ id: 'missed', batchId: 'batch-a', subjectId: 'math' }],
      revisionHistory: revisions, bossRetests: retests,
    } },
    logRevision: (cardIds, batchId) => revisions.push({ cardIds, batchId, date: '2026-10-12' }),
    saveBossRetest: (record) => retests.push({ ...record, id: 'practice' }),
  };
  const runtime = componentLoader(study);
  const Component = runtime.load('BossContinuation').default;
  let tree;
  await act(async () => { tree = create(React.createElement(Component, { test: official })); });
  const button = (id) => tree.root.findByProps({ testID: id });
  assert.equal(button('boss-start-retest').props.disabled, true);
  await act(async () => button('boss-targeted-revision').props.onPress());
  await act(async () => button('boss-revision-next').props.onPress());
  assert.equal(revisions.length, 1);
  assert.equal(button('boss-start-retest').props.disabled, false);
  await act(async () => button('boss-start-retest').props.onPress());
  await act(async () => button('boss-retest-answer').props.onChangeText('My actual recalled answer'));
  await act(async () => button('boss-retest-reveal').props.onPress());
  await act(async () => button('boss-retest-correct').props.onPress());
  assert.equal(retests.length, 1);
  assert.equal(retests[0].sourceTestId, 'official');
  assert.equal(retests[0].results[0].answer, 'My actual recalled answer');
  assert.equal(retests[0].results[0].correct, true);
  assert.equal(official.results[0].correct, false);
  assert.equal(study.state.totalXp, 80);
  await act(async () => tree.unmount());
});