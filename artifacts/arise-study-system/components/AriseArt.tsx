import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useId, useMemo } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Polygon, Stop } from 'react-native-svg';
import { arise } from '@/constants/colors';
import { rankDefinitionFor } from '@/contexts/rankSystem';
import type { RankCrownVariant } from '@/contexts/rankSystem';
import type { MissionDescriptor } from '@/contexts/masterProgress';
import { HudFrame } from '@/components/VisualWorld';

const peakPath = (n: number, top: number, base = 72) => {
  const xs = Array.from({ length: n }, (_, i) => 24 + (i * 52) / (n - 1));
  const mid = (n - 1) / 2;
  let d = `M24 ${base}`;
  xs.forEach((x, i) => {
    const h = top + (Math.abs(i - mid) / mid) * 10;
    d += ` L${x.toFixed(1)} ${h.toFixed(1)}`;
    if (i < n - 1) d += ` L${((x + xs[i + 1]) / 2).toFixed(1)} 54`;
  });
  return `${d} L76 ${base} Z`;
};

const CROWN_PEAKS: Record<RankCrownVariant, number> = {
  'iron-crown': 3, 'signal-crown': 4, 'prism-crown': 5, 'winged-crown': 5, 'solar-crown': 7,
  'halo-crown': 5, 'double-halo-crown': 7, 'triple-halo-crown': 7, 'eclipse-crown': 5, 'void-crown': 0,
};
const HALO_COUNT: Partial<Record<RankCrownVariant, number>> = { 'halo-crown': 1, 'double-halo-crown': 2, 'triple-halo-crown': 3 };

