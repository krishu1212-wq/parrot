import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORAGE_KEY, assertBlocked, batchPayload, mockStorage, mountProvider,
} from './study-provider-harness.mjs';

test('raw streak is captured before rollover and persisted history survives a provider reload', async (t) => {
  const original = batchPayload({
    date: '2026-09-29',
    lastActiveDate: '2026-09-29',
    streak: 7,
  });
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const provider = await mountProvider(t, storage);

  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.current.state.streak, 0, 'The expired active streak rolls over');
  assert.equal(provider.current.state.achievementHistory.highestObservedStreak, 7);
  assert.deepEqual([...provider.current.state.achievementHistory.earnedRelicIds], ['streak-7']);
  assert.equal(provider.current.state.totalXp, 4321);
  const persisted = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.deepEqual(persisted.achievementHistory, JSON.parse(JSON.stringify(provider.current.state.achievementHistory)));

  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  assert.equal(reloaded.current.state.streak, 0);
  assert.equal(reloaded.current.state.achievementHistory.highestObservedStreak, 7);
  assert.deepEqual([...reloaded.current.state.achievementHistory.earnedRelicIds], ['streak-7']);
});

test('legitimate lecture completion adds a relic once and keeps it through reload', async (t) => {
  const original = batchPayload({
    streak: 0,
    batches: [{
      id: 'saved-batch',
      name: 'Saved batch',
      source: 'Saved course',
      startDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00.000Z',
      isActive: true,
      subjects: [{
        id: 'maths',
        name: 'Maths',
        topics: [{
          id: 'saved-topic',
          title: 'Saved topic',
          category: 'ARITHMETIC',
          isArchived: false,
          lectures: [{
            id: 'saved-lecture',
            title: 'Saved lecture',
            link: '',
            status: 'not-started',
            xpReward: 25,
            sessionCount: 0,
            firstStartedAt: null,
            lastStartedAt: null,
            completedAt: null,
            xpEarnedOn: null,
            xpAwarded: false,
            isArchived: false,
          }],
        }],
      }],
    }],
  });
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const provider = await mountProvider(t, storage);

  await provider.edit((study) => study.completeLecture('maths', 'saved-topic', 'saved-lecture'));
  assert.deepEqual([...provider.current.state.achievementHistory.earnedRelicIds], ['first-lecture']);
  const firstCompletion = provider.snapshot();
  await provider.edit((study) => study.completeLecture('maths', 'saved-topic', 'saved-lecture'));
  assert.equal(provider.snapshot(), firstCompletion, 'Duplicate completion does not change history');

  await provider.unmount();
  const reloaded = await mountProvider(t, storage);
  assert.deepEqual([...reloaded.current.state.achievementHistory.earnedRelicIds], ['first-lecture']);
});

test('malformed achievement metadata blocks hydration without replacing saved bytes', async (t) => {
  const original = batchPayload({
    achievementHistory: { highestObservedStreak: 'seven', earnedRelicIds: [] },
  });
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const provider = await mountProvider(t, storage);

  assertBlocked(provider, storage, original);
  assert.equal(provider.hasButton('Retry loading progress'), true);
  assert.match(provider.alerts()[0], /not been reset or overwritten/);
  assert.equal(storage.data.get(STORAGE_KEY), original);
  assert.equal(storage.writes.some((write) => write.key === STORAGE_KEY), false);
});

test('partial legacy hydration does not award seeded fallback progress as history', async (t) => {
  const original = batchPayload({
    streak: 0,
    batches: [{
      id: 'saved-batch',
      name: 'Saved batch',
      source: 'Saved course',
      startDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00.000Z',
      isActive: true,
      subjects: [],
    }],
  });
  const storage = mockStorage([[STORAGE_KEY, original]]);
  const provider = await mountProvider(t, storage);

  assert.equal(provider.current.hydrated, true);
  assert.deepEqual([...provider.current.state.achievementHistory.earnedRelicIds], []);
  const persisted = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.deepEqual(persisted.achievementHistory.earnedRelicIds, []);
});

test('a new authenticated account starts with zero streak and empty persisted history', async (t) => {
  const storage = mockStorage();
  const provider = await mountProvider(t, storage, { accountUserId: 'fresh-account' });

  assert.equal(provider.current.hydrated, true);
  assert.equal(provider.current.state.streak, 0);
  assert.equal(provider.current.state.achievementHistory.highestObservedStreak, 0);
  assert.deepEqual([...provider.current.state.achievementHistory.earnedRelicIds], []);
  assert.ok(storage.writes.some((write) => {
    const saved = JSON.parse(write.value);
    return saved.achievementHistory?.highestObservedStreak === 0
      && saved.achievementHistory?.earnedRelicIds.length === 0;
  }), 'The clean account snapshot includes empty achievement history');
});