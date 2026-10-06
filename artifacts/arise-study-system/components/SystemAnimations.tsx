import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Modal, Pressable } from 'react-native';
import { arise } from '@/constants/colors';
import { GuardianArt, ParticleField, RankCrown, SystemEmblem } from '@/components/AriseArt';
import { rankDefinitionFor } from '@/contexts/rankSystem';
import type { GuardianKind } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useOptionalProfileSession } from '@/contexts/ProfileContext';

export type SystemNotificationKind =
  | 'quest-complete'
  | 'xp-gained'
  | 'level-up'
  | 'phase-unlocked'
  | 'achievement-unlocked'
  | 'new-quest'
  | 'weekly-boss'
  | 'equipment-equipped'
  | 'equipment-unequipped';

export type SystemNotificationEvent = {
  id: string;
  kind: SystemNotificationKind;
  detail?: string;
  amount?: number;
  level?: number;
};

export function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const profileSession = useOptionalProfileSession();

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion || profileSession?.profile?.settings.motion === 'reduced';
}

export function SystemCoreGlow({
  color,
  radius,
  reducedMotion,
}: {
  color: string;
  radius: number;
  reducedMotion: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    if (reducedMotion) {
      pulse.value = 0;
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + pulse.value * 0.16,
  }));

  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderColor: color, borderRadius: radius, borderWidth: 1 },
        glowStyle,
      ]}
    />
  );
}

function notificationCopy(event: SystemNotificationEvent) {
  switch (event.kind) {
    case 'quest-complete':
      return {
        title: 'QUEST COMPLETE',
        detail: event.detail ?? 'Daily objective recorded.',
        icon: 'check-circle' as const,
        accent: 'primary' as const,
      };
    case 'xp-gained':
      return {
        title: 'XP GAINED',
        detail: event.detail ?? `+${event.amount ?? 0} XP added to your total.`,
        icon: 'zap' as const,
        accent: 'accent' as const,
      };
    case 'level-up':
      return {
        title: 'LEVEL UP',
        detail: event.detail ?? `Level ${event.level ?? ''} reached.`,
        icon: 'trending-up' as const,
        accent: 'primary' as const,
      };
    case 'phase-unlocked':
      return {
        title: 'PHASE UNLOCKED',
        detail: event.detail ?? 'New missions are now available.',
        icon: 'unlock' as const,
        accent: 'primary' as const,
      };
    case 'new-quest':
      return { title: 'NEW QUEST DETECTED', detail: event.detail ?? 'A new objective is available.', icon: 'target' as const, accent: 'primary' as const };
    case 'weekly-boss':
      return { title: 'WEEKLY BOSS DETECTED', detail: event.detail ?? 'Saved cards are ready for the boss test.', icon: 'shield' as const, accent: 'accent' as const };
    case 'equipment-equipped':
      return { title: 'EQUIPPED', detail: event.detail ?? 'Item added to your loadout.', icon: 'shield' as const, accent: 'accent' as const };
    case 'equipment-unequipped':
      return { title: 'UNEQUIPPED', detail: event.detail ?? 'Item removed from your loadout.', icon: 'minus-circle' as const, accent: 'primary' as const };
    case 'achievement-unlocked':
      return {
        title: 'ACHIEVEMENT UNLOCKED',
        detail: event.detail ?? 'A new milestone has been recorded.',
        icon: 'award' as const,
        accent: 'accent' as const,
      };
  }
}

