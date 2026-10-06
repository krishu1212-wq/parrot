import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { arise } from '@/constants/colors';

const SCENES = {
  core: require('../assets/images/arise-system-sanctum.jpg'),
  guardian: require('../assets/images/arise-guardian-prime.jpg'),
  gate: require('../assets/images/arise-rift-portal.jpg'),
  vault: require('../assets/images/arise-relic-vault.jpg'),
} as const;

/** Original, locally bundled artwork. Decoration never owns progression or actions. */
export function WorldArtwork({
  scene, opacity = 1, style,
}: {
  scene: keyof typeof SCENES;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }, style]}>
      <Image source={SCENES[scene]} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" transition={0} style={StyleSheet.absoluteFill} accessible={Platform.OS === 'web' ? undefined : false} />
      <LinearGradient
        colors={['rgba(3,5,12,0.72)', 'rgba(3,5,12,0.18)', 'rgba(3,5,12,0.98)']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Flexible cut-corner metal frame; no CSS filters or expensive blur surfaces. */
export function HudFrame({
  children, accent = arise.cyan, style,
}: {
  children: React.ReactNode;
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const gradientId = `hud-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View style={[s.frame, style]}>
      <LinearGradient colors={['rgba(29,32,45,0.85)', 'rgba(8,10,17,0.95)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Svg pointerEvents="none" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true} width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={arise.silver} stopOpacity={0.48} />
            <Stop offset="0.36" stopColor={accent} stopOpacity={0.55} />
            <Stop offset="1" stopColor={arise.silver} stopOpacity={0.15} />
          </SvgGradient>
        </Defs>
        <Path d="M14 1 H303 L319 17 V165 L305 179 H17 L1 163 V14 Z" stroke={`url(#${gradientId})`} strokeWidth={1} fill="none" />
        <Path d="M18 6 H82 M238 174 H301 M6 19 V48 M314 132 V160" stroke={accent} strokeWidth={2} strokeOpacity={0.78} fill="none" />
        <Path d="M10 66 V108 M310 67 V109 M92 6 H130 M191 174 H228" stroke={arise.silver} strokeWidth={0.6} strokeOpacity={0.22} fill="none" />
      </Svg>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { position: 'relative', backgroundColor: arise.abyss, borderRadius: 3, overflow: 'hidden', padding: 16 },
});