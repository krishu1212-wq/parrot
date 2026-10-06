import React from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arise } from '@/constants/colors';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';

export default function SettingsRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const system = useSystemExperience();
  return <View style={s.root}>
    <WorldArtwork scene="core" opacity={0.2} />
    <ScrollView contentContainerStyle={{
      paddingHorizontal: 22, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16),
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24),
    }}>
      <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.back}>
          <Feather name="arrow-left" size={22} color={arise.silver} />
        </Pressable>
        <Text style={s.eyebrow}>ARISE · SYSTEM PREFERENCES</Text>
        <Text accessibilityRole="header" style={s.title}>Settings</Text>
        <Text style={s.description}>Your atmosphere. Your choice.</Text>
        <HudFrame accent={arise.gold} style={s.frame}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>System sound</Text>
              <Text style={s.description}>Original, short cues. Off by default.</Text>
            </View>
            <Switch testID="system-sound-toggle" accessibilityLabel="System sound"
              disabled={!system.ready} value={system.preference.enabled}
              trackColor={{ false: arise.rail, true: arise.gold }}
              onValueChange={(enabled) => void system.saveSound({ ...system.preference, enabled })} />
          </View>
          <Text style={[s.heading, { marginTop: 24 }]}>Volume · {Math.round(system.preference.volume * 100)}%</Text>
          <View accessibilityRole="radiogroup" style={s.volumes}>
            {[0, 0.25, 0.5, 0.75, 1].map((volume) => <Pressable key={volume}
              testID={`system-volume-${volume}`} accessibilityRole="radio"
              accessibilityLabel={`${Math.round(volume * 100)} percent volume`}
              accessibilityState={{ selected: system.preference.volume === volume }}
              disabled={!system.ready} onPress={() => void system.saveSound({ ...system.preference, volume })}
              style={[s.volume, system.preference.volume === volume && { borderColor: arise.gold, backgroundColor: arise.deep }]}>
              <Text style={{ color: system.preference.volume === volume ? arise.gold : arise.silver, fontWeight: '700', fontSize: 12 }}>{Math.round(volume * 100)}%</Text>
            </Pressable>)}
          </View>
          <Pressable testID="system-preview-sound" accessibilityRole="button"
            accessibilityState={{ disabled: !system.preference.enabled || system.preference.volume === 0 }}
            disabled={!system.ready || !system.preference.enabled || system.preference.volume === 0}
            onPress={() => system.play('notification')} style={s.action}>
            <Feather name="volume-2" size={18} color={arise.gold} />
            <Text style={s.actionText}>PREVIEW CUE</Text>
          </Pressable>
          <Text style={s.description}>No startup audio or background playback. Silent mode is respected. Enabling sound does not replay old rewards.</Text>
        </HudFrame>
        <HudFrame accent={arise.cyan} style={s.frame}>
          <Text style={s.heading}>System activation</Text>
          <Text style={s.description}>Replay your opening with your current level, rank, and study date. Reduced-motion mode uses a static summary.</Text>
          <Pressable testID="activation-replay" accessibilityRole="button" disabled={!system.ready}
            onPress={system.replayActivation} style={s.action}>
            <Feather name="play" size={18} color={arise.gold} /><Text style={s.actionText}>REPLAY ACTIVATION</Text>
          </Pressable>
        </HudFrame>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.action}>
          <Feather name="user" size={18} color={arise.gold} /><Text style={s.actionText}>ARISE PROFILE & SETTINGS</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={s.action}>
          <Feather name="cloud" size={18} color={arise.gold} /><Text style={s.actionText}>SYNC DETAILS & CONFLICTS</Text>
        </Pressable>
        {system.error ? <Text accessibilityRole="alert" style={s.error}>{system.error}</Text> : null}
      </View>
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: arise.abyss },
  back: { width: 48, minHeight: 48, justifyContent: 'center', marginBottom: 16 },
  eyebrow: { color: arise.gold, fontSize: 10, letterSpacing: 2, fontFamily: 'Inter_700Bold' },
  title: { color: arise.ink, fontSize: 34, fontFamily: 'Inter_700Bold', marginTop: 12 },
  description: { color: arise.inkSoft, fontSize: 13, lineHeight: 21, marginTop: 8 },
  heading: { color: arise.ink, fontSize: 16, fontFamily: 'Inter_700Bold' },
  frame: { padding: 20, marginTop: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  volumes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  volume: { minWidth: 48, minHeight: 48, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: arise.panelEdge },
  action: { minHeight: 52, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, marginTop: 12 },
  actionText: { color: arise.gold, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, flexShrink: 1 },
  error: { color: arise.danger, fontSize: 13, lineHeight: 21, marginTop: 20 },
});