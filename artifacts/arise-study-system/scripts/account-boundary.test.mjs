import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadTypeScript(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Math,
    encodeURIComponent,
    JSON,
    Number,
    Object,
    Set,
    Array,
    Error,
    require: (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      throw new Error(`Unexpected module import in isolated boundary test: ${id}`);
    },
  });
  return exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('account vault keys isolate stable profile IDs and preserve the anonymous key', async () => {
  const vault = loadTypeScript('../contexts/accountStudyVault.ts');
  assert.equal(vault.ANONYMOUS_STUDY_STORAGE_KEY, 'arise-study-state-v1');
  assert.notEqual(
    vault.getAccountStudyStorageKey('user_alpha'),
    vault.getAccountStudyStorageKey('user_beta'),
  );
  assert.equal(
    vault.getAccountStudyStorageKey(' user/one '),
    'arise-study-state-v1:account:user%2Fone',
  );
  assert.throws(() => vault.getAccountStudyStorageKey('  '), /verified account ID/);
  assert.throws(() => vault.getAccountStudyMetadataKey(vault.ANONYMOUS_STUDY_STORAGE_KEY), /account-scoped/);
});

test('serialized vault ownership rejects stale-provider writes after account remount', async () => {
  const vault = loadTypeScript('../contexts/accountStudyVault.ts');
  const key = vault.getAccountStudyStorageKey('user_alpha');
  const ownerA = await vault.claimStudyStorageOwner(key);
  const gate = deferred();
  let started;
  const hasStarted = new Promise((resolve) => { started = resolve; });
  const oldOperation = vault.withStudyStorageQueue(key, async () => {
    started();
    await gate.promise;
    return 'old-write-completed-before-claim';
  }, ownerA);
  await hasStarted;
  const ownerBRequest = vault.claimStudyStorageOwner(key);
  let staleOperationRan = false;
  const staleOperation = vault.withStudyStorageQueue(key, () => {
    staleOperationRan = true;
  }, ownerA);
  gate.resolve();
  const oldResult = await oldOperation;
  const ownerB = await ownerBRequest;
  const staleResult = await staleOperation;
  assert.equal(oldResult.ran, true);
  assert.ok(ownerB > ownerA);
  assert.equal(staleResult.ran, false);
  assert.equal(staleOperationRan, false);
  assert.equal(vault.isStudyStorageOwnerCurrent(key, ownerB), true);
});

test('failed account writes retain the latest staged snapshot across provider owners', async () => {
  const vault = loadTypeScript('../contexts/accountStudyVault.ts');
  const key = vault.getAccountStudyStorageKey('user_alpha');
  const persistence = loadTypeScript('../services/accountStudyVaultPersistence.ts', {
    '@react-native-async-storage/async-storage': {
      setItem: async () => { throw new Error('storage unavailable'); },
      multiSet: async () => undefined,
      removeItem: async () => undefined,
    },
    '@/contexts/accountStudyVault': vault,
  });
  await assert.rejects(
    persistence.persistAccountStudyVaultSnapshot(key, '{"totalXp":1}', '{"dirty":true}'),
    /storage unavailable/,
  );
  const first = vault.getPendingAccountStudySnapshot(key).id;
  const second = vault.stageAccountStudySnapshot(key, '{"totalXp":2}', '{"dirty":true}');
  vault.clearPendingAccountStudySnapshot(key, first);
  assert.deepEqual(
    JSON.parse(JSON.stringify(vault.getPendingAccountStudySnapshot(key))),
    { id: second, state: '{"totalXp":2}', metadata: '{"dirty":true}' },
  );
  vault.clearPendingAccountStudySnapshot(key, second);
  assert.equal(vault.getPendingAccountStudySnapshot(key), null);
});

