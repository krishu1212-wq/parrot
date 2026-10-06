import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function loadTypeScript(path, mocks, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Math,
    JSON,
    Number,
    Object,
    Set,
    Array,
    Error,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    process: globals.process ?? { env: {} },
    require: (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
      throw new Error(`Unexpected module import in root provider race test: ${id}`);
    },
  });
  return exports;
}

const stateBase = {
  date: '2026-06-02',
  lastActiveDate: '2026-06-02',
  streak: 0,
  totalXp: 0,
  quests: [],
  recoveryAvailable: false,
  recoveryXp: 0,
  ncertCompleted: 0,
  ncertTotal: 0,
  blackBookPage: 0,
  blackBookTotal: 0,
  batches: [{
    id: 'active',
    name: 'Current',
    source: 'account',
    startDate: '2026-06-02',
    createdAt: '2026-06-02T00:00:00.000Z',
    isActive: true,
    subjects: [],
  }],
  activeBatchId: 'active',
  ncertShelves: [],
  ncertBooks: [],
  ncertCatalogVersion: 1,
  ncertProgressLedger: { version: 1, byShelf: {} },
  vocabularySections: [],
  currentVocabularySectionId: '',
  currentVocabularyPage: 0,
  vocabularyDailyDate: '2026-06-02',
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

function cloudState(totalXp) {
  return { ...stateBase, totalXp };
}

function createRootHarness(initialAuth, { fontsLoaded = true } = {}) {
  const storage = new Map();
  const storageWrites = [];
  const asyncStorage = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => {
      storageWrites.push(key);
      storage.set(key, value);
    },
    multiSet: async (items) => {
      for (const [key, value] of items) {
        storageWrites.push(key);
        storage.set(key, value);
      }
    },
    removeItem: async (key) => { storage.delete(key); },
  };
  let auth = initialAuth;
  const authContext = React.createContext(initialAuth);
  const profileSession = (current) => ({
    ready: current.isLoaded,
    accessToken: current.isSignedIn ? 'test-profile-token' : null,
    profile: current.isSignedIn ? {
      profileId: current.userId,
      accountCode: 'ARISE-TEST-CODE',
      displayName: 'Race Test Profile',
      settings: {
        soundEnabled: false,
        soundVolume: 0.5,
        hapticsEnabled: true,
        motion: 'full',
        notificationsEnabled: true,
        appearance: 'system',
      },
    } : null,
    sessionError: null,
    recoveryKeyToShow: null,
    logout: async () => undefined,
  });
  const profileContext = {
    ProfileSessionProvider: ({ children }) => React.createElement(authContext.Provider, { value: auth }, children),
    useProfileSession: () => profileSession(React.useContext(authContext)),
  };
  const requests = new Map();
  const saveRequests = new Map();
  const requestCalls = [];
  const saveCalls = [];
  const accountRenders = [];
  const missionStats = { mounts: 0, unmounts: 0 };
  let latestAccountValue = null;
  let studyStateOverride = null;
  let useAccount = () => null;

  const queuesFor = (userId) => {
    if (!requests.has(userId)) requests.set(userId, []);
    return requests.get(userId);
  };
  const saveQueuesFor = (userId) => {
    if (!saveRequests.has(userId)) saveRequests.set(userId, []);
    return saveRequests.get(userId);
  };
  const userContext = React.createContext({
    state: cloudState(0),
    hydrated: true,
  });
  const MissionProvider = ({ children }) => {
    React.useEffect(() => {
      missionStats.mounts += 1;
      return () => { missionStats.unmounts += 1; };
    }, []);
    return children;
  };
  const cleanState = () => ({ ...cloudState(0) });
  const studyMocks = {
    StudyProvider: ({ initialAccountState, children }) => React.createElement(
      userContext.Provider,
      { value: {
        state: studyStateOverride ?? initialAccountState ?? cleanState(),
        hydrated: true,
      } },
      children,
    ),
    createCleanAccountStudyState: cleanState,
    prepareStudyStateForAccount: (value) => value,
    useStudy: () => React.useContext(userContext),
  };
  const vault = loadTypeScript('../contexts/accountStudyVault.ts', {});
  const cloudSync = loadTypeScript('../services/accountCloudSync.ts', {
    '@/contexts/learningTools': { normalizeStudyTools: (value) => value },
    '@/contexts/savedStudyValidation': { validateSavedStudyState: () => undefined },
  });
  const persistence = loadTypeScript('../services/accountStudyVaultPersistence.ts', {
    '@react-native-async-storage/async-storage': asyncStorage,
    '@/contexts/accountStudyVault': vault,
  });

  const Stack = () => {
    const account = useAccount();
    latestAccountValue = account;
    accountRenders.push({
      userId: account?.userId ?? null,
      isBootstrapped: account?.isBootstrapped ?? false,
      initialXp: account?.initialStudyState?.totalXp,
      conflict: account?.conflict ?? null,
    });
    return null;
  };
  Stack.Screen = () => null;

  const router = { replace: () => undefined, push: () => undefined, back: () => undefined };
  const expoRouter = { Stack, useRouter: () => router, usePathname: () => '/' };
  const apiClient = {
    getGetStudyAccountQueryKey: () => ['study-account'],
    setAuthTokenGetter: () => undefined,
    setBaseUrl: () => undefined,
    useGetStudyAccount: ({ query }) => {
      const userId = query.queryKey.at(-1);
      return {
        refetch: () => {
          requestCalls.push(userId);
          const pending = queuesFor(userId).shift();
          if (!pending) throw new Error(`No deferred cloud request for ${userId}`);
          return pending.promise;
        },
      };
    },
    usePutStudyAccount: () => ({
      mutateAsync: ({ data }) => {
        saveCalls.push(data);
        const pending = saveQueuesFor(data.expectedOwnerId).shift();
        if (!pending) throw new Error(`No deferred cloud save for ${data.expectedOwnerId}`);
        return pending.promise;
      },
    }),
  };
  const queryClient = { clear: () => undefined };
  const reactQuery = {
    QueryClient: class { clear() {} },
    QueryClientProvider: ({ children }) => children,
    useQueryClient: () => queryClient,
  };
  const passThrough = ({ children }) => children;
  const reactNative = {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    Platform: { OS: 'web' },
  };
  const accountMocks = {
    '@react-native-async-storage/async-storage': asyncStorage,
    '@/contexts/ProfileContext': profileContext,
    '@workspace/api-client-react': apiClient,
    'expo-router': expoRouter,
    'react-native': reactNative,
    '@tanstack/react-query': reactQuery,
    '@/contexts/accountStudyVault': vault,
    '@/contexts/StudyContext': studyMocks,
    '@/services/accountCloudSync': cloudSync,
    '@/services/accountStudyVaultPersistence': persistence,
  };
  const accountContext = loadTypeScript('../contexts/AriseAccountContext.tsx', accountMocks);
  useAccount = accountContext.useAriseAccount;

  const rootMocks = {
    '@tanstack/react-query': reactQuery,
    'react-native-gesture-handler': { GestureHandlerRootView: passThrough },
    'react-native-keyboard-controller': { KeyboardProvider: passThrough },
    'react-native-safe-area-context': { SafeAreaProvider: passThrough },
    '@/components/ErrorBoundary': { ErrorBoundary: passThrough },
    '@/components/rpg/RpgFeedback': { RpgFeedback: () => null },
    '@/components/system/SystemSoundBridge': { SystemSoundBridge: passThrough },
    '@/components/system/SystemActivation': { SystemActivationHost: passThrough },
    '@expo-google-fonts/inter': {
      Inter_400Regular: {},
      Inter_500Medium: {},
      Inter_600SemiBold: {},
      Inter_700Bold: {},
      useFonts: () => [fontsLoaded, null],
    },
    'expo-router': expoRouter,
    'expo-splash-screen': {
      preventAutoHideAsync: () => Promise.resolve(),
      hideAsync: () => Promise.resolve(),
    },
    '@/contexts/StudyContext': studyMocks,
    '@/contexts/AriseAccountContext': accountContext,
    '@/contexts/MissionContext': { MissionProvider },
    '@/contexts/SystemExperienceContext': { SystemExperienceProvider: passThrough },
    '@/contexts/ProfileContext': profileContext,
    '@workspace/api-client-react': apiClient,
    'react-native': reactNative,
    '@/hooks/useColors': {
      useColors: () => ({
        background: '#000',
        foreground: '#fff',
        primary: '#0ff',
        primaryForeground: '#000',
        accent: '#f00',
        mutedForeground: '#aaa',
        border: '#333',
        card: '#111',
      }),
    },
  };
  const rootModule = loadTypeScript('../app/_layout.tsx', rootMocks, {
    process: {
      env: { EXPO_PUBLIC_DOMAIN: 'study.test' },
    },
  });

  return {
    accountContext,
    accountRenders,
    asyncStorage,
    auth(value) { auth = value; },
    createElement: React.createElement,
    deferredFor(userId) {
      const item = deferred();
      item.ownerId = userId;
      queuesFor(userId).push(item);
      return item;
    },
    deferredSaveFor(userId) {
      const item = deferred();
      item.ownerId = userId;
      saveQueuesFor(userId).push(item);
      return item;
    },
    lastAccount() { return accountRenders.at(-1); },
    missionStats,
    currentAccount() { return latestAccountValue; },
    requestCalls,
    rootComponent: rootModule.default,
    async setStudyState(state, renderer) {
      studyStateOverride = state;
      await act(async () => {
        renderer.update(React.createElement(rootModule.default));
      });
      await flushEffects();
    },
    clearStudyStateOverride() { studyStateOverride = null; },
    storage,
    storageWrites,
    saveCalls,
    vault,
  };
}

