import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// Mount the actual provider with React's effects/context intact. Only device
// boundaries are mocked; no native storage, browser, or Metro is involved.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export const STORAGE_KEY = 'arise-study-state-v1';
export const BACKUP_KEY = `${STORAGE_KEY}-before-batch-migration`;
const today = '2026-10-01';
const fixedTime = new Date(2026, 9, 1, 12).getTime();

// Each mount owns its clock and timers, including the Date seen by every
// transitive provider module. Advancing time does not implicitly fire effects.
export function controlledClock(initialTime = fixedTime) {
  let now = new Date(initialTime).getTime();
  let nextTimer = 0;
  const intervals = new Map();
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() { return now; }
  }
  return {
    Date: ClockDate,
    intervals,
    setTime(time) {
      const next = new Date(time).getTime();
      assert.ok(Number.isFinite(next), 'Clock requires a valid time');
      now = next;
    },
    setInterval(callback, delay) {
      const id = ++nextTimer;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    async fireIntervals() {
      await act(async () => {
        for (const { callback } of [...intervals.values()]) callback();
      });
    },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function legacyPayload(overrides = {}) {
  return JSON.stringify({
    date: today,
    lastActiveDate: today,
    streak: 9,
    totalXp: 4321,
    mathsTopics: [
      { id: 'saved-topic', section: 'ARITHMETIC', title: 'Saved topic', total: 4, completed: 3 },
    ],
    ...overrides,
  });
}

export function batchPayload(overrides = {}) {
  return JSON.stringify({
    date: today,
    lastActiveDate: today,
    streak: 9,
    totalXp: 4321,
    activeBatchId: 'saved-batch',
    batches: [{
      id: 'saved-batch', name: 'Saved batch', source: 'Saved course',
      startDate: today, isActive: true, subjects: [],
    }],
    ...overrides,
  });
}

export function mockStorage(entries = []) {
  const data = new Map(entries);
  const reads = [];
  const writes = [];
  const completed = [];
  const storage = {
    data, reads, writes, completed,
    onRead: null,
    onWrite: null,
    async getItem(key) {
      reads.push(key);
      if (storage.onRead) await storage.onRead(key);
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      const call = { key, value };
      writes.push(call);
      if (storage.onWrite) await storage.onWrite(call);
      // Commit only on success and after the controlled delay, as device
      // storage would. This lets the final bytes expose out-of-order writes.
      data.set(key, value);
      completed.push(call);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
  return storage;
}

// Hold individual progress writes independently, including writes from separate
// provider mounts sharing the same mocked disk. Reads and backup writes stay free.
export function controlProgressWrites(t, storage) {
  assert.equal(storage.onWrite, null, 'Write controller requires an unused mock hook');
  const calls = [];
  const onWrite = (call) => {
    if (call.key !== STORAGE_KEY) return;
    const gate = deferred();
    const held = {
      ...call,
      settled: false,
      async settle(error) {
        assert.equal(held.settled, false, 'A held write can only settle once');
        held.settled = true;
        await settle(gate, error);
      },
    };
    calls.push(held);
    return gate.promise;
  };
  storage.onWrite = onWrite;
  t.after(async () => {
    // Release captured operations even when a test assertion fails. Subsequent
    // queued writes finish without delays, so no dangling promise leaks a test.
    if (storage.onWrite === onWrite) storage.onWrite = null;
    for (const call of calls) if (!call.settled) await call.settle();
  });
  return calls;
}

function loadProvider(storage, clock, dev = true) {
  const modules = new Map();
  const mocks = {
    react: React,
    '@react-native-async-storage/async-storage': storage,
    'expo-haptics': {
      impactAsync: async () => {},
      notificationAsync: async () => {},
      ImpactFeedbackStyle: { Light: 'light', Soft: 'soft', Medium: 'medium' },
      NotificationFeedbackType: { Success: 'success' },
    },
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
      AppState: { addEventListener: () => ({ remove() {} }) },
    },
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/contexts/profilePreferences': { isProfileHapticsEnabled: () => true },
  };
  function load(name) {
    if (name === '../docs/question-bank-drafts/percentage-class-4.review-draft.json') {
      return JSON.parse(readFileSync(new URL('../docs/question-bank-drafts/percentage-class-4.review-draft.json', import.meta.url), 'utf8'));
    }
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (modules.has(name)) return modules.get(name);
    assert.ok(
      ['@/contexts/StudyContext', '@/contexts/batchSystem', '@/contexts/vocabularyProgress', '@/contexts/ncertProgress',
        '@/contexts/studyActivityRules', '@/contexts/savedStudyValidation', '@/contexts/learningTools', '@/contexts/calculationEvidence',
        '@/contexts/accountStudyVault', '@/contexts/achievementHistory', '@/contexts/progressHistory',
        '@/contexts/progressHistorySchema', '@/contexts/progressHistoryRecords',
        '@/contexts/progressHistoryTransitions', '@/contexts/questionBank',
         '@/contexts/rankSystem',
         '@/contexts/rpgTypes', '@/contexts/rpgCatalog', '@/contexts/rpgSystem',
         '@/contexts/rpgStudyTransitions',
        '@/services/accountStudyVaultPersistence'].includes(name),
      `Unexpected provider dependency: ${name}`,
    );
    const isPersistenceService = name === '@/services/accountStudyVaultPersistence';
    const file = isPersistenceService
      ? 'accountStudyVaultPersistence'
      : name.slice('@/contexts/'.length);
      const extension = file === 'StudyContext' ? 'tsx' : 'ts';
    const sourcePath = isPersistenceService
      ? `../services/${file}.${extension}`
      : `../contexts/${file}.${extension}`;
    const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    modules.set(name, exports);
    vm.runInNewContext(compiled, {
      exports, require: load, Date: clock.Date, Math,
      setInterval: clock.setInterval, clearInterval: clock.clearInterval,
      __DEV__: dev,
    }, { filename: sourcePath });
    return exports;
  }
  return load('@/contexts/StudyContext');
}

// Metro keeps one module graph across provider remounts. Opt into that shared
// graph when testing ownership/queue behavior, rather than isolated runtimes.
export function createProviderRuntime(storage, clock = controlledClock(), dev = true) {
  return { studyModule: loadProvider(storage, clock, dev), storage, clock };
}

export async function mountProvider(t, storage, {
  strictMode = false, clock = controlledClock(),
  accountUserId = null, initialAccountState, runtime, dev = true,
} = {}) {
  if (runtime) assert.equal(runtime.storage, storage, 'A runtime owns its storage boundary');
  const { StudyProvider, useStudy } = runtime?.studyModule ?? loadProvider(storage, clock, dev);
  let current = null;
  let renders = 0;
  let renderer;
  let mounted = false;
  const renderedStates = [];
  function EditableChild() {
    current = useStudy();
    renders += 1;
    renderedStates.push(JSON.stringify(current.state));
    return React.createElement('StudyEditor');
  }
  // Cleanup is registered before mounting, including on assertion failures.
  async function unmount() {
    if (!mounted) return;
    await act(async () => { renderer.unmount(); });
    mounted = false;
  }
  t.after(unmount);
  await act(async () => {
    const tree = React.createElement(StudyProvider, {
      accountUserId,
      ...(initialAccountState ? { initialAccountState } : {}),
    }, React.createElement(EditableChild));
    renderer = create(strictMode ? React.createElement(React.StrictMode, null, tree) : tree);
    mounted = true;
  });
  const buttons = (label) => (mounted ? renderer.root.findAllByType('Pressable') : []).filter(
    (button) => button.findAllByType('Text').some((text) => text.props.children === label),
  );
  return {
    get current() { return current; },
    get renders() { return renders; },
    get renderedStates() { return [...renderedStates]; },
    unmount,
    snapshot: () => JSON.stringify(current.state),
    hasButton: (label) => buttons(label).length > 0,
    alerts: () => (mounted ? renderer.root.findAllByType('Text') : [])
      .filter((text) => text.props.accessibilityRole === 'alert')
      .map((text) => text.props.children),
    async press(label) {
      assert.equal(buttons(label).length, 1, `Expected one ${label} button`);
      await act(async () => { buttons(label)[0].props.onPress(); });
    },
    async edit(action) {
      assert.ok(current?.hydrated, 'Edits require a hydrated consumer');
      await act(async () => { action(current); });
    },
  };
}

export async function settle(gate, error) {
  await act(async () => {
    if (error) gate.reject(error);
    else gate.resolve();
  });
}

export function assertBlocked(provider, storage, original) {
  assert.equal(provider.current, null, 'No context or edit actions reach children');
  assert.equal(provider.renders, 0, 'Editable children must not mount');
  assert.equal(provider.hasButton('Retry saving'), false);
  assert.equal(storage.writes.filter((call) => call.key === STORAGE_KEY).length, 0);
  assert.equal(storage.data.get(STORAGE_KEY), original, 'Saved progress remains byte-for-byte intact');
}