import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_KEY, STORAGE_KEY, assertBlocked, batchPayload, deferred,
  controlProgressWrites, legacyPayload, mockStorage, mountProvider, settle,
} from './study-provider-harness.mjs';

function assertSavedHydration(provider, storage, xp = 4321) {
  assert.equal(provider.current?.hydrated, true);
  assert.equal(provider.current.state.totalXp, xp);
  assert.equal(provider.current.state.streak, 9);
  assert.ok(provider.renderedStates.length > 0);
  assert.ok(provider.renderedStates.every((state) => JSON.parse(state).totalXp === xp),
    'Every editable render uses saved progress, never defaults');
  const saves = storage.writes.filter((call) => call.key === STORAGE_KEY);
  assert.ok(saves.length > 0, 'The hydrated provider saves its prepared state');
  assert.ok(saves.every((call) => JSON.parse(call.value).totalXp === xp),
    'No default-state or abandoned-load snapshot is saved');
  assert.equal(storage.data.get(STORAGE_KEY), provider.snapshot());
}

// Resolve/reject at each asynchronous loading boundary, both before and after
// a new mount hydrates. All gates belong to the abandoned mount only.
for (const boundary of ['progress read', 'backup read', 'backup write']) {
  for (const fails of [false, true]) {
    for (const freshFirst of [false, true]) {
      test(`unmount during ${boundary}: late ${fails ? 'failure' : 'success'} ${
        freshFirst ? 'after' : 'before'
      } a fresh mount preserves progress`, async (t) => {
        const original = boundary === 'progress read' ? batchPayload() : legacyPayload();
        const backup = legacyPayload({ totalXp: 1111 });
        const entries = [[STORAGE_KEY, original]];
        if (boundary !== 'backup write') entries.push([BACKUP_KEY, backup]);
        const storage = mockStorage(entries);
        const gate = deferred();
        if (boundary === 'backup write') {
          storage.onWrite = (call) => call.key === BACKUP_KEY ? gate.promise : undefined;
        } else {
          storage.onRead = (key) => key === (
            boundary === 'progress read' ? STORAGE_KEY : BACKUP_KEY
          ) ? gate.promise : undefined;
        }
        const abandoned = await mountProvider(t, storage);
        assertBlocked(abandoned, storage, original);
        assert.deepEqual(storage.reads, boundary === 'progress read'
          ? [STORAGE_KEY] : [STORAGE_KEY, BACKUP_KEY]);
        assert.deepEqual(storage.writes, boundary === 'backup write'
          ? [{ key: BACKUP_KEY, value: original }] : []);
        assert.equal(storage.completed.length, 0);
        await abandoned.unmount();
        // Remove delays for subsequent operations; already-started operations
        // still await the captured promise.
        storage.onRead = null;
        storage.onWrite = null;
        let fresh;
        if (freshFirst) fresh = await mountProvider(t, storage);
        const writesBeforeSettlement = storage.writes.length;
        await settle(gate, fails ? new Error('Abandoned operation failed') : undefined);
        assert.equal(abandoned.current, null);
        assert.equal(abandoned.renders, 0, 'Abandoned load never mounts editable children');
        assert.equal(storage.writes.length, writesBeforeSettlement,
          'Settling an abandoned load must not start a progress save');
        if (!freshFirst) {
          assertBlocked(abandoned, storage, original);
          assert.equal(storage.data.get(BACKUP_KEY), boundary === 'backup write'
            ? (fails ? undefined : original) : backup);
          fresh = await mountProvider(t, storage);
        }
        assertSavedHydration(fresh, storage);
        assert.equal(storage.data.get(BACKUP_KEY), boundary === 'backup write' ? original : backup,
          'The original backup bytes survive abandoned and fresh loads');
        if (boundary === 'progress read') {
          assert.equal(fresh.current.state.activeBatchId, 'saved-batch');
        } else {
          assert.equal(fresh.current.activeBatch.subjects[0].topics[0].title, 'Saved topic');
          assert.equal(fresh.current.activeBatch.subjects[0].topics[0].lectures.filter(
            (lecture) => lecture.status === 'completed',
          ).length, 3, 'Fresh mount restores legacy lecture progress');
        }
      });
    }
  }
}