/** Original programmatic crown, drawn from the central rank definition's crownVariant. */
export function RankCrown({ rank, size = 96, showFrame = true }: { rank: string; size?: number; showFrame?: boolean }) {
  const def = rankDefinitionFor(rank);
  const v = def.crownVariant;
  const [c1, c2] = def.colors;
  const gid = `cr-${def.id}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const peaks = CROWN_PEAKS[v];
  const halos = HALO_COUNT[v] ?? 0;
  const path = useMemo(() => (peaks ? peakPath(peaks, v === 'iron-crown' ? 34 : 24) : ''), [peaks, v]);
  const gems = v === 'iron-crown' ? 1 : v === 'void-crown' ? 0 : Math.min(3, 1 + Math.floor(peaks / 3));
  return (
    <Svg testID={`rank-crown-${v}`} width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs>
        <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c1} />
          <Stop offset="1" stopColor={c2} />
        </SvgGradient>
      </Defs>
      {showFrame ? <Circle cx="50" cy="50" r="43" fill={arise.abyss} fillOpacity={0.8} stroke={c1} strokeOpacity={0.2} /> : null}
      {showFrame ? <Polygon points="50,3 90,26 90,74 50,97 10,74 10,26" fill="none" stroke={c2} strokeOpacity={0.24} strokeWidth="0.8" /> : null}
      {Array.from({ length: halos }, (_, i) => (
        <Ellipse key={`halo-${i}`} testID={`crown-halo-${i}`} cx="50" cy={20 - i * 6} rx={30 + i * 6} ry={7 + i * 2} stroke={c1} strokeOpacity={0.9 - i * 0.2} strokeWidth="1.6" fill="none" />
      ))}
      {v === 'signal-crown' ? <Path testID="crown-antenna" d="M50 26 L50 8 M42 14 L58 14" stroke={c1} strokeWidth="2" strokeLinecap="round" /> : null}
      {v === 'prism-crown' ? <Path testID="crown-facets" d="M24 72 L37 38 L50 72 L63 38 L76 72 M37 38 L63 38" stroke={c1} strokeOpacity={0.6} strokeWidth="1" fill="none" /> : null}
      {v === 'winged-crown' ? (
        <G testID="crown-wings" fill={c2} fillOpacity={0.8}>
          <Path d="M22 62 L2 40 L8 66 L22 72 Z M20 54 L6 30 L14 56 Z" />
          <Path d="M78 62 L98 40 L92 66 L78 72 Z M80 54 L94 30 L86 56 Z" />
        </G>
      ) : null}
      {v === 'solar-crown' ? (
        <G testID="crown-rays" stroke={c1} strokeWidth="1.6" strokeLinecap="round">
          <Circle cx="50" cy="52" r="44" strokeOpacity={0.35} strokeWidth="1" fill="none" />
          <Path d="M50 4 L50 12 M18 16 L24 22 M82 16 L76 22 M6 50 L14 50 M94 50 L86 50" />
        </G>
      ) : null}
      {v === 'triple-halo-crown' ? (
        <Path testID="crown-blades" d="M22 66 L2 52 L14 72 Z M78 66 L98 52 L86 72 Z M28 60 L10 30 L24 56 Z M72 60 L90 30 L76 56 Z" fill={c2} fillOpacity={0.75} />
      ) : null}
      {v === 'eclipse-crown' ? (
        <G testID="crown-eclipse">
          <Circle cx="50" cy="35" r="29" fill={c2} stroke={c1} strokeWidth="1.8" />
          <Circle cx="59" cy="28" r="26" fill={arise.abyss} />
          <Path d="M8 50 L18 44 M82 44 L92 50 M50 3 L50 12" stroke={c1} strokeWidth="2" />
        </G>
      ) : null}
      {v === 'void-crown' ? (
        <G testID="crown-void">
          <Circle cx="50" cy="50" r="44" stroke={c1} strokeOpacity={0.5} strokeWidth="1" strokeDasharray="3 5" fill="none" />
          <Circle cx="50" cy="50" r="34" stroke={c2} strokeOpacity={0.7} strokeWidth="1.4" strokeDasharray="14 6" fill="none" />
          <Path d="M50 10 L68 44 L50 88 L32 44 Z" fill={`url(#${gid})`} stroke={c1} strokeWidth="1.4" strokeLinejoin="round" />
          <Path d="M50 24 L60 44 L50 70 L40 44 Z" fill="#07101F" stroke={c1} strokeWidth="1" />
          <Path d="M14 40 L30 50 L14 60 Z M86 40 L70 50 L86 60 Z M50 2 L46 8 L54 8 Z" fill={c2} fillOpacity={0.85} />
        </G>
      ) : (
        <G>
          <Path d={path} fill={`url(#${gid})`} stroke={c1} strokeWidth="1.2" strokeLinejoin="round" />
          <Path d="M24 72 L76 72 L72 82 L28 82 Z" fill={c2} stroke={c1} strokeWidth="1" />
        </G>
      )}
      {Array.from({ length: gems }, (_, i) => (
        <Polygon key={i} points="0,-4 3,0 0,4 -3,0" transform={`translate(${gems === 1 ? 50 : 34 + (i * 32) / (gems - 1)} 77)`} fill="#F4FCFF" />
      ))}
      <Circle cx="50" cy={v === 'void-crown' ? 44 : 46} r={v === 'void-crown' ? 4 : 2.4 + halos * 0.6} fill="#FFFFFF" fillOpacity={0.9} />
    </Svg>
  );
}

export type GuardianKind = 'maths' | 'ncert' | 'vocabulary' | 'reasoning' | 'english';

export const guardianKindFor = (key: string | null | undefined): GuardianKind => {
  const k = (key ?? '').toLowerCase();
  if (k.includes('ncert')) return 'ncert';
  if (k.includes('vocab') || k.includes('black')) return 'vocabulary';
  if (k.includes('reason')) return 'reasoning';
  if (k.includes('english')) return 'english';
  return 'maths';
};

export const GUARDIAN_NAMES: Record<GuardianKind, string> = {
  maths: 'Axiom Warden',
  ncert: 'Archive Keeper',
  vocabulary: 'Lexicon Wraith',
  reasoning: 'Lattice Seer',
  english: 'Verse Sentinel',
};

const GUARD_COLOR: Record<GuardianKind, string> = {
  maths: arise.cyan,
  ncert: arise.violet,
  vocabulary: arise.magenta,
  reasoning: arise.indigo,
  english: arise.teal,
};

