import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGetStudyAccountQueryKey,
  setAuthTokenGetter,
  useGetStudyAccount,
  usePutStudyAccount,
} from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  ANONYMOUS_STUDY_STORAGE_KEY,
  getAccountStudyJournalKey,
  getAccountStudyMetadataKey,
  getAccountStudyStorageKey,
  getPendingAccountStudySnapshot,
  withStudyStorageQueue,
} from '@/contexts/accountStudyVault';
import {
  createCleanAccountStudyState,
  prepareStudyStateForAccount,
  useStudy,
} from '@/contexts/StudyContext';
import type { StudyState } from '@/contexts/StudyContext';
import {
  createCloudSaveInput,
  isCloudCompareAndSwapConflict,
  safelyMergeStudyStates,
  validateCloudAccount,
  validateCloudStudyState,
  areStudyStatesEqual,
  type AccountCloudSnapshot,
} from '@/services/accountCloudSync';
import { persistAccountStudyVaultSnapshot } from '@/services/accountStudyVaultPersistence';
import { useProfileSession } from '@/contexts/ProfileContext';

export type AriseAccountStatus =
  | 'loading'
  | 'signed-in'
  | 'signed-out'
  | 'signing-in'
  | 'error'
  | 'unavailable';

export type AriseSyncStatus =
  | 'unavailable'
  | 'loading'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'conflict'
  | 'error';

export type AccountConflictResolution = 'keep-cloud' | 'merge';
export type AccountConflictKind = 'revision' | 'anonymous-import' | 'local-recovery';

export type AccountStudyConflict = {
  kind: AccountConflictKind;
  localState: StudyState;
  cloudState: StudyState | null;
  baseState: StudyState | null;
  baseRevision: number | null;
  serverRevision: number;
  createdAt: string;
};

type VaultMetadata = {
  version: 1;
  baseRevision: number | null;
  baseState: StudyState | null;
  dirty: boolean;
  conflict?: AccountStudyConflict | null;
};

type AccountBootstrap = {
  ready: boolean;
  userId: string | null;
  ownerEpoch: number;
  ownerGeneration: number;
  initialState?: StudyState;
  persistAllowed: boolean;
  providerEpoch: number;
  conflict: AccountStudyConflict | null;
};

type AriseAccountValue = {
  userId: string | null;
  isSignedIn: boolean;
  status: AriseAccountStatus;
  syncStatus: AriseSyncStatus;
  syncError: string | null;
  loginError: string | null;
  isAvailable: boolean;
  isBootstrapped: boolean;
  initialStudyState?: StudyState;
  accountPersistenceAllowed: boolean;
  providerEpoch: number;
  sessionScope: string;
  conflict: AccountStudyConflict | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retrySync: () => Promise<void>;
  continueOffline: () => void;
  importAnonymous: () => Promise<void>;
  resolveConflict: (resolution: AccountConflictResolution) => Promise<void>;
  observeStudyState: (state: StudyState) => void;
  accountPayloadMetadata: (serializedState: string) => string;
};

const AriseAccountContext = createContext<AriseAccountValue | null>(null);
const BACKUP_PREFIX = ':preserved:';
let activeConfiguredProviderLifetime: symbol | null = null;
let activeAuthTokenLifetime: symbol | null = null;
let nextConfiguredProviderLifetimeId = 0;

type IdentitySnapshot = { userId: string | null; epoch: number; generation?: number };

type ParsedVault = {
  rawState: string | null;
  state: StudyState | null;
  metadata: VaultMetadata | null;
  metadataError: string | null;
  stateError: string | null;
  rawMetadata: string | null;
  rawJournal: string | null;
  journalError: string | null;
};

function parsePersistedConflict(value: unknown): AccountStudyConflict | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid saved account conflict.');
  }
  const row = value as Record<string, unknown>;
  if (!['revision', 'anonymous-import', 'local-recovery'].includes(row.kind as string)
    || !Number.isSafeInteger(row.serverRevision)
    || (row.serverRevision as number) < 0
    || !(row.baseRevision === null || (
      Number.isSafeInteger(row.baseRevision) && (row.baseRevision as number) >= 0
    ))
    || typeof row.createdAt !== 'string') {
    throw new Error('Invalid saved account conflict details.');
  }
  const localState = validateCloudStudyState(row.localState);
  const cloudState = row.cloudState === null ? null : validateCloudStudyState(row.cloudState);
  const baseState = row.baseState === null ? null : validateCloudStudyState(row.baseState);
  return {
    kind: row.kind as AccountConflictKind,
    localState,
    cloudState,
    baseState,
    baseRevision: row.baseRevision as number | null,
    serverRevision: row.serverRevision as number,
    createdAt: row.createdAt,
  };
}

function parseVaultMetadata(raw: string | null): {
  metadata: VaultMetadata | null;
  error: string | null;
} {
  if (!raw) return { metadata: null, error: null };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const row = value as Record<string, unknown>;
    const baseRevision = row.baseRevision;
    if (row.version !== 1 || typeof row.dirty !== 'boolean'
      || !(baseRevision === null || (
        Number.isSafeInteger(baseRevision) && (baseRevision as number) >= 0
      ))) throw new Error();
    const baseState = row.baseState === null
      ? null
      : validateCloudStudyState(row.baseState);
    const conflict = parsePersistedConflict(row.conflict);
    return {
      metadata: {
        version: 1,
        baseRevision: baseRevision as number | null,
        baseState,
        dirty: row.dirty,
        conflict,
      },
      error: null,
    };
  } catch {
    return {
      metadata: null,
      error: 'The account vault metadata is damaged. Its original bytes have been retained.',
    };
  }
}

