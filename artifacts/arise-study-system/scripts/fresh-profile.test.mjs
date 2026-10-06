import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_KEY, STORAGE_KEY, batchPayload, legacyPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

function assertFreshProfile(provider) {
  const { current } = provider;
  const state = current.state;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.equal(current.hydrated, true);
  assert.equal(state.totalXp, 0);
  assert.equal(current.level, 1);
  assert.equal(current.rank, 'E-RANK');
  assert.equal(state.streak, 0);
  assert.ok(state.quests.every((quest) => !quest.completed), 'no quest is completed');
  assert.equal(current.phaseTwoUnlocked, false, 'a fresh profile remains in Phase 1');
  assert.equal(state.achievementHistory.highestObservedStreak, 0);
  assert.deepEqual(plain(state.achievementHistory.earnedRelicIds), []);
  assert.deepEqual(plain(state.progressHistory.systemEvents), []);
  assert.deepEqual(plain(state.progressHistory.xpEvents), []);
  assert.deepEqual(plain(state.progressHistory.dailyObservations), {});
  assert.deepEqual(plain(state.calculationHistory), []);
  assert.deepEqual(plain(state.studyTools.bossTests), []);
  assert.deepEqual(plain(state.rpg.attempts), []);
  assert.deepEqual(plain(state.rpg.events), []);
  assert.deepEqual(plain(state.rpg.inventory), {});
  assert.ok(Object.values(state.rpg.loadout).every((itemId) => itemId === null));
  assert.ok(Object.values(state.rpg.gates).every((gate) => !gate.completed));
  assert.ok(state.ncertShelves.every((shelf) => shelf.completed === 0 && shelf.sessions === 0));
  assert.ok(state.vocabularySections.every((section) => section.completed === 0));
  const lectures = state.batches.flatMap((batch) => batch.subjects.flatMap((subject) => (
    subject.topics.flatMap((topic) => topic.lectures)
  )));
  assert.ok(lectures.every((lecture) => lecture.status !== 'completed'));
}

test('a missing local profile starts clean and does not restore a stale legacy backup', async (t) => {
  const staleBackup = legacyPayload({ totalXp: 1240, streak: 4 });
  const storage = mockStorage([[BACKUP_KEY, staleBackup]]);
  const provider = await mountProvider(t, storage);

  assertFreshProfile(provider);
  assert.equal(storage.data.get(BACKUP_KEY), staleBackup, 'legacy backup bytes are preserved');
});

test('the dev-only local reset archives existing progress and saves clean defaults', async (t) => {
  const unrelatedData = 'other profile data';
  const oldBackup = 'legacy recovery bytes';
  const storage = mockStorage([
    [STORAGE_KEY, batchPayload({ totalXp: 4321, streak: 9 })],
    [BACKUP_KEY, oldBackup],
    ['unrelated-profile-data', unrelatedData],
  ]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.state.totalXp, 4321, 'existing progress is hydrated before reset');
  assert.equal(provider.current.state.streak, 9);
  const snapshotBeforeReset = storage.data.get(STORAGE_KEY);

  await provider.edit((study) => study.resetLocalProfile());
  await provider.edit(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  assertFreshProfile(provider);
  const archives = [...storage.data.entries()].filter(([key]) => key.startsWith(`${STORAGE_KEY}:dev-reset-archive:`));
  assert.equal(archives.length, 1, 'reset keeps one separate recovery copy');
  assert.equal(archives[0][1], snapshotBeforeReset, 'the active local snapshot is copied byte-for-byte');
  assert.equal(JSON.parse(storage.data.get(STORAGE_KEY)).totalXp, 0, 'clean defaults are persisted as the new local profile');
  assert.equal(storage.data.get(BACKUP_KEY), oldBackup, 'the legacy backup is untouched');
  assert.equal(storage.data.get('unrelated-profile-data'), unrelatedData, 'unrelated local data is untouched');
});

test('the reset action is unavailable outside development and for signed-in accounts', async (t) => {
  const localStorage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const productionProvider = await mountProvider(t, localStorage, { dev: false });
  const currentSnapshot = localStorage.data.get(STORAGE_KEY);
  await assert.rejects(
    productionProvider.current.resetLocalProfile(),
    /development builds/,
  );
  assert.equal(localStorage.data.get(STORAGE_KEY), currentSnapshot);

  const accountProvider = await mountProvider(t, mockStorage(), { accountUserId: 'user_alpha' });
  await assert.rejects(
    accountProvider.current.resetLocalProfile(),
    /anonymous local profile/,
  );
});