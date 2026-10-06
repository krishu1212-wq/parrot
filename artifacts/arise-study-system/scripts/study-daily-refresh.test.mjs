import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORAGE_KEY, batchPayload, controlledClock, deferred, mockStorage, mountProvider, settle,
} from './study-provider-harness.mjs';

const yesterday = '2026-10-01';
const today = '2026-10-02';
const beforeMidnight = new Date(2026, 9, 1, 23, 59, 30);
const afterMidnight = new Date(2026, 9, 2, 0, 0, 30);

function rolloverPayload(exhausted) {
  const lecture = {
    id: 'new-lecture', title: 'New lecture', link: 'https://example.com/lecture',
    status: 'in-progress', xpReward: 50, sessionCount: 2,
    firstStartedAt: new Date(2026, 9, 1, 20).toISOString(),
    lastStartedAt: beforeMidnight.toISOString(),
    completedAt: null, xpEarnedOn: null, xpAwarded: false, isArchived: false,
  };
  const subject = (entry) => [{
    id: 'maths', name: 'Maths', topics: [{
      id: 'topic', title: 'Saved topic', category: 'ARITHMETIC',
      isArchived: false, lectures: [entry],
    }],
  }];
  return batchPayload({
    batches: [{
      id: 'saved-batch', name: 'Saved batch', source: 'Saved course',
      startDate: yesterday, createdAt: beforeMidnight.toISOString(), isActive: true,
      subjects: subject(lecture),
    }, {
      id: 'historical-batch', name: 'Historical batch', source: 'Old course',
      startDate: '2026-09-01', createdAt: new Date(2026, 8, 1).toISOString(), isActive: false,
      subjects: subject({
        ...lecture, id: 'old-lecture', status: 'completed',
        completedAt: new Date(2026, 8, 30, 12).toISOString(),
        xpEarnedOn: '2026-09-30', xpAwarded: true, isArchived: true,
      }),
    }],
    vocabularySections: [
      { id: 'one-word', title: 'One Word', pages: exhausted ? 2 : 4, completed: 1 },
      { id: 'idioms', title: 'Idioms', pages: 4, completed: 1 },
    ],
    currentVocabularySectionId: 'one-word',
    currentVocabularyPage: 2,
    vocabularyDailyDate: yesterday,
    vocabularyDailyCompleted: false,
  });
}

