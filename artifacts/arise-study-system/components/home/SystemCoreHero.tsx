import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Polygon, Stop } from 'react-native-svg';
import { RankCrown, SystemEmblem } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { SystemCoreGlow } from '@/components/SystemAnimations';

const SIZE = 236;
const C = SIZE / 2;
const R = 92;
const CIRC = 2 * Math.PI * R;

function Spin({ children, seconds, reverse, reducedMotion }: { children: React.ReactNode; seconds: number; reverse?: boolean; reducedMotion: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) { t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: seconds * 1000, easing: Easing.linear }), -1, false);
  }, [reducedMotion, seconds, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(reverse ? -1 : 1) * t.value * 360}deg` }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

type Props = {
  weekday: string; dateLabel: string; rank: string; level: number; totalXp: number; nextLevelXp: number;
  levelProgress: number; streak: number; todayXp: number; done: number; total: number;
  reducedMotion: boolean; onBriefing: () => void;
};

export function SystemCoreHero(p: Props) {
  const prog = Math.max(0, Math.min(1, p.levelProgress));
  const ticks = Array.from({ length: 36 }, (_, i) => i);
  return (
    <HudFrame accent="#70E7FF" style={s.frame}>
      <WorldArtwork scene="core" opacity={0.7} style={{ top: 95, bottom: 205 }} />
      <View style={s.top}>
        <View style={s.brandHeader}>
          <Text style={s.date}>{p.weekday} / {p.dateLabel}</Text>
          <View style={s.brandRow}>
            <SystemEmblem size={44} color="#70E7FF" />
            <View>
              <Text style={s.brand}>ARISE</Text>
              <Text style={s.sub}>SYSTEM STATUS · ONLINE</Text>
            </View>
          </View>
        </View>
        <Pressable testID="open-briefing" accessibilityRole="button" accessibilityLabel="Open daily briefing" onPress={p.onBriefing} style={({ pressed }) => [s.brief, { opacity: pressed ? 0.7 : 1 }]}>
          <Feather name="zap" size={20} color="#70E7FF" />
        </Pressable>
      </View>

      <View style={s.coreWrap} testID="home-system-core">
        <SystemCoreGlow color="#70E7FF" radius={26} reducedMotion={p.reducedMotion} />
        <Spin seconds={40} reducedMotion={p.reducedMotion}>
          <Svg width={SIZE} height={SIZE}>
            {ticks.map((i) => {
              const a = (i / ticks.length) * Math.PI * 2;
              const long = i % 3 === 0;
              return <Line key={i} x1={C + Math.cos(a) * 108} y1={C + Math.sin(a) * 108} x2={C + Math.cos(a) * (long ? 98 : 103)} y2={C + Math.sin(a) * (long ? 98 : 103)} stroke={long ? '#70E7FF' : '#3E8BFF'} strokeOpacity={long ? 0.9 : 0.5} strokeWidth={long ? 1.6 : 1} />;
            })}
          </Svg>
        </Spin>
        <Spin seconds={26} reverse reducedMotion={p.reducedMotion}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={C} cy={C} r={78} stroke="#B896FF" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="4 9 26 9" fill="none" />
          </Svg>
        </Spin>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="xpArc" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#70E7FF" />
              <Stop offset="1" stopColor="#E4C27A" />
            </SvgGradient>
          </Defs>
          <Polygon points={`${C},${C - 62} ${C + 54},${C - 31} ${C + 54},${C + 31} ${C},${C + 62} ${C - 54},${C + 31} ${C - 54},${C - 31}`} fill="rgba(4,10,21,0.78)" stroke="#70E7FF" strokeOpacity={0.55} strokeWidth={1.2} />
          <Circle cx={C} cy={C} r={R} stroke="#16304D" strokeWidth={7} fill="none" />
          <Circle cx={C} cy={C} r={R} stroke="url(#xpArc)" strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray={`${CIRC * prog} ${CIRC}`} transform={`rotate(-90 ${C} ${C})`} />
        </Svg>
        <View style={s.coreText} pointerEvents="none">
          <Text style={s.lvLabel}>RANK</Text>
          <Text testID="home-rank-letter" style={s.lvNum} allowFontScaling={false}>{p.rank.replace(/-RANK$/i, '')}</Text>
          <Text style={s.pct}>{Math.round(prog * 100)}% TO NEXT</Text>
        </View>
      </View>

      <View style={s.rankRow} testID="home-rank-emblem">
        <View style={s.rankIdentity}>
          <View style={s.rankCrownScale}>
            <RankCrown rank={p.rank} size={80} showFrame={false} />
          </View>
          <View style={s.levelNamePlate}>
            <Text style={s.rankName} numberOfLines={1}>{`LEVEL-${String(p.level).padStart(2, '0')}`}</Text>
          </View>
        </View>
        <View style={s.xpDivider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <View style={s.xpInfo}>
          <Text style={s.xpBig}>{p.totalXp.toLocaleString()}</Text>
          <Text style={s.rankLabel} numberOfLines={1}>XP · NEXT {p.nextLevelXp.toLocaleString()}</Text>
        </View>
      </View>

      <View style={s.stats}>
        <Stat icon="activity" color="#FF8E6B" value={`${p.streak}`} label="DAY STREAK" />
        <Stat icon="target" color="#70E7FF" value={`${p.todayXp}`} label="XP TODAY" />
        <Stat icon="check-square" color="#6DF0B4" value={`${p.done}/${p.total}`} label="QUESTS" />
      </View>
      <View style={s.segs} accessibilityLabel={`${p.done} of ${p.total} daily quests complete`}>
        {Array.from({ length: Math.max(1, p.total) }, (_, i) => (
          <View key={i} style={[s.seg, i < p.done && { backgroundColor: '#70E7FF', borderColor: '#70E7FF' }]} />
        ))}
      </View>
    </HudFrame>
  );
}

function Stat({ icon, color, value, label }: { icon: 'activity' | 'target' | 'check-square'; color: string; value: string; label: string }) {
  return (
    <View style={[s.stat, { borderLeftColor: color }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLab}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { marginBottom: 16, padding: 16, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#070C16', paddingBottom: 10 },
  brandHeader: { flex: 1, minWidth: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  date: { color: '#70E7FF', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  brand: { color: '#F2F6FF', fontSize: 32, fontWeight: '700', letterSpacing: 7, marginTop: 2 },
  sub: { color: '#8EA6C5', fontSize: 11, fontWeight: '600', letterSpacing: 1.4 },
  brief: { width: 46, height: 46, borderWidth: 1, borderColor: '#70E7FF', backgroundColor: 'rgba(4,10,21,0.6)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], borderRadius: 6 },
  coreWrap: { width: SIZE, height: SIZE, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  coreText: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lvLabel: { color: '#E4C27A', fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  lvNum: { color: '#FFFFFF', fontSize: 62, fontWeight: '700', lineHeight: 68, letterSpacing: 1, textShadowColor: '#70E7FF', textShadowRadius: 14 },
  pct: { color: '#9DB3D0', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: 'rgba(112,231,255,0.25)', paddingTop: 10, marginTop: 4, backgroundColor: '#070C16' },
  rankIdentity: { flex: 1, minWidth: 206, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankCrownScale: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 1.14 }] },
  levelNamePlate: { flex: 1, minWidth: 120, minHeight: 46, justifyContent: 'center', paddingHorizontal: 7, borderWidth: 1, borderLeftWidth: 3, borderColor: 'rgba(112,231,255,0.2)', borderLeftColor: '#E4C27A', borderRadius: 3, backgroundColor: 'rgba(112,231,255,0.05)' },
  xpDivider: { width: 1, height: 40, backgroundColor: 'rgba(228,194,122,0.28)' },
  xpInfo: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '36%' },
  rankLabel: { color: '#8EA6C5', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  rankName: { color: '#F2F6FF', fontSize: 20, fontWeight: '700', letterSpacing: 0.5, flexShrink: 0 },
  xpBig: { color: '#E4C27A', fontSize: 20, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, minWidth: 0, borderLeftWidth: 3, backgroundColor: 'rgba(4,10,21,0.62)', paddingVertical: 8, paddingHorizontal: 9, minHeight: 72 },
  statVal: { color: '#F2F6FF', fontSize: 18, fontWeight: '700', marginTop: 3 },
  statLab: { color: '#8EA6C5', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  segs: { flexDirection: 'row', gap: 4, marginTop: 12 },
  seg: { flex: 1, height: 7, borderWidth: 1, borderColor: '#2A4A70', backgroundColor: 'rgba(16,32,56,0.8)', transform: [{ skewX: '-20deg' }] },
});