for (const fails of [false, true]) {
  for (const liveFirst of [false, true]) {
    test(`StrictMode replay ignores abandoned read ${fails ? 'failure' : 'success'} ${
      liveFirst ? 'after' : 'before'
    } live hydration`, async (t) => {
      const original = legacyPayload();
      const backup = legacyPayload({ totalXp: 1111 });
      const storage = mockStorage([[STORAGE_KEY, original], [BACKUP_KEY, backup]]);
      const gates = [deferred(), deferred()];
      let reads = 0;
      storage.onRead = (key) => key === STORAGE_KEY ? gates[reads++].promise : undefined;
      const provider = await mountProvider(t, storage, { strictMode: true });
      assert.equal(reads, 2, 'StrictMode actually runs load setup, cleanup, and setup again');
      assertBlocked(provider, storage, original);
      assert.equal(storage.writes.length, 0);
      if (liveFirst) {
        await settle(gates[1]);
        assertSavedHydration(provider, storage);
      }
      const writesBeforeSettlement = storage.writes.length;
      await settle(gates[0], fails ? new Error('Replayed read failed') : undefined);
      assert.equal(storage.writes.length, writesBeforeSettlement,
        'The cleaned-up effect cannot schedule a save');
      assert.deepEqual(provider.alerts(), [], 'An abandoned failure cannot show a load error');
      if (!liveFirst) {
        assertBlocked(provider, storage, original);
        assert.equal(storage.writes.length, 0);
        await settle(gates[1]);
      }
      assertSavedHydration(provider, storage);
      assert.equal(storage.data.get(BACKUP_KEY), backup);
      assert.equal(storage.writes.some((call) => call.key === BACKUP_KEY), false);
      await provider.unmount();
      storage.onRead = null;
      const fresh = await mountProvider(t, storage);
      assert.equal(fresh.snapshot(), provider.snapshot(), 'Replayed hydration survives reopening');
      assertSavedHydration(fresh, storage);
      assert.equal(storage.data.get(BACKUP_KEY), backup);
    });
  }
}

test('rejected progress reads never expose edits or save defaults; retry loads the saved data', async (t) => {
  const original = batchPayload();
  const storage = mockStorage([[STORAGE_KEY, original]]);
  storage.onRead = () => { throw new Error('Device read unavailable'); };
  const provider = await mountProvider(t, storage);

  assertBlocked(provider, storage, original);
  assert.equal(provider.hasButton('Retry loading progress'), true);
  assert.match(provider.alerts()[0], /not been reset or overwritten/);
  await provider.press('Retry loading progress');
  assertBlocked(provider, storage, original);
  assert.deepEqual(storage.reads, [STORAGE_KEY, STORAGE_KEY]);
  assert.equal(storage.writes.length, 0);

  storage.onRead = null;
  await provider.press('Retry loading progress');
  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.current.state.totalXp, 4321);
  assert.equal(provider.current.state.activeBatchId, 'saved-batch');
  assert.equal(storage.data.get(STORAGE_KEY), provider.snapshot());
  assert.equal(provider.hasButton('Retry loading progress'), false);
});

test('a rejected legacy backup read blocks migration rather than risking the existing backup', async (t) => {
  const original = legacyPayload();
  const backup = 'original backup bytes';
  const storage = mockStorage([[STORAGE_KEY, original], [BACKUP_KEY, backup]]);
  storage.onRead = (key) => {
    if (key === BACKUP_KEY) throw new Error('Cannot read backup');
  };
  const provider = await mountProvider(t, storage);
  assertBlocked(provider, storage, original);
  assert.equal(provider.hasButton('Retry loading progress'), true);
  assert.deepEqual(storage.reads, [STORAGE_KEY, BACKUP_KEY]);
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.data.get(BACKUP_KEY), backup);
});

test('a delayed and then failed legacy backup write never hydrates or overwrites progress', async (t) => {
  const original = legacyPayload();
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const gate = deferred();
  storage.onWrite = (call) => call.key === BACKUP_KEY ? gate.promise : undefined;
  const provider = await mountProvider(t, storage);

  assertBlocked(provider, storage, original);
  assert.equal(provider.hasButton('Retry loading progress'), false, 'Backup is still pending');
  assert.deepEqual(storage.writes, [{ key: BACKUP_KEY, value: original }]);
  await settle(gate, new Error('Device full'));
  assertBlocked(provider, storage, original);
  assert.equal(provider.hasButton('Retry loading progress'), true);
  assert.equal(storage.data.has(BACKUP_KEY), false);
  assert.equal(storage.completed.length, 0);

  // Repeated failure must still be safe, then a recovered device can migrate.
  storage.onWrite = () => { throw new Error('Still full'); };
  await provider.press('Retry loading progress');
  assertBlocked(provider, storage, original);
  assert.equal(storage.data.has(BACKUP_KEY), false);
  storage.onWrite = null;
  await provider.press('Retry loading progress');
  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.current.state.totalXp, 4321);
  assert.equal(storage.data.get(BACKUP_KEY), original);
  assert.equal(storage.completed[0].key, BACKUP_KEY, 'Backup commits before migrated state');
  assert.equal(storage.data.get(STORAGE_KEY), provider.snapshot());
});