for (const mode of ['delayed', 'rejected', 'rejected after rollover']) {
  const fails = mode !== 'delayed';
  const failedEarly = mode === 'rejected';
  for (const exhausted of [false, true]) {
    test(`midnight with ${mode} edits preserves progress and ${
      exhausted ? 'switches vocabulary category' : 'advances vocabulary page'
    }`, async (t) => {
      const clock = controlledClock(beforeMidnight);
      const storage = mockStorage([[STORAGE_KEY, rolloverPayload(exhausted)]]);
      const provider = await mountProvider(t, storage, { clock });
      const persisted = provider.snapshot();
      assert.equal(storage.data.get(STORAGE_KEY), persisted);
      assert.equal(clock.intervals.size, 1, 'Hydration installs one refresh interval');
      assert.equal([...clock.intervals.values()][0].delay, 60_000);
      assert.deepEqual(storage.reads, [STORAGE_KEY]);

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

      // These are real provider actions, not a hand-built post-edit state.
      await provider.edit((study) => {
        study.completeLecture('maths', 'topic', 'new-lecture');
        study.completeVocabularyPage('one-word');
        study.toggleQuest('morning-workout');
      });
      const edited = provider.snapshot();
      const before = JSON.parse(edited);
      const completedLecture = before.batches[0].subjects[0].topics[0].lectures[0];
      // The edit earns 50 lecture XP, the 160-XP Maths quest, the 100-XP
      // Black Book quest, and the 80-XP workout quest: 390 XP in total.
      assert.equal(before.totalXp, 4321 + 50 + 160 + 100 + 80);
      assert.equal(provider.current.todayXp, 50 + 160 + 100 + 80);
      assert.equal(before.quests.find((quest) => quest.id === 'maths-lecture')?.completed, true);
      assert.equal(before.quests.find((quest) => quest.id === 'black-book')?.completed, true);
      assert.equal(before.vocabularyDailyCompleted, true);
      assert.equal(before.vocabularySections[0].completed, 2);
      assert.equal(completedLecture.status, 'completed');
      assert.equal(completedLecture.sessionCount, 2);
      assert.equal(completedLecture.completedAt, beforeMidnight.toISOString());
      assert.equal(completedLecture.xpEarnedOn, yesterday);
      assert.equal(completedLecture.xpAwarded, true);
      assert.equal(gates.length, 1, 'The edited snapshot is still in flight');
      if (failedEarly) {
        await settle(gates[0], new Error('Mock device write rejected before midnight'));
        assert.equal(provider.hasButton('Retry saving'), true);
        assert.equal(provider.snapshot(), edited, 'Rejection retains unsaved edits');
        assert.equal(storage.data.get(STORAGE_KEY), persisted);
      }

      // Moving the clock alone cannot refresh state. Exercise the actual
      // callback registered by the provider, without remounting or editing.
      clock.setTime(afterMidnight);
      assert.equal(provider.current.state.date, yesterday);
      await clock.fireIntervals();
      const rollover = provider.snapshot();
      const next = JSON.parse(rollover);
      assert.equal(next.date, today);
      assert.equal(next.vocabularyDailyDate, today);
      assert.equal(next.vocabularyDailyCompleted, false);
      assert.equal(next.currentVocabularySectionId, exhausted ? 'idioms' : 'one-word');
      assert.equal(next.currentVocabularyPage, exhausted ? 2 : 3);
      assert.deepEqual(next.vocabularySections, before.vocabularySections);
      assert.equal(next.blackBookPage, before.blackBookPage);
      assert.deepEqual(next.batches, before.batches, 'All batch/session/XP history survives rollover');
      assert.equal(next.activeBatchId, before.activeBatchId);
      assert.equal(next.totalXp, before.totalXp, 'Daily reset must not remove earned XP');
      assert.equal(next.lastActiveDate, yesterday);
      assert.equal(next.streak, 9);
      assert.equal(next.quests.length, 6);
      assert.ok(next.quests.every((quest) => !quest.completed && !quest.isRecovery));
      assert.equal(provider.current.completedCount, 0);
      assert.equal(provider.current.todayXp, 0, 'Yesterday lecture and quest XP is not today XP');
      assert.equal(next.recoveryAvailable, true);
      assert.equal(next.recoveryXp, 120 + 100 + 100,
        'Only the uncompleted calculation and NCERT quests are recoverable');
      assert.equal(storage.data.get(STORAGE_KEY), persisted);
      assert.equal(gates.length, failedEarly ? 2 : 1,
        'Rollover save advances only after the edited snapshot settles');
      assert.equal(provider.hasButton('Retry saving'), failedEarly,
        'Rollover does not clear a pre-midnight save failure');
      assert.deepEqual(storage.reads, [STORAGE_KEY], 'Refresh uses unsaved memory, never disk');

      await clock.fireIntervals();
      assert.equal(provider.snapshot(), rollover, 'Repeated same-day ticks are idempotent');
      await provider.edit((study) => {
        // Re-completing an old lecture must not award XP for the new day.
        study.completeLecture('maths', 'topic', 'new-lecture');
        study.completeVocabularyPage(exhausted ? 'idioms' : 'one-word');
        study.toggleQuest('morning-workout');
      });
      const latest = provider.snapshot();
      // The new vocabulary page awards Black Book (100) and the workout
      // awards 80; repeating the already-completed lecture awards nothing.
      assert.equal(provider.current.state.totalXp, before.totalXp + 100 + 80);
      assert.equal(provider.current.todayXp, 100 + 80);
      assert.equal(provider.current.state.quests.find((quest) => quest.id === 'maths-lecture')?.completed, false);
      assert.equal(provider.current.state.quests.find((quest) => quest.id === 'black-book')?.completed, true);
      assert.equal(provider.current.state.streak, 10);
      assert.equal(provider.current.state.lastActiveDate, today);
      assert.equal(provider.current.state.vocabularyDailyCompleted, true);
      assert.equal(provider.current.state.currentVocabularyPage, exhausted ? 2 : 3);
      assert.equal(provider.current.state.vocabularySections[exhausted ? 1 : 0].completed,
        exhausted ? 2 : 3);
      assert.deepEqual(JSON.parse(latest).batches, before.batches);
      await clock.fireIntervals();
      assert.equal(provider.snapshot(), latest, 'Refresh cannot clear new-day completion');
      assert.equal(gates.length, failedEarly ? 2 : 1,
        'Post-rollover edits wait for the in-flight save');

      const failure = () => fails ? new Error('Mock device write rejected') : undefined;
      if (!failedEarly) await settle(gates[0], failure());
      assert.equal(gates.length, 2);
      assert.equal(storage.writes.at(-1).value, rollover);
      assert.equal(storage.data.get(STORAGE_KEY), fails ? persisted : edited);
      assert.equal(provider.hasButton('Retry saving'), fails);
      if (fails) {
        await provider.press('Retry saving');
        assert.equal(gates.length, 2, 'Retry waits behind rollover and new-day saves');
      }
      await settle(gates[1], failure());
      assert.equal(gates.length, 3);
      assert.equal(storage.writes.at(-1).value, latest);
      assert.equal(storage.data.get(STORAGE_KEY), fails ? persisted : rollover);
      await settle(gates[2], failure());
      if (fails) {
        assert.equal(gates.length, 4, 'Failures cannot poison the save queue');
        assert.equal(storage.writes.at(-1).value, latest, 'Retry captures newest post-rollover state');
        assert.equal(storage.data.get(STORAGE_KEY), persisted);
        assert.equal(provider.hasButton('Retry saving'), true);
        assert.match(provider.alerts()[0], /latest progress could not be saved/);
        await settle(gates[3]);
      }
      assert.equal(provider.snapshot(), latest, 'Save settlements never replace live edits');
      assert.equal(storage.data.get(STORAGE_KEY), latest);
      assert.equal(provider.hasButton('Retry saving'), false);
      assert.deepEqual(provider.alerts(), []);
      assert.equal(maxActiveWrites, 1);
      assert.equal(activeWrites, 0);
      assert.ok(storage.writes.every((call) => call.key === STORAGE_KEY));
      assert.deepEqual(storage.writes.slice(1).map((call) => call.value),
        fails ? [edited, rollover, latest, latest] : [edited, rollover, latest]);
      assert.deepEqual(storage.completed.slice(1).map((call) => call.value),
        fails ? [latest] : [edited, rollover, latest]);
      await provider.unmount();
      assert.equal(clock.intervals.size, 0, 'Unmount removes the controlled interval');
      await clock.fireIntervals();
      assert.equal(storage.data.get(STORAGE_KEY), latest);
    });
  }
}