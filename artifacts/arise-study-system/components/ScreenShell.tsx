import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arise } from '@/constants/colors';
import { ParticleField } from '@/components/AriseArt';
import { useReducedMotionPreference } from '@/components/SystemAnimations';
import { WorldArtwork } from '@/components/VisualWorld';

export default function ScreenShell({ kicker, title, children, scroll = true }: { kicker: string; title: string; children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotionPreference();
  const context = `${kicker} ${title}`.toLowerCase();
  const accent = context.includes('boss') || context.includes('recovery') || context.includes('weakness') ? arise.danger
    : context.includes('inventory') || context.includes('equipment') || context.includes('loadout') ? arise.gold
      : context.includes('gate') || context.includes('rank') || context.includes('status') || context.includes('journey') ? arise.violet : arise.cyan;
  const scene = context.includes('inventory') ? 'vault' : context.includes('gate') || context.includes('weakness') ? 'gate'
    : context.includes('journey') || context.includes('loadout') || context.includes('equipment') ? 'guardian' : 'core';
  const top = insets.top + (Platform.OS === 'web' ? 67 : 8);
  const bottom = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 32;
  const body = (
    <>
      <View style={s.header}>
        <Pressable testID="shell-back" accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))} style={s.back}>
          <Feather name="chevron-left" size={22} color={accent} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { color: accent }]}>{kicker}</Text>
          <Text style={s.title}>{title}</Text>
        </View>
      </View>
      {children}
    </>
  );
  return (
    <View style={s.screen}>
      <LinearGradient colors={[arise.deep, arise.abyss]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <WorldArtwork scene={scene} opacity={0.15} />
      <ParticleField reducedMotion={reduced} color={accent} secondaryColor={arise.silver} />
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false}>{body}</ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 14 }}>{body}</View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: arise.abyss },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 44, height: 44, borderRadius: 3, borderWidth: 1, borderColor: arise.panelEdge, alignItems: 'center', justifyContent: 'center', backgroundColor: arise.panel },
  kicker: { color: arise.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: arise.ink, fontSize: 25, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
});