test('an existing original legacy backup is never replaced by later migrations or saves', async (t) => {
  const backup = legacyPayload({ totalXp: 1111 });
  const original = legacyPayload({ totalXp: 6789 });
  const storage = mockStorage([[STORAGE_KEY, original], [BACKUP_KEY, backup]]);
  const provider = await mountProvider(t, storage);
  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.current.state.totalXp, 6789);
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  assert.equal(storage.data.get(STORAGE_KEY), provider.snapshot());
  assert.equal(storage.data.get(BACKUP_KEY), backup);
  assert.equal(storage.writes.some((call) => call.key === BACKUP_KEY), false);

  // Even another legacy payload from a later load must leave the first backup.
  storage.data.set(STORAGE_KEY, legacyPayload({ totalXp: 9999 }));
  const reloaded = await mountProvider(t, storage);
  assert.equal(reloaded.current.state.totalXp, 9999);
  assert.equal(storage.data.get(BACKUP_KEY), backup);
  assert.equal(storage.writes.some((call) => call.key === BACKUP_KEY), false);
});

test('delayed overlapping snapshots are invoked and committed in order, never concurrently', async (t) => {
  const original = batchPayload();
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const gates = [];
  let activeWrites = 0;
  let maxActiveWrites = 0;
  storage.onWrite = async () => {
    const gate = deferred();
    gates.push(gate);
    activeWrites += 1;
    maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
    try { await gate.promise; } finally { activeWrites -= 1; }
  };
  const provider = await mountProvider(t, storage);
  const snapshots = [provider.snapshot()];
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  snapshots.push(provider.snapshot());
  await provider.edit((study) => study.toggleQuest('timed-calculation'));
  snapshots.push(provider.snapshot());
  assert.equal(new Set(snapshots).size, 3, 'Each edit produces a distinct snapshot');

  assert.equal(storage.writes.length, 1, 'Newer saves wait while the oldest is delayed');
  assert.equal(storage.completed.length, 0);
  assert.equal(storage.data.get(STORAGE_KEY), original);
  await settle(gates[0]);
  assert.equal(storage.writes.length, 2);
  assert.equal(storage.data.get(STORAGE_KEY), snapshots[0]);
  await settle(gates[1]);
  assert.equal(storage.writes.length, 3);
  assert.equal(storage.data.get(STORAGE_KEY), snapshots[1]);
  await settle(gates[2]);
  assert.equal(maxActiveWrites, 1);
  assert.deepEqual(storage.writes.map((call) => call.value), snapshots);
  assert.deepEqual(storage.completed.map((call) => call.value), snapshots);
  assert.ok(storage.writes.every((call) => call.key === STORAGE_KEY));
  assert.equal(storage.data.get(STORAGE_KEY), snapshots[2]);
});

test('unmount after hydration still drains pending and queued progress writes', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage);
  assertSavedHydration(provider, storage);
  const persisted = storage.data.get(STORAGE_KEY);
  const held = controlProgressWrites(t, storage);
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  const pending = provider.snapshot();
  await provider.edit((study) => study.toggleQuest('timed-calculation'));
  const queued = provider.snapshot();
  assert.notEqual(pending, queued);
  assert.equal(held.length, 1, 'Second edit is queued, not yet invoked');
  await provider.unmount();
  const renders = provider.renders;
  assert.equal(storage.data.get(STORAGE_KEY), persisted);
  await held[0].settle();
  assert.equal(held.length, 2, 'Unmount does not discard the queued edit');
  assert.equal(held[1].value, queued);
  assert.equal(storage.data.get(STORAGE_KEY), pending);
  await held[1].settle();
  assert.equal(storage.data.get(STORAGE_KEY), queued);
  assert.equal(provider.renders, renders, 'Settlements do not render the unmounted provider');
  assert.deepEqual(storage.completed.slice(-2).map((call) => call.value), [pending, queued]);
  const reopened = await mountProvider(t, storage);
  assert.equal(reopened.snapshot(), queued, 'Drained edits survive reopening');
  assert.equal(held.length, 3);
  await held[2].settle();
});

