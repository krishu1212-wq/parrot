import { useEffect, useId } from 'react';
import { Platform } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SG, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { arise } from '@/constants/colors';
import type { GateType, ItemCategory, ItemRarity } from '@/contexts/rpgTypes';

export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: arise.silver, rare: arise.azure, epic: arise.violet, legendary: arise.gold, mythic: arise.danger,
};
export const GATE_COLOR: Record<GateType, string> = {
  normal: arise.cyan, difficult: arise.violet, special: arise.gold, boss: arise.danger,
};
export const RARITIES: ItemRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const formatSeconds = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, '0')}`;
};

const GLYPH: Record<ItemCategory, string> = {
  keys: 'M38 50 A10 10 0 1 1 38 49.9 M48 50 L72 50 M64 50 L64 60 M72 50 L72 58',
  potions: 'M44 30 L56 30 M46 30 L46 44 L34 68 Q32 74 40 74 L60 74 Q68 74 66 68 L54 44 L54 30 M40 60 L60 60',
  revision: 'M30 50 A20 20 0 1 1 40 67 M30 50 L30 38 M30 50 L42 50',
  'quest-items': 'M50 28 L72 40 L72 60 L50 72 L28 60 L28 40 Z M50 40 L50 60 M40 50 L60 50',
  'relic-fragments': 'M50 28 L66 46 L56 72 L36 62 L34 42 Z M50 28 L50 50 L66 46 M50 50 L36 62',
  'xp-items': 'M50 26 L64 50 L50 74 L36 50 Z M36 50 L64 50',
  'special-rewards': 'M30 44 L70 44 L70 72 L30 72 Z M30 44 L36 30 L64 30 L70 44 M50 44 L50 72',
};

const ID_GLYPH: Record<string, string> = {
  'scholar-core': 'M50 28 L68 38 L68 62 L50 72 L32 62 L32 38 Z M50 40 Q42 50 50 60 Q58 50 50 40',
  'revision-relic': 'M34 30 L66 30 M34 72 L66 72 M36 30 L50 50 L36 72 M64 30 L50 50 L64 72',
  'calculation-gauntlet': 'M36 34 L64 34 L68 56 L58 72 L42 72 L32 56 Z M42 46 L58 46 M50 40 L50 58',
  'focus-crystal': 'M50 26 L62 42 L50 74 L38 42 Z M38 42 L62 42 M50 26 L50 74',
  'sentinel-sigil': 'M32 32 L50 26 L68 32 L66 58 L50 74 L34 58 Z M50 36 L50 62 M40 48 L60 48',
  'achievement-relic': 'M50 24 L56 42 L74 42 L60 54 L66 72 L50 61 L34 72 L40 54 L26 42 L44 42 Z',
  'quest-lens': 'M50 50 m-18 0 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 M50 50 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M64 64 L74 74',
  'reward-chest': 'M28 48 Q28 32 50 32 Q72 32 72 48 L72 72 L28 72 Z M28 48 L72 48 M46 48 L46 58 L54 58 L54 48',
  'study-coins': 'M50 28 m-20 22 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0 M50 38 L50 62 M42 44 L58 44',
  'life-potion': 'M44 28 L56 28 M46 28 L46 42 L32 68 Q30 76 40 76 L60 76 Q70 76 68 68 L54 42 L54 28 M50 52 L50 66 M43 59 L57 59',
};

/** Original artifact bodies: filled glass, faceted crystal, metal and relic geometry. */
function ArtifactBody({ id, category, gradient, color }: { id: string; category: ItemCategory; gradient: string; color: string }) {
  const fill = `url(#${gradient})`;
  if (category === 'xp-items' || id === 'focus-crystal' || category === 'relic-fragments') return (
    <G stroke={color} strokeWidth="0.7">
      <Path d={category === 'relic-fragments' ? 'M50 28 L66 46 L56 72 L36 62 L34 42 Z' : 'M50 25 L65 48 L50 75 L35 48 Z'} fill={fill} />
      <Path d="M50 29 L43 48 L50 70 L57 48 Z" fill={color} fillOpacity={0.85} />
      <Path d="M50 29 L43 48 L36 48 Z" fill={arise.ink} fillOpacity={0.8} stroke="none" />
      <Path d="M50 70 L57 48 L64 48 Z" fill={arise.abyss} fillOpacity={0.5} stroke="none" />
    </G>
  );
  if (id === 'life-potion' || category === 'potions') return (
    <G>
      <Path d="M45 30 H55 V43 L68 68 Q71 77 60 78 H40 Q29 77 32 68 L45 43 Z" fill={fill} stroke={color} strokeWidth="1.5" />
      <Path d="M38 61 Q47 55 54 61 Q60 64 64 60 L67 70 Q65 75 58 75 H42 Q35 75 34 70 Z" fill={color} fillOpacity={0.8} />
      <Path d="M43 26 H57 V34 H43 Z" fill={arise.gold} stroke={arise.silver} strokeWidth="1" />
      <Path d="M40 55 L36 67 M43 46 L40 52" stroke={arise.ink} strokeOpacity={0.8} strokeWidth="2" />
      <Circle cx="55" cy="65" r="2" fill={arise.ink} /><Circle cx="45" cy="70" r="1" fill={arise.ink} />
    </G>
  );
  if (id === 'reward-chest') return (
    <G stroke={arise.gold} strokeWidth="1">
      <Path d="M28 47 L36 29 H64 L72 47 V71 L50 79 L28 71 Z" fill={fill} />
      <Path d="M28 47 H72 L50 54 Z" fill={arise.gold} fillOpacity={0.55} />
      <Path d="M33 38 H67 M36 48 V72 M64 48 V72" fill="none" />
      <Path d="M46 46 H54 V58 L50 62 L46 58 Z" fill={arise.violet} stroke={arise.ink} />
      <Path d="M31 59 L45 64 M69 59 L55 64" stroke={arise.ink} strokeOpacity={0.5} />
    </G>
  );
  if (id === 'study-coins') return (
    <G stroke={arise.gold} strokeWidth="1.3">
      <Ellipse cx="43" cy="61" rx="19" ry="9" fill={fill} /><Ellipse cx="57" cy="54" rx="19" ry="9" fill={fill} />
      <Circle cx="50" cy="45" r="19" fill={fill} />
      <Circle cx="50" cy="45" r="14" fill="none" stroke={arise.ink} strokeOpacity={0.55} />
      <Path d="M50 34 L56 45 L50 57 L44 45 Z" fill={arise.gold} stroke={arise.ink} />
    </G>
  );
  if (id === 'gate-key') return (
    <G fill={fill} stroke={arise.silver} strokeWidth="1.2">
      <Path d="M38 36 L47 41 V55 L38 63 L29 56 V42 Z M46 48 H73 V56 H67 V64 H61 V56 H46 Z" />
      <Circle cx="38" cy="49" r="4" fill={arise.abyss} stroke={color} />
      <Path d="M56 49 H70" stroke={arise.ink} strokeWidth="2" />
    </G>
  );
  if (id === 'revision-token' || id === 'quest-lens') return (
    <G stroke={color} fill="none">
      <Circle cx="50" cy="50" r="24" fill={fill} strokeWidth="2" />
      <Circle cx="50" cy="50" r="17" stroke={arise.silver} strokeWidth="1" />
      <Path d="M31 37 L38 32 M63 68 L69 63 M50 25 V31 M50 69 V75" strokeWidth="3" />
      <Circle cx="50" cy="50" r="8" fill={color} fillOpacity={0.6} stroke={arise.ink} />
    </G>
  );
  if (id === 'calculation-gauntlet') return (
    <G fill={fill} stroke={arise.silver} strokeWidth="1">
      <Path d="M32 32 H68 L74 53 L62 73 H38 L26 53 Z" />
      <Path d="M35 33 L42 47 L38 66 M65 33 L58 47 L62 66 M42 47 H58 V63 H42 Z" fill={arise.abyss} stroke={color} />
      <Path d="M47 43 L54 52 L48 59 L43 51 Z" fill={color} stroke={arise.ink} />
      <Path d="M38 73 H62 V78 H38 Z" fill={arise.silver} fillOpacity={0.45} />
    </G>
  );
  return <G fill={fill} stroke={color} strokeWidth="1.2"><Polygon points="50,25 71,39 66,66 50,77 34,66 29,39" /><Path d="M50 32 L61 49 L50 69 L39 49 Z" fill={color} fillOpacity={0.4} /><Path d="M34 43 L40 40 M60 60 L66 57" stroke={arise.ink} strokeWidth="2" /></G>;
}

