import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../contexts/batchSystem.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Date, Math });
const {
  resizeTopicLectures, getTopicProgress, getSubjectProgress, getProtectedLectureCount,
  getNextLecture, getNextLectureForSubject, createStudyBatch, normalizeBatchCollection,
  isPhaseOneComplete,
} = exports;
const topic = () => ({ id: 'test-topic', title: 'Algebra', category: 'Maths', lectures: [], isArchived: false });

test('bulk count creates real unique editable lecture records with no earned XP', () => {
  const result = resizeTopicLectures(topic(), 7);
  assert.equal(result.lectures.length, 7);
  assert.equal(new Set(result.lectures.map((lecture) => lecture.id)).size, 7);
  assert.equal(getTopicProgress(result).remaining, 7);
  for (const lecture of result.lectures) {
    assert.equal(lecture.xpAwarded, false);
    assert.equal(lecture.status, 'not-started');
    assert.equal(lecture.sessionCount, 0);
  }
});

test('lowering counts archives untouched lectures without changing study or XP history', () => {
  const original = resizeTopicLectures(topic(), 7);
  Object.assign(original.lectures[0], {
    status: 'completed', xpAwarded: true, xpEarnedOn: '2026-10-01', xpReward: 75,
    completedAt: '2026-10-01T07:00:00Z', sessionCount: 2,
  });
  Object.assign(original.lectures[4], { status: 'in-progress', sessionCount: 1, firstStartedAt: '2026-10-01T07:05:00Z' });
  const raw = JSON.stringify(original);
  const smaller = resizeTopicLectures(original, 2);
  assert.equal(JSON.stringify(original), raw, 'Original state must not be mutated');
  assert.equal(smaller.lectures.length, 7, 'No records are deleted');
  assert.equal(getProtectedLectureCount(smaller), 2);
  assert.equal(getTopicProgress(smaller).completed, 1);
  assert.equal(getTopicProgress(smaller).remaining, 1);
  assert.equal(JSON.stringify(smaller.lectures[0]), JSON.stringify(original.lectures[0]));
  assert.equal(JSON.stringify(smaller.lectures[4]), JSON.stringify(original.lectures[4]));
  assert.throws(() => resizeTopicLectures(original, 1));
});

test('increasing counts restores only count-archived placeholders and preserves their IDs and links', () => {
  const original = resizeTopicLectures(topic(), 5);
  original.lectures[3].link = 'https://example.com/course';
  const smaller = resizeTopicLectures(original, 2);
  const restored = resizeTopicLectures(smaller, 5);
  assert.equal(restored.lectures.length, 5);
  assert.equal(restored.lectures[3].id, original.lectures[3].id);
  assert.equal(restored.lectures[3].link, original.lectures[3].link);
  const manual = resizeTopicLectures(topic(), 1);
  manual.lectures[0].isArchived = true;
  const expanded = resizeTopicLectures(manual, 1);
  assert.equal(expanded.lectures[0].isArchived, true, 'Manual archives must stay archived');
  assert.equal(expanded.lectures.length, 2);
});

test('recommendations resume current work within the selected batch/subject', () => {
  const batch = createStudyBatch('Future course', '', '', 'future');
  batch.subjects[0].topics.push(resizeTopicLectures(topic(), 3));
  const english = resizeTopicLectures({ ...topic(), id: 'english-topic' }, 2);
  english.lectures[1].status = 'in-progress';
  batch.subjects[1].topics.push(english);
  assert.equal(getNextLecture(batch).lecture.id, english.lectures[1].id);
  assert.equal(getNextLectureForSubject(batch, 'maths').subjectId, 'maths');
  english.isArchived = true;
  assert.equal(getNextLecture(batch).subjectId, 'maths');
});

test('count edits and archive flags survive reload without changing another batch', () => {
  const old = createStudyBatch('Old course', '', '', 'old');
  old.subjects[0].topics.push(resizeTopicLectures(topic(), 9));
  const future = createStudyBatch('New course', '', '', 'future');
  future.subjects[2].topics.push(resizeTopicLectures(resizeTopicLectures(topic(), 5), 3));
  const restored = normalizeBatchCollection(JSON.parse(JSON.stringify([old, future])), 'future', undefined, []);
  assert.equal(restored.activeBatchId, 'future');
  assert.equal(getSubjectProgress(restored.batches[0].subjects[0]).total, 9);
  assert.equal(getSubjectProgress(restored.batches[1].subjects[2]).total, 3);
  assert.equal(restored.batches[1].subjects[2].topics[0].lectures.length, 5);
  assert.equal(resizeTopicLectures(restored.batches[1].subjects[2].topics[0], 5).lectures.length, 5);
});

test('invalid counts fail explicitly, including attempts to remove awarded history', () => {
  for (const count of [-1, 1.5, NaN, Infinity, 1001]) assert.throws(() => resizeTopicLectures(topic(), count));
  const awarded = resizeTopicLectures(topic(), 1);
  awarded.lectures[0].xpAwarded = true;
  assert.throws(() => resizeTopicLectures(awarded, 0));
  assert.equal(getTopicProgress(resizeTopicLectures(topic(), 0)).progress, 0);
});

test('historical timestamps remain protected even if an imported status is not-started', () => {
  for (const field of ['firstStartedAt', 'lastStartedAt', 'completedAt', 'xpEarnedOn']) {
    const imported = resizeTopicLectures(topic(), 1);
    imported.lectures[0][field] = '2026-10-01';
    assert.equal(getProtectedLectureCount(imported), 1);
    assert.throws(() => resizeTopicLectures(imported, 0));
  }
});

test('Phase 2 requires real completed Maths and NCERT goals, not empty catalogs', () => {
  assert.equal(isPhaseOneComplete({ total: 3, completed: 3 }, { total: 0, completed: 0 }), false);
  assert.equal(isPhaseOneComplete({ total: 0, completed: 0 }, { total: 3, completed: 3 }), false);
  assert.equal(isPhaseOneComplete({ total: 3, completed: 3 }, { total: 3, completed: 2 }), false);
  assert.equal(isPhaseOneComplete({ total: 3, completed: 3 }, { total: 3, completed: 3 }), true);
});