// These interleavings use separate module graphs, which represent separate app
// runtimes rather than provider remounts within this Expo process. Keep the
// characterization visible but skipped; shared-runtime remount behavior is
// exercised by the tests above and below. No cross-process lock is promised.
for (const freshFirst of [false, true]) {
  for (const fails of [false, true]) {
    test.skip(`separate-runtime characterization: ${freshFirst ? 'fresh' : 'old'} writes finish first, ${
      fails ? 'old in-flight write rejects' : 'old in-flight write succeeds'
    }`, async (t) => {
      const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
      const old = await mountProvider(t, storage);
      assertSavedHydration(old, storage);
      const persisted = old.snapshot();
      const held = controlProgressWrites(t, storage);
      await old.edit((study) => study.toggleQuest('morning-workout'));
      const oldPending = old.snapshot();
      await old.edit((study) => study.toggleQuest('timed-calculation'));
      const oldQueued = old.snapshot();
      assert.equal(held.length, 1);
      assert.equal(held[0].value, oldPending);
      assert.equal(storage.data.get(STORAGE_KEY), persisted);
      await old.unmount();
      const oldRenders = old.renders;

      const fresh = await mountProvider(t, storage);
      assert.equal(fresh.current.hydrated, true, 'Reopened provider finishes loading');
      assert.equal(fresh.snapshot(), persisted, 'Reopening reads disk before old writes settle');
      assert.equal(held.length, 2, 'Separate mounts start concurrent writes');
      assert.equal(held[1].value, persisted, 'Fresh hydration save is independently held');
      await fresh.edit((study) => study.toggleQuest('ncert-reading'));
      const newer = fresh.snapshot();
      assert.equal(new Set([persisted, oldPending, oldQueued, newer]).size, 4);
      assert.equal(held.length, 2, 'Fresh edit queues behind its own hydration save');
      const completedBefore = storage.completed.length;

      const finishOld = async () => {
        await held[0].settle(fails ? new Error('Unmounted write failed') : undefined);
        const queued = held.at(-1);
        assert.equal(queued.value, oldQueued, 'Old queue drains even after unmount or rejection');
        await queued.settle();
        assert.equal(storage.data.get(STORAGE_KEY), oldQueued);
      };
      const finishFresh = async () => {
        await held[1].settle();
        const queued = held.at(-1);
        assert.equal(queued.value, newer);
        await queued.settle();
        assert.equal(storage.data.get(STORAGE_KEY), newer);
      };
      if (freshFirst) {
        await finishFresh();
        await finishOld();
      } else {
        await finishOld();
        await finishFresh();
      }
      const oldCommits = fails ? [oldQueued] : [oldPending, oldQueued];
      const freshCommits = [persisted, newer];
      assert.deepEqual(storage.completed.slice(completedBefore).map((call) => call.value),
        freshFirst ? [...freshCommits, ...oldCommits] : [...oldCommits, ...freshCommits]);
      assert.equal(held.length, 4, 'All pending and queued writes were invoked');
      assert.ok(held.every((call) => call.settled), 'Every controlled write has settled');
      assert.equal(old.renders, oldRenders);
      assert.equal(fresh.snapshot(), newer, 'Late disk writes do not change the live UI');
      assert.deepEqual(fresh.alerts(), [], 'Old write failures are not visible in the fresh provider');
      const finalBytes = storage.data.get(STORAGE_KEY);
      assert.equal(finalBytes, freshFirst ? oldQueued : newer,
        'Current behavior is last-completing mount wins, not newest edit wins');

      await t.test('newer progress cannot be overwritten by an earlier mount', {
        todo: freshFirst ? 'KNOWN SAFETY FAILURE: old queue replaces the newer saved edit' : false,
      }, () => {
        assert.ok(finalBytes === newer, 'Disk must retain the fresh provider’s newer edit');
      });
      await t.test('queued pre-unmount progress survives reopening', {
        todo: freshFirst ? false : 'KNOWN SAFETY FAILURE: fresh stale snapshot replaces drained old edits',
      }, () => {
        const saved = JSON.parse(finalBytes);
        const previous = JSON.parse(oldQueued);
        for (const id of ['morning-workout', 'timed-calculation']) {
          assert.equal(saved.quests.find((quest) => quest.id === id)?.completed,
            previous.quests.find((quest) => quest.id === id)?.completed,
            `Queued progress for ${id} must survive reopening`);
        }
      });

      await fresh.unmount();
      storage.onWrite = null;
      const reopened = await mountProvider(t, storage);
      assert.equal(reopened.snapshot(), finalBytes, 'Next reopening exposes the actual persisted winner');
    });
  }
}

