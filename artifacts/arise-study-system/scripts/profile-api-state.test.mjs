import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mockStorage, mountProvider } from './study-provider-harness.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../../api-server/src/lib/study-profile-state.ts', import.meta.url);

function loadProfileStateService(storedProfile) {
  const source = readFileSync(root, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const queriedCodes = [];
  const db = {
    select() {
      return {
        from() {
          return {
            where(filter) {
              queriedCodes.push(filter.value);
              return {
                async limit() {
                  return filter.value === storedProfile.accountCode ? [storedProfile] : [];
                },
              };
            },
          };
        },
      };
    },
  };
  const accountCodeColumn = {};
  const serviceExports = {};
  vm.runInNewContext(compiled, {
    exports: serviceExports,
    Buffer,
    require(name) {
      if (name === 'node:crypto') return require('node:crypto');
      if (name === 'drizzle-orm') return {
        and: (...parts) => parts,
        eq: (column, value) => ({ column, value }),
      };
      if (name === '@workspace/db') return {
        db,
        studyAccountStatesTable: {},
        studyProfileCredentialsTable: { accountCode: accountCodeColumn },
      };
      if (name === './study-account-state') return { isBoundedStudyState: () => true };
      throw new Error(`Unexpected profile API dependency: ${name}`);
    },
  });
  return { service: serviceExports, queriedCodes };
}

test('server accepts the actual clean mobile state and rejects legacy progress markers', async (t) => {
  const provider = await mountProvider(t, mockStorage());
  const clean = JSON.parse(JSON.stringify(provider.current.state));
  const profile = {
    accountCode: 'ARISE-2ABC-3DEF',
    profileId: 'arise_11111111-1111-4111-8111-111111111111',
    recoveryKeySalt: 'test-salt',
    recoveryKeyHash: 'unused',
    displayName: 'Test Player',
    settings: {},
  };
  const { service } = loadProfileStateService(profile);
  assert.equal(service.isFreshProfileState(clean), true);

  const withXp = structuredClone(clean);
  withXp.totalXp = 1;
  assert.equal(service.isFreshProfileState(withXp), false);

  const withHistory = structuredClone(clean);
  withHistory.progressHistory.xpEvents.push({ id: 'legacy-xp' });
  assert.equal(service.isFreshProfileState(withHistory), false);

  const withPeakStreak = structuredClone(clean);
  withPeakStreak.achievementHistory.highestObservedStreak = 1;
  assert.equal(service.isFreshProfileState(withPeakStreak), false);

  const withRelic = structuredClone(clean);
  withRelic.achievementHistory.earnedRelicIds.push('old-relic');
  assert.equal(service.isFreshProfileState(withRelic), false);
});

test('server restore requires the ARISE Account Code and the separate matching recovery key', async () => {
  const recoveryKey = 'a-distinct-recovery-key-with-more-than-32-characters';
  const recoveryKeyHash = createHash('sha256')
    .update('test-salt')
    .update(':')
    .update(recoveryKey)
    .digest('base64url');
  const profile = {
    accountCode: 'ARISE-2ABC-3DEF',
    profileId: 'arise_11111111-1111-4111-8111-111111111111',
    recoveryKeySalt: 'test-salt',
    recoveryKeyHash,
    displayName: 'Test Player',
    settings: {},
  };
  const { service, queriedCodes } = loadProfileStateService(profile);

  const restored = await service.prepareStudyProfileRestore('arise-2abc-3def', recoveryKey);
  assert.equal(restored.profileId, profile.profileId);
  assert.equal(await service.prepareStudyProfileRestore('ARISE-2ABC-3DEF', 'wrong-recovery-key-long-enough-to-pass'), null);
  assert.equal(await service.prepareStudyProfileRestore('OTHER-2ABC-3DEF', recoveryKey), null);
  assert.deepEqual(queriedCodes, ['ARISE-2ABC-3DEF', 'ARISE-2ABC-3DEF']);
});