test('stale ownership is rejected before account snapshot staging', async () => {
  const vault = loadTypeScript('../contexts/accountStudyVault.ts');
  const key = vault.getAccountStudyStorageKey('user_alpha');
  const persistence = loadTypeScript('../services/accountStudyVaultPersistence.ts', {
    '@react-native-async-storage/async-storage': {
      setItem: async () => undefined,
      multiSet: async () => undefined,
      removeItem: async () => undefined,
    },
    '@/contexts/accountStudyVault': vault,
  });
  const oldOwner = await vault.claimStudyStorageOwner(key);
  const activeOwner = await vault.claimStudyStorageOwner(key);
  const staleOwnerResult = await persistence.persistAccountStudyVaultSnapshot(
    key,
    '{"totalXp":1}',
    '{"version":1,"baseRevision":0,"baseState":null,"dirty":true}',
    oldOwner,
  );
  assert.equal(staleOwnerResult.ran, false);
  assert.equal(vault.getPendingAccountStudySnapshot(key), null);

  const rejectedGuardResult = await persistence.persistAccountStudyVaultSnapshot(
    key,
    '{"totalXp":2}',
    '{"version":1,"baseRevision":0,"baseState":null,"dirty":true}',
    activeOwner,
    () => false,
  );
  assert.equal(rejectedGuardResult.ran, false);
  assert.equal(vault.getPendingAccountStudySnapshot(key), null);
});

test('cloud account snapshots are validated and new-account revision zero is explicit', () => {
  const sync = loadTypeScript('../services/accountCloudSync.ts', {
    '@/contexts/learningTools': { normalizeStudyTools: (value) => value },
    '@/contexts/savedStudyValidation': { validateSavedStudyState: () => undefined },
  });
  const emptyAccount = sync.validateCloudAccount({
    ownerId: 'user_alpha', state: null, revision: 0, updatedAt: null,
  }, 'user_alpha');
  assert.deepEqual(JSON.parse(JSON.stringify(emptyAccount)), {
    ownerId: 'user_alpha',
    state: null,
    revision: 0,
    updatedAt: null,
  });
  assert.throws(
    () => sync.validateCloudAccount({
      ownerId: 'user_alpha', state: null, revision: 1, updatedAt: null,
    }, 'user_alpha'),
    /empty-state revision/,
  );
  assert.throws(
    () => sync.validateCloudAccount({
      ownerId: 'user_alpha', state: {}, revision: 1, updatedAt: 'today',
    }, 'user_alpha'),
    /malformed/,
  );
  assert.throws(
    () => sync.validateCloudAccount({
      ownerId: 'user_beta', state: null, revision: 0, updatedAt: null,
    }, 'user_alpha'),
    /different account/,
  );
});

test('account save input carries the captured owner and expected revision', () => {
  const sync = loadTypeScript('../services/accountCloudSync.ts', {
    '@/contexts/learningTools': { normalizeStudyTools: (value) => value },
    '@/contexts/savedStudyValidation': { validateSavedStudyState: () => undefined },
  });
  const state = { totalXp: 12 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(sync.createCloudSaveInput('user_alpha', 6, state))),
    { expectedOwnerId: 'user_alpha', expectedRevision: 6, state },
  );
  assert.throws(() => sync.createCloudSaveInput('', 0, state), /verified ARISE profile ID/);
  assert.equal(sync.isCloudCompareAndSwapConflict({ status: 409 }), true);
  assert.equal(sync.isCloudCompareAndSwapConflict({ status: 500 }), false);
});

test('automatic merge accepts disjoint top-level edits and rejects overlapping edits', () => {
  const sync = loadTypeScript('../services/accountCloudSync.ts', {
    '@/contexts/learningTools': { normalizeStudyTools: (value) => value },
    '@/contexts/savedStudyValidation': { validateSavedStudyState: () => undefined },
  });
  const base = {
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
  assert.throws(
    () => sync.validateCloudAccount({
      ownerId: 'user_alpha',
      state: { ...base, studyTools: {} },
      revision: 1,
      updatedAt: '2026-06-02T00:00:00Z',
    }, 'user_alpha'),
    /malformed/,
  );
  const local = { ...base, totalXp: 20 };
  const cloud = { ...base, streak: 3 };
  const merged = sync.safelyMergeStudyStates(base, local, cloud);
  assert.equal(merged?.totalXp, 20);
  assert.equal(merged?.streak, 3);
  assert.equal(sync.safelyMergeStudyStates(base, local, { ...base, totalXp: 40 }), null);
});