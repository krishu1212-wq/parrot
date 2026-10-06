export const ANONYMOUS_STUDY_STORAGE_KEY = 'arise-study-state-v1';
export const STUDY_STORAGE_BACKUP_KEY = `${ANONYMOUS_STUDY_STORAGE_KEY}-before-batch-migration`;
export const ONBOARDING_COMPLETE_STORAGE_KEY = 'arise-onboarding-complete-v1';

const ACCOUNT_STORAGE_PREFIX = `${ANONYMOUS_STUDY_STORAGE_KEY}:account:`;
const METADATA_SUFFIX = ':vault-meta-v1';

const storageQueues = new Map<string, Promise<void>>();
const storageOwners = new Map<string, number>();
const pendingAccountSnapshots = new Map<string, {
  id: number;
  state: string;
  metadata: string;
}>();
const committedAccountSnapshots = new Map<string, {
  id: number;
  state: string;
  metadata: string;
}>();
let nextOwnerId = 0;
let nextSnapshotId = 0;

export type StorageOwner = number;

export function getAccountStudyStorageKey(userId: string): string {
  const stableUserId = userId.trim();
  if (!stableUserId) throw new Error('A verified account ID is required for account-scoped study storage.');
  return `${ACCOUNT_STORAGE_PREFIX}${encodeURIComponent(stableUserId)}`;
}

export function getAccountStudyMetadataKey(storageKey: string): string {
  if (!storageKey.startsWith(ACCOUNT_STORAGE_PREFIX)) {
    throw new Error('Account metadata can only be stored beside an account-scoped study vault.');
  }
  return `${storageKey}${METADATA_SUFFIX}`;
}

export function getAccountStudyJournalKey(storageKey: string): string {
  if (!storageKey.startsWith(ACCOUNT_STORAGE_PREFIX)) {
    throw new Error('Account journals can only be stored beside an account-scoped study vault.');
  }
  return `${storageKey}:vault-journal-v1`;
}

export function stageAccountStudySnapshot(
  storageKey: string,
  state: string,
  metadata: string,
): number {
  getAccountStudyMetadataKey(storageKey);
  const id = ++nextSnapshotId;
  pendingAccountSnapshots.set(storageKey, { id, state, metadata });
  return id;
}

export function getPendingAccountStudySnapshot(storageKey: string): {
  id: number;
  state: string;
  metadata: string;
} | null {
  return pendingAccountSnapshots.get(storageKey) ?? null;
}

export function getCommittedAccountStudySnapshot(storageKey: string): {
  id: number;
  state: string;
  metadata: string;
} | null {
  return committedAccountSnapshots.get(storageKey) ?? null;
}

export function clearPendingAccountStudySnapshot(storageKey: string, id: number): void {
  if (pendingAccountSnapshots.get(storageKey)?.id === id) pendingAccountSnapshots.delete(storageKey);
}

export function markAccountStudySnapshotCommitted(
  storageKey: string,
  snapshot: { id: number; state: string; metadata: string },
): void {
  if ((committedAccountSnapshots.get(storageKey)?.id ?? 0) <= snapshot.id) {
    committedAccountSnapshots.set(storageKey, snapshot);
  }
}

function enqueue<T>(storageKey: string, operation: () => Promise<T> | T): Promise<T> {
  const previous = storageQueues.get(storageKey) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  storageQueues.set(storageKey, current.then(() => undefined, () => undefined));
  return current;
}

// Ownership changes themselves go through the same queue as loads and saves.
// Thus an older provider's already-enqueued save completes before the new
// provider claims the key, while later stale-provider operations are rejected.
export function claimStudyStorageOwner(storageKey: string): Promise<StorageOwner> {
  return enqueue(storageKey, () => {
    const owner = ++nextOwnerId;
    storageOwners.set(storageKey, owner);
    return owner;
  });
}

export function isStudyStorageOwnerCurrent(storageKey: string, owner: StorageOwner): boolean {
  return storageOwners.get(storageKey) === owner;
}

export async function withStudyStorageQueue<T>(
  storageKey: string,
  operation: () => Promise<T> | T,
  owner?: StorageOwner,
): Promise<{ ran: boolean; value?: T }> {
  return enqueue(storageKey, async () => {
    if (owner !== undefined && !isStudyStorageOwnerCurrent(storageKey, owner)) {
      return { ran: false };
    }
    return { ran: true, value: await operation() };
  });
}

export async function drainStudyStorageQueue(storageKey: string): Promise<void> {
  await (storageQueues.get(storageKey) ?? Promise.resolve()).catch(() => undefined);
}