export function SystemNotificationToast({
  event,
  top,
  reducedMotion,
  onDismiss,
}: {
  event: SystemNotificationEvent;
  top: number;
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const profileSession = useOptionalProfileSession();
  const notificationsEnabled = profileSession?.profile?.settings.notificationsEnabled ?? true;
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const copy = notificationCopy(event);
  const accent = copy.accent === 'accent' ? colors.accent : colors.primary;

  useEffect(() => {
    cancelAnimation(progress);
    if (!notificationsEnabled) {
      onDismiss();
      return;
    }
    if (reducedMotion) {
      progress.value = 1;
      const timer = setTimeout(onDismiss, 1900);
      return () => clearTimeout(timer);
    }

    progress.value = 0;
    progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const holdTimer = setTimeout(() => {
      progress.value = withTiming(2, { duration: 220, easing: Easing.in(Easing.cubic) });
      exitTimer = setTimeout(onDismiss, 230);
    }, 1650);
    return () => {
      clearTimeout(holdTimer);
      if (exitTimer) clearTimeout(exitTimer);
      cancelAnimation(progress);
    };
  }, [event.id, notificationsEnabled, onDismiss, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1, 2], [0, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1, 2], [-16, 0, -8]) },
      { scale: interpolate(progress.value, [0, 1, 2], [0.97, 1, 0.985]) },
    ],
  }));

  if (!notificationsEnabled) return null;
  return (
    <View pointerEvents="box-none" style={[styles.toastHost, { top }]}>
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { backgroundColor: 'rgba(10,22,40,0.92)', borderColor: accent, shadowColor: accent },
          reducedMotion ? null : animatedStyle,
        ]}
      >
        <View style={[styles.toastIcon, { backgroundColor: colors.secondary, borderColor: accent }]}>
          <Feather name={copy.icon} size={17} color={accent} />
        </View>
        <View style={styles.toastCopy}>
          <Text style={[styles.toastTitle, { color: accent }]}>{copy.title}</Text>
          <Text style={[styles.toastDetail, { color: colors.secondaryForeground }]} numberOfLines={2}>
            {copy.detail}
          </Text>
        </View>
        <View style={[styles.toastSignal, { backgroundColor: accent }]} />
      </Animated.View>
    </View>
  );
}

