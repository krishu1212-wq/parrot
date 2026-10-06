import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// The model is dependency-free. Compile it in memory to test the real TS source
// without introducing a second test runner or writing generated files.
const source = readFileSync(new URL('../contexts/batchSystem.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Date, Math });
const { normalizeBatchCollection, createStudyBatch, getSubjectProgress, getNextLecture } = exports;
const legacy = [
  { id: 'percent', section: 'Arithmetic', title: 'Percentage', total: 5, completed: 2 },
  { id: 'ratio', section: 'Arithmetic', title: 'Ratio', total: 3, completed: 1 },
];
const migrate = () => normalizeBatchCollection(undefined, undefined, legacy, []);
const newLecture = (id) => ({
  id, title: id, link: '', status: 'not-started', xpReward: 50,
  sessionCount: 0, firstStartedAt: null, lastStartedAt: null,
  completedAt: null, xpEarnedOn: null, xpAwarded: false, isArchived: false,
});

test('legacy migration preserves topic counts and cannot award old completion XP again', () => {
  const original = JSON.stringify(legacy);
  const { batches, activeBatchId } = migrate();
  const maths = batches[0].subjects[0];
  assert.equal(activeBatchId, 'current-batch');
  assert.equal(getSubjectProgress(maths).completed, 3);
  assert.equal(getSubjectProgress(maths).total, 8);
  for (const lecture of maths.topics.flatMap((topic) => topic.lectures)) {
    assert.equal(lecture.xpAwarded, lecture.status === 'completed');
    assert.equal(lecture.xpEarnedOn, null);
  }
  assert.equal(getNextLecture(batches[0]).lecture.id, 'percent-lecture-3');
  assert.equal(JSON.stringify(legacy), original);
});

test('future batches have their own topics, lecture counts and next action', () => {
  const current = migrate().batches[0];
  const future = createStudyBatch('Future', 'Real course', '2026-10-01', 'future');
  future.subjects[0].topics.push({
    id: 'new-topic', title: 'New syllabus', category: '', isArchived: false,
    lectures: [newLecture('first'), newLecture('second')],
  });
  future.subjects[0].topics[0].lectures[0].status = 'completed';
  assert.equal(getSubjectProgress(future.subjects[0]).completed, 1);
  assert.equal(getSubjectProgress(future.subjects[0]).total, 2);
  assert.equal(getSubjectProgress(current.subjects[0]).completed, 3);
  assert.equal(getSubjectProgress(current.subjects[0]).total, 8);
  assert.equal(getNextLecture(future).lecture.id, 'second');
  future.subjects[0].topics[0].lectures.push(newLecture('third'));
  assert.equal(getSubjectProgress(future.subjects[0]).total, 3);
});

test('reload normalization retains independent progress and the selected batch', () => {
  const current = migrate().batches[0];
  const future = createStudyBatch('Future', 'Platform', '2026-10-01', 'future');
  future.subjects[1].topics.push({
    id: 'grammar', title: 'Grammar', category: '', isArchived: false,
    lectures: [{ ...newLecture('grammar-one'), link: 'https://example.com', status: 'in-progress', sessionCount: 2 }],
  });
  const stored = JSON.stringify([current, future]);
  const restored = normalizeBatchCollection(JSON.parse(stored), 'future', undefined, []);
  assert.equal(restored.activeBatchId, 'future');
  assert.equal(restored.batches.filter((batch) => batch.isActive).length, 1);
  assert.equal(getSubjectProgress(restored.batches[0].subjects[0]).completed, 3);
  const lecture = getNextLecture(restored.batches[1]).lecture;
  assert.equal(lecture.status, 'in-progress');
  assert.equal(lecture.sessionCount, 2);
  assert.equal(lecture.link, 'https://example.com');
});

test('archived records leave dynamic progress and recommendations but retain history', () => {
  const batch = migrate().batches[0];
  const subject = batch.subjects[0];
  subject.topics[0].lectures[2].isArchived = true;
  assert.equal(getSubjectProgress(subject).total, 7);
  assert.equal(getNextLecture(batch).lecture.id, 'percent-lecture-4');
  subject.topics[0].isArchived = true;
  assert.equal(getSubjectProgress(subject).total, 3);
  assert.equal(getSubjectProgress(subject).completed, 1);
  assert.equal(getNextLecture(batch).lecture.id, 'ratio-lecture-2');
  assert.equal(subject.topics[0].lectures.length, 5);
});

test('damaged stored collections fail instead of replacing progress with defaults', () => {
  for (const damaged of [null, {}, [], [null], [{ subjects: [{ topics: null }] }]]) {
    assert.throws(() => normalizeBatchCollection(damaged, '', undefined, legacy));
  }
  assert.throws(() => normalizeBatchCollection(undefined, '', [{ id: 'bad', total: '5' }], legacy));
});

test('batch dates validate consistently in UTC and India, including leap days', () => {
  const editor = readFileSync(new URL('../components/BatchEditorModal.tsx', import.meta.url), 'utf8');
  const validator = editor.match(/const validDate =[\s\S]*?\n};/)?.[0];
  assert.ok(validator, 'Test the date validator from the actual editor');
  const dateExports = {};
  const dateCode = ts.transpileModule(`${validator}\nexports.validDate = validDate;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(dateCode, { exports: dateExports, Date });
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'Asia/Kolkata']) {
      process.env.TZ = timezone;
      assert.equal(dateExports.validDate(''), true);
      assert.equal(dateExports.validDate('2026-10-01'), true);
      assert.equal(dateExports.validDate('2024-02-29'), true);
      assert.equal(dateExports.validDate('2026-02-29'), false);
      assert.equal(dateExports.validDate('2026-04-31'), false);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});