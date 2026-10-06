import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isProfileHapticsEnabled } from '@/contexts/profilePreferences';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { arise } from '@/constants/colors';
import { useReducedMotionPreference } from '@/components/SystemAnimations';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

function FramedTabIcon({ name, focused }: { name: FeatherName; focused: boolean }) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFrameFocused]}>
      <Svg width={58} height={46} viewBox="0 0 58 46" style={StyleSheet.absoluteFill}>
        <Path
          d="M8 1 H49 L57 9 V37 L49 45 H8 L1 38 V8 Z"
          fill={focused ? arise.azure : arise.deep}
          fillOpacity={focused ? 0.23 : 0.76}
          stroke={focused ? arise.cyan : arise.silver}
          strokeOpacity={focused ? 0.96 : 0.24}
          strokeWidth={focused ? 1.5 : 1}
        />
        <Path
          d="M9 4 H25 M34 4 H48"
          fill="none"
          stroke={focused ? arise.gold : arise.cyan}
          strokeOpacity={focused ? 0.9 : 0.34}
          strokeWidth={1}
        />
        {focused ? (
          <Path d="M11 41 H47" fill="none" stroke={arise.cyan} strokeOpacity={0.9} strokeWidth={1.3} />
        ) : null}
      </Svg>
      <Feather
        name={name}
        size={22}
        color={focused ? arise.cyan : arise.inkSoft}
      />
    </View>
  );
}

