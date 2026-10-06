import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { ONBOARDING_COMPLETE_STORAGE_KEY } from '@/contexts/accountStudyVault';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';
import { useColors } from '@/hooks/useColors';
import { arise } from '@/constants/colors';
import { ParticleField, SystemEmblem } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';

const STEP_COUNT = 4;
const SCREEN_CUES = ['notification', 'xp', 'achievement', null] as const;

const FEATURE_CARDS = [
  { title: 'Daily Missions', icon: 'check-square', accent: arise.cyan, note: 'FOCUSED STUDY' },
  { title: 'XP', icon: 'zap', accent: arise.gold, note: 'EARN AS YOU LEARN' },
  { title: 'Level Up', icon: 'trending-up', accent: arise.violet, note: 'SEE YOUR GROWTH' },
  { title: 'Rewards', icon: 'gift', accent: arise.teal, note: 'MILESTONES MATTER' },
] as const;

// Illustrative sample content only. This preview is deliberately disconnected from study state.
const PREVIEW_STUDY_ROWS = [
  { title: 'Maths', count: '2/2', progress: 1, icon: 'target', accent: arise.cyan },
  { title: 'NCERT Reading', count: '1/1', progress: 1, icon: 'book-open', accent: arise.teal },
  { title: 'Vocabulary', count: '50/50', progress: 1, icon: 'type', accent: arise.violet },
  { title: 'Mock Test', count: '0/1', progress: 0, icon: 'edit-3', accent: arise.gold },
] as const;

type Destination = '/' | '/(tabs)';
type FeatureIcon = React.ComponentProps<typeof Feather>['name'];

function FeatureTile({
  title, icon, accent, note, delay, reducedMotion,
}: {
  title: string;
  icon: FeatureIcon;
  accent: string;
  note: string;
  delay: number;
  reducedMotion: boolean;
}) {
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.delay(delay).duration(320)}
      style={[s.featureTile, { borderColor: `${accent}88` }]}
    >
      <LinearGradient
        colors={[`${accent}22`, 'rgba(5,10,21,0.92)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[s.featureGlyph, { borderColor: `${accent}88`, shadowColor: accent }]}>
        <Feather name={icon} size={23} color={accent} />
      </View>
      <Text style={s.featureTitle}>{title}</Text>
      <Text style={s.featureNote}>{note}</Text>
      <View style={[s.featureCorner, { backgroundColor: accent }]} />
    </Animated.View>
  );
}

