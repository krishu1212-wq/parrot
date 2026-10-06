import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import {
  ACTIVATION_COMPLETE_KEY, DEFAULT_SOUND, normalizeSoundPreference, SOUND_PREFERENCE_KEY,
  type SoundPreference, type SystemSound,
} from './systemExperiencePolicy';
import { useOptionalProfileSession } from '@/contexts/ProfileContext';

const cues: Record<SystemSound, number> = {
  xp: require('../assets/sounds/xp.wav'), quest: require('../assets/sounds/quest.wav'),
  level: require('../assets/sounds/level.wav'), rank: require('../assets/sounds/rank.wav'),
  unlock: require('../assets/sounds/unlock.wav'), streak: require('../assets/sounds/streak.wav'),
  boss: require('../assets/sounds/boss.wav'), achievement: require('../assets/sounds/achievement.wav'),
  notification: require('../assets/sounds/notification.wav'), reward: require('../assets/sounds/reward.wav'),
};
type Experience = {
  ready: boolean; preference: SoundPreference; error: string | null;
  saveSound: (preference: SoundPreference) => Promise<void>;
  play: (cue: SystemSound) => void; stop: () => void;
  activationComplete: boolean; replaying: boolean; replayActivation: () => void;
  finishActivation: () => Promise<void>;
};
const Context = createContext<Experience | null>(null);
export function SystemExperienceProvider({ children }: { children: React.ReactNode }) {
  const profileSession = useOptionalProfileSession();
  const [ready, setReady] = useState(false);
  const [activationReady, setActivationReady] = useState(false);
  const [preference, setPreference] = useState<SoundPreference>({ ...DEFAULT_SOUND });
  const [activationComplete, setActivationComplete] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preferenceRef = useRef(preference);
  const player = useRef<AudioPlayer | null>(null);
  const generation = useRef(0);
  const lastPlayed = useRef(0);
  const stop = useCallback(() => {
    generation.current += 1;
    player.current?.remove();
    player.current = null;
  }, []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(ACTIVATION_COMPLETE_KEY).then((value) => {
      if (!active) return;
      setActivationComplete(value === 'true');
      setActivationReady(true);
    }).catch(() => {
      if (active) {
        setError('System preferences could not be read. Sound remains off; study data is untouched.');
        setActivationReady(true);
      }
    });
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => { active = false; sub.remove(); stop(); };
  }, [stop]);
  useEffect(() => {
    if (!activationReady) return;
    if (profileSession) {
      if (!profileSession.ready) return;
      const next = profileSession.profile
        ? normalizeSoundPreference({
          enabled: profileSession.profile.settings.soundEnabled,
          volume: profileSession.profile.settings.soundVolume,
        })
        : { ...DEFAULT_SOUND };
      stop();
      preferenceRef.current = next;
      setPreference(next);
      setReady(true); // Hydration deliberately never calls play.
      return;
    }
    let active = true;
    void AsyncStorage.getItem(SOUND_PREFERENCE_KEY).then((stored) => {
      if (!active) return;
      let next = { ...DEFAULT_SOUND };
      try { next = normalizeSoundPreference(stored ? JSON.parse(stored) : null); }
      catch { setError('Saved sound preferences were invalid. Sound is off; choose your preference again.'); }
      stop();
      preferenceRef.current = next;
      setPreference(next);
      setReady(true); // Legacy unscoped fallback is used only outside a profile session.
    }).catch(() => {
      if (active) {
        setError('System preferences could not be read. Sound remains off; study data is untouched.');
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [
    activationReady,
    profileSession,
    profileSession?.ready,
    profileSession?.profile?.profileId,
    profileSession?.profile?.settings.soundEnabled,
    profileSession?.profile?.settings.soundVolume,
    stop,
  ]);
  const saveSound = useCallback(async (input: SoundPreference) => {
    const next = normalizeSoundPreference(input);
    stop();
    try {
      if (profileSession?.profile) {
        await profileSession.updateProfile({
          settings: {
            ...profileSession.profile.settings,
            soundEnabled: next.enabled,
            soundVolume: next.volume,
          },
        });
      } else {
        await AsyncStorage.setItem(SOUND_PREFERENCE_KEY, JSON.stringify(next));
      }
      preferenceRef.current = next;
      setPreference(next);
      setError(null);
    }
    catch { setError('Sound preference could not be saved. Please retry before closing Settings.'); }
  }, [profileSession, stop]);
  const play = useCallback((cue: SystemSound) => {
    const pref = preferenceRef.current;
    if (!ready || !pref.enabled || pref.volume <= 0 || AppState.currentState === 'background'
      || AppState.currentState === 'inactive' || Date.now() - lastPlayed.current < 450) return;
    lastPlayed.current = Date.now();
    stop();
    const token = generation.current;
    void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' })
      .then(() => {
        if (generation.current !== token || !preferenceRef.current.enabled) return;
        const audio = createAudioPlayer(cues[cue]);
        player.current = audio;
        audio.volume = preferenceRef.current.volume;
        audio.play();
      }).catch(() => setError('System audio is unavailable on this device. Study progress is unaffected.'));
  }, [ready, stop]);
  const finishActivation = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ACTIVATION_COMPLETE_KEY, 'true');
      setActivationComplete(true); setReplaying(false); setError(null);
    } catch {
      setError('Activation completion could not be saved. Please retry; onboarding and study data are unchanged.');
      throw new Error('Activation completion could not be saved.');
    }
  }, []);
  return <Context.Provider value={{
    ready, preference, error, saveSound, play, stop, activationComplete, replaying,
    replayActivation: () => setReplaying(true), finishActivation,
  }}>{children}</Context.Provider>;
}
export function useSystemExperience() {
  const context = useContext(Context);
  if (!context) throw new Error('useSystemExperience requires SystemExperienceProvider');
  return context;
}