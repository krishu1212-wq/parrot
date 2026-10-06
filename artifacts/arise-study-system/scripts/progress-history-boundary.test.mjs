import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  controlProgressWrites,
  createProviderRuntime,
  mockStorage,
  mountProvider,
} from './study-provider-harness.mjs';

const require = createRequire(import.meta.url);
const React = require('react');

const moduleFiles = {
  '@/contexts/achievementHistory': '../contexts/achievementHistory.ts',
  '@/contexts/accountStudyVault': '../contexts/accountStudyVault.ts',
  '@/contexts/batchSystem': '../contexts/batchSystem.ts',
  '@/contexts/calculationEvidence': '../contexts/calculationEvidence.ts',
  '@/contexts/learningTools': '../contexts/learningTools.ts',
  '@/contexts/progressHistory': '../contexts/progressHistory.ts',
  '@/contexts/progressHistoryRecords': '../contexts/progressHistoryRecords.ts',
  '@/contexts/progressHistorySchema': '../contexts/progressHistorySchema.ts',
  '@/contexts/progressHistoryTransitions': '../contexts/progressHistoryTransitions.ts',
  '@/contexts/rankSystem': '../contexts/rankSystem.ts',
  '@/contexts/rpgTypes': '../contexts/rpgTypes.ts',
  '@/contexts/rpgCatalog': '../contexts/rpgCatalog.ts',
  '@/contexts/rpgSystem': '../contexts/rpgSystem.ts',
  '@/contexts/rpgStudyTransitions': '../contexts/rpgStudyTransitions.ts',
  '@/contexts/savedStudyValidation': '../contexts/savedStudyValidation.ts',
  '@/contexts/studyActivityRules': '../contexts/studyActivityRules.ts',
  '@/contexts/vocabularyProgress': '../contexts/vocabularyProgress.ts',
  '@/contexts/ncertProgress': '../contexts/ncertProgress.ts',
  '@/services/accountCloudSync': '../services/accountCloudSync.ts',
  '@/services/accountStudyVaultPersistence': '../services/accountStudyVaultPersistence.ts',
};

function loadTypeScript(path, mocks = {}, modules = new Map()) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  modules.set(path, exports);
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Math,
    encodeURIComponent,
    JSON,
    Number,
    Object,
    Set,
    Map,
    Array,
    Error,
    require: (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      const dependency = moduleFiles[id];
      if (dependency) return modules.get(dependency) ?? loadTypeScript(dependency, mocks, modules);
      throw new Error(`Unexpected module import in progress-history boundary test: ${id}`);
    },
  }, { filename: path });
  return exports;
}

function loadCloudSync() {
  // These are production validators/normalizers, not boundary-test mocks.
  return loadTypeScript('../services/accountCloudSync.ts');
}

function loadStudyContext() {
  const asyncStorage = {
    getItem: async () => null,
    setItem: async () => undefined,
    multiSet: async () => undefined,
    removeItem: async () => undefined,
  };
  return loadTypeScript('../contexts/StudyContext.tsx', {
    '@react-native-async-storage/async-storage': { default: asyncStorage, ...asyncStorage },
    'expo-haptics': {
      impactAsync: async () => undefined,
      notificationAsync: async () => undefined,
      ImpactFeedbackStyle: { Light: 'light' },
      NotificationFeedbackType: { Success: 'success' },
    },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      AppState: { addEventListener: () => ({ remove: () => undefined }) },
      Pressable: 'Pressable',
      Text: 'Text',
      View: 'View',
    },
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/contexts/profilePreferences': { isProfileHapticsEnabled: () => true },
    '@/contexts/questionBank': {
      getPublishedQuestion: () => undefined,
      getPublishedQuestionBank: () => undefined,
    },
  });
}