/** Full-screen cinematic for a real rank or phase transition. Dismissable; reduced-motion = static. */
export function AscensionOverlay({
  visible, kind, rank, previousRank, pathTitle, guardian, reducedMotion, onDismiss,
}: {
  visible: boolean;
  kind: 'rank' | 'phase';
  rank?: string;
  previousRank?: string;
  pathTitle?: string;
  guardian?: GuardianKind;
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  const rankDef = rankDefinitionFor(rank);
  const insets = useSafeAreaInsets();
  const p = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    cancelAnimation(p);
    if (!visible) { p.value = reducedMotion ? 1 : 0; return; }
    p.value = reducedMotion ? 1 : withTiming(1, { duration: 3600, easing: Easing.linear });
    return () => cancelAnimation(p);
  }, [visible, reducedMotion, p]);
  const emblem = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.28, 0.63, 1], [0, 0, 1, 1]),
    transform: [{ scale: interpolate(p.value, [0, 0.28, 0.7, 1], [0.35, 0.35, 1.08, 1]) }, { translateY: interpolate(p.value, [0, 1], [24, 0]) }],
  }));
  const halo = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.24, 0.34, 0.5, 1], [0.05, 0.15, 0.45, 0.18, 0.14]),
    transform: [{ scale: interpolate(p.value, [0, 0.4, 1], [0.3, 1.6, 1.05]) }],
  }));
  const leftFragment = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.23, 0.43, 1], [1, 1, 0, 0]),
    transform: [{ translateX: -p.value * 170 }, { translateY: p.value * 55 }, { rotate: `${-p.value * 32}deg` }],
  }));
  const rightFragment = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.23, 0.43, 1], [1, 1, 0, 0]),
    transform: [{ translateX: p.value * 170 }, { translateY: -p.value * 45 }, { rotate: `${p.value * 36}deg` }],
  }));
  const rings = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.22, 0.42, 1], [0.1, 0.35, 0.8, 0.45]),
    transform: [{ scale: interpolate(p.value, [0, 0.4, 1], [0.45, 1.28, 1]) }, { rotate: `${p.value * 120}deg` }],
  }));
  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onDismiss}>
      <View testID="rank-ascension-event" style={[styles.ascBackdrop, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <WorldArtwork scene="guardian" opacity={0.64} />
        <ParticleField reducedMotion={reducedMotion} color={arise.violet} secondaryColor={arise.gold} />
        <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <SystemEmblem size={42} color={arise.violet} />
          <Text style={styles.ascSystem}>SYSTEM ALERT · {kind === 'rank' ? 'RANK PROTOCOL' : 'PATH PROTOCOL'}</Text>
          <Text accessibilityRole="header" style={styles.ascTitle}>{kind === 'rank' ? 'RANK\nASCENSION' : 'NEW PATH\nUNLOCKED'}</Text>
          <View style={{ width: 280, height: 280, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View pointerEvents="none" style={[styles.ascHalo, { width: 240, height: 240, borderRadius: 120, backgroundColor: rankDef.colors[0] }, reducedMotion ? { opacity: 0.16 } : halo]} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, reducedMotion ? null : rings]}>
              <Svg width={280} height={280} viewBox="0 0 280 280">
                <Circle cx="140" cy="140" r="128" stroke={arise.violet} strokeOpacity={0.5} strokeDasharray="24 9" fill="none" />
                <Circle cx="140" cy="140" r="111" stroke={rankDef.colors[0]} strokeWidth="2" strokeDasharray="48 8 2 8" fill="none" />
                <Circle cx="140" cy="140" r="99" stroke={arise.silver} strokeOpacity={0.25} fill="none" />
                <Path d="M140 4 V17 M276 140 H263 M140 276 V263 M4 140 H17 M38 38 L49 49 M242 38 L231 49" stroke={arise.gold} strokeWidth="2" />
              </Svg>
            </Animated.View>
            {!reducedMotion && kind === 'rank' && previousRank ? <>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 50, top: 50, width: 90, height: 180, overflow: 'hidden' }, leftFragment]}><RankCrown rank={previousRank} size={180} /></Animated.View>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 140, top: 50, width: 90, height: 180, overflow: 'hidden' }, rightFragment]}><View style={{ marginLeft: -90 }}><RankCrown rank={previousRank} size={180} /></View></Animated.View>
            </> : null}
            <Animated.View testID="ascension-new-emblem" style={reducedMotion ? undefined : emblem}>
              {kind === 'rank' ? <RankCrown rank={rank ?? 'E'} size={192} /> : <GuardianArt kind={guardian ?? 'reasoning'} size={185} />}
            </Animated.View>
          </View>
          <Text testID="ascension-rank-name" style={[styles.ascRank, { color: rankDef.colors[0] }]}>{kind === 'rank' ? rankDef.displayName.toUpperCase() : pathTitle ?? 'Phase 02 · Ascension'}</Text>
          <HudFrame accent={arise.violet} style={{ width: '100%', marginTop: 18, alignItems: 'center' }}>
            <Text style={styles.ascSub}>{kind === 'rank' ? 'ASCENSION RECORDED' : 'NEW TRAINING PATH AVAILABLE'}</Text>
            <Text style={styles.ascNote}>{kind === 'rank' ? rankDef.announcement : 'Your existing study progress is preserved. Open the Journey to inspect this path.'}</Text>
            {kind === 'rank' ? <Text style={[styles.ascNote, { color: arise.gold }]}>GATE REQUIREMENTS FOLLOW YOUR REAL LEVEL AND RANK</Text> : null}
          </HudFrame>
        </ScrollView>
        <Pressable testID="ascension-dismiss" accessibilityRole="button" onPress={onDismiss} style={styles.ascBtn}>
          <Text style={styles.ascBtnText}>CONTINUE</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ascBackdrop: { flex: 1, backgroundColor: arise.abyss, alignItems: 'center', paddingHorizontal: 24 },
  ascHalo: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  ascSystem: { color: arise.violet, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  ascTitle: { color: arise.ink, fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, lineHeight: 34, marginTop: 18, textAlign: 'center' },
  ascRank: { fontSize: 31, fontFamily: 'Inter_700Bold', letterSpacing: 2, textAlign: 'center' },
  ascSub: { color: '#C3D3EA', fontSize: 14, marginTop: 6, textAlign: 'center' },
  ascNote: { color: arise.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center', maxWidth: 310 },
  ascBtn: { marginTop: 16, minHeight: 48, width: '100%', alignItems: 'center', borderRadius: 3, borderWidth: 1, borderColor: arise.violet, backgroundColor: arise.panel, justifyContent: 'center' },
  ascBtnText: { color: arise.ink, fontWeight: '700', letterSpacing: 1.6, fontSize: 12 },
  toastHost: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  toast: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  toastIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  toastCopy: { flex: 1, paddingRight: 8 },
  toastTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 3 },
  toastDetail: { fontSize: 12, lineHeight: 16 },
  toastSignal: { width: 4, height: 28, borderRadius: 3 },
});