/** Original faceted ARISE mark, distinct from rank crowns and subject Guardians. */
export function SystemEmblem({ size = 64, color = arise.cyan }: { size?: number; color?: string }) {
  const gid = `system-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs><SvgGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={arise.silver} /><Stop offset="0.5" stopColor={color} /><Stop offset="1" stopColor={arise.azure} /></SvgGradient></Defs>
      <Polygon points="50,3 91,26 91,74 50,97 9,74 9,26" fill={arise.abyss} stroke={color} strokeOpacity={0.5} />
      <Path d="M50 15 L80 74 L64 74 L50 44 L36 74 L20 74 Z" fill={`url(#${gid})`} stroke={arise.silver} strokeWidth="0.8" />
      <Path d="M50 36 L62 60 L50 76 L38 60 Z" fill={arise.abyss} stroke={color} strokeWidth="1.4" />
      <Path d="M50 43 L55 57 L50 64 L45 57 Z M16 37 L9 42 M84 63 L91 58" fill={color} />
      <Path d="M30 84 H42 M58 84 H70 M50 5 V10" stroke={arise.silver} strokeWidth="1.4" />
    </Svg>
  );
}

/** Original three-spire Recordkeeper seal for real Boss challenge surfaces. */
export function BossEmblem({ size = 80, color = arise.danger }: { size?: number; color?: string }) {
  const gid = `boss-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs><SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.75} /><Stop offset="1" stopColor={arise.violet} stopOpacity={0.25} /></SvgGradient></Defs>
      <Circle cx="50" cy="50" r="44" stroke={color} strokeOpacity={0.35} strokeDasharray="9 5" fill={arise.abyss} />
      <Path d="M50 8 L60 29 L84 19 L76 57 L50 88 L24 57 L16 19 L40 29 Z" fill={`url(#${gid})`} stroke={color} strokeWidth="1.5" />
      <Path d="M50 30 L66 44 L60 65 L50 75 L40 65 L34 44 Z M50 30 V75 M34 44 L66 44" fill={arise.abyss} stroke={arise.silver} strokeOpacity={0.85} />
      <Path d="M40 49 L47 53 M60 49 L53 53 M46 66 H54" stroke={color} strokeWidth="2.5" />
    </Svg>
  );
}