function canonicalStudyState() {
  return {
    date: '2026-06-02',
    lastActiveDate: '2026-06-02',
    streak: 0,
    totalXp: 0,
    recoveryXp: 0,
    ncertCompleted: 0,
    ncertTotal: 1,
    blackBookPage: 0,
    blackBookTotal: 1,
    quests: [],
    recoveryAvailable: false,
    batches: [{
      id: 'batch',
      name: 'Current',
      source: 'account',
      startDate: '2026-06-02',
      createdAt: '2026-06-02',
      isActive: true,
      subjects: [{ id: 'subject', name: 'Maths', topics: [] }],
    }],
    activeBatchId: 'batch',
    ncertShelves: [],
    ncertBooks: [],
    ncertCatalogVersion: 1,
    vocabularySections: [],
    currentVocabularySectionId: 'section',
    currentVocabularyPage: 1,
    vocabularyDailyDate: '2026-06-02',
    vocabularyDailyCompleted: false,
    calculationHistory: [],
    ncertProgressLedger: { version: 1, byShelf: {} },
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

function completedLectureHistory() {
  const historyModule = loadTypeScript('../contexts/progressHistory.ts');
  const previous = {
    date: '2026-06-02',
    totalXp: 0,
    quests: [{ id: 'maths-lecture', title: 'Maths lecture', xp: 160, completed: false }],
    batches: [{
      id: 'batch',
      subjects: [{
        id: 'maths',
        topics: [{
          id: 'percentage',
          title: 'Percentage',
          lectures: [{
            id: 'percentage-lecture-4',
            title: 'Complete the lesson',
            status: 'in-progress',
            sessionCount: 1,
            xpReward: 50,
            xpAwarded: false,
          }],
        }],
      }],
    }],
    ncertBooks: [],
    vocabularySections: [],
    calculationHistory: [],
  };
  const next = {
    ...previous,
    totalXp: 210,
    quests: [{ ...previous.quests[0], completed: true }],
    batches: [{
      ...previous.batches[0],
      subjects: [{
        ...previous.batches[0].subjects[0],
        topics: [{
          ...previous.batches[0].subjects[0].topics[0],
          lectures: [{
            ...previous.batches[0].subjects[0].topics[0].lectures[0],
            status: 'completed',
            xpAwarded: true,
          }],
        }],
      }],
    }],
  };
  const history = historyModule.captureProgressHistoryTransition(
    previous,
    next,
    historyModule.createEmptyProgressHistory(),
    historyModule.createProgressHistoryTicket('2026-06-02T12:00:00.000Z'),
  );
  assert.equal(history.systemEvents.some((event) => event.type === 'lecture.completed'), true);
  assert.equal(history.xpEvents.reduce((total, event) => total + event.amount, 0), 210,
    'The canonical quest + lecture XP balance remains 210');
  return history;
}

function cloneWithHistoryMarker(history, marker) {
  const systemEvent = history.systemEvents.at(-1);
  const xpEvent = history.xpEvents.at(-1);
  assert.ok(systemEvent, 'Canonical lecture completion records a system event');
  assert.ok(xpEvent, 'Canonical lecture completion records an XP event');
  return {
    ...structuredClone(history),
    systemEvents: [
      ...structuredClone(history.systemEvents),
      {
        ...structuredClone(systemEvent),
        id: `${systemEvent.id}:${marker}`,
        idempotencyKey: `${systemEvent.idempotencyKey}:${marker}`,
      },
    ],
    xpEvents: [
      ...structuredClone(history.xpEvents),
      {
        ...structuredClone(xpEvent),
        id: `${xpEvent.id}:${marker}`,
        idempotencyKey: `${xpEvent.idempotencyKey}:${marker}`,
      },
    ],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(predicate(), `Timed out waiting for ${description}`);
}

function assertHistoryIdsAreUnique(history) {
  for (const key of ['systemEvents', 'xpEvents']) {
    const rows = history[key];
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `${key} IDs stay unique`);
    assert.equal(
      new Set(rows.map((row) => row.idempotencyKey)).size,
      rows.length,
      `${key} idempotency keys stay unique`,
    );
  }
}

function createVaultPersistence(asyncStorage) {
  const vault = loadTypeScript('../contexts/accountStudyVault.ts');
  const storageModule = { default: asyncStorage, ...asyncStorage };
  const persistence = loadTypeScript('../services/accountStudyVaultPersistence.ts', {
    '@react-native-async-storage/async-storage': storageModule,
    '@/contexts/accountStudyVault': vault,
  });
  return { persistence, vault };
}

test('cloud accepts legacy states without progressHistory using the real saved-state validator', () => {
  const sync = loadCloudSync();
  const legacy = canonicalStudyState();
  const validated = sync.validateCloudStudyState(legacy);
  assert.equal(validated.progressHistory, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(validated)), legacy);
});

test('cloud/save and three-way merge preserve the whole history boundary', () => {
  const sync = loadCloudSync();
  const history = completedLectureHistory();
  const base = { ...canonicalStudyState(), progressHistory: history };
  const historyJson = JSON.stringify(base.progressHistory);

  const validated = sync.validateCloudStudyState(base);
  assert.equal(JSON.stringify(validated.progressHistory), historyJson);
  const saveInput = sync.createCloudSaveInput('user_alpha', 4, validated);
  assert.equal(JSON.stringify(saveInput.state), JSON.stringify(base),
    'Cloud save input serializes the complete, unchanged progressHistory');

  const local = { ...base, totalXp: 12 };
  const cloud = { ...base, streak: 3 };
  const merged = sync.safelyMergeStudyStates(base, local, cloud);
  assert.equal(merged?.totalXp, 12);
  assert.equal(merged?.streak, 3);
  assert.equal(JSON.stringify(merged?.progressHistory), historyJson,
    'Disjoint top-level edits retain the whole history rather than merging its internals');

  const localHistory = cloneWithHistoryMarker(history, 'local');
  const cloudHistory = cloneWithHistoryMarker(history, 'cloud');
  assert.notEqual(JSON.stringify(localHistory), JSON.stringify(cloudHistory));
  assert.equal(sync.safelyMergeStudyStates(
    base,
    { ...base, progressHistory: localHistory },
    { ...base, progressHistory: cloudHistory },
  ), null, 'Conflicting concurrent history edits fail closed instead of dropping either event');

  const malformedHistory = {
    version: 92,
    systemEvents: 'raw-corrupt-event-list',
    xpEvents: [{ marker: 'raw-unknown-xp-shape' }],
    personalRecords: null,
  };
  const malformedState = { ...canonicalStudyState(), progressHistory: malformedHistory };
  const malformedHistoryJson = JSON.stringify(malformedHistory);
  const acceptedMalformedRaw = sync.validateCloudStudyState(malformedState);
  assert.equal(JSON.stringify(acceptedMalformedRaw.progressHistory), malformedHistoryJson,
    'Cloud validation leaves malformed optional history raw for provider-side import normalization');
  assert.equal(
    JSON.stringify(sync.createCloudSaveInput('user_alpha', 5, acceptedMalformedRaw).state),
    JSON.stringify(malformedState),
    'Raw history survives cloud save serialization byte-for-byte at the JSON boundary',
  );

  const imported = loadStudyContext().prepareStudyStateForAccount(malformedState);
  assert.equal(imported.progressHistory.version, 1);
  assert.equal(JSON.stringify(imported.progressHistory.systemEvents), '[]');
  assert.equal(JSON.stringify(imported.progressHistory.xpEvents), '[]');
  assert.deepEqual(
    JSON.parse(JSON.stringify(imported.progressHistory.malformedRaw)),
    malformedHistory,
    'StudyContext normalizes imported history and retains malformed source data for repair',
  );
});

test('serialized account journal drains to the newer whole-history snapshot and rejects stale owners', async () => {
  const data = new Map();
  const writes = [];
  const journalGate = deferred();
  let journalWriteStarted;
  const hasJournalWriteStarted = new Promise((resolve) => { journalWriteStarted = resolve; });
  let holdFirstJournal = true;
  const asyncStorage = {
    async setItem(key, value) {
      writes.push({ operation: 'set', key, value });
      if (key.endsWith(':vault-journal-v1') && holdFirstJournal) {
        holdFirstJournal = false;
        journalWriteStarted();
        await journalGate.promise;
      }
      data.set(key, value);
    },
    async multiSet(items) {
      writes.push({ operation: 'multiSet', items: structuredClone(items) });
      for (const [key, value] of items) data.set(key, value);
    },
    async removeItem(key) {
      writes.push({ operation: 'remove', key });
      data.delete(key);
    },
  };
  const { persistence, vault } = createVaultPersistence(asyncStorage);
  const storageKey = vault.getAccountStudyStorageKey('user_history');
  const oldOwner = await vault.claimStudyStorageOwner(storageKey);
  const base = canonicalStudyState();
  const canonicalHistory = completedLectureHistory();
  const oldState = {
    ...base,
    totalXp: 41,
    progressHistory: cloneWithHistoryMarker(canonicalHistory, 'old-owner'),
  };
  const newerState = {
    ...base,
    totalXp: 210,
    progressHistory: cloneWithHistoryMarker(canonicalHistory, 'newer-snapshot'),
  };
  const oldMetadata = {
    version: 1,
    baseRevision: 7,
    baseState: { ...base, totalXp: 40, progressHistory: canonicalHistory },
    dirty: true,
  };
  const newerMetadata = {
    version: 1,
    baseRevision: 8,
    baseState: { ...base, totalXp: 209, progressHistory: newerState.progressHistory },
    dirty: true,
  };
  const oldStateJson = JSON.stringify(oldState);
  const oldMetadataJson = JSON.stringify(oldMetadata);
  const newerStateJson = JSON.stringify(newerState);
  const newerMetadataJson = JSON.stringify(newerMetadata);

  const oldWrite = persistence.persistAccountStudyVaultSnapshot(
    storageKey,
    oldStateJson,
    oldMetadataJson,
    oldOwner,
  );
  await hasJournalWriteStarted;
  const newerWrite = persistence.persistAccountStudyVaultSnapshot(
    storageKey,
    newerStateJson,
    newerMetadataJson,
    oldOwner,
  );
  const pending = vault.getPendingAccountStudySnapshot(storageKey);
  assert.equal(pending.state, newerStateJson);
  assert.equal(pending.metadata, newerMetadataJson);

  journalGate.resolve();
  const [oldResult, newerResult] = await Promise.all([oldWrite, newerWrite]);
  assert.equal(oldResult.ran, true);
  assert.equal(newerResult.ran, true);

  const accountMetadataKey = vault.getAccountStudyMetadataKey(storageKey);
  const journalKey = vault.getAccountStudyJournalKey(storageKey);
  assert.equal(data.get(storageKey), newerStateJson);
  assert.equal(data.get(accountMetadataKey), newerMetadataJson);
  assert.equal(data.has(journalKey), false);
  const committed = vault.getCommittedAccountStudySnapshot(storageKey);
  assert.equal(committed.state, newerStateJson);
  assert.equal(committed.metadata, newerMetadataJson);
  assert.equal(JSON.stringify(JSON.parse(committed.state).progressHistory),
    JSON.stringify(newerState.progressHistory));

  const journalRows = writes
    .filter((write) => write.operation === 'set' && write.key === journalKey)
    .map((write) => JSON.parse(write.value));
  assert.equal(journalRows.length, 2);
  assert.equal(journalRows[0].state, oldStateJson);
  const recoverableNewerRow = journalRows[1];
  assert.equal(recoverableNewerRow.state, newerStateJson);
  assert.equal(recoverableNewerRow.metadata, newerMetadataJson);
  assert.equal(recoverableNewerRow.baseRevision, newerMetadata.baseRevision);
  assert.equal(recoverableNewerRow.baseStateJson, JSON.stringify(newerMetadata.baseState));
  assert.equal(
    JSON.stringify(JSON.parse(recoverableNewerRow.state).progressHistory),
    JSON.stringify(newerState.progressHistory),
    'The journal recovery payload contains the exact newer whole-history state and matching metadata',
  );

  const newOwner = await vault.claimStudyStorageOwner(storageKey);
  assert.ok(newOwner > oldOwner);
  const writesBeforeStaleAttempt = writes.length;
  const staleResult = await persistence.persistAccountStudyVaultSnapshot(
    storageKey,
    oldStateJson,
    oldMetadataJson,
    oldOwner,
  );
  assert.equal(staleResult.ran, false);
  assert.equal(writes.length, writesBeforeStaleAttempt, 'Stale-owner bytes never reach the journal or vault');
  assert.equal(data.get(storageKey), newerStateJson);
  assert.equal(data.get(accountMetadataKey), newerMetadataJson);
  assert.equal(vault.getPendingAccountStudySnapshot(storageKey), null);
});

test('real StudyProvider remounts share the storage queue and preserve cumulative XP history', async (t) => {
  const storage = mockStorage();
  const runtime = createProviderRuntime(storage);
  const oldProvider = await mountProvider(t, storage, { runtime });
  assert.equal(oldProvider.current?.hydrated, true);
  const startingXp = oldProvider.current.state.totalXp;
  const heldWrites = controlProgressWrites(t, storage);

  await oldProvider.edit(({ toggleQuest }) => toggleQuest('morning-workout'));
  await waitFor(() => heldWrites.length === 1, 'first provider snapshot write');
  await oldProvider.edit(({ toggleQuest }) => toggleQuest('timed-calculation'));
  const oldNewestState = JSON.parse(oldProvider.snapshot());
  assert.equal(oldNewestState.totalXp, startingXp + 200);
  assert.equal(oldNewestState.progressHistory.xpEvents.length, 2);
  assert.equal(heldWrites.length, 1, 'The second canonical edit queues behind the held write');
  await oldProvider.unmount();

  const freshProvider = await mountProvider(t, storage, { runtime });
  assert.equal(freshProvider.current, null, 'Same-runtime owner claim waits for the abandoned provider queue');
  assert.equal(freshProvider.renders, 0, 'The fresh provider cannot expose partial or default state');

  await heldWrites[0].settle();
  await waitFor(() => heldWrites.length === 2, 'queued old-provider snapshot write');
  assert.equal(heldWrites[1].value, JSON.stringify(oldNewestState));
  await heldWrites[1].settle();
  await waitFor(() => freshProvider.current?.hydrated === true, 'fresh provider hydration');

  const freshHydratedState = JSON.parse(freshProvider.snapshot());
  assert.equal(freshHydratedState.totalXp, oldNewestState.totalXp);
  assert.equal(
    JSON.stringify(freshHydratedState.progressHistory),
    JSON.stringify(oldNewestState.progressHistory),
    'Hydration carries every queued old-provider system and XP event',
  );
  assert.equal(freshHydratedState.progressHistory.xpEvents.length, 2);
  assertHistoryIdsAreUnique(freshHydratedState.progressHistory);
  await waitFor(() => heldWrites.length === 3, 'fresh provider initial save');
  assert.equal(heldWrites[2].value, JSON.stringify(freshHydratedState));

  await freshProvider.edit(({ toggleQuest }) => toggleQuest('ncert-reading'));
  const newestState = JSON.parse(freshProvider.snapshot());
  assert.equal(newestState.totalXp, startingXp + 300);
  assert.equal(newestState.progressHistory.xpEvents.length, 3,
    'The post-remount canonical edit records the third XP event');
  assertHistoryIdsAreUnique(newestState.progressHistory);
  assert.equal(heldWrites.length, 3, 'The new edit queues behind the fresh hydration save');

  await heldWrites[2].settle();
  await waitFor(() => heldWrites.length === 4, 'queued fresh-provider canonical edit');
  assert.equal(heldWrites[3].value, JSON.stringify(newestState));
  await heldWrites[3].settle();
  assert.equal(storage.data.get('arise-study-state-v1'), JSON.stringify(newestState));
  await freshProvider.unmount();

  storage.onWrite = null;
  const reopened = await mountProvider(t, storage, { runtime });
  const reopenedState = JSON.parse(reopened.snapshot());
  assert.equal(reopened.current?.hydrated, true);
  assert.equal(reopenedState.totalXp, newestState.totalXp);
  assert.equal(
    JSON.stringify(reopenedState.progressHistory),
    JSON.stringify(newestState.progressHistory),
    'A same-runtime reload restores the complete cumulative history',
  );
  assert.deepEqual(reopenedState.progressHistory.personalRecords, newestState.progressHistory.personalRecords);
  assert.equal(reopenedState.progressHistory.xpEvents.length, 3);
  assertHistoryIdsAreUnique(reopenedState.progressHistory);
});