async function flushEffects() {
  for (let index = 0; index < 8; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

async function renderRoot(harness) {
  let renderer;
  await act(async () => {
    renderer = create(harness.createElement(harness.rootComponent));
  });
  await flushEffects();
  return renderer;
}

async function updateAuth(renderer, harness, auth) {
  harness.auth(auth);
  await act(async () => {
    renderer.update(harness.createElement(harness.rootComponent));
  });
  await flushEffects();
}

function resolveCloud(request, totalXp, revision = 1) {
  request.resolve({
    data: {
      ownerId: request.ownerId,
      state: cloudState(totalXp),
      revision,
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
    error: null,
  });
}

function resolveSave(request, totalXp, revision = 2) {
  request.resolve({
    ownerId: request.ownerId,
    state: cloudState(totalXp),
    revision,
    updatedAt: '2026-06-02T00:00:00.000Z',
  });
}

test('root waits for profile-session restoration and a same-profile login rejects the previous bootstrap', async () => {
  const harness = createRootHarness({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    getToken: async () => 'test-token',
  });
  const renderer = await renderRoot(harness);
  assert.match(JSON.stringify(renderer.toJSON()), /Preparing your profile and saved progress/);
  assert.equal(harness.accountRenders.length, 0, 'study routes stay gated until the local session is resolved');

  const firstAccountRequest = harness.deferredFor('user_alpha');
  await updateAuth(renderer, harness, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alpha',
    getToken: async () => 'test-token',
  });
  assert.ok(harness.requestCalls.includes('user_alpha'));

  await updateAuth(renderer, harness, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => 'test-token',
  });
  const secondAccountRequest = harness.deferredFor('user_alpha');
  await updateAuth(renderer, harness, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alpha',
    getToken: async () => 'test-token',
  });
  resolveCloud(firstAccountRequest, 100);
  await flushEffects();
  assert.equal(harness.accountRenders.some((entry) => entry.initialXp === 100), false);

  resolveCloud(secondAccountRequest, 12);
  await flushEffects();
  assert.equal(harness.lastAccount().isBootstrapped, true);
  assert.equal(harness.lastAccount().initialXp, 12);
  await act(async () => renderer.unmount());
});