function CrystalTabIcon({ focused, tapVersion }: { focused: boolean; tapVersion: number }) {
  const reducedMotion = useReducedMotionPreference();
  const spin = useSharedValue(0);
  const orbit = useSharedValue(0);
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(spin);
    cancelAnimation(orbit);
    cancelAnimation(pulse);
    cancelAnimation(sweep);
    if (reducedMotion) {
      spin.value = 0;
      orbit.value = 0;
      pulse.value = 0;
      sweep.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(360, { duration: 42_000, easing: Easing.linear }), -1, false);
    orbit.value = withRepeat(withTiming(-360, { duration: 26_000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withTiming(1, { duration: 2_800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    sweep.value = withRepeat(withSequence(
      withTiming(1, { duration: 1_050, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 3_200 }),
      withTiming(0, { duration: 1 }),
    ), -1, false);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(orbit);
      cancelAnimation(pulse);
      cancelAnimation(sweep);
    };
  }, [orbit, pulse, reducedMotion, spin, sweep]);

  useEffect(() => {
    if (reducedMotion || tapVersion === 0) return;
    burst.value = 0;
    burst.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }),
    );
    return () => cancelAnimation(burst);
  }, [burst, reducedMotion, tapVersion]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (focused ? 1.025 : 1) + burst.value * 0.065 }],
  }));
  const crystalStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }, { scale: 1 + pulse.value * 0.025 }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value}deg` }],
    opacity: 0.52 + pulse.value * 0.3,
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : interpolate(sweep.value, [0, 0.15, 0.85, 1], [0, 0.55, 0.4, 0]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-38, 42]) }],
  }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value * 0.85,
    transform: [{ scale: 0.9 + burst.value * 0.32 }],
  }));

  return (
    <View style={styles.crystalSlot}>
      <Animated.View style={[styles.crystalOrb, focused && styles.crystalOrbFocused, orbStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbitStyle]}>
          <Svg width={64} height={64} viewBox="0 0 64 64">
          <Circle
            cx={32}
            cy={32}
            r={30}
            fill="none"
            stroke={arise.cyan}
            strokeOpacity={focused ? 0.82 : 0.52}
            strokeWidth={1.1}
          />
          <Circle
            cx={32}
            cy={32}
            r={24}
            fill="none"
            stroke={arise.gold}
            strokeOpacity={focused ? 0.72 : 0.38}
            strokeWidth={1.1}
            strokeDasharray="26 9 13 8"
          />
          <Circle cx={32} cy={32} r={20} fill="none" stroke={arise.cyan} strokeOpacity={0.24} strokeWidth={0.8} strokeDasharray="2 7" />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, burstStyle]}>
          <Svg width={64} height={64} viewBox="0 0 64 64">
            <Circle cx={32} cy={32} r={30} fill="none" stroke={arise.cyan} strokeWidth={1.4} />
          </Svg>
        </Animated.View>
        <View style={styles.crystalWindow}>
          <Animated.View pointerEvents="none" style={[styles.crystalSweep, sweepStyle]} />
          <Animated.View style={crystalStyle}>
            <Svg width={48} height={56} viewBox="0 0 64 64">
              <Polygon points="32,7 45,23 32,56 19,23" fill={arise.azure} stroke={arise.cyan} strokeWidth={1.4} strokeLinejoin="round" />
              <Path d="M32 7 L32 56 L19 23 Z" fill={arise.cyan} fillOpacity={0.72} />
              <Path d="M32 7 L45 23 L32 29 Z" fill={arise.ink} fillOpacity={0.9} />
              <Path d="M19 23 L32 29 L45 23 M32 29 L32 56" fill="none" stroke={arise.ink} strokeOpacity={0.75} strokeWidth={1} />
              <Polygon points="32,1 35,5 32,9 29,5" fill={arise.ink} />
              <Polygon points="32,55 35,59 32,63 29,59" fill={arise.gold} />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const { play } = useSystemExperience();
  const [tapVersion, setTapVersion] = useState(0);
  const onCrystalPress = () => {
    setTapVersion((value) => value + 1);
    play('unlock');
    if (isProfileHapticsEnabled()) void Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: arise.cyan,
        tabBarInactiveTintColor: arise.inkSoft,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 16,
          ...(isWeb ? { height: 84 } : {}),
          paddingTop: isWeb ? 6 : 5,
          paddingBottom: isWeb ? 0 : insets.bottom,
          overflow: 'visible',
        },
        tabBarBackground: () => (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.barBackground]}>
            <LinearGradient
              colors={['rgba(9,22,42,0.97)', 'rgba(4,9,19,0.99)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.topRail} />
            <View style={styles.topRailAccent} />
            <View style={styles.leftCornerRail} />
            <View style={styles.rightCornerRail} />
          </View>
        ),
        tabBarItemStyle: {
          overflow: 'visible',
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 9,
          letterSpacing: 0.25,
          lineHeight: 13,
          marginTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <FramedTabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="maths"
        options={{
          title: 'Maths',
          tabBarIcon: ({ focused }) => <FramedTabIcon name="check-square" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused }) => <CrystalTabIcon focused={focused} tapVersion={tapVersion} />,
          tabBarIconStyle: { marginTop: -17 },
        }}
        listeners={{ tabPress: onCrystalPress }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Practice',
          tabBarIcon: ({ focused }) => <FramedTabIcon name="bar-chart-2" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Coach',
          tabBarIcon: ({ focused }) => <FramedTabIcon name="message-square" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barBackground: {
    overflow: 'visible',
    borderTopWidth: 1,
    borderTopColor: 'rgba(112,231,255,0.4)',
    backgroundColor: arise.abyss,
  },
  topRail: {
    position: 'absolute',
    top: 0,
    left: 13,
    right: 13,
    height: 1,
    backgroundColor: 'rgba(112,231,255,0.36)',
  },
  topRailAccent: {
    position: 'absolute',
    top: 0,
    left: '42%',
    width: '16%',
    height: 2,
    backgroundColor: arise.cyan,
    boxShadow: `0px 0px 9px ${arise.cyan}`,
  },
  leftCornerRail: {
    position: 'absolute',
    top: -8,
    left: 9,
    width: 1,
    height: 24,
    backgroundColor: 'rgba(112,231,255,0.58)',
    transform: [{ rotate: '34deg' }],
  },
  rightCornerRail: {
    position: 'absolute',
    top: -8,
    right: 9,
    width: 1,
    height: 24,
    backgroundColor: 'rgba(112,231,255,0.58)',
    transform: [{ rotate: '-34deg' }],
  },
  iconFrame: {
    width: 58,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  iconFrameFocused: {
    boxShadow: `0px 0px 11px ${arise.cyan}`,
  },
  crystalSlot: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -14 }],
    zIndex: 4,
    overflow: 'visible',
  },
  crystalOrb: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: 'rgba(5,10,21,0.96)',
    boxShadow: `0px 0px 14px ${arise.azure}`,
    overflow: 'visible',
    position: 'relative',
  },
  crystalOrbFocused: {
    boxShadow: `0px 0px 18px ${arise.cyan}`,
  },
  crystalWindow: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  crystalSweep: {
    position: 'absolute',
    zIndex: 2,
    top: -4,
    width: 7,
    height: 66,
    transform: [{ skewX: '-22deg' }],
    backgroundColor: 'rgba(231,251,255,0.68)',
    boxShadow: `0px 0px 9px ${arise.cyan}`,
  },
});