import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { arise } from '@/constants/colors';
import { ParticleField, SystemEmblem } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { useStudy } from '@/contexts/StudyContext';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';

/** Static until OS accessibility has been read: no initial motion for reduced-motion users. */
function useActivationMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; sub.remove(); };
  }, []);
  return reduced;
}
export function SystemActivationHost() {
  const experience = useSystemExperience();
  const { hydrated } = useStudy();
  const account = useAriseAccount();
  const segments = useSegments();
  const accountReady = account.status !== 'loading' && (!account.isSignedIn || account.isBootstrapped);
  const firstLaunchHome = segments[0] === '(tabs)' && !experience.activationComplete;
  if (!experience.ready || !hydrated || !accountReady || (!firstLaunchHome && !experience.replaying)) return null;
  const owner = account.isSignedIn ? `${account.userId}:${account.sessionScope}` : 'anonymous';
  return <Activation key={`${owner}:${experience.replaying ? 'replay' : 'first'}`} />;
}
function Activation() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useActivationMotion();
  const { level, rank, state } = useStudy();
  const experience = useSystemExperience();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const reveal = useSharedValue(1);
  const visibleStep = reduced ? 6 : step;
  useEffect(() => {
    if (reduced || step >= 6) return;
    const timer = setTimeout(() => setStep((current) => current + 1), step === 2 ? 1300 : 750);
    return () => clearTimeout(timer);
  }, [reduced, step]);
  useEffect(() => {
    reveal.value = reduced ? 1 : 0.4;
    if (!reduced) reveal.value = withTiming(1, { duration: 500 });
  }, [step, reduced, reveal]);
  const animated = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: reduced ? 0 : (1 - reveal.value) * 12 }],
  }));
  const finish = async (home: boolean) => {
    if (busy) return;
    setBusy(true); setLocalError(null);
    try {
      await experience.finishActivation();
      if (home) router.replace('/(tabs)');
    } catch {
      setLocalError('Could not save activation completion. Retry to continue safely.');
      setBusy(false);
    }
  };
  return (
    <Modal visible animationType="none" onRequestClose={() => void finish(false)}>
      <View style={s.root} testID="system-activation">
        <WorldArtwork scene="core" opacity={0.65} />
        <ParticleField reducedMotion={reduced} color={arise.gold} secondaryColor={arise.cyan} />
        <ScrollView contentContainerStyle={{
          flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
          paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20),
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24),
        }}>
          <View style={s.content}>
            <Text style={s.eyebrow}>ARISE · LOCAL SYSTEM LINK</Text>
            <Text accessibilityRole="header" style={s.title}>SYSTEM{'\n'}ACTIVATED</Text>
            <Animated.View style={[s.emblem, animated]}>
              {visibleStep >= 1 ? <SystemEmblem size={150} color={arise.gold} /> : <View style={{ height: 150 }} />}
            </Animated.View>
            <Text style={s.message}>
              {visibleStep >= 2 ? 'Your record is linked.\nOne honest action. A stronger tomorrow.' : 'Establishing your study signal…'}
            </Text>
            <HudFrame accent={arise.gold} style={{ width: '100%', padding: 20, marginTop: 24 }}>
              <Readout label="LEVEL" value={visibleStep >= 3 ? String(level).padStart(2, '0') : '—'} />
              <Readout label="RANK" value={visibleStep >= 4 ? rank : '—'} />
              <Readout label="DAY · STUDY DATE" value={visibleStep >= 5 ? state.date : '—'} />
            </HudFrame>
            <Text style={s.note}>Live profile values. This opening grants no XP or rewards.</Text>
            <Pressable testID="activation-home" accessibilityRole="button" disabled={busy}
              onPress={() => void finish(true)} style={[s.primary, { opacity: busy ? 0.5 : 1 }]}>
              <Text style={s.primaryText}>{visibleStep >= 6 ? 'ENTER HOME' : 'SKIP TO HOME'}</Text>
            </Pressable>
            <Pressable testID="activation-skip" accessibilityRole="button" disabled={busy}
              onPress={() => void finish(false)} style={s.secondary}>
              <Text style={s.secondaryText}>SKIP ACTIVATION</Text>
            </Pressable>
            <Text style={s.note}>Sound is off by default. Opt in or replay in Settings.</Text>
            {localError || experience.error ? <Text accessibilityRole="alert" style={s.error}>{localError ?? experience.error}</Text> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
function Readout({ label, value }: { label: string; value: string }) {
  return <View style={s.readout}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: arise.abyss },
  content: { width: '100%', maxWidth: 440, alignItems: 'center' },
  eyebrow: { color: arise.gold, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 },
  title: { color: arise.ink, fontFamily: 'Inter_700Bold', fontSize: 38, lineHeight: 44, letterSpacing: 2, textAlign: 'center', marginTop: 14 },
  emblem: { marginTop: 24, minHeight: 150 },
  message: { color: arise.silver, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 20, minHeight: 46 },
  readout: { gap: 8, borderBottomWidth: 1, borderColor: arise.panelEdge, paddingVertical: 12 },
  label: { color: arise.inkSoft, fontSize: 10, letterSpacing: 2, fontFamily: 'Inter_700Bold' },
  value: { color: arise.gold, fontSize: 24, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  note: { color: arise.inkDim, textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 14 },
  primary: { backgroundColor: arise.gold, minHeight: 54, width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 14 },
  primaryText: { color: arise.onCyan, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 8 },
  secondaryText: { color: arise.silver, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  error: { color: arise.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
});