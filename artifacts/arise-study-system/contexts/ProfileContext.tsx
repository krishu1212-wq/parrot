import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  confirmStudyProfileRestore,
  createStudyProfile,
  getStudyProfile,
  prepareStudyProfileRestore,
  updateStudyProfile,
} from '@workspace/api-client-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { StudyState } from '@/contexts/StudyContext';
import { setActiveProfilePreferences } from '@/contexts/profilePreferences';

export type ProfileSettings = {
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
  motion: 'full' | 'reduced';
  notificationsEnabled: boolean;
  appearance: 'system' | 'dark';
};

export type StudyProfile = {
  profileId: string;
  accountCode: string;
  displayName: string;
  settings: ProfileSettings;
};

type StoredProfileSession = {
  accessToken: string;
  profile: StudyProfile;
};

type ProfileSessionValue = {
  ready: boolean;
  accessToken: string | null;
  profile: StudyProfile | null;
  sessionError: string | null;
  recoveryKeyToShow: string | null;
  createGuest: (displayName: string, state: StudyState) => Promise<void>;
  prepareRestore: (accountCode: string, recoveryKey: string) => Promise<{
    candidateToken: string;
    accountCode: string;
  }>;
  confirmRestore: (candidateToken: string) => Promise<void>;
  updateProfile: (updates: Partial<Pick<StudyProfile, 'displayName' | 'settings'>>) => Promise<void>;
  clearRecoveryKey: () => void;
  logout: () => Promise<void>;
};

const STORAGE_KEY = 'arise.profile.session.v1';
const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  soundEnabled: false,
  soundVolume: 0.5,
  hapticsEnabled: true,
  motion: 'full',
  notificationsEnabled: true,
  appearance: 'system',
};
const ProfileSessionContext = createContext<ProfileSessionValue | null>(null);

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const source = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const status = source.status ?? source.statusCode ?? source.response?.status;
  return typeof status === 'number' ? status : null;
}

async function readStoredSession(): Promise<StoredProfileSession | null> {
  try {
    const raw = Platform.OS === 'web'
      ? await AsyncStorage.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProfileSession>;
    if (typeof parsed.accessToken !== 'string'
      || !parsed.profile
      || typeof parsed.profile.profileId !== 'string'
      || !/^arise_[0-9a-f-]{36}$/i.test(parsed.profile.profileId)
      || typeof parsed.profile.accountCode !== 'string'
      || typeof parsed.profile.displayName !== 'string'
      || !parsed.profile.settings) return null;
    return parsed as StoredProfileSession;
  } catch {
    return null;
  }
}

async function writeStoredSession(session: StoredProfileSession): Promise<void> {
  const value = JSON.stringify(session);
  if (Platform.OS === 'web') await AsyncStorage.setItem(STORAGE_KEY, value);
  else await SecureStore.setItemAsync(STORAGE_KEY, value);
}

async function removeStoredSession(): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(STORAGE_KEY);
  else await SecureStore.deleteItemAsync(STORAGE_KEY);
}

function authRequest(accessToken: string) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

export function ProfileSessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudyProfile | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [recoveryKeyToShow, setRecoveryKeyToShow] = useState<string | null>(null);

  useEffect(() => {
    setActiveProfilePreferences(profile?.settings ?? null);
  }, [profile]);

  useEffect(() => {
    let active = true;
    void readStoredSession().then((stored) => {
      if (!active) return;
      if (!stored) {
        setReady(true);
        return;
      }
      setAccessToken(stored.accessToken);
      setProfile(stored.profile);
      setReady(true);
      void getStudyProfile(authRequest(stored.accessToken)).then(async (verified) => {
        if (!active) return;
        const fresh = { accessToken: stored.accessToken, profile: verified };
        setProfile(verified);
        await writeStoredSession(fresh);
      }).catch(async (error: unknown) => {
        if (!active) return;
        if (getStatusCode(error) === 401 || getStatusCode(error) === 404) {
          await removeStoredSession().catch(() => undefined);
          setAccessToken(null);
          setProfile(null);
          setSessionError('This profile session has expired. Enter your Account Code and recovery key to restore it.');
        }
      });
    }).catch(() => {
      if (active) {
        setSessionError('The saved ARISE profile session could not be read.');
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  const activateSession = useCallback(async (
    nextProfile: StudyProfile,
    nextAccessToken: string,
    recoveryKey?: string,
  ) => {
    setAccessToken(nextAccessToken);
    setProfile(nextProfile);
    setRecoveryKeyToShow(recoveryKey ?? null);
    setSessionError(null);
    setReady(true);
    try {
      await writeStoredSession({ accessToken: nextAccessToken, profile: nextProfile });
    } catch {
      setSessionError('This device could not save the profile session. Keep your Account Code and recovery key safe before closing ARISE.');
    }
  }, []);

  const createGuest = useCallback(async (displayName: string, state: StudyState) => {
    if (accessToken) throw new Error('Log out before creating a different profile.');
    const response = await createStudyProfile({ displayName, state });
    const { accessToken: token, recoveryKey, ...nextProfile } = response;
    await activateSession(nextProfile, token, recoveryKey);
  }, [accessToken, activateSession]);

  const prepareRestore = useCallback(async (accountCode: string, recoveryKey: string) => {
    const response = await prepareStudyProfileRestore({ accountCode, recoveryKey });
    return response;
  }, []);

  const confirmRestore = useCallback(async (candidateToken: string) => {
    if (accessToken) throw new Error('Log out before restoring a different profile.');
    const response = await confirmStudyProfileRestore({ candidateToken });
    const { accessToken: token, ...nextProfile } = response;
    await activateSession(nextProfile, token);
  }, [accessToken, activateSession]);

  const saveProfile = useCallback(async (
    updates: Partial<Pick<StudyProfile, 'displayName' | 'settings'>>,
  ) => {
    if (!accessToken || !profile) throw new Error('Choose an ARISE profile before changing profile settings.');
    const updated = await updateStudyProfile(updates, authRequest(accessToken));
    setProfile(updated);
    try {
      await writeStoredSession({ accessToken, profile: updated });
      setSessionError(null);
    } catch {
      setSessionError('Profile settings were saved online, but could not be cached on this device.');
    }
  }, [accessToken, profile]);

  const logout = useCallback(async () => {
    await removeStoredSession();
    setAccessToken(null);
    setProfile(null);
    setRecoveryKeyToShow(null);
    setSessionError(null);
  }, []);

  const value = useMemo<ProfileSessionValue>(() => ({
    ready,
    accessToken,
    profile,
    sessionError,
    recoveryKeyToShow,
    createGuest,
    prepareRestore,
    confirmRestore,
    updateProfile: saveProfile,
    clearRecoveryKey: () => setRecoveryKeyToShow(null),
    logout,
  }), [
    ready,
    accessToken,
    profile,
    sessionError,
    recoveryKeyToShow,
    createGuest,
    prepareRestore,
    confirmRestore,
    saveProfile,
    logout,
  ]);

  return <ProfileSessionContext.Provider value={value}>{children}</ProfileSessionContext.Provider>;
}

export function useProfileSession(): ProfileSessionValue {
  const value = useContext(ProfileSessionContext);
  if (!value) throw new Error('useProfileSession must be used inside ProfileSessionProvider.');
  return value;
}

export function useOptionalProfileSession(): ProfileSessionValue | null {
  return useContext(ProfileSessionContext);
}