test('root shows a system-font loading surface while its Stack is already mounted', async () => {
  const harness = createRootHarness({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => 'test-token',
  }, { fontsLoaded: false });
  const renderer = await renderRoot(harness);
  assert.ok(harness.accountRenders.length > 0, 'the root Stack should mount while font assets load');
  assert.match(JSON.stringify(renderer.toJSON()), /Loading display fonts/);
  await act(async () => renderer.unmount());
});

test('a profile chooser with no selection loads no cloud profile', async () => {
  const harness = createRootHarness({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => 'test-token',
  });
  const renderer = await renderRoot(harness);
  assert.equal(harness.lastAccount().userId, null);
  assert.equal(harness.lastAccount().isBootstrapped, true);
  assert.deepEqual(harness.requestCalls, []);
  await act(async () => renderer.unmount());
});

test('a successful old-profile save cannot stage over a new same-profile mount', async () => {
  const harness = createRootHarness({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alpha',
    getToken: async () => 'test-token',
  });
  const oldRead = harness.deferredFor('user_alpha');
  const firstRenderer = await renderRoot(harness);
  resolveCloud(oldRead, 1, 1);
  await flushEffects();

  const oldSave = harness.deferredSaveFor('user_alpha');
  await harness.setStudyState(cloudState(5), firstRenderer);
  assert.equal(harness.saveCalls.length, 1);
  await act(async () => firstRenderer.unmount());

  harness.clearStudyStateOverride();
  const newRead = harness.deferredFor('user_alpha');
  const secondRenderer = await renderRoot(harness);
  assert.equal(harness.requestCalls.filter((userId) => userId === 'user_alpha').length, 2);

  resolveSave(oldSave, 5);
  await flushEffects();
  const accountKey = harness.vault.getAccountStudyStorageKey('user_alpha');
  assert.equal(harness.vault.getPendingAccountStudySnapshot(accountKey), null);

  resolveCloud(newRead, 50, 2);
  await flushEffects();
  assert.equal(harness.lastAccount().userId, 'user_alpha');
  assert.equal(harness.lastAccount().initialXp, 50);
  const committedState = JSON.parse(harness.storage.get(accountKey));
  assert.equal(committedState.totalXp, 50);
  assert.equal(harness.vault.getPendingAccountStudySnapshot(accountKey), null);
  await act(async () => secondRenderer.unmount());
});

test('root account switch discards a late previous-user bootstrap without exposing it to the next user', async () => {
  const harness = createRootHarness({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alpha',
    getToken: async () => 'test-token',
  });
  const firstUserRequest = harness.deferredFor('user_alpha');
  const renderer = await renderRoot(harness);
  assert.ok(harness.requestCalls.includes('user_alpha'));

  const secondUserRequest = harness.deferredFor('user_beta');
  const mountsBeforeAccountSwitch = harness.missionStats.mounts;
  await updateAuth(renderer, harness, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_beta',
    getToken: async () => 'test-token',
  });
  assert.equal(harness.missionStats.mounts, mountsBeforeAccountSwitch);
  resolveCloud(firstUserRequest, 900);
  await flushEffects();
  assert.equal(harness.accountRenders.some((entry) => entry.initialXp === 900), false);

  resolveCloud(secondUserRequest, 7);
  await flushEffects();
  assert.equal(harness.lastAccount().isBootstrapped, true);
  assert.equal(harness.lastAccount().initialXp, 7);
  assert.ok(harness.storageWrites.every((key) => key.includes('user_beta')));
  await act(async () => renderer.unmount());
});