/** Five original hooded guardians: shared ARISE sentinel silhouette, unique crest, aura and chest sigil. */
export function GuardianArt({ kind, size = 72, dim = false }: { kind: GuardianKind; size?: number; dim?: boolean }) {
  const c = dim ? '#4D6585' : GUARD_COLOR[kind];
  const gid = `guardian-${kind}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true} opacity={dim ? 0.7 : 1}>
      <Defs>
        <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={arise.silver} stopOpacity={0.5} />
          <Stop offset="0.45" stopColor={c} stopOpacity={0.5} />
          <Stop offset="1" stopColor={arise.abyss} stopOpacity={0.85} />
        </SvgGradient>
      </Defs>
      <Circle cx="50" cy="49" r="43" stroke={c} strokeOpacity={0.24} strokeDasharray="11 5" fill={arise.abyss} fillOpacity={0.6} />
      <Path d="M50 3 L92 22 L92 64 L50 97 L8 64 L8 22 Z" fill="none" stroke={c} strokeOpacity={0.35} strokeWidth="1" />
      {/* cloak + shoulders */}
      <Path d="M14 94 L20 62 Q24 46 38 42 L62 42 Q76 46 80 62 L86 94 Z" fill={`url(#${gid})`} stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <Path d="M20 62 L35 50 L42 79 L30 94 Z M80 62 L65 50 L58 79 L70 94 Z" fill={arise.abyss} fillOpacity={0.65} stroke={c} strokeOpacity={0.4} />
      <Path d="M25 60 L36 56 L33 69 L20 78 M75 60 L64 56 L67 69 L80 78 M37 76 L32 90 M63 76 L68 90" fill="none" stroke={arise.silver} strokeOpacity={0.4} strokeWidth="0.8" />
      {/* helm */}
      <Path d="M36 40 L36 22 Q36 10 50 8 Q64 10 64 22 L64 40 L56 34 L44 34 Z" fill="#07101F" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <Path d="M43 24 L50 30 L57 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <Path d="M36 22 L50 14 L64 22 L57 34 L50 39 L43 34 Z M50 14 V27 M43 34 L50 30 L57 34" fill="none" stroke={arise.silver} strokeOpacity={0.48} strokeWidth="0.7" />
      {kind === 'maths' ? <Path d="M50 8 L46 -2 L50 -6 L54 -2 Z M50 8 L50 -4" fill={c} stroke={c} strokeWidth="1" transform="translate(0 6)" /> : null}
      {kind === 'ncert' ? <Path d="M36 20 L20 10 L24 28 Z M64 20 L80 10 L76 28 Z" fill={c} fillOpacity={0.55} stroke={c} strokeWidth="1" /> : null}
      {kind === 'vocabulary' ? <Path d="M62 14 Q84 6 88 28 Q74 22 62 24 Z" fill={c} fillOpacity={0.55} stroke={c} strokeWidth="1" /> : null}
      {kind === 'reasoning' ? (
        <G fill={c}><Circle cx="50" cy="3" r="3" /><Circle cx="34" cy="9" r="2.4" /><Circle cx="66" cy="9" r="2.4" /></G>
      ) : null}
      {kind === 'english' ? <Path d="M34 18 Q28 4 44 4 Q34 8 38 18 Z M66 18 Q72 4 56 4 Q66 8 62 18 Z" fill={c} fillOpacity={0.6} stroke={c} strokeWidth="1" /> : null}
      {/* chest sigil */}
      <G transform="translate(29 47) scale(0.42)">
        {kind === 'maths' ? (
          <G stroke={c} strokeWidth="5" strokeLinecap="round" fill="none">
            <Path d="M50 30 L50 66 M32 48 L68 48" />
            <Circle cx="50" cy="48" r="22" strokeWidth="2.5" />
          </G>
        ) : null}
        {kind === 'ncert' ? (
          <G fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round">
            <Path d="M50 36 Q38 28 24 32 L24 64 Q38 60 50 68 Q62 60 76 64 L76 32 Q62 28 50 36 Z M50 36 L50 68" />
          </G>
        ) : null}
        {kind === 'vocabulary' ? (
          <G fill={c} fillOpacity={0.4} stroke={c} strokeWidth="4" strokeLinejoin="round">
            <Path d="M64 24 Q46 38 38 62 L36 72 L46 66 Q60 54 66 24 Z" />
          </G>
        ) : null}
        {kind === 'reasoning' ? (
          <G stroke={c} strokeWidth="4" fill="none">
            <Path d="M50 28 L30 52 L50 70 L70 52 Z M50 28 L50 70 M30 52 L70 52" />
          </G>
        ) : null}
        {kind === 'english' ? (
          <G fill={c} fillOpacity={0.35} stroke={c} strokeWidth="4" strokeLinecap="round">
            <Path d="M62 30 A22 22 0 1 0 62 70 A16 16 0 1 1 62 30 Z" />
          </G>
        ) : null}
      </G>
    </Svg>
  );
}

const RELIC_GLYPH: Record<string, string> = {
  'first-lecture': 'M50 30 L50 66 M34 46 L50 30 L66 46',
  'ten-lectures': 'M34 34 L34 66 M46 34 L46 66 M58 34 L58 66 M70 34 L70 66',
  practice: 'M32 66 L44 40 L54 56 L68 32',
  blackbook: 'M34 34 L66 34 L66 68 L34 68 Z M42 44 L58 44 M42 54 L58 54',
  'streak-7': 'M50 28 Q64 46 56 58 Q64 56 62 68 Q50 78 38 68 Q34 56 44 48 Q44 38 50 28 Z',
  'streak-30': 'M50 24 Q68 44 58 58 Q70 58 66 72 Q50 84 34 72 Q30 58 42 50 Q42 36 50 24 Z M50 50 L50 66',
  'first-boss': 'M32 36 L50 28 L68 36 L66 58 L50 72 L34 58 Z M42 46 L58 46',
  'hundred-lectures': 'M32 66 L32 34 L44 34 M50 34 L62 34 L62 66 L50 66 Z M68 34 L68 66 L80 66 L80 34 Z',
  'ncert-master': 'M50 36 Q38 28 26 32 L26 64 Q38 60 50 68 Q62 60 74 64 L74 32 Q62 28 50 36 Z',
  'vocab-master': 'M64 26 Q46 38 38 62 L36 72 L46 66 Q60 54 66 26 Z',
};

