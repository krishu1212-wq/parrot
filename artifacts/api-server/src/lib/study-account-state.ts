export const MAX_STUDY_STATE_BYTES = 900 * 1024;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 50_000;
const MAX_OBJECT_PROPERTIES = 1_000;
const MAX_REVISION = 2_147_483_647;

export interface StudyAccountRow {
  state: Record<string, unknown>;
  revision: number;
  updatedAt: Date;
}

export interface StudyAccountStore {
  get(ownerId: string): Promise<StudyAccountRow | null>;
  createIfMissing(ownerId: string, state: Record<string, unknown>): Promise<StudyAccountRow | null>;
  replaceAtRevision(
    ownerId: string,
    expectedRevision: number,
    state: Record<string, unknown>,
  ): Promise<StudyAccountRow | null>;
}

export interface StudyAccountSnapshot {
  ownerId: string;
  state: Record<string, unknown> | null;
  revision: number;
  updatedAt: string | null;
}

export type SaveStudyAccountResult =
  | { kind: "saved"; account: StudyAccountSnapshot }
  | { kind: "owner-mismatch" }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "invalid" };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isBoundedStudyState(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length > MAX_OBJECT_PROPERTIES) return false;

  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodeCount = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) return false;
    nodeCount += 1;
    if (nodeCount > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return false;

    const item = current.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return false;
      continue;
    }
    if (Array.isArray(item)) {
      for (const child of item) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(item) || Object.keys(item).length > MAX_OBJECT_PROPERTIES) return false;
    for (const child of Object.values(item)) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }

  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      && Buffer.byteLength(serialized, "utf8") <= MAX_STUDY_STATE_BYTES;
  } catch {
    return false;
  }
}

function toSnapshot(row: StudyAccountRow | null, ownerId: string): StudyAccountSnapshot {
  if (!row) return { ownerId, state: null, revision: 0, updatedAt: null };
  return {
    ownerId,
    state: row.state,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getStudyAccount(
  store: StudyAccountStore,
  verifiedOwnerId: string,
): Promise<StudyAccountSnapshot> {
  return toSnapshot(await store.get(verifiedOwnerId), verifiedOwnerId);
}

export async function saveStudyAccount(
  store: StudyAccountStore,
  verifiedOwnerId: string,
  input: {
    expectedOwnerId?: string;
    expectedRevision: number;
    state: unknown;
  },
): Promise<SaveStudyAccountResult> {
  if (input.expectedOwnerId !== undefined && input.expectedOwnerId !== verifiedOwnerId) {
    return { kind: "owner-mismatch" };
  }
  if (
    !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || input.expectedRevision >= MAX_REVISION
    || !isBoundedStudyState(input.state)
  ) {
    return { kind: "invalid" };
  }

  const state = input.state;
  const saved = input.expectedRevision === 0
    ? await store.createIfMissing(verifiedOwnerId, state)
    : await store.replaceAtRevision(verifiedOwnerId, input.expectedRevision, state);
  if (saved) return { kind: "saved", account: toSnapshot(saved, verifiedOwnerId) };

  const current = await store.get(verifiedOwnerId);
  return { kind: "conflict", currentRevision: current?.revision ?? 0 };
}