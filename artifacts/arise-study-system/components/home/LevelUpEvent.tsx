import { useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { RankCrown } from '@/components/AriseArt';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

export type LevelUpAchievementIcon = 'target' | 'play' | 'book-open' | 'type' | 'hash' | 'activity' | 'award' | 'check-circle';
export type LevelUpAchievement = {
  id: string;
  title: string;
  detail: string;
  icon: LevelUpAchievementIcon;
};

function Ring({ delay, color, size, reducedMotion }: { delay: number; color: string; size: number; reducedMotion: boolean }) {
  const t = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { t.value = 0; return; }
    t.value = 0;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false));
  }, [delay, reducedMotion, t]);
  const style = useAnimatedStyle(() => {
    const pulse = Math.sin(t.value * Math.PI * 2);
    return {
      opacity: reducedMotion ? 0.28 : 0.32 + Math.abs(pulse) * 0.2,
      transform: [{ rotate: `${t.value * 360}deg` }, { scale: reducedMotion ? 1 : 1 + pulse * 0.025 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[s.orbit, { width: size, height: size, borderRadius: size / 2, borderColor: color }, style]}>
      <View style={[s.orbitMark, { backgroundColor: color }]} />
      <View style={[s.orbitMarkSmall, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function SystemEmblem({ size = 30 }: { size?: number }) {
  return (
    <View style={[s.systemEmblem, { width: size, height: size }]}>
      <Svg width="100%" height="100%" viewBox="0 0 40 40">
        <Path d="M20 2 L23.5 14.5 L38 20 L23.5 23.5 L20 38 L16.5 23.5 L2 20 L16.5 14.5 Z" fill="#E5FBFF" />
        <Polygon points="20,9 24,20 20,31 16,20" fill="#43CFFF" />
        <Circle cx="20" cy="20" r="2.2" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

function LevelCore({ level }: { level: number | null }) {
  return (
    <View style={s.coreShield}>
      <Svg width="100%" height="100%" viewBox="0 0 180 190" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Path d="M90 4 L145 22 L171 61 L160 120 L128 156 L90 184 L52 156 L20 120 L9 61 L35 22 Z" fill="rgba(3,20,39,0.87)" stroke="#91F4FF" strokeWidth="2" />
        <Path d="M90 17 L132 32 L151 64 L143 111 L119 141 L90 163 L61 141 L37 111 L29 64 L48 32 Z" fill="rgba(5,30,53,0.7)" stroke="rgba(98,218,255,0.65)" strokeWidth="1.2" />
        <Path d="M35 69 C17 52 12 42 16 34 C31 39 46 50 56 66 M145 69 C163 52 168 42 164 34 C149 39 134 50 124 66" fill="none" stroke="rgba(145,244,255,0.84)" strokeWidth="3" strokeLinecap="round" />
        <Path d="M37 83 L19 65 M143 83 L161 65 M48 112 L30 98 M132 112 L150 98" stroke="#38BFFF" strokeWidth="2" strokeLinecap="round" />
        <Path d="M90 27 L100 40 L90 47 L80 40 Z M90 145 L100 157 L90 168 L80 157 Z" fill="#D8FBFF" />
      </Svg>
      <View style={s.coreInset}>
        <Text style={s.levelCaption}>LEVEL</Text>
        <Text testID="levelup-number" style={s.levelNumber}>{level ?? ''}</Text>
      </View>
    </View>
  );
}

type Props = {
  level: number | null;
  rank: string;
  totalXp: number;
  nextLevelXp: number;
  levelProgress: number;
  reducedMotion: boolean;
  onDismiss: () => void;
  todayAchievements?: LevelUpAchievement[];
};

export function LevelUpEvent({
  level, rank, totalXp, nextLevelXp, levelProgress, reducedMotion, onDismiss, todayAchievements = [],
}: Props) {
  const insets = useSafeAreaInsets();
  const progress = Math.max(0, Math.min(1, levelProgress));
  const backdropPulse = useSharedValue(0);
  const coreReveal = useSharedValue(reducedMotion ? 1 : 0);
  const titleReveal = useSharedValue(reducedMotion ? 1 : 0);
  const detailsReveal = useSharedValue(reducedMotion ? 1 : 0);
  const fillReveal = useSharedValue(reducedMotion ? progress : 0);
  useEffect(() => {
    if (level === null) return;
    backdropPulse.value = 0;
    coreReveal.value = reducedMotion ? 1 : 0;
    titleReveal.value = reducedMotion ? 1 : 0;
    detailsReveal.value = reducedMotion ? 1 : 0;
    fillReveal.value = reducedMotion ? progress : 0;
    if (reducedMotion) return;
    backdropPulse.value = withRepeat(withSequence(
      withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
    ), -1, false);
    titleReveal.value = withDelay(100, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    coreReveal.value = withDelay(700, withSequence(
      withTiming(1.12, { duration: 420, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 12, stiffness: 145 }),
    ));
    detailsReveal.value = withDelay(1180, withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) }));
    fillReveal.value = withDelay(1550, withTiming(progress, { duration: 820, easing: Easing.out(Easing.cubic) }));
  }, [level, progress, reducedMotion, backdropPulse, coreReveal, titleReveal, detailsReveal, fillReveal]);
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.015 + backdropPulse.value * 0.018 }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, coreReveal.value * 1.35),
    transform: [{ scale: 0.78 + coreReveal.value * 0.22 }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleReveal.value,
    transform: [{ translateY: (1 - titleReveal.value) * 14 }],
  }));
  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsReveal.value,
    transform: [{ translateY: (1 - detailsReveal.value) * 10 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, fillReveal.value) * 100}%`,
  }));
  const buttonGlowStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.38 : 0.22 + Math.abs(Math.sin(backdropPulse.value * Math.PI * 2)) * 0.36,
  }));

  return (
    <Modal visible={level !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[s.backdrop, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Image
            source={require('@/assets/images/arise-levelup-neon-guardian.jpg')}
            contentFit="cover"
            contentPosition="center"
            cachePolicy="memory-disk"
            transition={0}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        </Animated.View>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(1,5,15,0.30)', 'rgba(2,8,21,0.16)', 'rgba(2,7,17,0.56)', 'rgba(1,3,10,0.9)']}
          locations={[0, 0.28, 0.64, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[s.backgroundShard, s.backgroundShardOne]} />
        <View pointerEvents="none" style={[s.backgroundShard, s.backgroundShardTwo]} />
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          accessibilityLabel="Level-up event"
        >
          <View style={s.frame}>
            <View style={s.topBar}>
              <View style={s.brand}>
                <View style={s.brandMark}><SystemEmblem size={24} /></View>
                <View>
                  <Text style={s.brandName}>ARISE</Text>
                  <Text style={s.brandSub}>STUDY SYSTEM</Text>
                </View>
              </View>
              <View style={s.eventBadge}>
                <View style={s.liveDot} />
                <Text style={s.eventLabel}>SYSTEM EVENT</Text>
              </View>
            </View>
            <Animated.View style={[s.heroTitle, titleStyle]}>
              <SystemEmblem size={25} />
              <View style={s.titleLine}>
                <Text style={s.congrats}>CONGRATULATIONS</Text>
                <Text accessibilityRole="header" style={s.title}>LEVEL UP</Text>
              </View>
              <View style={s.titleRule}><View style={s.titleRuleGlow} /></View>
            </Animated.View>

            <View style={s.coreArea}>
              <Ring delay={0} color="#75EBFF" size={172} reducedMotion={reducedMotion} />
              <Ring delay={700} color="#49BFFF" size={202} reducedMotion={reducedMotion} />
              <Ring delay={1400} color="#E4C27A" size={228} reducedMotion={reducedMotion} />
              <View pointerEvents="none" style={[s.shard, s.shardOne]} />
              <View pointerEvents="none" style={[s.shard, s.shardTwo]} />
              <Animated.View style={[s.core, coreStyle]}>
                <LevelCore level={level} />
              </Animated.View>
            </View>

            <Animated.View style={[s.body, detailsStyle]}>
              <View style={s.messagePanel}>
                <Text style={s.message}>“You are getting stronger. Keep going.”</Text>
              </View>

              <View style={s.rankRow}>
                <View style={s.rankIcon}><RankCrown rank={rank} size={38} /></View>
                <View style={s.rankText}>
                  <Text style={s.eyebrow}>CURRENT RANK</Text>
                  <Text numberOfLines={1} style={s.rankName}>{rank}</Text>
                </View>
                <View style={s.rankDivider} />
                <View style={s.xpSummary}>
                  <Text style={s.eyebrow}>TOTAL XP</Text>
                  <Text style={s.xpTotal}>{totalXp.toLocaleString()}</Text>
                </View>
              </View>

              <View style={s.progressPanel}>
                <View style={s.progressHeading}>
                  <View style={s.progressTitle}>
                    <Feather name="activity" size={15} color="#8FEFFF" />
                    <View>
                      <Text style={s.panelLabel}>PROGRESS TO NEXT LEVEL</Text>
                      <Text style={s.nextLevel}>LV {level === null ? '—' : level + 1}</Text>
                    </View>
                  </View>
                  <Text style={s.percent}>{Math.round(progress * 100)}%</Text>
                </View>
                <View style={s.xpTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
                  <Animated.View style={[s.xpFill, fillStyle]}>
                    <LinearGradient colors={['#D9FFFF', '#73EAFF', '#2A9CFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
                    <View style={s.xpSpark} />
                  </Animated.View>
                </View>
                <View style={s.xpCaptionRow}>
                  <Text style={s.xpCaption}>TOTAL XP · {totalXp.toLocaleString()}</Text>
                  <Text style={s.xpCaption}>TARGET · {nextLevelXp.toLocaleString()} XP</Text>
                </View>
              </View>

              {todayAchievements.length > 0 ? (
                <View style={s.achievementSection}>
                  <View style={s.sectionHeading}>
                    <Text style={s.panelLabel}>TODAY’S ACHIEVEMENT</Text>
                    <View style={s.recordedBadge}><View style={s.recordedDot} /><Text style={s.recorded}>RECORDED</Text></View>
                  </View>
                  <View style={s.achievementList}>
                    {todayAchievements.slice(0, 3).map((item, index) => (
                      <Animated.View key={item.id} entering={reducedMotion ? undefined : FadeInDown.delay(index * 130).duration(280)} style={s.achievement}>
                        <View style={s.achievementIcon}><Feather name={item.icon} size={17} color="#D9F8FF" /></View>
                        <View style={s.achievementCopy}>
                          <Text numberOfLines={1} style={s.achievementTitle}>{item.title}</Text>
                          <Text numberOfLines={1} style={s.achievementDetail}>{item.detail}</Text>
                        </View>
                        <View style={s.check}><Feather name="check" size={11} color="#07131E" /></View>
                      </Animated.View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View
                accessibilityLabel="Level-Up rewards: no new rewards"
                style={s.rewardSection}
              >
                <View style={s.rewardHeading}>
                  <Text style={s.panelLabel}>LEVEL-UP REWARDS</Text>
                  <Text style={s.rewardContext}>THIS LEVEL-UP</Text>
                </View>
                <View style={s.rewardEmpty}>
                  <View style={s.rewardIcon}><Feather name="gift" size={15} color="#F5D894" /></View>
                  <Text style={s.rewardEmptyText}>NO NEW REWARDS</Text>
                </View>
              </View>

              <Pressable
                testID="dismiss-level-up"
                accessibilityRole="button"
                accessibilityLabel="Continue"
                onPress={onDismiss}
                style={({ pressed }) => [s.button, { transform: [{ scale: pressed ? 0.975 : 1 }] }]}
              >
                <Svg width="100%" height="100%" viewBox="0 0 360 62" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
                  <Path d="M18 1 H342 L359 31 L342 61 H18 L1 31 Z" fill="rgba(4,27,47,0.96)" stroke="#79ECFF" strokeWidth="1.5" />
                  <Path d="M24 6 H336 M8 31 L19 31 M341 31 L352 31" fill="none" stroke="rgba(220,252,255,0.55)" strokeWidth="1" />
                </Svg>
                <Animated.View pointerEvents="none" style={[s.buttonGlow, buttonGlowStyle]} />
                <Text style={s.buttonText}>CONTINUE</Text>
                <Text style={s.buttonArrow}>→</Text>
              </Pressable>
            </Animated.View>
            <View pointerEvents="none" style={s.frameBottom} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020715', overflow: 'hidden' },
  backgroundShard: { position: 'absolute', width: 7, height: 22, borderWidth: 1, borderColor: 'rgba(115,226,255,0.74)', backgroundColor: 'rgba(58,169,255,0.14)', transform: [{ rotate: '42deg' }] },
  backgroundShardOne: { top: '27%', left: '8%' },
  backgroundShardTwo: { top: '49%', right: '8%', borderColor: 'rgba(226,195,128,0.7)' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8 },
  frame: { width: '100%', maxWidth: 438, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(135,230,255,0.54)', backgroundColor: 'rgba(2,8,18,0.49)', shadowColor: '#2CBAFF', shadowOpacity: 0.22, shadowRadius: 22, elevation: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 35, paddingHorizontal: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(130,230,255,0.62)', backgroundColor: 'rgba(2,12,27,0.7)' },
  brandName: { color: '#F7FBFF', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  brandSub: { color: '#AFC9E1', fontSize: 7, fontWeight: '700', letterSpacing: 1.8, marginTop: 1 },
  eventBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(120,226,255,0.44)', backgroundColor: 'rgba(3,11,24,0.72)', paddingHorizontal: 8, paddingVertical: 6 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#8AF2FF', shadowColor: '#52DFFF', shadowOpacity: 0.9, shadowRadius: 5 },
  eventLabel: { color: '#C5F7FF', fontSize: 7, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { alignItems: 'center', marginTop: 7, marginBottom: 0 },
  systemEmblem: { alignItems: 'center', justifyContent: 'center', shadowColor: '#76E9FF', shadowOpacity: 0.9, shadowRadius: 11, elevation: 4 },
  titleLine: { alignItems: 'center', marginTop: 0 },
  congrats: { color: '#E0F8FF', fontSize: 8, fontWeight: '900', letterSpacing: 4.2, textShadowColor: '#25BFFF', textShadowRadius: 8 },
  title: { color: '#FFE7B0', fontSize: 36, lineHeight: 43, fontWeight: '900', letterSpacing: 2.8, textShadowColor: 'rgba(255,190,90,0.9)', textShadowRadius: 20, textAlign: 'center' },
  titleRule: { height: 1, width: 174, marginTop: 1, backgroundColor: 'rgba(112,231,255,0.38)', alignItems: 'center' },
  titleRuleGlow: { width: 70, height: 2, backgroundColor: '#FFF2CE', shadowColor: '#FFE0A2', shadowRadius: 12, elevation: 3 },
  coreArea: { height: 182, alignItems: 'center', justifyContent: 'center', marginTop: -2, overflow: 'visible' },
  orbit: { position: 'absolute', borderWidth: 1.3, borderStyle: 'dashed', backgroundColor: 'rgba(2,20,38,0.12)' },
  orbitMark: { position: 'absolute', width: 7, height: 7, top: -4, left: '50%', marginLeft: -3.5, transform: [{ rotate: '45deg' }], shadowColor: '#7BEAFF', shadowOpacity: 0.9, shadowRadius: 5 },
  orbitMarkSmall: { position: 'absolute', width: 4, height: 4, bottom: -2, right: '21%', transform: [{ rotate: '45deg' }], opacity: 0.8 },
  core: { width: 154, height: 164, alignItems: 'center', justifyContent: 'center', shadowColor: '#44CFFF', shadowOpacity: 0.72, shadowRadius: 23, elevation: 9 },
  coreShield: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  coreInset: { width: 83, height: 92, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(246,216,147,0.93)', backgroundColor: 'rgba(2,12,27,0.56)', shadowColor: '#8DEBFF', shadowOpacity: 0.72, shadowRadius: 18, elevation: 4 },
  levelCaption: { color: '#B8F4FF', fontSize: 9, fontWeight: '900', letterSpacing: 3.4, textShadowColor: '#42D7FF', textShadowRadius: 5 },
  levelNumber: { color: '#FFFFFF', fontSize: 46, lineHeight: 52, fontWeight: '900', textShadowColor: '#65DEFF', textShadowRadius: 18 },
  shard: { position: 'absolute', width: 12, height: 20, borderWidth: 1, borderColor: 'rgba(126,235,255,0.9)', backgroundColor: 'rgba(52,170,255,0.24)', transform: [{ rotate: '42deg' }], shadowColor: '#49CFFF', shadowOpacity: 0.9, shadowRadius: 8 },
  shardOne: { top: 34, left: '24%' },
  shardTwo: { bottom: 33, right: '23%', borderColor: 'rgba(255,221,151,0.8)' },
  body: { paddingBottom: 1 },
  messagePanel: { minHeight: 39, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(121,219,255,0.36)', borderLeftWidth: 2, borderLeftColor: '#7AF0FF', backgroundColor: 'rgba(3,13,29,0.78)', paddingVertical: 8, paddingHorizontal: 12, marginTop: -2 },
  message: { color: '#F2F7FF', fontSize: 11, lineHeight: 16, textAlign: 'center', fontWeight: '600', textShadowColor: 'rgba(92,201,255,0.4)', textShadowRadius: 5 },
  rankRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(119,221,255,0.34)', backgroundColor: 'rgba(3,11,25,0.78)', marginTop: 8, paddingVertical: 6, paddingHorizontal: 9, gap: 8 },
  rankIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(237,198,119,0.55)', backgroundColor: 'rgba(8,19,32,0.8)' },
  rankText: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#AFCAE1', fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  rankName: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 2, textShadowColor: 'rgba(115,221,255,0.6)', textShadowRadius: 6 },
  rankDivider: { width: 1, height: 30, backgroundColor: 'rgba(112,231,255,0.34)' },
  xpSummary: { alignItems: 'flex-end', minWidth: 74 },
  xpTotal: { color: '#FFE2A2', fontSize: 14, fontWeight: '900', marginTop: 2 },
  progressPanel: { marginTop: 8, borderWidth: 1, borderColor: 'rgba(110,216,255,0.46)', backgroundColor: 'rgba(2,11,25,0.82)', paddingHorizontal: 9, paddingVertical: 8 },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  progressTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  panelLabel: { color: '#D3E7F6', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  nextLevel: { color: '#F5D894', fontSize: 10, fontWeight: '900', marginTop: 1 },
  percent: { color: '#B9F8FF', fontSize: 17, fontWeight: '900', textShadowColor: '#42CFFF', textShadowRadius: 9 },
  xpTrack: { height: 11, overflow: 'hidden', backgroundColor: 'rgba(9,28,52,0.96)', borderWidth: 1, borderColor: 'rgba(131,233,255,0.7)', padding: 1, shadowColor: '#42CFFF', shadowOpacity: 0.4, shadowRadius: 8, elevation: 2 },
  xpFill: { height: '100%', minWidth: 2, overflow: 'hidden', backgroundColor: '#70E7FF', shadowColor: '#8EF5FF', shadowOpacity: 0.9, shadowRadius: 8 },
  xpSpark: { position: 'absolute', top: 0, right: 1, width: 3, height: '100%', backgroundColor: '#FFFFFF', shadowColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 5 },
  xpCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  xpCaption: { color: '#B5CEE3', fontSize: 7, fontWeight: '800', letterSpacing: 0.65 },
  achievementSection: { marginTop: 9, paddingHorizontal: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  recordedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#70E7B2' },
  recorded: { color: '#A6F1D1', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  achievementList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  achievement: { width: '48%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(96,209,255,0.36)', backgroundColor: 'rgba(3,15,31,0.82)' },
  achievementIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(111,223,255,0.55)', backgroundColor: 'rgba(10,50,77,0.54)' },
  achievementCopy: { flex: 1, minWidth: 0 },
  achievementTitle: { color: '#F2F8FF', fontSize: 9, fontWeight: '800' },
  achievementDetail: { color: '#9FC6DE', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  check: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#70E7B2', alignItems: 'center', justifyContent: 'center' },
  rewardSection: { marginTop: 8, borderWidth: 1, borderColor: 'rgba(237,198,119,0.42)', backgroundColor: 'rgba(8,15,28,0.86)', paddingHorizontal: 8, paddingVertical: 6 },
  rewardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  rewardContext: { color: '#9FC6DE', fontSize: 6, fontWeight: '900', letterSpacing: 0.9 },
  rewardEmpty: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(110,216,255,0.24)', backgroundColor: 'rgba(3,12,25,0.72)' },
  rewardIcon: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(237,198,119,0.48)', backgroundColor: 'rgba(30,28,24,0.62)' },
  rewardEmptyText: { color: '#F5D894', fontSize: 8, fontWeight: '900', letterSpacing: 1.3, textShadowColor: 'rgba(245,216,148,0.35)', textShadowRadius: 5 },
  button: { position: 'relative', minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, overflow: 'hidden', shadowColor: '#38CFFF', shadowOpacity: 0.44, shadowRadius: 14, elevation: 5 },
  buttonGlow: { position: 'absolute', width: '62%', height: 20, borderRadius: 20, backgroundColor: 'rgba(74,215,255,0.46)', shadowColor: '#70E7FF', shadowOpacity: 0.9, shadowRadius: 14 },
  buttonText: { color: '#F4FCFF', fontSize: 11, fontWeight: '900', letterSpacing: 3.1, textShadowColor: '#70E7FF', textShadowRadius: 5 },
  buttonArrow: { color: '#C2F9FF', fontSize: 20, lineHeight: 22, marginTop: -1, textShadowColor: '#70E7FF', textShadowRadius: 7 },
  frameBottom: { height: 1, marginTop: 9, marginHorizontal: 3, backgroundColor: 'rgba(119,221,255,0.46)' },
});