/** Metallic rarity frame and original layered artifact illustration. */
export function ItemIcon({ category, rarity, id, size = 64, dim = false }: { category: ItemCategory; rarity: ItemRarity; id: string; size?: number; dim?: boolean }) {
  const c = dim ? '#3C5170' : RARITY_COLOR[rarity];
  const gid = `ii-${id}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs>
        <SG id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c} stopOpacity={dim ? 0.1 : 0.45} />
          <Stop offset="1" stopColor={c} stopOpacity={0.04} />
        </SG>
        <SG id={`${gid}-metal`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={arise.silver} stopOpacity={dim ? 0.15 : 0.85} />
          <Stop offset="0.42" stopColor={c} stopOpacity={dim ? 0.15 : 0.65} />
          <Stop offset="1" stopColor={arise.abyss} />
        </SG>
      </Defs>
      <Polygon points="50,4 90,26 90,74 50,96 10,74 10,26" fill={`url(#${gid})`} stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <Polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill={arise.abyss} fillOpacity={0.6} stroke={arise.silver} strokeOpacity={0.14} />
      <Path d="M14 31 V42 M86 58 V69 M40 12 L50 6 L60 12" fill="none" stroke={dim ? c : arise.silver} strokeOpacity={0.65} strokeWidth="1.3" />
      {rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic' ? <Polygon points="50,12 82,30 82,70 50,88 18,70 18,30" fill="none" stroke={c} strokeOpacity={0.45} strokeWidth="1" /> : null}
      {rarity === 'mythic' && !dim ? <Circle cx="50" cy="50" r="46" fill="none" stroke={c} strokeOpacity={0.5} strokeDasharray="4 6" /> : null}
      {rarity === 'legendary' && !dim ? <Path d="M50 0 L50 8 M0 50 L8 50 M100 50 L92 50" stroke={c} strokeWidth="2" /> : null}
      <G opacity={dim ? 0.3 : 1}><ArtifactBody id={id} category={category} gradient={`${gid}-metal`} color={c} /></G>
      <Path d={ID_GLYPH[id] ?? GLYPH[category]} fill="none" stroke={dim ? '#4D6585' : arise.ink} strokeOpacity={dim ? 0.45 : 0.75} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Original holographic gate portal; shape/palette per gate type. */
export function GatePortal({ type, size = 96, locked = false, cleared = false }: { type: GateType; size?: number; locked?: boolean; cleared?: boolean }) {
  const c = locked ? '#4D6585' : GATE_COLOR[type];
  const rings = type === 'boss' ? 3 : type === 'special' ? 2 : 1;
  const gid = `portal-${type}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs>
        <SG id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c} stopOpacity={0.55} />
          <Stop offset="1" stopColor={c} stopOpacity={0.05} />
        </SG>
        <RadialGradient id={`${gid}-energy`} cx="50%" cy="45%" r="58%">
          <Stop offset="0" stopColor={locked ? arise.abyss : arise.ink} stopOpacity={locked ? 0.2 : 0.85} />
          <Stop offset="0.3" stopColor={c} stopOpacity={0.65} />
          <Stop offset="1" stopColor={arise.abyss} stopOpacity={0.5} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50" cy="50" rx="30" ry="43" stroke={c} strokeWidth="3.2" fill={`url(#${gid}-energy)`} />
      <Ellipse cx="50" cy="50" rx="35" ry="47" stroke={arise.silver} strokeWidth="1" strokeOpacity={locked ? 0.15 : 0.55} fill="none" strokeDasharray={type === 'normal' ? '16 4' : type === 'boss' ? '6 4' : '22 8'} />
      {Array.from({ length: rings }, (_, i) => (
        <Ellipse key={i} cx="50" cy="50" rx={24 - i * 4} ry={37 - i * 5} fill="none" stroke={c} strokeOpacity={0.9 - i * 0.25} strokeWidth="1.2" strokeDasharray={type === 'boss' ? '8 3' : undefined} />
      ))}
      {!locked ? <Path d="M30 60 L44 38 L39 53 L54 34 L48 54 L65 44 L55 69 M32 25 L42 29 M65 70 L70 76" fill="none" stroke={arise.ink} strokeOpacity={0.7} strokeWidth="0.8" /> : null}
      <Path d="M16 21 L23 24 L18 32 L12 28 Z M83 67 L89 73 L84 81 L79 74 Z M36 4 L40 9 L35 14 L31 9 Z" fill={c} fillOpacity={0.75} stroke={arise.silver} strokeOpacity={0.45} strokeWidth="0.7" />
      {type === 'difficult' ? <Path d="M10 94 L20 60 M90 94 L80 60 M14 40 L22 46 M86 40 L78 46" stroke={c} strokeWidth="2" strokeLinecap="round" /> : null}
      {type === 'special' ? <G fill={c}><Polygon points="50,0 54,6 50,12 46,6" /><Circle cx="18" cy="30" r="2" /><Circle cx="82" cy="30" r="2" /></G> : null}
      {type === 'boss' ? <Path d="M14 40 L4 24 L18 30 Z M86 40 L96 24 L82 30 Z M42 6 L50 -2 L58 6" fill={c} fillOpacity={0.7} stroke={c} /> : null}
      {type === 'normal' ? <Path d="M42 60 L50 52 L58 60" fill="none" stroke={c} strokeWidth="2" /> : null}
      {cleared ? <Path d="M38 64 L47 74 L64 50" fill="none" stroke={arise.success} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {locked ? <Path d="M40 62 L60 62 L60 78 L40 78 Z M44 62 L44 55 Q50 48 56 55 L56 62" fill="none" stroke={c} strokeWidth="2.4" /> : null}
    </Svg>
  );
}

/** Original faceted armor scan with readable attachment points. */
export function SuitSilhouette({ color = arise.cyan, height = 260 }: { color?: string; height?: number }) {
  const gid = `suit-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg width={height * 0.5} height={height} viewBox="0 0 100 200" accessible={Platform.OS === 'web' ? undefined : false} aria-hidden={true}>
      <Defs>
        <SG id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0.03} />
        </SG>
      </Defs>
      <Path d="M50 8 Q64 8 64 26 Q64 40 56 44 L56 50 Q86 56 88 84 L84 120 L72 120 L72 100 L68 100 L70 196 L54 196 L50 130 L46 196 L30 196 L32 100 L28 100 L28 120 L16 120 L12 84 Q14 56 44 50 L44 44 Q36 40 36 26 Q36 8 50 8 Z" fill={`url(#${gid})`} stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <Path d="M36 22 L50 14 L64 22 L57 38 L50 43 L43 38 Z M50 14 V27 M20 62 L37 52 L32 82 L17 91 Z M80 62 L63 52 L68 82 L83 91 Z M34 91 L50 103 L66 91 L62 122 H38 Z M37 134 L46 144 L40 185 M63 134 L54 144 L60 185" fill={arise.abyss} fillOpacity={0.7} stroke={arise.silver} strokeOpacity={0.5} strokeWidth="0.8" />
      <Path d="M44 70 L56 70 M50 62 L50 90 M40 26 L60 26" stroke={color} strokeOpacity={0.6} strokeWidth="1.2" />
      <Circle cx="50" cy="78" r="6" fill="none" stroke={color} strokeOpacity={0.8} />
    </Svg>
  );
}

/** Slow pulse wrapper (static when reduced). */
export function Pulse({ children, reduced, style }: { children: React.ReactNode; reduced: boolean; style?: object }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) { p.value = 0; return; }
    p.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(p);
  }, [p, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: 0.8 + p.value * 0.2, transform: [{ scale: 1 + p.value * 0.04 }] }));
  return <Animated.View style={[style, reduced ? null : a]}>{children}</Animated.View>;
}
