import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const learningToolsSource = readFileSync(new URL('contexts/learningTools.ts', root), 'utf8');
const bossToolSource = readFileSync(new URL('components/study-tools/BossTestTool.tsx', root), 'utf8');
const ritualsSource = readFileSync(new URL('app/rituals.tsx', root), 'utf8');
const compiled = ts.transpileModule(learningToolsSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, {
  exports, Date, Math, Map, Number, String, Error, Object, Array, RegExp,
});

test('Gate attempt tag survives normalization and cannot replace the official weekly test', () => {
  const gateRecord = {
    id: 'gate-record',
    gateAttemptId: 'attempt-7',
    batchId: 'batch-a',
    date: '2025-01-08',
    weekStart: '2025-01-06',
    results: [],
    weakTopics: [],
  };
  const officialRecord = { ...gateRecord, id: 'official-record', gateAttemptId: undefined };
  const normalized = exports.normalizeStudyTools({ bossTests: [gateRecord, officialRecord] });
  assert.equal(normalized.bossTests[0].gateAttemptId, 'attempt-7');
  assert.equal(normalized.bossTests[1].gateAttemptId, undefined);
  assert.equal(
    exports.getWeeklyBossTest(normalized.bossTests, 'batch-a', '2025-01-08').id,
    'official-record',
  );
  assert.equal(exports.getWeeklyBossTest([gateRecord], 'batch-a', '2025-01-08'), undefined);
});

test('Gate route is opt-in and validates against the actual active boss attempt', () => {
  assert.match(ritualsSource, /<BossTestTool key=\{`boss:\$\{firstParam\(params\.gate\)/);
  assert.match(bossToolSource, /const gateDefinition = gateId \? getGateDefinition\(gateId\) : undefined/);
  assert.match(bossToolSource, /gateDefinition\?\.type === 'boss'/);
  assert.match(bossToolSource, /activeAttempt\.gateId === gateId/);
  assert.match(bossToolSource, /attempt\.status === 'active'/);
  assert.match(bossToolSource, /saveGateBossTest\(\{/);
  assert.match(bossToolSource, /gateAttemptId === gateAttempt\?\.id/);
});

test('Gate preparation and results use existing batch cards; default Saturday lock remains intact', () => {
  assert.match(bossToolSource, /state\.studyTools\.reviewCards\.filter\(\(reviewCard\) => reviewCard\.batchId === activeBatch\.id\)/);
  assert.match(bossToolSource, /gateCards\.length < 5/);
  assert.match(bossToolSource, /PREPARE 5 SAVED CARDS/);
  assert.match(bossToolSource, /router\.push\('\/rituals\?mode=recovery'/);
  assert.match(bossToolSource, /const awaitingSubmission = saturday && !existingTest && !saved/);
  assert.match(bossToolSource, /!saturday \? \(/);
});