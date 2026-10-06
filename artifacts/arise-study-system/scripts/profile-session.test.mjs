import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';

const root = new URL('../', import.meta.url);
const nodeRequire = createRequire(import.meta.url);
const DEFAULT_SETTINGS = {
  soundEnabled: false,
  soundVolume: 0.5,
  hapticsEnabled: true,
  motion: 'full',
  notificationsEnabled: true,
  appearance: 'system',
};

function makeRuntime() {
  const secure = new Map();
  const web = new Map();
  const storageReads = [];
  const apiCalls = [];
  const profilePrefs = [];
  let currentProfile = {
    profileId: 'arise_11111111-1111-4111-8111-111111111111',
    accountCode: 'ARISE-TEST-CODE',
    displayName: 'Test Player',
    settings: { ...DEFAULT_SETTINGS },
  };
  const secureStore = {
    async getItemAsync(key) { storageReads.push(key); return secure.get(key) ?? null; },
    async setItemAsync(key, value) { secure.set(key, value); },
    async deleteItemAsync(key) { secure.delete(key); },
  };
  const asyncStorage = {
    async getItem(key) { return web.get(key) ?? null; },
    async setItem(key, value) { web.set(key, value); },
    async removeItem(key) { web.delete(key); },
  };
  const api = {
    async createStudyProfile(input) {
      apiCalls.push(['create', input]);
      currentProfile = { ...currentProfile, displayName: input.displayName };
      return { ...currentProfile, accessToken: 'profile-token', recoveryKey: 'one-time-recovery-key' };
    },
    async prepareStudyProfileRestore(input) {
      apiCalls.push(['prepare-restore', input]);
      return { candidateToken: 'candidate-token', accountCode: currentProfile.accountCode };
    },
    async confirmStudyProfileRestore(input) {
      apiCalls.push(['confirm-restore', input]);
      return { ...currentProfile, accessToken: 'restored-token' };
    },
    async getStudyProfile(request) {
      apiCalls.push(['get-profile', request]);
      return currentProfile;
    },
    async updateStudyProfile(input, request) {
      apiCalls.push(['update-profile', input, request]);
      currentProfile = { ...currentProfile, ...input };
      return currentProfile;
    },
  };
  const source = readFileSync(new URL('contexts/ProfileContext.tsx', root), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    JSON,
    Error,
    Promise,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return nodeRequire('react/jsx-runtime');
      if (name === '@react-native-async-storage/async-storage') return asyncStorage;
      if (name === 'expo-secure-store') return secureStore;
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === '@workspace/api-client-react') return api;
      if (name === '@/contexts/profilePreferences') {
        return { setActiveProfilePreferences: (settings) => profilePrefs.push(settings) };
      }
      throw new Error(`Unexpected dependency in profile session test: ${name}`);
    },
  });
  let context;
  function Probe() {
    context = exports.useProfileSession();
    return null;
  }
  return {
    apiCalls,
    context: () => context,
    element: React.createElement(exports.ProfileSessionProvider, null, React.createElement(Probe)),
    profilePrefs,
    secure,
    storageReads,
    web,
  };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(runtime) {
  let renderer;
  await act(async () => { renderer = create(runtime.element); });
  for (let index = 0; index < 5; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return renderer;
}

test('new guest uses a native secure session and exposes the recovery key only once', async () => {
  const runtime = makeRuntime();
  const renderer = await mount(runtime);
  assert.equal(runtime.context().ready, true);
  assert.equal(runtime.context().profile, null);

  await act(async () => runtime.context().createGuest('Ari', { totalXp: 0 }));
  assert.equal(runtime.context().profile.displayName, 'Ari');
  assert.equal(runtime.context().recoveryKeyToShow, 'one-time-recovery-key');
  const saved = [...runtime.secure.values()][0];
  assert.match(saved, /profile-token/);
  assert.doesNotMatch(saved, /one-time-recovery-key/);
  assert.equal(runtime.web.size, 0);

  await act(async () => runtime.context().clearRecoveryKey());
  assert.equal(runtime.context().recoveryKeyToShow, null);
  assert.deepEqual(runtime.apiCalls.map(([name]) => name), ['create']);
  await act(async () => renderer.unmount());
});

test('restore requires both credentials, explicit confirmation, and logout only clears the device session', async () => {
  const runtime = makeRuntime();
  const renderer = await mount(runtime);
  let candidate;
  await act(async () => {
    candidate = await runtime.context().prepareRestore('ARISE-TEST-CODE', 'separate-recovery-key');
  });
  assert.equal(candidate.candidateToken, 'candidate-token');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.apiCalls.at(-1))), ['prepare-restore', {
    accountCode: 'ARISE-TEST-CODE',
    recoveryKey: 'separate-recovery-key',
  }]);

  await act(async () => runtime.context().confirmRestore(candidate.candidateToken));
  assert.equal(runtime.context().profile.profileId, 'arise_11111111-1111-4111-8111-111111111111');
  assert.equal(runtime.context().recoveryKeyToShow, null);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.apiCalls.at(-1))), ['confirm-restore', { candidateToken: 'candidate-token' }]);

  await act(async () => runtime.context().logout());
  assert.equal(runtime.context().profile, null);
  assert.equal(runtime.secure.size, 0);
  assert.equal(runtime.apiCalls.some(([name]) => name === 'delete-profile'), false);
  await act(async () => renderer.unmount());
  const loggedOutRenderer = await mount(runtime);
  assert.equal(runtime.context().profile, null, 'a cleared device session does not automatically reopen the profile');
  assert.equal(runtime.apiCalls.filter(([name]) => name === 'get-profile').length, 0);
  await act(async () => loggedOutRenderer.unmount());
});

test('restoring the saved session never probes a legacy Google key', async () => {
  const runtime = makeRuntime();
  runtime.secure.set('arise.profile.session.v1', JSON.stringify({
    accessToken: 'existing-profile-token',
    profile: {
      profileId: 'arise_11111111-1111-4111-8111-111111111111',
      accountCode: 'ARISE-TEST-CODE',
      displayName: 'Test Player',
      settings: { ...DEFAULT_SETTINGS },
    },
  }));
  runtime.secure.set('clerk-cache', 'legacy-google-session');
  const renderer = await mount(runtime);
  assert.equal(runtime.context().profile.displayName, 'Test Player');
  assert.deepEqual(runtime.storageReads, ['arise.profile.session.v1']);
  assert.equal(runtime.apiCalls.filter(([name]) => name === 'get-profile').length, 1);
  await act(async () => runtime.context().logout());
  await act(async () => renderer.unmount());
});