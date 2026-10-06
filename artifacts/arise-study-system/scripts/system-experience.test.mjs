import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';

const root = new URL('../', import.meta.url);
function compile(file) {
  return ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
}
const policy = {};
vm.runInNewContext(compile('contexts/systemExperiencePolicy.ts'), { exports: policy, Date, Set });
const plain = (value) => JSON.parse(JSON.stringify(value));
const time = 1791000000000;
const event = (id, type = 'xp.awarded', timestamp = time + 100, metadata = { amount: 25 }) =>
  ({ id, type, timestamp: new Date(timestamp).toISOString(), metadata });

test('sound defaults to OFF, volume is bounded and malformed opt-in is rejected', () => {
  assert.deepEqual(plain(policy.normalizeSoundPreference(null)), { enabled: false, volume: 0.5 });
  assert.deepEqual(plain(policy.normalizeSoundPreference({ enabled: 'true', volume: NaN })), { enabled: false, volume: 0.5 });
  assert.equal(policy.normalizeSoundPreference({ enabled: true, volume: 2 }).volume, 1);
  assert.equal(policy.normalizeSoundPreference({ volume: -2 }).volume, 0);
  assert.notEqual(policy.ACTIVATION_COMPLETE_KEY, 'arise_onboarding_complete');
  assert.notEqual(policy.ACTIVATION_COMPLETE_KEY, policy.SOUND_PREFERENCE_KEY);
});
test('new receipt sounds exactly once; hydration, owner changes, old imports, resume receipts are silent', () => {
  const cursor = new policy.FreshSystemEventCursor();
  assert.equal(cursor.observe('anonymous', [event('saved')], time).length, 0);
  assert.equal(cursor.observe('anonymous', [event('saved'), event('new')], time + 200).length, 1);
  assert.equal(cursor.observe('anonymous', [event('new')], time + 300).length, 0);
  assert.equal(cursor.observe('account:a', [event('new'), event('cloud')], time + 400).length, 0);
  assert.equal(cursor.observe('account:a', [event('cloud'), event('old-import', 'level.up', time - 100)], time + 500).length, 0);
  assert.equal(cursor.observe('account:a', [event('stale', 'level.up', time + 500)], time + 10000).length, 0);
  cursor.reset();
  assert.equal(cursor.observe('account:a', [event('after-remount')], time + 11000).length, 0);
});
test('mirrored RPG history receipts do not replay or double-play a single action', () => {
  const cursor = new policy.FreshSystemEventCursor();
  cursor.observe('owner', [], time);
  const original = event('chest:1', 'chest.opened');
  assert.equal(cursor.observe('owner', policy.canonicalSoundEvents([], [original]), time + 200).length, 1);
  const mirror = event('history:1', 'chest.opened', time + 100, { rpgEventId: 'chest:1' });
  assert.equal(policy.canonicalSoundEvents([mirror], [original]).length, 1);
  assert.equal(cursor.observe('owner', policy.canonicalSoundEvents([mirror], [original]), time + 300).length, 0);
});
test('rank/level cues coalesce action receipts; undo and negative XP are silent', () => {
  assert.equal(policy.chooseSound([event('xp'), event('quest', 'quest.completed'), event('level', 'level.up'), event('rank', 'rank.changed')]), 'rank');
  assert.equal(policy.chooseSound([event('undo', 'xp.awarded', time, { amount: -50 }), event('bonus-reversed', 'equipment.bonus-reversed')]), null);
  for (const [type, sound] of [
    ['quest.completed', 'quest'], ['level.up', 'level'], ['rank.changed', 'rank'],
    ['phase.unlocked', 'unlock'], ['gate.unlocked', 'unlock'], ['boss.activity', 'boss'],
    ['achievement.unlocked', 'achievement'], ['chest.opened', 'reward'], ['system.notification', 'notification'],
  ]) assert.equal(policy.soundForEvent(event(type, type)), sound);
  assert.equal(policy.soundForEvent(event('streak', 'system.notification', time, { kind: 'streak' })), 'streak');
});
test('all ten WAVs are original small mono PCM clips, not external audio', () => {
  for (const cue of ['xp', 'quest', 'level', 'rank', 'unlock', 'streak', 'boss', 'achievement', 'notification', 'reward']) {
    const data = readFileSync(new URL(`assets/sounds/${cue}.wav`, root));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(20), 1);
    assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 22050);
    assert.ok(data.length < 27000);
  }
});
function providerRuntime(initial = new Map(), options = {}) {
  const values = new Map(initial), played = [], modes = [], removed = [];
  let stateListener, context;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async multiGet(keys) { return keys.map((key) => [key, values.get(key) ?? null]); },
    async setItem(key, value) {
      if (options.failWrites) throw new Error('Storage unavailable');
      values.set(key, value);
    },
  };
  const audio = {
    async setAudioModeAsync(mode) { modes.push(mode); },
    createAudioPlayer(source) {
      return { volume: 0, play() { played.push(source); }, remove() { removed.push(source); } };
    },
  };
  const appState = { currentState: 'active', addEventListener(_name, listener) { stateListener = listener; return { remove() {} }; } };
  const exports = {};
  vm.runInNewContext(compile('contexts/SystemExperienceContext.tsx'), {
    exports, Date, console,
    require(name) {
      if (name === 'react') return React;
      if (name === '@react-native-async-storage/async-storage') return storage;
      if (name === 'react-native') return { AppState: appState };
      if (name === 'expo-audio') return audio;
      if (name === './systemExperiencePolicy') return policy;
      if (name === '@/contexts/ProfileContext') return { useOptionalProfileSession: () => null };
      if (name.endsWith('.wav')) return name;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  function Probe() { context = exports.useSystemExperience(); return null; }
  return {
    values, played, modes, removed, get context() { return context; },
    element: React.createElement(exports.SystemExperienceProvider, null, React.createElement(Probe)),
    background() { appState.currentState = 'background'; stateListener('background'); },
  };
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('provider hydration, opt-in, volume, background release, replay and completion are independent of study/onboarding', async () => {
  const runtime = providerRuntime(new Map([[policy.ACTIVATION_COMPLETE_KEY, 'true']]));
  let renderer;
  await act(async () => { renderer = create(runtime.element); });
  assert.equal(runtime.context.ready, true);
  assert.equal(runtime.context.preference.enabled, false);
  assert.equal(runtime.context.activationComplete, true);
  await act(async () => runtime.context.play('xp'));
  assert.equal(runtime.played.length, 0);
  await act(async () => runtime.context.saveSound({ enabled: true, volume: 0.25 }));
  assert.equal(runtime.played.length, 0, 'opt-in must not autoplay');
  await act(async () => runtime.context.play('notification'));
  assert.equal(runtime.played.length, 1);
  assert.equal(runtime.modes[0].playsInSilentMode, false);
  assert.equal(runtime.modes[0].shouldPlayInBackground, false);
  await act(async () => runtime.background());
  assert.equal(runtime.removed.length, 1);
  await act(async () => runtime.context.replayActivation());
  assert.equal(runtime.context.replaying, true);
  await act(async () => runtime.context.finishActivation());
  assert.equal(runtime.context.replaying, false);
  assert.deepEqual([...runtime.values.keys()].sort(), [policy.ACTIVATION_COMPLETE_KEY, policy.SOUND_PREFERENCE_KEY].sort());
  await act(async () => renderer.unmount());
});
test('persisted opt-in hydrates without audio; invalid sound JSON does not reset activation completion', async () => {
  for (const stored of ['{"enabled":true,"volume":0.5}', '{invalid']) {
    const runtime = providerRuntime(new Map([[policy.SOUND_PREFERENCE_KEY, stored], [policy.ACTIVATION_COMPLETE_KEY, 'true']]));
    let renderer;
    await act(async () => { renderer = create(runtime.element); });
    assert.equal(runtime.played.length, 0);
    assert.equal(runtime.context.activationComplete, true);
    if (stored === '{invalid') {
      assert.equal(runtime.context.preference.enabled, false);
      assert.match(runtime.context.error, /invalid/);
    }
    await act(async () => renderer.unmount());
  }
});
test('failed completion is explicit and does not mark activation done or alter account/onboarding data', async () => {
  const runtime = providerRuntime(new Map([['existing-study-data', 'keep']]), { failWrites: true });
  let renderer;
  await act(async () => { renderer = create(runtime.element); });
  await act(async () => {
    await assert.rejects(runtime.context.finishActivation(), /could not be saved/);
  });
  assert.equal(runtime.context.activationComplete, false);
  assert.match(runtime.context.error, /onboarding and study data are unchanged/);
  await act(async () => runtime.context.saveSound({ enabled: false, volume: 0.75 }));
  assert.match(runtime.context.error, /could not be saved/);
  assert.deepEqual([...runtime.values.entries()], [['existing-study-data', 'keep']]);
  assert.equal(runtime.played.length, 0);
  await act(async () => renderer.unmount());
});
test('read-only sound bridge and activation never own domain rewards or onboarding storage', () => {
  for (const file of ['components/system/SystemSoundBridge.tsx', 'components/system/SystemActivation.tsx', 'contexts/SystemExperienceContext.tsx']) {
    const source = readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /\b(completeQuest|toggleQuest|acknowledgeRpgPresentation|refreshRpgClock|setTotalXp|ONBOARDING_COMPLETE_STORAGE_KEY)\b/);
  }
  const source = readFileSync(new URL('components/system/SystemActivation.tsx', root), 'utf8');
  assert.match(source, /useState\(true\)/, 'activation must start static until the OS preference is available');
  assert.match(source, /state\.date/);
  assert.match(source, /ScrollView/);
  assert.match(source, /insets\.top/);
});