test('failed saves keep edits in memory and Retry saving persists the latest, not the failed snapshot', async (t) => {
  const original = batchPayload();
  const storage = mockStorage([[STORAGE_KEY, original]]);
  storage.onWrite = () => { throw new Error('Write unavailable'); };
  const provider = await mountProvider(t, storage);
  const failedInitialSnapshot = storage.writes[0].value;
  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.hasButton('Retry saving'), true);
  assert.match(provider.alerts()[0], /latest progress could not be saved/);
  assert.equal(storage.data.get(STORAGE_KEY), original);

  await provider.edit((study) => study.toggleQuest('morning-workout'));
  const failedEditSnapshot = provider.snapshot();
  await provider.edit((study) => study.toggleQuest('timed-calculation'));
  const latest = provider.snapshot();
  assert.notEqual(latest, failedInitialSnapshot);
  assert.notEqual(latest, failedEditSnapshot);
  assert.equal(storage.writes.length, 3);
  assert.equal(storage.completed.length, 0);
  assert.equal(storage.data.get(STORAGE_KEY), original);
  assert.equal(provider.hasButton('Retry saving'), true);

  // A failed retry also leaves both the original disk bytes and current edits.
  await provider.press('Retry saving');
  assert.equal(storage.writes.at(-1).value, latest);
  assert.equal(storage.data.get(STORAGE_KEY), original);
  assert.equal(provider.snapshot(), latest);
  assert.equal(provider.hasButton('Retry saving'), true);

  const gate = deferred();
  storage.onWrite = () => gate.promise;
  await provider.press('Retry saving');
  assert.equal(storage.writes.at(-1).value, latest);
  assert.equal(provider.hasButton('Retry saving'), true, 'Alert stays visible until storage succeeds');
  assert.equal(storage.data.get(STORAGE_KEY), original);
  await settle(gate);
  assert.equal(storage.data.get(STORAGE_KEY), latest);
  assert.equal(provider.hasButton('Retry saving'), false);
  assert.deepEqual(provider.alerts(), []);
  assert.deepEqual(storage.completed.map((call) => call.value), [latest]);

  const reloaded = await mountProvider(t, storage);
  assert.equal(reloaded.snapshot(), latest, 'Recovered retry survives a new provider mount');
});

test('a rejected in-flight save does not poison the queue; retry waits and captures the newest state', async (t) => {
  const storage = mockStorage([[STORAGE_KEY, batchPayload()]]);
  const provider = await mountProvider(t, storage);
  const persisted = storage.data.get(STORAGE_KEY);
  const gates = [];
  storage.onWrite = () => {
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  await provider.edit((study) => study.toggleQuest('morning-workout'));
  const obsolete = provider.snapshot();
  await provider.edit((study) => study.toggleQuest('timed-calculation'));
  const newer = provider.snapshot();
  assert.equal(gates.length, 1);
  await settle(gates[0], new Error('First edit failed'));
  assert.equal(provider.hasButton('Retry saving'), true);
  assert.equal(storage.data.get(STORAGE_KEY), persisted);
  assert.equal(gates.length, 2, 'Queue advances after rejection');
  assert.equal(storage.writes.at(-1).value, newer);

  // Make one more edit while the second save is pending. Retry must capture
  // this state, not the original failure or the currently in-flight payload.
  await provider.edit((study) => study.toggleQuest('ncert-reading'));
  const latest = provider.snapshot();
  await provider.press('Retry saving');
  assert.equal(gates.length, 2, 'Retry cannot bypass the in-flight write');
  await settle(gates[1]);
  assert.equal(gates.length, 3);
  assert.equal(storage.writes.at(-1).value, latest);
  await settle(gates[2]);
  assert.equal(gates.length, 4);
  assert.equal(storage.writes.at(-1).value, latest, 'Retry serializes the current state');
  await settle(gates[3]);
  assert.deepEqual(storage.writes.slice(1).map((call) => call.value), [obsolete, newer, latest, latest]);
  assert.deepEqual(storage.completed.slice(1).map((call) => call.value), [newer, latest, latest]);
  assert.equal(storage.data.get(STORAGE_KEY), latest);
  assert.equal(provider.hasButton('Retry saving'), false);
});