async function readAccountVault(userId: string): Promise<ParsedVault> {
  const storageKey = getAccountStudyStorageKey(userId);
  const read = await withStudyStorageQueue(storageKey, async () => {
    const pending = getPendingAccountStudySnapshot(storageKey);
    if (pending) {
      return {
        rawState: pending.state,
        rawMetadata: pending.metadata,
        rawJournal: null,
        journalError: null,
      };
    }
    const [rawState, rawMetadata] = await Promise.all([
      AsyncStorage.getItem(storageKey),
      AsyncStorage.getItem(getAccountStudyMetadataKey(storageKey)),
    ]);
    const rawJournal = await AsyncStorage.getItem(getAccountStudyJournalKey(storageKey));
    if (rawJournal === null) return { rawState, rawMetadata, rawJournal, journalError: null };
    try {
      const envelope: unknown = JSON.parse(rawJournal);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error();
      const row = envelope as Record<string, unknown>;
      if (row.version !== 1 || !Number.isSafeInteger(row.id)
        || typeof row.state !== 'string' || typeof row.metadata !== 'string') throw new Error();
      const metadataValue: unknown = JSON.parse(row.metadata);
      if (!metadataValue || typeof metadataValue !== 'object' || Array.isArray(metadataValue)) throw new Error();
      const metadataRow = metadataValue as Record<string, unknown>;
      if (row.baseRevision !== metadataRow.baseRevision
        || typeof row.baseStateJson !== 'string'
        || row.baseStateJson !== JSON.stringify(metadataRow.baseState)) throw new Error();
      return {
        rawState: row.state,
        rawMetadata: row.metadata,
        rawJournal,
        journalError: null,
      };
    } catch {
      return {
        rawState,
        rawMetadata,
        rawJournal,
        journalError: 'The account vault recovery journal is damaged. Its original bytes have been retained.',
      };
    }
  });
  const rawState = read.value?.rawState ?? null;
  const rawMetadata = read.value?.rawMetadata ?? null;
  const rawJournal = read.value?.rawJournal ?? null;
  let state: StudyState | null = null;
  let stateError: string | null = null;
  if (rawState !== null) {
    try {
      state = prepareStudyStateForAccount(JSON.parse(rawState));
    } catch (error) {
      stateError = error instanceof Error
        ? `Saved account progress could not be validated: ${error.message}`
        : 'Saved account progress could not be validated. Its original bytes have been retained.';
    }
  }
  const metadata = parseVaultMetadata(rawMetadata);
  let journalError = read.value?.journalError ?? null;
  if (rawJournal && !journalError) {
    let rawSnapshotState: StudyState | null = null;
    try {
      if (rawState !== null) rawSnapshotState = validateCloudStudyState(JSON.parse(rawState));
    } catch {
      rawSnapshotState = null;
    }
    if (stateError || metadata.error || !rawSnapshotState || !metadata.metadata) {
      journalError = 'The account recovery journal does not contain a complete matching state and metadata snapshot.';
    } else if ((!metadata.metadata.dirty
        && (!metadata.metadata.baseState
          || !areStudyStatesEqual(rawSnapshotState, metadata.metadata.baseState)))
      || (metadata.metadata.conflict
        && !areStudyStatesEqual(rawSnapshotState, metadata.metadata.conflict.localState))) {
      journalError = 'The account recovery journal state does not match its saved base or conflict snapshot.';
    }
  }
  return {
    rawState,
    state,
    metadata: metadata.metadata,
    metadataError: metadata.error ?? journalError,
    stateError,
    rawMetadata,
    rawJournal,
    journalError,
  };
}