export default function OnboardingRoute() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const system = useSystemExperience();
  const deviceReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(deviceReducedMotion);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submissionLock = useRef(false);
  const ambientMotion = useSharedValue(0);
  const contentProgress = useSharedValue(1);
  const slideDirection = useSharedValue(1);
  const buttonPulse = useSharedValue(0);
  const activationProgress = useSharedValue(0);

  useEffect(() => {
    setReducedMotion(deviceReducedMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, [deviceReducedMotion]);

  useEffect(() => {
    cancelAnimation(ambientMotion);
    if (reducedMotion) {
      ambientMotion.value = 0;
      return undefined;
    }
    ambientMotion.value = withRepeat(
      withTiming(1, { duration: 17000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(ambientMotion);
  }, [ambientMotion, reducedMotion]);

  useEffect(() => {
    contentProgress.value = 0;
    if (reducedMotion) {
      contentProgress.value = 1;
      return;
    }
    contentProgress.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
  }, [contentProgress, reducedMotion, step]);

  useEffect(() => {
    cancelAnimation(buttonPulse);
    if (reducedMotion) {
      buttonPulse.value = 0;
      return undefined;
    }
    buttonPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(buttonPulse);
  }, [buttonPulse, reducedMotion]);

  useEffect(() => {
    const cue = SCREEN_CUES[step];
    if (system.ready && cue) system.play(cue);
  }, [step, system.play, system.ready]);

  const backgroundMotionStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + ambientMotion.value * 0.045 },
      { translateY: -ambientMotion.value * 10 },
    ],
  }));
  const contentMotionStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [{ translateX: (1 - contentProgress.value) * slideDirection.value * 25 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.05 + buttonPulse.value * 0.19,
    transform: [{ scaleX: 0.92 + buttonPulse.value * 0.08 }],
  }));
  const activationFlashStyle = useAnimatedStyle(() => ({ opacity: activationProgress.value * 0.74 }));
  const activationRingStyle = useAnimatedStyle(() => ({
    opacity: activationProgress.value,
    transform: [{ scale: 0.35 + activationProgress.value * 3.7 }],
  }));
  const activationEmblemStyle = useAnimatedStyle(() => ({
    opacity: activationProgress.value,
    transform: [{ scale: 0.72 + activationProgress.value * 0.28 }],
  }));

  const moveToStep = useCallback((next: number) => {
    if (busy || next < 0 || next >= STEP_COUNT || next === step) return;
    slideDirection.value = next > step ? 1 : -1;
    setError(null);
    setStep(next);
  }, [busy, slideDirection, step]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx < -48) moveToStep(step + 1);
      else if (gesture.dx > 48) moveToStep(step - 1);
    },
  }), [moveToStep, step]);

  const completeOnboarding = async (destination: Destination, playActivation = false) => {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (playActivation) {
        system.play('unlock');
        if (!reducedMotion) {
          activationProgress.value = withSequence(
            withTiming(0.24, { duration: 150, easing: Easing.out(Easing.cubic) }),
            withTiming(0.64, { duration: 220, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 90 }),
            withTiming(0, { duration: 190, easing: Easing.out(Easing.cubic) }),
          );
          await new Promise<void>((resolve) => setTimeout(resolve, 650));
        }
      }
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_STORAGE_KEY, 'true');
      router.replace(destination);
    } catch {
      setError('Your onboarding preference could not be saved. Your study progress remains untouched. Please try again.');
      submissionLock.current = false;
      setBusy(false);
    }
  };

  const topInset = Math.max(insets.top, Platform.OS === 'web' ? 67 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16);
  const availableHeight = Math.max(560, window.height - topInset - bottomInset - 22);
  const compact = window.height < 760;
  const backgroundScene = step === 1 ? 'vault' : 'core';
  const backgroundImage = step === 0
    ? require('../assets/images/arise-onboarding-awakening.jpg')
    : step === 3
      ? require('../assets/images/arise-levelup-neon-guardian.jpg')
      : null;

  const primaryLabel = step === 0
    ? 'GET STARTED  →'
    : step === 3
      ? (busy ? 'ACTIVATING SYSTEM…' : "LET'S BEGIN  →")
      : 'NEXT  →';
  const onPrimaryPress = step === 0
    ? () => moveToStep(1)
    : step === 3
      ? () => void completeOnboarding('/(tabs)', true)
      : () => moveToStep(step + 1);

  return (
    <View style={s.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backgroundMotionStyle]}>
        {backgroundImage ? (
          <Image
            source={backgroundImage}
            contentFit="cover"
            contentPosition="center"
            transition={reducedMotion ? 0 : 420}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <WorldArtwork scene={backgroundScene} opacity={step === 1 ? 0.38 : 0.3} />
        )}
        <View style={[StyleSheet.absoluteFill, step === 0 ? s.portalColorWash : s.backgroundShade]} />
      </Animated.View>
      <LinearGradient
        pointerEvents="none"
        colors={step === 0
          ? ['rgba(3,7,17,0.12)', 'rgba(3,8,19,0.08)', 'rgba(2,5,13,0.91)']
          : step === 3
            ? ['rgba(2,5,13,0.38)', 'rgba(2,5,13,0.16)', 'rgba(2,5,13,0.91)']
            : ['rgba(2,5,13,0.44)', 'rgba(2,5,13,0.52)', 'rgba(2,5,13,0.96)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View style={[s.lightSweep, glowStyle]} />
        <ParticleField reducedMotion={reducedMotion} color={arise.cyan} secondaryColor={arise.violet} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: topInset + 8, paddingBottom: bottomInset + 8 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[s.page, { minHeight: availableHeight }]}>
          <View style={s.topBar}>
            {step === 0 ? <View style={s.topBarSpacer} /> : (
              <View style={s.miniBrand}>
                <SystemEmblem size={23} color={arise.cyan} />
                <Text style={s.miniBrandText}>ARISE <Text style={s.miniBrandDivider}>/</Text> SYSTEM INTRO</Text>
              </View>
            )}
            <View style={s.topActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sound and activation settings"
                testID="onboarding-system-settings"
                disabled={busy}
                onPress={() => router.push('/settings')}
                style={s.settingsButton}
              >
                <Feather name="sliders" size={15} color={arise.silver} />
                <Text style={s.settingsText}>SETTINGS</Text>
              </Pressable>
              {step === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip onboarding and choose a profile"
                  testID="onboarding-skip"
                  disabled={busy}
                  onPress={() => void completeOnboarding('/')}
                  style={s.skipButton}
                >
                  <Text style={s.skipText}>SKIP</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Animated.View
            key={step}
            {...panResponder.panHandlers}
            style={[s.slide, compact && s.slideCompact, contentMotionStyle]}
          >
            {step === 0 ? (
              <View style={s.awakeningSlide}>
                <View style={s.awakeningBrand}>
                  <View style={s.emblemHalo}>
                    <SystemEmblem size={66} color={arise.cyan} />
                  </View>
                  <Text style={s.wordmark}>ARISE</Text>
                  <View style={s.wordmarkRule} />
                  <Text style={s.brandSubline}>STUDY SYSTEM</Text>
                </View>
                <View style={s.awakeningCopy}>
                  <Text style={s.overline}>SYSTEM AWAKENING</Text>
                  <Text accessibilityRole="header" style={s.awakeningTagline}>
                    Discipline Today.{'\n'}A Stronger You Tomorrow.
                  </Text>
                </View>
              </View>
            ) : step === 1 ? (
              <View style={s.infoSlide}>
                <View style={s.headingBlock}>
                  <Text accessibilityRole="header" style={s.titleLine}>Turn Your Study</Text>
                  <Text style={s.titleAccent}>Into a Game</Text>
                  <Text style={s.subtitle}>Complete daily missions, earn XP, level up and become a better you.</Text>
                </View>
                <View style={s.featureGrid}>
                  {FEATURE_CARDS.map((feature, index) => (
                    <FeatureTile
                      key={feature.title}
                      title={feature.title}
                      icon={feature.icon}
                      accent={feature.accent}
                      note={feature.note}
                      delay={index * 100}
                      reducedMotion={reducedMotion}
                    />
                  ))}
                </View>
                <View style={s.systemNote}>
                  <Feather name="activity" size={14} color={arise.cyan} />
                  <Text style={s.systemNoteText}>SMALL MISSIONS. REAL MOMENTUM.</Text>
                </View>
              </View>
            ) : step === 2 ? (
              <View style={s.infoSlide}>
                <View style={s.headingBlock}>
                  <Text accessibilityRole="header" style={s.titleLine}>Track Progress</Text>
                  <Text style={s.titleAccent}>Every Day</Text>
                  <Text style={s.subtitle}>Stay consistent with streaks, detailed progress and achievements.</Text>
                </View>
                <HudFrame accent={arise.cyan} style={[s.progressPreview, compact && s.progressPreviewCompact]}>
                  <View style={s.phoneNotch} />
                  <View style={s.streakPanel}>
                    <View style={s.streakTop}>
                      <View style={s.streakIcon}><Feather name="zap" size={20} color={arise.gold} /></View>
                      <View style={s.streakCopy}>
                        <Text style={s.previewLabel}>STREAK</Text>
                        <Text style={s.streakCount}>6 Days</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={arise.silver} />
                    </View>
                    <View style={s.weekStrip}>
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                        <View key={`${day}-${index}`} style={s.weekDay}>
                          <View style={[s.weekMark, index < 6 && s.weekMarkComplete]}>
                            {index < 6 ? <Feather name="check" size={9} color={arise.abyss} /> : null}
                          </View>
                          <Text style={[s.weekLabel, index === 5 && s.weekLabelActive]}>{day}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={s.todayPanel}>
                    <View style={s.todayHeading}>
                      <Text style={s.todayTitle}>Today’s Progress</Text>
                      <Text style={s.todayPercent}>75%</Text>
                    </View>
                    <View style={s.todayTrack}>
                      <View style={s.todayFill} />
                    </View>
                    <View style={s.previewRows}>
                      {PREVIEW_STUDY_ROWS.map((item) => (
                        <View key={item.title} style={s.previewRow}>
                          <View style={[s.previewRowIcon, { borderColor: `${item.accent}66` }]}>
                            <Feather name={item.icon} size={12} color={item.accent} />
                          </View>
                          <Text style={s.previewRowTitle}>{item.title}</Text>
                          <Text style={s.previewRowCount}>{item.count}</Text>
                          <View style={s.previewRowStatus}>
                            <Feather
                              name={item.progress > 0 ? 'check-circle' : 'circle'}
                              size={13}
                              color={item.progress > 0 ? arise.success : arise.inkDim}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </HudFrame>
                <Text style={s.sampleLabel}>ILLUSTRATIVE PREVIEW · NOT YOUR STUDY DATA</Text>
              </View>
            ) : (
              <View style={s.futureSlide}>
                <View style={s.futureHeading}>
                  <Text style={s.futureTitle}>Level Up</Text>
                  <Text accessibilityRole="header" style={s.futureAccent}>Your Future</Text>
                  <Text style={s.futureSubtitle}>Build discipline, improve your skills and unlock your potential with ARISE.</Text>
                </View>
                <View style={s.futureSpacer} />
                <View style={s.futurePillars}>
                  <View style={s.pillar}>
                    <Feather name="award" size={23} color={arise.gold} />
                    <Text style={s.pillarText}>BETTER{'\n'}DISCIPLINE</Text>
                  </View>
                  <View style={s.pillarDivider} />
                  <View style={s.pillar}>
                    <Feather name="bar-chart-2" size={23} color={arise.cyan} />
                    <Text style={s.pillarText}>REAL{'\n'}PROGRESS</Text>
                  </View>
                  <View style={s.pillarDivider} />
                  <View style={s.pillar}>
                    <Feather name="star" size={23} color={arise.gold} />
                    <Text style={s.pillarText}>A STRONGER{'\n'}YOU</Text>
                  </View>
                </View>
              </View>
            )}
          </Animated.View>

          <View style={s.footer}>
            {step === 1 || step === 2 ? (
              <View style={s.stepActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous screen"
                  testID="onboarding-back"
                  disabled={busy}
                  onPress={() => moveToStep(step - 1)}
                  style={s.backButton}
                >
                  <Feather name="arrow-left" size={16} color={arise.silver} />
                  <Text style={s.backText}>BACK</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next screen"
                  testID="onboarding-next"
                  disabled={busy}
                  onPress={onPrimaryPress}
                  style={({ pressed }) => [s.primaryButton, s.nextButton, pressed && s.buttonPressed, busy && s.buttonDisabled]}
                >
                  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.buttonGlow, glowStyle]} />
                  <Text style={s.primaryButtonText}>{primaryLabel}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={step === 0 ? 'Get started' : "Let's begin and open your dashboard"}
                testID={step === 0 ? 'onboarding-start' : 'onboarding-finish'}
                disabled={busy}
                onPress={onPrimaryPress}
                style={({ pressed }) => [s.primaryButton, pressed && s.buttonPressed, busy && s.buttonDisabled]}
              >
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.buttonGlow, glowStyle]} />
                <Text style={s.primaryButtonText}>{primaryLabel}</Text>
              </Pressable>
            )}
            <View accessibilityRole="progressbar" accessibilityLabel={`Onboarding step ${step + 1} of ${STEP_COUNT}`} style={s.pagination}>
              {Array.from({ length: STEP_COUNT }, (_, index) => (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to onboarding step ${index + 1}`}
                  accessibilityState={{ selected: index === step }}
                  disabled={busy}
                  hitSlop={10}
                  onPress={() => moveToStep(index)}
                  style={s.paginationTarget}
                >
                  <View style={[s.paginationDot, index === step && s.paginationDotActive]} />
                </Pressable>
              ))}
            </View>
            {step === 3 ? (
              <Text style={s.offlineNote}>Offline progress stays on this device. You can choose to import it into an account later.</Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={[s.error, { color: colors.destructive }]}>{error}</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View style={[s.activationFlash, activationFlashStyle]} />
        <Animated.View style={[s.activationRing, activationRingStyle]} />
        <Animated.View style={[s.activationEmblem, activationEmblemStyle]}>
          <SystemEmblem size={76} color={arise.cyan} />
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: arise.abyss, overflow: 'hidden' },
  portalColorWash: { backgroundColor: 'rgba(17,74,194,0.18)' },
  backgroundShade: { backgroundColor: 'rgba(3,7,17,0.35)' },
  lightSweep: { position: 'absolute', top: '12%', left: '10%', width: '80%', height: 3, backgroundColor: arise.cyan, shadowColor: arise.cyan, shadowOpacity: 0.9, shadowRadius: 18, elevation: 3 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 18 },
  page: { width: '100%', maxWidth: 460, alignSelf: 'center', justifyContent: 'space-between' },
  topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarSpacer: { flex: 1 },
  miniBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  miniBrandText: { color: arise.silver, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  miniBrandDivider: { color: arise.cyan },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: 'rgba(209,217,240,0.22)', backgroundColor: 'rgba(4,9,20,0.58)' },
  settingsText: { color: arise.silver, fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  skipButton: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { color: arise.ink, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  slide: { flex: 1, width: '100%', justifyContent: 'center', paddingVertical: 10 },
  slideCompact: { paddingVertical: 5 },
  awakeningSlide: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 20 },
  awakeningBrand: { alignItems: 'center', marginBottom: 27 },
  emblemHalo: { width: 98, height: 98, alignItems: 'center', justifyContent: 'center', borderRadius: 49, borderWidth: 1, borderColor: 'rgba(112,231,255,0.45)', backgroundColor: 'rgba(4,12,27,0.36)', shadowColor: arise.cyan, shadowOpacity: 0.8, shadowRadius: 22, elevation: 8 },
  wordmark: { color: arise.ink, fontSize: 43, lineHeight: 50, fontFamily: 'Inter_700Bold', letterSpacing: 8, marginLeft: 8, textShadowColor: arise.azure, textShadowRadius: 18 },
  wordmarkRule: { height: 1, width: 184, marginTop: 2, backgroundColor: arise.cyan, opacity: 0.8 },
  brandSubline: { color: arise.cyan, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 3.1, marginTop: 7 },
  awakeningCopy: { alignItems: 'center', paddingHorizontal: 8, marginBottom: 5 },
  overline: { color: arise.gold, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 2.2, marginBottom: 9 },
  awakeningTagline: { color: arise.ink, fontSize: 18, lineHeight: 26, fontFamily: 'Inter_600SemiBold', textAlign: 'center', textShadowColor: 'rgba(2,5,13,0.9)', textShadowRadius: 8 },
  infoSlide: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  headingBlock: { width: '100%', alignItems: 'center', marginBottom: 22, paddingHorizontal: 6 },
  titleLine: { color: arise.ink, fontSize: 27, lineHeight: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', textShadowColor: 'rgba(4,11,27,0.8)', textShadowRadius: 8 },
  titleAccent: { color: arise.cyan, fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', textShadowColor: 'rgba(27,145,255,0.56)', textShadowRadius: 12 },
  subtitle: { maxWidth: 345, color: arise.ink, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, textShadowColor: 'rgba(2,5,13,0.9)', textShadowRadius: 7 },
  featureGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  featureTile: { position: 'relative', width: '48.5%', minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, backgroundColor: 'rgba(4,9,20,0.78)', overflow: 'hidden', shadowColor: arise.azure, shadowOpacity: 0.28, shadowRadius: 12, elevation: 3 },
  featureGlyph: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(5,12,25,0.74)', shadowOpacity: 0.5, shadowRadius: 9, elevation: 2 },
  featureTitle: { color: arise.ink, fontSize: 12, lineHeight: 16, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 7 },
  featureNote: { color: arise.inkSoft, fontSize: 7, fontFamily: 'Inter_700Bold', letterSpacing: 0.9, textAlign: 'center', marginTop: 3 },
  featureCorner: { position: 'absolute', top: 0, right: 0, width: 5, height: 17, opacity: 0.82 },
  systemNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16 },
  systemNoteText: { color: arise.cyan, fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.25 },
  progressPreview: { width: '100%', maxWidth: 390, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 13, borderRadius: 18, borderColor: 'rgba(112,231,255,0.7)', backgroundColor: 'rgba(3,9,20,0.94)', shadowColor: arise.azure, shadowOpacity: 0.35, shadowRadius: 18, elevation: 8 },
  progressPreviewCompact: { paddingTop: 18, paddingBottom: 10 },
  phoneNotch: { position: 'absolute', top: 7, left: '40%', width: '20%', height: 5, borderRadius: 4, backgroundColor: 'rgba(127,173,214,0.52)' },
  streakPanel: { borderWidth: 1, borderColor: 'rgba(112,231,255,0.24)', backgroundColor: 'rgba(9,20,39,0.9)', paddingHorizontal: 11, paddingTop: 9, paddingBottom: 7 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  streakIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(228,194,122,0.4)', backgroundColor: 'rgba(228,194,122,0.09)' },
  streakCopy: { flex: 1 },
  previewLabel: { color: arise.inkSoft, fontSize: 7, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  streakCount: { color: arise.ink, fontSize: 16, lineHeight: 20, fontFamily: 'Inter_700Bold', marginTop: 1 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  weekDay: { alignItems: 'center', gap: 3 },
  weekMark: { width: 17, height: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(142,166,197,0.5)', backgroundColor: 'rgba(11,23,41,0.9)' },
  weekMarkComplete: { borderColor: arise.cyan, backgroundColor: arise.cyan, shadowColor: arise.cyan, shadowOpacity: 0.5, shadowRadius: 5 },
  weekLabel: { color: arise.inkDim, fontSize: 7, fontFamily: 'Inter_700Bold' },
  weekLabelActive: { color: arise.cyan },
  todayPanel: { marginTop: 9, borderWidth: 1, borderColor: 'rgba(112,231,255,0.2)', backgroundColor: 'rgba(7,16,31,0.94)', paddingHorizontal: 10, paddingVertical: 9 },
  todayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayTitle: { color: arise.ink, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  todayPercent: { color: arise.cyan, fontSize: 15, fontFamily: 'Inter_700Bold', textShadowColor: arise.azure, textShadowRadius: 7 },
  todayTrack: { height: 5, marginTop: 7, overflow: 'hidden', backgroundColor: 'rgba(32,58,91,0.78)' },
  todayFill: { width: '75%', height: '100%', backgroundColor: arise.cyan, shadowColor: arise.cyan, shadowOpacity: 0.8, shadowRadius: 5 },
  previewRows: { gap: 5, marginTop: 8 },
  previewRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewRowIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(14,27,46,0.9)' },
  previewRowTitle: { flex: 1, color: arise.ink, fontSize: 9, fontFamily: 'Inter_500Medium' },
  previewRowCount: { color: arise.inkSoft, fontSize: 8, fontFamily: 'Inter_700Bold', marginRight: 1 },
  previewRowStatus: { width: 16, alignItems: 'center' },
  sampleLabel: { color: arise.inkSoft, fontSize: 7, fontFamily: 'Inter_700Bold', letterSpacing: 0.85, textAlign: 'center', marginTop: 10 },
  futureSlide: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  futureHeading: { width: '100%', alignItems: 'center', paddingTop: 11 },
  futureTitle: { color: arise.ink, fontSize: 29, lineHeight: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', textShadowColor: 'rgba(2,5,13,0.9)', textShadowRadius: 8 },
  futureAccent: { color: arise.cyan, fontSize: 29, lineHeight: 35, fontFamily: 'Inter_700Bold', textAlign: 'center', textShadowColor: 'rgba(27,145,255,0.72)', textShadowRadius: 13 },
  futureSubtitle: { maxWidth: 342, color: arise.ink, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7, textShadowColor: 'rgba(2,5,13,0.9)', textShadowRadius: 8 },
  futureSpacer: { flex: 1, minHeight: 90 },
  futurePillars: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(209,217,240,0.23)', backgroundColor: 'rgba(4,9,20,0.72)' },
  pillar: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', gap: 5 },
  pillarDivider: { width: 1, height: 42, backgroundColor: 'rgba(209,217,240,0.28)' },
  pillarText: { color: arise.ink, fontSize: 7, lineHeight: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, textAlign: 'center' },
  footer: { width: '100%', paddingTop: 8 },
  stepActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 82, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(209,217,240,0.3)', backgroundColor: 'rgba(6,12,24,0.88)' },
  backText: { color: arise.ink, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  primaryButton: { position: 'relative', width: '100%', minHeight: 54, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1.2, borderColor: arise.cyan, backgroundColor: 'rgba(20,86,185,0.9)', shadowColor: arise.azure, shadowOpacity: 0.8, shadowRadius: 14, elevation: 7 },
  nextButton: { flex: 1 },
  buttonGlow: { backgroundColor: 'rgba(112,231,255,0.28)' },
  primaryButtonText: { zIndex: 1, color: arise.ink, fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.9, textShadowColor: 'rgba(112,231,255,0.7)', textShadowRadius: 7 },
  buttonPressed: { opacity: 0.83, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.65 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10 },
  paginationTarget: { minWidth: 16, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  paginationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(142,166,197,0.44)' },
  paginationDotActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: arise.cyan, shadowColor: arise.cyan, shadowOpacity: 1, shadowRadius: 7, elevation: 3 },
  offlineNote: { color: arise.inkSoft, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 7 },
  error: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  activationFlash: { ...StyleSheet.absoluteFill, backgroundColor: '#E7FAFF' },
  activationRing: { position: 'absolute', top: '50%', left: '50%', width: 150, height: 150, marginTop: -75, marginLeft: -75, borderRadius: 75, borderWidth: 2, borderColor: arise.cyan, shadowColor: arise.cyan, shadowOpacity: 0.9, shadowRadius: 20, elevation: 8 },
  activationEmblem: { position: 'absolute', top: '50%', left: '50%', width: 100, height: 100, marginTop: -50, marginLeft: -50, alignItems: 'center', justifyContent: 'center' },
});