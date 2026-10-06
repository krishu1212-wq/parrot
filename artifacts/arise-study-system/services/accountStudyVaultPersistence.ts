import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingAccountStudySnapshot,
  getCommittedAccountStudySnapshot,
  getAccountStudyJournalKey,
  getAccountStudyMetadataKey,
  getPendingAccountStudySnapshot,
  isStudyStorageOwnerCurrent,
  stageAccountStudySnapshot,
  markAccountStudySnapshotCommitted,
  withStudyStorageQueue,
  type StorageOwner,
} from '@/contexts/accountStudyVault';

export type AccountSnapshotGuard = () => boolean;

export async function persistAccountStudyVaultSnapshot(
  storageKey: string,
  state: string,
  metadata: string,
  owner?: StorageOwner,
  guard?: AccountSnapshotGuard,
): Promise<{
  ran: boolean;
  snapshot?: { id: number; state: string; metadata: string };
}> {
  const isEligible = () => (!guard || guard())
    && (owner === undefined || isStudyStorageOwnerCurrent(storageKey, owner));
  if (!isEligible()) return { ran: false };

  const initialMetadata: unknown = JSON.parse(metadata);
  if (!initialMetadata || typeof initialMetadata !== 'object' || Array.isArray(initialMetadata)) {
    throw new Error('The account snapshot metadata is malformed; it was not staged.');
  }
  const stagedId = stageAccountStudySnapshot(storageKey, state, metadata);
  let completedPersistence = false;
  const queued = await withStudyStorageQueue(storageKey, async () => {
    if (!isEligible()) return undefined;
    const journalKey = getAccountStudyJournalKey(storageKey);
    const metadataKey = getAccountStudyMetadataKey(storageKey);
    let snapshot = getPendingAccountStudySnapshot(storageKey);
    let committed: { id: number; state: string; metadata: string } | undefined;
    while (snapshot) {
      if (!isEligible()) return undefined;
      const metadataValue: unknown = JSON.parse(snapshot.metadata);
      if (!metadataValue || typeof metadataValue !== 'object' || Array.isArray(metadataValue)) {
        throw new Error('The account snapshot metadata is malformed; it was not committed.');
      }
      const metadataRow = metadataValue as Record<string, unknown>;
      await AsyncStorage.setItem(journalKey, JSON.stringify({
        version: 1,
        id: snapshot.id,
        state: snapshot.state,
        metadata: snapshot.metadata,
        baseRevision: metadataRow.baseRevision,
        baseStateJson: JSON.stringify(metadataRow.baseState),
      }));
      if (!isEligible()) return undefined;
      const entries: [string, string][] = [
        [storageKey, snapshot.state],
        [metadataKey, snapshot.metadata],
      ];
      const multiSet = (AsyncStorage as typeof AsyncStorage & {
        multiSet?: (items: [string, string][]) => Promise<void>;
      }).multiSet;
      if (multiSet) await multiSet(entries);
      else {
        await AsyncStorage.setItem(entries[0][0], entries[0][1]);
        await AsyncStorage.setItem(entries[1][0], entries[1][1]);
      }
      markAccountStudySnapshotCommitted(storageKey, snapshot);
      committed = snapshot;
      const newerSnapshot = getPendingAccountStudySnapshot(storageKey);
      if (newerSnapshot && newerSnapshot.id !== snapshot.id) {
        snapshot = newerSnapshot;
        continue;
      }
      await AsyncStorage.removeItem(journalKey);
      const latestSnapshot = getPendingAccountStudySnapshot(storageKey);
      if (latestSnapshot && latestSnapshot.id !== snapshot.id) {
        snapshot = latestSnapshot;
        continue;
      }
      clearPendingAccountStudySnapshot(storageKey, snapshot.id);
      snapshot = null;
    }
    completedPersistence = true;
    return committed;
  }, owner);
  const ran = queued.ran && completedPersistence;
  const committed = ran
    ? queued.value ?? getCommittedAccountStudySnapshot(storageKey) ?? undefined
    : undefined;
  return {
    ran,
    snapshot: committed && committed.id >= stagedId ? committed : undefined,
  };
}