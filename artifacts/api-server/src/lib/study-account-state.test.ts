import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudyAccount,
  isBoundedStudyState,
  MAX_STUDY_STATE_BYTES,
  saveStudyAccount,
  type StudyAccountRow,
  type StudyAccountStore,
} from "./study-account-state";

function memoryStore(): StudyAccountStore {
  const rows = new Map<string, StudyAccountRow>();
  const clock = () => new Date("2025-01-01T00:00:00.000Z");
  return {
    async get(ownerId) {
      return rows.get(ownerId) ?? null;
    },
    async createIfMissing(ownerId, state) {
      if (rows.has(ownerId)) return null;
      const row = { state, revision: 1, updatedAt: clock() };
      rows.set(ownerId, row);
      return row;
    },
    async replaceAtRevision(ownerId, expectedRevision, state) {
      const existing = rows.get(ownerId);
      if (!existing || existing.revision !== expectedRevision) return null;
      const row = { state, revision: expectedRevision + 1, updatedAt: clock() };
      rows.set(ownerId, row);
      return row;
    },
  };
}

test("missing account state is explicit and does not create a profile", async () => {
  const store = memoryStore();
  assert.deepEqual(await getStudyAccount(store, "clerk_test_user_a"), {
    ownerId: "clerk_test_user_a",
    state: null,
    revision: 0,
    updatedAt: null,
  });
});

test("expected owner mismatch rejects an in-flight save before touching storage", async () => {
  const store = memoryStore();
  let writes = 0;
  const guardedStore: StudyAccountStore = {
    ...store,
    async createIfMissing(ownerId, state) {
      writes += 1;
      return store.createIfMissing(ownerId, state);
    },
    async replaceAtRevision(ownerId, revision, state) {
      writes += 1;
      return store.replaceAtRevision(ownerId, revision, state);
    },
  };

  const result = await saveStudyAccount(guardedStore, "clerk_test_user_b", {
    expectedOwnerId: "clerk_test_user_a",
    expectedRevision: 0,
    state: { totalXp: 900 },
  });
  assert.deepEqual(result, { kind: "owner-mismatch" });
  assert.equal(writes, 0);
  assert.deepEqual(await getStudyAccount(store, "clerk_test_user_b"), {
    ownerId: "clerk_test_user_b",
    state: null,
    revision: 0,
    updatedAt: null,
  });
});

test("create and updates use compare-and-swap revisions without replacing newer state", async () => {
  const store = memoryStore();
  const created = await saveStudyAccount(store, "clerk_test_user_a", {
    expectedRevision: 0,
    state: { totalXp: 100, futureProgress: { relics: ["first"] } },
  });
  assert.equal(created.kind, "saved");
  if (created.kind !== "saved") return;
  assert.equal(created.account.revision, 1);
  assert.equal(created.account.ownerId, "clerk_test_user_a");
  assert.equal(created.account.updatedAt, "2025-01-01T00:00:00.000Z");
  assert.deepEqual(created.account.state, {
    totalXp: 100,
    futureProgress: { relics: ["first"] },
  });

  const newer = await saveStudyAccount(store, "clerk_test_user_a", {
    expectedRevision: 1,
    state: { totalXp: 200 },
  });
  assert.equal(newer.kind, "saved");
  if (newer.kind !== "saved") return;
  assert.equal(newer.account.revision, 2);

  const stale = await saveStudyAccount(store, "clerk_test_user_a", {
    expectedRevision: 1,
    state: { totalXp: 50 },
  });
  assert.deepEqual(stale, { kind: "conflict", currentRevision: 2 });
  assert.deepEqual(await getStudyAccount(store, "clerk_test_user_a"), {
    ownerId: "clerk_test_user_a",
    state: { totalXp: 200 },
    revision: 2,
    updatedAt: "2025-01-01T00:00:00.000Z",
  });
});

test("malformed or over-bounded state is rejected without writes", async () => {
  assert.equal(isBoundedStudyState(null), false);
  assert.equal(isBoundedStudyState([]), false);
  assert.equal(isBoundedStudyState({ totalXp: Number.POSITIVE_INFINITY }), false);
  assert.equal(isBoundedStudyState({ notes: "x".repeat(MAX_STUDY_STATE_BYTES + 1) }), false);

  const deeplyNested: Record<string, unknown> = {};
  let cursor = deeplyNested;
  for (let i = 0; i < 34; i += 1) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  assert.equal(isBoundedStudyState(deeplyNested), false);

  const store = memoryStore();
  const result = await saveStudyAccount(store, "clerk_test_user_a", {
    expectedRevision: 0,
    state: { totalXp: Number.NaN },
  });
  assert.deepEqual(result, { kind: "invalid" });
  assert.deepEqual(await getStudyAccount(store, "clerk_test_user_a"), {
    ownerId: "clerk_test_user_a",
    state: null,
    revision: 0,
    updatedAt: null,
  });
});