export function RelicArt({ id, earned, size = 64 }: { id: string; earned: boolean; size?: number }) {
  const c = earned ? (id.startsWith('streak') ? arise.ember : id.includes('master') || id === 'hundred-lectures' ? arise.gold : arise.cyan) : '#3C5170';
  const gid = `relic-${id}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs>
        <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c} stopOpacity={earned ? 0.4 : 0.12} />
          <Stop offset="1" stopColor={c} stopOpacity={0.05} />
        </SvgGradient>
      </Defs>
      <Polygon points="50,4 86,22 94,58 70,92 30,92 6,58 14,22" fill={`url(#${gid})`} stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
      <Polygon points="50,14 78,28 84,56 66,82 34,82 16,56 22,28" fill="none" stroke={c} strokeOpacity={0.35} strokeWidth="0.8" />
      <Path d={RELIC_GLYPH[id] ?? RELIC_GLYPH.practice} fill={id.startsWith('streak') && earned ? c : 'none'} fillOpacity={0.35} stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Mote({ x, delay, duration, size, color }: { x: number; delay: number; duration: number; size: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [p, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value * 5 : (1 - p.value) * 0.9,
    transform: [{ translateY: -p.value * 150 }, { translateX: Math.sin(p.value * 6.28) * 6 }],
  }));
  return <Animated.View style={[{ position: 'absolute', bottom: 0, left: `${x}%`, width: size, height: size, borderRadius: size, backgroundColor: color }, style]} />;
}

/** Lightweight ambient motes (8 native-driven dots). Static when reducedMotion. */
export function ParticleField({ reducedMotion, style, color = arise.cyan, secondaryColor = arise.violet }: { reducedMotion: boolean; style?: StyleProp<ViewStyle>; color?: string; secondaryColor?: string }) {
  const motes = useMemo(() => [8, 19, 31, 42, 55, 66, 78, 90].map((x, i) => ({
    x, delay: i * 420, duration: 4200 + (i % 4) * 900, size: 2 + (i % 3),
    color: i % 3 === 0 ? secondaryColor : color,
  })), [color, secondaryColor]);
  if (reducedMotion) return null;
  return (
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {motes.map((m) => <Mote key={m.x} {...m} />)}
    </View>
  );
}

/** Legacy API over the shared angular metal/HUD surface. */
export function GlassPanel({ children, style, tone = 'cyan' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'cyan' | 'violet' | 'gold' | 'danger' }) {
  const edge = tone === 'violet' ? arise.violet : tone === 'gold' ? arise.gold : tone === 'danger' ? arise.danger : arise.cyan;
  return (
    <HudFrame accent={edge} style={[glass.wrap, style]}>
      <LinearGradient colors={[`${edge}12`, 'rgba(8,10,17,0.0)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[glass.edge, { backgroundColor: `${edge}77` }]} />
      {children}
    </HudFrame>
  );
}

const glass = StyleSheet.create({
  wrap: { borderRadius: 3, padding: 16 },
  edge: { position: 'absolute', top: 0, left: 24, right: 24, height: 1 },
});

/** Navigate to a mission's canonical activity route. */
export function openMissionRoute(m: Pick<MissionDescriptor, 'route' | 'routeParams'>) {
  const [path, query] = m.route.split('?');
  const params: Record<string, string> = {};
  if (query) query.split('&').forEach((kv) => { const [k, v] = kv.split('='); if (k) params[k] = decodeURIComponent(v ?? ''); });
  Object.assign(params, m.routeParams ?? {});
  router.push((Object.keys(params).length ? { pathname: path, params } : path) as never);
}