async function preserveVaultBytes(storageKey: string, label: string, contents: string): Promise<string> {
  const backupKey = `${storageKey}${BACKUP_PREFIX}${label}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await withStudyStorageQueue(storageKey, async () => {
    await AsyncStorage.setItem(backupKey, contents);
  });
  return backupKey;
}

async function preserveConflictPair(
  storageKey: string,
  localState: StudyState,
  cloudState: StudyState | null,
  rawLocalState?: string | null,
): Promise<void> {
  await withStudyStorageQueue(storageKey, async () => {
    const suffix = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(
      `${storageKey}${BACKUP_PREFIX}conflict-local:${suffix}`,
      rawLocalState ?? JSON.stringify(localState),
    );
    await AsyncStorage.setItem(
      `${storageKey}${BACKUP_PREFIX}conflict-cloud:${suffix}`,
      JSON.stringify(cloudState),
    );
  });
}

export function AriseAccountProvider({ children }: { children: React.ReactNode }) {
  return <ConfiguredAccountProvider>{children}</ConfiguredAccountProvider>;
}

function ConfiguredAccountProvider({ children }: { children: React.ReactNode }) {
  const profileSession = useProfileSession();
  const isLoaded = profileSession.ready;
  const isSignedIn = !!profileSession.profile && !!profileSession.accessToken;
  const user = profileSession.profile ? { id: profileSession.profile.profileId } : null;
  const getToken = useCallback(async () => profileSession.accessToken, [profileSession.accessToken]);
  const profileLogout = profileSession.logout;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [providerLifetime] = useState(() => Symbol('configured-account-provider'));
  const [providerLifetimeId] = useState(() => ++nextConfiguredProviderLifetimeId);
  const accountQuery = useGetStudyAccount({
    query: {
      queryKey: [...getGetStudyAccountQueryKey(), user?.id ?? 'signed-out'],
      enabled: false,
      retry: false,
    },
    request: {},
  });
  const accountMutation = usePutStudyAccount({ request: {} });
  const accountQueryRef = useRef(accountQuery);
  accountQueryRef.current = accountQuery;
  const accountMutationRef = useRef(accountMutation);
  accountMutationRef.current = accountMutation;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [offlineOverride, setOfflineOverride] = useState(false);
  const activeProfileId = isLoaded && isSignedIn ? user?.id ?? null : null;
  const userId = offlineOverride ? null : activeProfileId;
  const identityRef = useRef<{ key: string; userId: string | null; epoch: number }>({
    key: 'initial',
    userId: null,
    epoch: 0,
  });
  const identityKey = offlineOverride
    ? 'offline-override'
    : isLoaded ? (userId ? `user:${userId}` : 'signed-out') : 'loading';
  if (identityRef.current.key !== identityKey) {
    identityRef.current = {
      key: identityKey,
      userId,
      epoch: identityRef.current.epoch + 1,
    };
  }
  const identity = identityRef.current;
  const bootstrapGenerationRef = useRef(0);
  const [bootstrapGeneration, setBootstrapGeneration] = useState(0);
  const [bootstrap, setBootstrap] = useState<AccountBootstrap>({
    ready: false,
    userId: null,
    ownerEpoch: -1,
    ownerGeneration: -1,
    persistAllowed: true,
    providerEpoch: 0,
    conflict: null,
  });
  const [syncStatus, setSyncStatus] = useState<AriseSyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signInBusy] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const revisionRef = useRef<number | null>(null);
  const baseStateRef = useRef<StudyState | null>(null);
  const latestCloudRef = useRef<AccountCloudSnapshot | null>(null);
  const lastSyncedPayloadRef = useRef<string | null>(null);
  const vaultMetadataRef = useRef<VaultMetadata | null>(null);
  const conflictRef = useRef<AccountStudyConflict | null>(null);
  const forceDirtyRef = useRef(false);
  const latestStudyStateRef = useRef<StudyState | null>(null);
  const observedPayloadRef = useRef<string | null>(null);
  const pendingStudyStateRef = useRef<StudyState | null>(null);
  const syncingOwnerRef = useRef<IdentitySnapshot | null>(null);
  const resolvingOwnerRef = useRef<IdentitySnapshot | null>(null);
  const cloudRequestOwnerRef = useRef<IdentitySnapshot | null>(null);
  const bootstrapOwnerRef = useRef<IdentitySnapshot | null>(null);
  const [callbackFailure, setCallbackFailure] = useState(false);

  const isOwnerCurrent = useCallback((expected: IdentitySnapshot) => (
    activeConfiguredProviderLifetime === providerLifetime
    && identityRef.current.userId === expected.userId
    && identityRef.current.epoch === expected.epoch
    && (expected.generation === undefined
      || bootstrapGenerationRef.current === expected.generation)
  ), [providerLifetime]);

  const assertCurrentOwner = useCallback((expected: IdentitySnapshot) => {
    if (!isOwnerCurrent(expected)) {
      throw new Error('The active account session or bootstrap changed. The previous account request was discarded.');
    }
  }, [isOwnerCurrent]);

  const readCloudSnapshot = useCallback(async (expected: IdentitySnapshot): Promise<AccountCloudSnapshot> => {
    assertCurrentOwner(expected);
    cloudRequestOwnerRef.current = expected;
    try {
      const result = await accountQueryRef.current.refetch();
      assertCurrentOwner(expected);
      if (result.error) throw result.error;
      if (!result.data) throw new Error('The secure account service returned no study state.');
      if (!expected.userId) throw new Error('A verified account ID is required to load cloud progress.');
      return validateCloudAccount(result.data, expected.userId);
    } finally {
      if (cloudRequestOwnerRef.current?.epoch === expected.epoch
        && cloudRequestOwnerRef.current?.userId === expected.userId
        && cloudRequestOwnerRef.current?.generation === expected.generation) {
        cloudRequestOwnerRef.current = null;
      }
    }
  }, [assertCurrentOwner]);

  const saveCloudSnapshot = useCallback(async (
    expected: IdentitySnapshot,
    expectedRevision: number,
    state: StudyState,
  ): Promise<AccountCloudSnapshot> => {
    if (!expected.userId) throw new Error('A signed-in account is required to save cloud progress.');
    assertCurrentOwner(expected);
    cloudRequestOwnerRef.current = expected;
    try {
      const response = await accountMutationRef.current.mutateAsync({
        data: createCloudSaveInput(expected.userId, expectedRevision, state),
      });
      assertCurrentOwner(expected);
      return validateCloudAccount(response, expected.userId);
    } finally {
      if (cloudRequestOwnerRef.current?.epoch === expected.epoch
        && cloudRequestOwnerRef.current?.userId === expected.userId
        && cloudRequestOwnerRef.current?.generation === expected.generation) {
        cloudRequestOwnerRef.current = null;
      }
    }
  }, [assertCurrentOwner]);

  useLayoutEffect(() => {
    activeConfiguredProviderLifetime = providerLifetime;
    return () => {
      if (activeConfiguredProviderLifetime === providerLifetime) {
        activeConfiguredProviderLifetime = null;
      }
      if (activeAuthTokenLifetime === providerLifetime) {
        activeAuthTokenLifetime = null;
        setAuthTokenGetter(null);
      }
    };
  }, [providerLifetime]);

  useEffect(() => {
    const generation = bootstrapGenerationRef.current + 1;
    bootstrapGenerationRef.current = generation;
    setBootstrapGeneration(generation);
    const previous = bootstrapOwnerRef.current;
    const snapshot = { userId, epoch: identity.epoch, generation };
    bootstrapOwnerRef.current = snapshot;
    if (previous && previous.epoch !== snapshot.epoch) queryClient.clear();
    if (!isLoaded) return;
    if (!userId) {
      revisionRef.current = null;
      baseStateRef.current = null;
      latestCloudRef.current = null;
      lastSyncedPayloadRef.current = null;
      vaultMetadataRef.current = null;
      conflictRef.current = null;
      forceDirtyRef.current = false;
      latestStudyStateRef.current = null;
      observedPayloadRef.current = null;
      pendingStudyStateRef.current = null;
      setBootstrap((current) => isOwnerCurrent(snapshot) ? {
        ready: true,
        userId: null,
        ownerEpoch: snapshot.epoch,
        ownerGeneration: generation,
        persistAllowed: true,
        providerEpoch: current.providerEpoch + 1,
        conflict: null,
      } : current);
      setSyncStatus((current) => isOwnerCurrent(snapshot) ? 'unavailable' : current);
      setSyncError((current) => isOwnerCurrent(snapshot) ? null : current);
      return;
    }

    const requestSnapshot = snapshot;
    const isCurrent = () => isOwnerCurrent(requestSnapshot);
    const assertCurrent = () => {
      assertCurrentOwner(requestSnapshot);
    };
    let active = true;
      setBootstrap((current) => (isCurrent() ? {
      ready: false,
      userId,
      ownerEpoch: snapshot.epoch,
      ownerGeneration: generation,
      persistAllowed: current.userId === userId ? current.persistAllowed : true,
      providerEpoch: current.providerEpoch + 1,
      conflict: null,
      } : current));
    setSyncStatus((current) => isCurrent() ? 'loading' : current);
    setSyncError((current) => isCurrent() ? null : current);
    revisionRef.current = null;
    baseStateRef.current = null;
    latestCloudRef.current = null;
    lastSyncedPayloadRef.current = null;
    vaultMetadataRef.current = null;
    conflictRef.current = null;
    forceDirtyRef.current = false;
    latestStudyStateRef.current = null;
    observedPayloadRef.current = null;
    pendingStudyStateRef.current = null;

    const finish = (
      next: Omit<AccountBootstrap, 'providerEpoch' | 'userId' | 'ownerEpoch' | 'ownerGeneration'>,
      status: AriseSyncStatus,
      error: string | null,
    ) => {
      if (!active || !isCurrent()) return;
      setBootstrap((current) => (!active || !isCurrent() ? current : {
        ...next,
        userId,
        ownerEpoch: snapshot.epoch,
        ownerGeneration: generation,
        providerEpoch: current.providerEpoch + 1,
      }));
      setSyncStatus((current) => active && isCurrent() ? status : current);
      setSyncError((current) => active && isCurrent() ? error : current);
    };

    void (async () => {
      const storageKey = getAccountStudyStorageKey(userId);
      let vault: ParsedVault;
      try {
        vault = await readAccountVault(userId);
        assertCurrent();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Account-local progress could not be read.';
        finish({
          ready: true,
          initialState: createCleanAccountStudyState(),
          persistAllowed: false,
          conflict: null,
        }, 'error', message);
        return;
      }

      if (vault.rawMetadata && vault.metadataError) {
        await preserveVaultBytes(storageKey, 'damaged-metadata', vault.rawMetadata);
        assertCurrent();
      }
      if (vault.rawState !== null && vault.stateError) {
        await preserveVaultBytes(storageKey, 'damaged-local-state', vault.rawState);
        assertCurrent();
      }
      if (vault.rawJournal && vault.journalError) {
        await preserveVaultBytes(storageKey, 'damaged-journal', vault.rawJournal);
        assertCurrent();
      }
      const localIssue = vault.stateError || vault.metadataError;
      const canPersistVault = !vault.stateError && !vault.journalError;
      let cloud: AccountCloudSnapshot;
      try {
        cloud = await readCloudSnapshot(requestSnapshot);
        assertCurrent();
      } catch (error) {
        if (!active || !isCurrent()) return;
        const localState = vault.state;
        const errorMessage = error instanceof Error
          ? error.message
          : 'Account progress could not be reached. Your local account vault was retained.';
        revisionRef.current = vault.metadata?.baseRevision ?? null;
        baseStateRef.current = vault.metadata?.baseState ?? null;
        vaultMetadataRef.current = vault.metadata;
        conflictRef.current = vault.metadata?.conflict ?? null;
        forceDirtyRef.current = !!vault.metadata?.dirty;
        lastSyncedPayloadRef.current = vault.metadata?.dirty
          ? null
          : localState ? JSON.stringify(localState) : null;
        const preservedConflict = vault.metadata?.conflict ?? null;
        finish({
          ready: true,
          initialState: preservedConflict
            ? preservedConflict.cloudState ?? createCleanAccountStudyState()
            : localState ?? createCleanAccountStudyState(),
          persistAllowed: canPersistVault,
          conflict: preservedConflict,
        }, preservedConflict ? 'conflict' : localIssue ? 'error' : 'offline',
        preservedConflict ? 'An unresolved progress conflict is preserved. Reconnect to review or resolve it.'
          : localIssue ?? errorMessage);
        return;
      }

      latestCloudRef.current = cloud;
      revisionRef.current = cloud.revision;
      baseStateRef.current = cloud.state;
      vaultMetadataRef.current = vault.metadata;

      if (vault.metadata?.conflict) {
        const priorConflict = vault.metadata.conflict;
        const recoveredLocalState = vault.state
          && !areStudyStatesEqual(vault.state, priorConflict.localState)
          ? vault.state
          : priorConflict.localState;
        const localChanged = !areStudyStatesEqual(recoveredLocalState, priorConflict.localState);
        const cloudChanged = priorConflict.serverRevision !== cloud.revision
          || !areStudyStatesEqual(priorConflict.cloudState, cloud.state);
        const conflict: AccountStudyConflict = cloudChanged
          ? {
            ...priorConflict,
            localState: recoveredLocalState,
            cloudState: cloud.state,
            serverRevision: cloud.revision,
            createdAt: new Date().toISOString(),
          }
          : localChanged ? { ...priorConflict, localState: recoveredLocalState } : priorConflict;
        if (cloudChanged || localChanged) {
          await preserveConflictPair(storageKey, conflict.localState, cloud.state, vault.rawState);
          assertCurrent();
        }
        conflictRef.current = conflict;
        forceDirtyRef.current = true;
        lastSyncedPayloadRef.current = JSON.stringify(cloud.state ?? createCleanAccountStudyState());
        finish({
          ready: true,
          initialState: cloud.state ?? createCleanAccountStudyState(),
          persistAllowed: canPersistVault,
          conflict,
        }, 'conflict', 'A saved progress conflict is waiting for your choice. Both versions are preserved.');
        return;
      }

      if (cloud.state) {
        const localMatchesCloud = areStudyStatesEqual(vault.state, cloud.state);
        const localDiffersFromBase = !!vault.state && !!vault.metadata?.baseState
          && !areStudyStatesEqual(vault.state, vault.metadata.baseState);
        const localMayHaveUncommittedChanges = !!vault.state && !localMatchesCloud
          && (!!vault.metadata?.dirty || localDiffersFromBase || !vault.metadata);
        if (vault.state && localMayHaveUncommittedChanges) {
          if (vault.metadata
            && vault.metadata.baseRevision === cloud.revision
            && areStudyStatesEqual(vault.metadata.baseState, cloud.state)) {
            forceDirtyRef.current = true;
            lastSyncedPayloadRef.current = JSON.stringify(cloud.state);
            finish({
              ready: true,
              initialState: vault.state,
              persistAllowed: canPersistVault,
              conflict: null,
            }, 'synced', localIssue);
            return;
          }
          await preserveConflictPair(storageKey, vault.state, cloud.state, vault.rawState);
          assertCurrent();
          const conflict: AccountStudyConflict = {
            kind: 'revision',
            localState: vault.state,
            cloudState: cloud.state,
            baseState: vault.metadata?.baseState ?? null,
            baseRevision: vault.metadata?.baseRevision ?? null,
            serverRevision: cloud.revision,
            createdAt: new Date().toISOString(),
          };
          conflictRef.current = conflict;
          forceDirtyRef.current = true;
          lastSyncedPayloadRef.current = JSON.stringify(cloud.state);
          finish({
            ready: true,
            initialState: cloud.state,
            persistAllowed: canPersistVault,
            conflict,
          }, 'conflict', 'Local and cloud progress both changed. Both versions were backed up; choose how to resolve them.');
          return;
        }
        if (vault.state && !localMatchesCloud) {
          const provenOlderCache = !!vault.metadata
            && !vault.metadata.dirty
            && areStudyStatesEqual(vault.state, vault.metadata.baseState)
            && vault.metadata.baseRevision !== null
            && vault.metadata.baseRevision < cloud.revision;
          if (!provenOlderCache) {
            await preserveConflictPair(storageKey, vault.state, cloud.state, vault.rawState);
            assertCurrent();
            const conflict: AccountStudyConflict = {
              kind: 'revision',
              localState: vault.state,
              cloudState: cloud.state,
              baseState: vault.metadata?.baseState ?? null,
              baseRevision: vault.metadata?.baseRevision ?? null,
              serverRevision: cloud.revision,
              createdAt: new Date().toISOString(),
            };
            conflictRef.current = conflict;
            forceDirtyRef.current = true;
            lastSyncedPayloadRef.current = JSON.stringify(cloud.state);
            finish({
              ready: true,
              initialState: cloud.state,
              persistAllowed: canPersistVault,
              conflict,
            }, 'conflict', 'Local and cloud progress do not have a provably clean common snapshot. Both versions were backed up for review.');
            return;
          }
          await preserveVaultBytes(storageKey, 'older-local-cache', vault.rawState ?? JSON.stringify(vault.state));
          assertCurrent();
        }
        forceDirtyRef.current = !!localIssue;
        lastSyncedPayloadRef.current = JSON.stringify(cloud.state);
        finish({
          ready: true,
          initialState: cloud.state,
          persistAllowed: canPersistVault,
          conflict: null,
        }, localIssue ? 'error' : 'synced', localIssue);
        return;
      }

      const cleanState = createCleanAccountStudyState();
      const cleanSerialized = JSON.stringify(cleanState);
      const localDiffersFromBase = !!vault.state && !!vault.metadata?.baseState
        && !areStudyStatesEqual(vault.state, vault.metadata.baseState);
      const localMayHaveUncommittedChanges = !!vault.state && (
        !vault.metadata
        || vault.metadata.dirty
        || !vault.metadata.baseState
        || localDiffersFromBase
      );
      if (vault.state && localMayHaveUncommittedChanges && vault.metadata
        && (vault.metadata.baseRevision === 0 || vault.metadata.baseRevision === null)) {
        revisionRef.current = 0;
        baseStateRef.current = vault.metadata.baseState ?? cleanState;
        forceDirtyRef.current = true;
        lastSyncedPayloadRef.current = cleanSerialized;
        finish({
          ready: true,
          initialState: vault.state,
          persistAllowed: canPersistVault,
          conflict: null,
        }, 'synced', localIssue);
        return;
      }
      if (vault.state && vault.metadata
        && !localMayHaveUncommittedChanges
        && (vault.metadata.baseRevision === 0 || vault.metadata.baseRevision === null)) {
        revisionRef.current = 0;
        baseStateRef.current = vault.metadata.baseState ?? vault.state;
        lastSyncedPayloadRef.current = JSON.stringify(vault.state);
        forceDirtyRef.current = false;
        finish({
          ready: true,
          initialState: vault.state,
          persistAllowed: canPersistVault,
          conflict: null,
        }, localIssue ? 'error' : 'synced', localIssue);
        return;
      }
      if (vault.state && !areStudyStatesEqual(vault.state, cleanState)) {
        await preserveConflictPair(storageKey, vault.state, null, vault.rawState);
        assertCurrent();
        const conflict: AccountStudyConflict = {
          kind: 'local-recovery',
          localState: vault.state,
          cloudState: null,
          baseState: vault.metadata?.baseState ?? null,
          baseRevision: null,
          serverRevision: 0,
          createdAt: new Date().toISOString(),
        };
        conflictRef.current = conflict;
        forceDirtyRef.current = true;
        lastSyncedPayloadRef.current = cleanSerialized;
        finish({
          ready: true,
          initialState: cleanState,
          persistAllowed: canPersistVault,
          conflict,
        }, 'conflict', 'Cloud progress is empty but a separate local account copy exists. It was backed up and has not been uploaded.');
        return;
      }
      revisionRef.current = 0;
      baseStateRef.current = cleanState;
      lastSyncedPayloadRef.current = cleanSerialized;
      forceDirtyRef.current = false;
      finish({
        ready: true,
        initialState: cleanState,
        persistAllowed: canPersistVault,
        conflict: null,
      }, localIssue ? 'error' : 'synced', localIssue);
    })().catch((error) => {
      if (!active || !isCurrent()) return;
      const message = error instanceof Error ? error.message : 'Account progress could not be prepared safely.';
      finish({
        ready: true,
        initialState: createCleanAccountStudyState(),
        persistAllowed: false,
        conflict: null,
      }, 'error', message);
    });

    return () => { active = false; };
  }, [identity.epoch, isLoaded, queryClient, readCloudSnapshot, retryAttempt, userId]);

  useEffect(() => {
    if (!isLoaded || !userId || !isSignedIn) {
      if (activeAuthTokenLifetime === providerLifetime) {
        activeAuthTokenLifetime = null;
        setAuthTokenGetter(null);
      }
      return;
    }
    const requestIdentity: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    activeAuthTokenLifetime = providerLifetime;
    setAuthTokenGetter(async () => {
      const expected = cloudRequestOwnerRef.current ?? requestIdentity;
      if (!isOwnerCurrent(expected)) return null;
      const token = await getTokenRef.current();
      if (!isOwnerCurrent(expected)) return null;
      return token;
    });
    return () => {
      if (activeAuthTokenLifetime === providerLifetime) {
        activeAuthTokenLifetime = null;
        setAuthTokenGetter(null);
      }
    };
  }, [bootstrapGeneration, identity.epoch, isLoaded, isSignedIn, isOwnerCurrent, providerLifetime, userId]);

  const writeVaultMetadata = useCallback(async (
    metadata: VaultMetadata,
    state: StudyState,
    expected: IdentitySnapshot,
  ) => {
    assertCurrentOwner(expected);
    if (!userId) return;
    const storageKey = getAccountStudyStorageKey(userId);
    const persisted = await persistAccountStudyVaultSnapshot(
      storageKey,
      JSON.stringify(state),
      JSON.stringify(metadata),
      undefined,
      () => isOwnerCurrent(expected),
    );
    assertCurrentOwner(expected);
    if (!persisted.ran
      || persisted.snapshot?.state !== JSON.stringify(state)
      || persisted.snapshot?.metadata !== JSON.stringify(metadata)) {
      throw new Error('The exact account snapshot could not be committed. Progress remains protected for recovery.');
    }
  }, [assertCurrentOwner, userId]);

  const accountPayloadMetadata = useCallback((serializedState: string) => {
    if (!userId) return '';
    const expected: IdentitySnapshot = {
      userId,
      epoch: identityRef.current.epoch,
      generation: bootstrapGenerationRef.current,
    };
    if (!isOwnerCurrent(expected)) return '';
    let conflict = conflictRef.current;
    if (conflict) {
      const serializedLocal = JSON.stringify(conflict.localState);
      if (serializedLocal !== serializedState) {
        try {
          const latestLocal = JSON.parse(serializedState) as StudyState;
          if (isOwnerCurrent(expected)) {
            conflict = { ...conflict, localState: latestLocal };
            conflictRef.current = conflict;
            setBootstrap((current) => isOwnerCurrent(expected)
              && current.userId === userId
              && current.ownerEpoch === expected.epoch
              && current.ownerGeneration === expected.generation
              ? { ...current, conflict }
              : current);
          }
        } catch {
          // The state writer reports the original serialization error separately.
        }
      }
    }
    const metadata: VaultMetadata = {
      version: 1,
      baseRevision: revisionRef.current,
      baseState: baseStateRef.current,
      dirty: forceDirtyRef.current || serializedState !== lastSyncedPayloadRef.current,
      conflict,
    };
    vaultMetadataRef.current = metadata;
    return JSON.stringify(metadata);
  }, [isOwnerCurrent, userId]);

  const publishConflict = useCallback(async (
    expected: IdentitySnapshot,
    kind: AccountConflictKind,
    localState: StudyState,
    cloud: AccountCloudSnapshot,
    baseState: StudyState | null,
    followLatestLocal = true,
  ) => {
    assertCurrentOwner(expected);
    if (!expected.userId) throw new Error('A signed-in account is required to preserve this conflict.');
    const storageKey = getAccountStudyStorageKey(expected.userId);
    await preserveConflictPair(storageKey, localState, cloud.state);
    assertCurrentOwner(expected);
    const previousConflict = conflictRef.current;
    const previousLocal = previousConflict?.kind === kind
      ? previousConflict.localState
      : null;
    let protectedLocalState = followLatestLocal
      ? previousLocal ?? latestStudyStateRef.current ?? localState
      : localState;
    if (!areStudyStatesEqual(protectedLocalState, localState)) {
      await preserveConflictPair(storageKey, protectedLocalState, cloud.state);
      assertCurrentOwner(expected);
      protectedLocalState = followLatestLocal
        ? (conflictRef.current?.kind === kind
          ? conflictRef.current.localState
          : latestStudyStateRef.current ?? protectedLocalState)
        : protectedLocalState;
    }
    const conflict: AccountStudyConflict = {
      kind,
      localState: protectedLocalState,
      cloudState: cloud.state,
      baseState,
      baseRevision: kind === 'revision'
        ? previousConflict?.kind === kind
          ? previousConflict.baseRevision
          : revisionRef.current
        : null,
      serverRevision: cloud.revision,
      createdAt: new Date().toISOString(),
    };
    assertCurrentOwner(expected);
    conflictRef.current = conflict;
    revisionRef.current = cloud.revision;
    baseStateRef.current = cloud.state;
    latestCloudRef.current = cloud;
    forceDirtyRef.current = true;
    latestStudyStateRef.current = protectedLocalState;
    pendingStudyStateRef.current = null;
      setBootstrap((current) => isOwnerCurrent(expected)
        && current.userId === expected.userId
        && current.ownerEpoch === expected.epoch
        && current.ownerGeneration === expected.generation
      ? { ...current, conflict }
      : current);
    setSyncStatus((current) => isOwnerCurrent(expected) ? 'conflict' : current);
    setSyncError((current) => isOwnerCurrent(expected)
      ? 'Local and cloud progress both changed. Both versions were backed up; choose how to resolve them.'
      : current);
    const metadata: VaultMetadata = {
      version: 1,
      baseRevision: cloud.revision,
      baseState: cloud.state,
      dirty: true,
      conflict,
    };
    vaultMetadataRef.current = metadata;
    const persistence = await persistAccountStudyVaultSnapshot(
      storageKey,
      JSON.stringify(protectedLocalState),
      JSON.stringify(metadata),
      undefined,
      () => isOwnerCurrent(expected),
    );
    assertCurrentOwner(expected);
    if (!persistence.ran) {
      throw new Error('The account session changed before its conflict snapshot could be preserved.');
    }
  }, [assertCurrentOwner, isOwnerCurrent]);

  const synchronizeState = useCallback(async (state: StudyState) => {
    if (!userId || revisionRef.current === null || !bootstrap.ready
      || bootstrap.userId !== userId || bootstrap.conflict || conflictRef.current
      || syncStatus === 'offline' || syncStatus === 'error') return;
    const requestIdentity: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    if (!isOwnerCurrent(requestIdentity)) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedPayloadRef.current && !forceDirtyRef.current) {
      const metadata: VaultMetadata = {
        version: 1,
        baseRevision: revisionRef.current,
        baseState: baseStateRef.current,
        dirty: false,
        conflict: conflictRef.current,
      };
      vaultMetadataRef.current = metadata;
      void writeVaultMetadata(metadata, state, requestIdentity).catch((error) => {
        if (!isOwnerCurrent(requestIdentity)) return;
        setSyncStatus((current) => isOwnerCurrent(requestIdentity) ? 'offline' : current);
        setSyncError((current) => isOwnerCurrent(requestIdentity)
          ? error instanceof Error ? error.message : 'Account progress could not be saved safely.'
          : current);
      });
      return;
    }
    pendingStudyStateRef.current = state;
    const currentSyncOwner = syncingOwnerRef.current;
    if (currentSyncOwner?.userId === requestIdentity.userId
      && currentSyncOwner.epoch === requestIdentity.epoch
      && currentSyncOwner.generation === requestIdentity.generation) return;
    syncingOwnerRef.current = requestIdentity;
    setSyncStatus((current) => isOwnerCurrent(requestIdentity) ? 'syncing' : current);
    setSyncError((current) => isOwnerCurrent(requestIdentity) ? null : current);
    try {
      while (pendingStudyStateRef.current) {
        assertCurrentOwner(requestIdentity);
        const pending = pendingStudyStateRef.current;
        pendingStudyStateRef.current = null;
        if (!pending) break;
        const payload = JSON.stringify(pending);
        if (payload === lastSyncedPayloadRef.current && !forceDirtyRef.current) continue;
        const expectedRevision = revisionRef.current;
        if (expectedRevision === null) throw new Error('Cloud revision is unknown. Retry sync before saving.');
        try {
          const saved = await saveCloudSnapshot(
            requestIdentity,
            expectedRevision,
            pending,
          );
          assertCurrentOwner(requestIdentity);
          latestCloudRef.current = saved;
          revisionRef.current = saved.revision;
          baseStateRef.current = saved.state;
          lastSyncedPayloadRef.current = JSON.stringify(saved.state);
          forceDirtyRef.current = false;
          const metadata: VaultMetadata = {
            version: 1,
            baseRevision: saved.revision,
            baseState: saved.state,
            dirty: pendingStudyStateRef.current !== null,
            conflict: conflictRef.current,
          };
          vaultMetadataRef.current = metadata;
          await writeVaultMetadata(metadata, pendingStudyStateRef.current ?? pending, requestIdentity);
          assertCurrentOwner(requestIdentity);
          setSyncStatus((current) => isOwnerCurrent(requestIdentity)
            ? pendingStudyStateRef.current ? 'syncing' : 'synced'
            : current);
        } catch (error) {
          assertCurrentOwner(requestIdentity);
          if (isCloudCompareAndSwapConflict(error)) {
            const currentCloud = await readCloudSnapshot(requestIdentity);
            assertCurrentOwner(requestIdentity);
            const latestLocal = latestStudyStateRef.current
              ?? pendingStudyStateRef.current
              ?? pending;
            await publishConflict(
              requestIdentity,
              'revision',
              latestLocal,
              currentCloud,
              baseStateRef.current,
            );
            assertCurrentOwner(requestIdentity);
            break;
          }
          pendingStudyStateRef.current = latestStudyStateRef.current ?? pending;
          throw error;
        }
      }
    } catch (error) {
      if (isOwnerCurrent(requestIdentity)) {
        setSyncStatus((current) => isOwnerCurrent(requestIdentity) ? 'offline' : current);
        setSyncError((current) => isOwnerCurrent(requestIdentity) ? error instanceof Error
          ? `Progress is saved on this device but could not sync: ${error.message}`
          : 'Progress is saved on this device but could not sync. Retry when your connection is available.'
          : current);
      }
    } finally {
      const currentOwner = syncingOwnerRef.current;
      if (currentOwner?.userId === requestIdentity.userId
        && currentOwner.epoch === requestIdentity.epoch
        && currentOwner.generation === requestIdentity.generation
        && isOwnerCurrent(requestIdentity)) {
        syncingOwnerRef.current = null;
      }
    }
  }, [
    assertCurrentOwner,
    bootstrapGeneration,
    bootstrap.conflict,
    bootstrap.ready,
    bootstrap.userId,
    identity.epoch,
    isOwnerCurrent,
    publishConflict,
    readCloudSnapshot,
    saveCloudSnapshot,
    syncStatus,
    userId,
    writeVaultMetadata,
  ]);

  const observeStudyState = useCallback((state: StudyState) => {
    if (!userId || bootstrap.userId !== userId || !bootstrap.ready) return;
    const expected: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    if (!isOwnerCurrent(expected)) return;
    latestStudyStateRef.current = state;
    const serialized = JSON.stringify(state);
    if (observedPayloadRef.current === serialized) return;
    observedPayloadRef.current = serialized;
    const currentConflict = conflictRef.current;
    if (currentConflict) {
      pendingStudyStateRef.current = null;
      if (areStudyStatesEqual(currentConflict.localState, state)) return;
      const updatedConflict = { ...currentConflict, localState: state };
      conflictRef.current = updatedConflict;
      forceDirtyRef.current = true;
      const metadata: VaultMetadata = {
        version: 1,
        baseRevision: updatedConflict.serverRevision,
        baseState: updatedConflict.cloudState,
        dirty: true,
        conflict: updatedConflict,
      };
      vaultMetadataRef.current = metadata;
      setBootstrap((current) => isOwnerCurrent(expected)
        && current.userId === userId
        && current.ownerEpoch === expected.epoch
        && current.ownerGeneration === expected.generation
        ? { ...current, conflict: updatedConflict }
        : current);
      const storageKey = getAccountStudyStorageKey(userId);
      void persistAccountStudyVaultSnapshot(
        storageKey,
        serialized,
        JSON.stringify(metadata),
        undefined,
        () => isOwnerCurrent(expected),
      ).catch((error) => {
        if (!isOwnerCurrent(expected)) return;
        setSyncError((current) => isOwnerCurrent(expected)
          ? error instanceof Error
            ? `The latest conflict copy remains staged for recovery: ${error.message}`
            : 'The latest conflict copy remains staged for recovery.'
          : current);
      });
      return;
    }
    void synchronizeState(state);
  }, [
    bootstrap.ready,
    bootstrap.userId,
    bootstrapGeneration,
    identity.epoch,
    isOwnerCurrent,
    synchronizeState,
    userId,
  ]);

  const retrySync = useCallback(async () => {
    if (!userId) return;
    const expected: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    if (!isOwnerCurrent(expected)) return;
    setSyncError((current) => isOwnerCurrent(expected) ? null : current);
    setRetryAttempt((attempt) => isOwnerCurrent(expected) ? attempt + 1 : attempt);
  }, [bootstrapGeneration, identity.epoch, isOwnerCurrent, userId]);

  const continueOffline = useCallback(() => undefined, []);

  const signIn = useCallback(async () => {
    throw new Error('Choose NEW GUEST or ENTER ACCOUNT CODE to open an ARISE profile.');
  }, []);

  const signOut = useCallback(async () => {
    if (!userId) return;
    const owner: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    assertCurrentOwner(owner);
    pendingStudyStateRef.current = null;
    await profileLogout();
    if (identityRef.current.userId === null && identityRef.current.epoch === owner.epoch + 1) {
      router.replace('/' as never);
    }
  }, [assertCurrentOwner, bootstrapGeneration, profileLogout, identity.epoch, router, userId]);

  const importAnonymous = useCallback(async () => {
    if (!userId || revisionRef.current === null || !bootstrap.ready) {
      throw new Error('Wait until your signed-in account is ready before importing local progress.');
    }
    if (bootstrap.conflict) throw new Error('Resolve the existing account progress conflict before importing anonymous progress.');
    if (syncStatus !== 'synced' || forceDirtyRef.current
      || (latestStudyStateRef.current
        && JSON.stringify(latestStudyStateRef.current) !== lastSyncedPayloadRef.current)) {
      throw new Error('Wait for this account’s own progress to finish syncing before importing another profile.');
    }
    const owner: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    const accountKey = getAccountStudyStorageKey(userId);
    const liveStateAtImportStart = latestStudyStateRef.current;
    const livePayloadAtImportStart = liveStateAtImportStart
      ? JSON.stringify(liveStateAtImportStart)
      : lastSyncedPayloadRef.current;
    const importBaseState = baseStateRef.current;
    const anonymousRead = await withStudyStorageQueue(ANONYMOUS_STUDY_STORAGE_KEY, async () => (
      AsyncStorage.getItem(ANONYMOUS_STUDY_STORAGE_KEY)
    ));
    assertCurrentOwner(owner);
    const raw = anonymousRead.value ?? null;
    if (!raw) throw new Error('No anonymous study progress was found to import.');
    const anonymousState = prepareStudyStateForAccount(JSON.parse(raw));
    await preserveVaultBytes(accountKey, 'anonymous-import-source', raw);
    assertCurrentOwner(owner);
    const cloud = latestCloudRef.current;
    if (cloud?.state) {
      await publishConflict(owner, 'anonymous-import', anonymousState, cloud, null, false);
      assertCurrentOwner(owner);
      return;
    }
    if ((latestStudyStateRef.current
        && JSON.stringify(latestStudyStateRef.current) !== livePayloadAtImportStart)
      || syncingOwnerRef.current?.userId === owner.userId
        && syncingOwnerRef.current.epoch === owner.epoch
        && syncingOwnerRef.current.generation === owner.generation) {
      throw new Error('This device changed while the import was being prepared. Sync the latest account progress and retry.');
    }
    let cloudCommit: AccountCloudSnapshot | null = null;
    try {
      const saved = await saveCloudSnapshot(
        owner,
        revisionRef.current,
        anonymousState,
      );
      assertCurrentOwner(owner);
      cloudCommit = saved;
      const liveStateAfterSave = latestStudyStateRef.current;
      if (liveStateAfterSave
        && JSON.stringify(liveStateAfterSave) !== livePayloadAtImportStart) {
        await publishConflict(
          owner,
          'anonymous-import',
          liveStateAfterSave,
          saved,
          importBaseState,
        );
        assertCurrentOwner(owner);
        return;
      }
      latestCloudRef.current = saved;
      revisionRef.current = saved.revision;
      baseStateRef.current = saved.state;
      lastSyncedPayloadRef.current = JSON.stringify(saved.state);
      forceDirtyRef.current = false;
      conflictRef.current = null;
      const metadata: VaultMetadata = {
        version: 1,
        baseRevision: saved.revision,
        baseState: saved.state,
        dirty: false,
        conflict: null,
      };
      vaultMetadataRef.current = metadata;
      await writeVaultMetadata(metadata, saved.state ?? anonymousState, owner);
      assertCurrentOwner(owner);
      const liveStateAfterPersistence = latestStudyStateRef.current;
      if (liveStateAfterPersistence
        && JSON.stringify(liveStateAfterPersistence) !== livePayloadAtImportStart) {
        await publishConflict(
          owner,
          'anonymous-import',
          liveStateAfterPersistence,
          saved,
          importBaseState,
        );
        assertCurrentOwner(owner);
        return;
      }
      latestStudyStateRef.current = saved.state ?? anonymousState;
      pendingStudyStateRef.current = null;
      setBootstrap((current) => isOwnerCurrent(owner)
        && current.userId === owner.userId
        && current.ownerEpoch === owner.epoch
        && current.ownerGeneration === owner.generation ? ({
        ...current,
        initialState: saved.state ?? anonymousState,
        conflict: null,
        providerEpoch: current.providerEpoch + 1,
      }) : current);
      setSyncStatus((current) => isOwnerCurrent(owner) ? 'synced' : current);
      setSyncError((current) => isOwnerCurrent(owner) ? null : current);
    } catch (error) {
      assertCurrentOwner(owner);
      if (isCloudCompareAndSwapConflict(error)) {
        const currentCloud = await readCloudSnapshot(owner);
        assertCurrentOwner(owner);
        await publishConflict(owner, 'anonymous-import', anonymousState, currentCloud, null, false);
        assertCurrentOwner(owner);
        return;
      }
      if (cloudCommit) {
        const latestLocal = latestStudyStateRef.current
          ?? liveStateAtImportStart
          ?? createCleanAccountStudyState();
        await publishConflict(owner, 'anonymous-import', latestLocal, cloudCommit, importBaseState);
        assertCurrentOwner(owner);
        return;
      }
      await preserveVaultBytes(accountKey, 'anonymous-import-draft', JSON.stringify(anonymousState));
      assertCurrentOwner(owner);
      throw error;
    }
  }, [
    assertCurrentOwner,
    bootstrap.ready,
    bootstrap.conflict,
    bootstrapGeneration,
    identity.epoch,
    isOwnerCurrent,
    publishConflict,
    readCloudSnapshot,
    saveCloudSnapshot,
    syncStatus,
    userId,
    writeVaultMetadata,
  ]);

  const resolveConflict = useCallback(async (resolution: AccountConflictResolution) => {
    if (!userId) throw new Error('There is no account progress conflict to resolve.');
    const owner: IdentitySnapshot = {
      userId,
      epoch: identity.epoch,
      generation: bootstrapGeneration,
    };
    assertCurrentOwner(owner);
    const conflict = conflictRef.current ?? bootstrap.conflict;
    if (!conflict) throw new Error('There is no account progress conflict to resolve.');
    const activeResolution = resolvingOwnerRef.current;
    if (activeResolution?.userId === owner.userId
      && activeResolution.epoch === owner.epoch
      && activeResolution.generation === owner.generation) {
      throw new Error('A progress conflict decision is already being saved.');
    }
    let resolvedState: StudyState | null = conflict.cloudState;
    if (resolution === 'merge') {
      if (conflict.kind !== 'revision'
        || conflict.baseRevision === null
        || conflict.baseRevision >= conflict.serverRevision
        || !conflict.baseState
        || !conflict.cloudState) {
        throw new Error('A safe merge is unavailable because these versions do not share a verified cloud base. Keep the cloud version instead.');
      }
      resolvedState = safelyMergeStudyStates(
        conflict.baseState,
        conflict.localState,
        conflict.cloudState,
      );
      if (!resolvedState) {
        throw new Error('These versions contain overlapping changes that cannot be safely merged. Keep the cloud version instead.');
      }
    }

    resolvingOwnerRef.current = owner;
    let savedSnapshot: AccountCloudSnapshot | null = null;
    let cloudWasChanged = false;
    try {
      if (resolution === 'keep-cloud') {
        const currentCloud = await readCloudSnapshot(owner);
        assertCurrentOwner(owner);
        if (currentCloud.revision !== conflict.serverRevision
          || !areStudyStatesEqual(currentCloud.state, conflict.cloudState)) {
          await publishConflict(
            owner,
            conflict.kind,
            conflict.localState,
            currentCloud,
            conflict.baseState,
            true,
          );
          assertCurrentOwner(owner);
          throw new Error('Cloud progress changed again. Review the refreshed versions before choosing.');
        }
        savedSnapshot = currentCloud;
      } else {
        try {
          savedSnapshot = await saveCloudSnapshot(
            owner,
            conflict.serverRevision,
            resolvedState!,
          );
          cloudWasChanged = true;
        } catch (error) {
          assertCurrentOwner(owner);
          if (!isCloudCompareAndSwapConflict(error)) throw error;
          const currentCloud = await readCloudSnapshot(owner);
          assertCurrentOwner(owner);
          await publishConflict(
            owner,
            conflict.kind,
            conflict.localState,
            currentCloud,
            conflict.baseState,
            true,
          );
          assertCurrentOwner(owner);
          return;
        }
      }
      assertCurrentOwner(owner);

      const latestConflictLocal = conflictRef.current?.kind === conflict.kind
        ? conflictRef.current.localState
        : conflict.localState;
      if (!areStudyStatesEqual(latestConflictLocal, conflict.localState)) {
        await publishConflict(
          owner,
          conflict.kind,
          latestConflictLocal,
          savedSnapshot!,
          conflict.baseState,
          true,
        );
        assertCurrentOwner(owner);
        return;
      }

      const targetState = resolution === 'keep-cloud'
        ? savedSnapshot?.state ?? createCleanAccountStudyState()
        : savedSnapshot?.state ?? resolvedState!;
      const revision = savedSnapshot?.revision ?? 0;
      const metadata: VaultMetadata = {
        version: 1,
        baseRevision: revision,
        baseState: savedSnapshot?.state ?? targetState,
        dirty: false,
        conflict: null,
      };
      await writeVaultMetadata(metadata, targetState, owner);
      assertCurrentOwner(owner);

      const changedLocalDuringCommit = conflictRef.current
        && !areStudyStatesEqual(conflictRef.current.localState, conflict.localState);
      if (changedLocalDuringCommit) {
        await publishConflict(
          owner,
          conflict.kind,
          conflictRef.current!.localState,
          savedSnapshot!,
          conflict.baseState,
          true,
        );
        assertCurrentOwner(owner);
        return;
      }

      latestCloudRef.current = savedSnapshot ?? { state: null, revision, updatedAt: null };
      revisionRef.current = revision;
      baseStateRef.current = metadata.baseState;
      lastSyncedPayloadRef.current = JSON.stringify(targetState);
      forceDirtyRef.current = false;
      conflictRef.current = null;
      vaultMetadataRef.current = metadata;
      latestStudyStateRef.current = targetState;
      pendingStudyStateRef.current = null;
      setBootstrap((current) => isOwnerCurrent(owner)
        && current.userId === owner.userId
        && current.ownerEpoch === owner.epoch
        && current.ownerGeneration === owner.generation
        ? {
          ...current,
          initialState: targetState,
          conflict: null,
          providerEpoch: current.providerEpoch + 1,
        }
        : current);
      setSyncStatus((current) => isOwnerCurrent(owner) ? 'synced' : current);
      setSyncError((current) => isOwnerCurrent(owner) ? null : current);
    } catch (error) {
      assertCurrentOwner(owner);
      if (cloudWasChanged && savedSnapshot && conflictRef.current) {
        const latestLocal = conflictRef.current.localState;
        await publishConflict(
          owner,
          conflict.kind,
          latestLocal,
          savedSnapshot,
          conflict.baseState,
          true,
        );
        assertCurrentOwner(owner);
        return;
      }
      throw error;
    } finally {
      const active = resolvingOwnerRef.current;
      if (active?.userId === owner.userId
        && active.epoch === owner.epoch
        && active.generation === owner.generation
        && isOwnerCurrent(owner)) {
        resolvingOwnerRef.current = null;
      }
    }
  }, [
    assertCurrentOwner,
    bootstrapGeneration,
    bootstrap.conflict,
    identity.epoch,
    isOwnerCurrent,
    publishConflict,
    readCloudSnapshot,
    saveCloudSnapshot,
    userId,
    writeVaultMetadata,
  ]);

  const status: AriseAccountStatus = offlineOverride
    ? 'unavailable'
    : !isLoaded
    ? 'loading'
    : signInBusy
      ? 'signing-in'
      : userId
        ? 'signed-in'
        : callbackFailure
          ? 'error'
          : 'signed-out';
  const bootstrapOwnedByCurrentSession = bootstrap.ownerEpoch === identity.epoch
    && bootstrap.ownerGeneration === bootstrapGeneration;
  const value = useMemo<AriseAccountValue>(() => ({
    userId,
    isSignedIn: !!userId,
    status,
    syncStatus: offlineOverride ? 'unavailable' : syncStatus,
    syncError: offlineOverride ? null : syncError,
    loginError,
    isAvailable: true,
    isBootstrapped: bootstrapOwnedByCurrentSession && bootstrap.ready && bootstrap.userId === userId,
    initialStudyState: bootstrapOwnedByCurrentSession && bootstrap.userId === userId
      ? bootstrap.initialState
      : undefined,
    accountPersistenceAllowed: bootstrapOwnedByCurrentSession && bootstrap.userId === userId
      ? bootstrap.persistAllowed
      : true,
    providerEpoch: bootstrap.providerEpoch,
    sessionScope: `${providerLifetimeId}:${identity.epoch}`,
    conflict: bootstrapOwnedByCurrentSession && bootstrap.userId === userId ? bootstrap.conflict : null,
    signIn,
    signOut,
    retrySync,
    continueOffline,
    importAnonymous,
    resolveConflict,
    observeStudyState,
    accountPayloadMetadata,
  }), [
    accountPayloadMetadata,
    bootstrap,
    bootstrapOwnedByCurrentSession,
    continueOffline,
    importAnonymous,
    loginError,
    observeStudyState,
    offlineOverride,
    providerLifetimeId,
    identity.epoch,
    resolveConflict,
    retrySync,
    signIn,
    signOut,
    status,
    syncError,
    syncStatus,
    userId,
  ]);

  return <AriseAccountContext.Provider value={value}>{children}</AriseAccountContext.Provider>;
}

export function useAriseAccount(): AriseAccountValue {
  const account = useContext(AriseAccountContext);
  if (!account) throw new Error('useAriseAccount must be used within AriseAccountProvider.');
  return account;
}

export function AccountStudySyncBridge() {
  const { state, hydrated } = useStudy();
  const { isSignedIn, observeStudyState } = useAriseAccount();
  useEffect(() => {
    if (isSignedIn && hydrated) observeStudyState(state);
  }, [hydrated, isSignedIn, observeStudyState, state]);
  return null;
}