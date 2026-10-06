import { useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { arise } from '@/constants/colors';
import { ParticleField } from '@/components/AriseArt';
import { WorldArtwork } from '@/components/VisualWorld';
import { getItemDefinition } from '@/contexts/rpgCatalog';
import type { RpgEvent } from '@/contexts/rpgTypes';
import { ItemIcon, RARITY_COLOR } from './rpgArt';
import { HudButton } from './RpgBits';

export function RewardItemCard({ itemId, quantity, floatStyle }: { itemId: string; quantity: number; floatStyle?: object }) {
  const d = getItemDefinition(itemId);
  if (!d) return null;
  const c = RARITY_COLOR[d.rarity];
  return (
    <View testID={`reward-item-${d.id}`} style={[s.card, { borderColor: c }]}>
      <View style={[s.cardGlow, { backgroundColor: c }]} />
      <Animated.View style={floatStyle}><ItemIcon id={d.id} category={d.category} rarity={d.rarity} size={56} /></Animated.View>
      <Text style={[s.rName, { color: c }]} numberOfLines={2}>{d.name}</Text>
      <Text style={s.rQty}>x{quantity}</Text>
      <Text style={[s.rRar, { color: c }]}>{d.rarity.toUpperCase()}</Text>
    </View>
  );
}

function ChestArt({ color }: { color: string }) {
  return (
    <Svg width={150} height={110} viewBox="0 0 150 110">
      <Defs>
        <LinearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#7A5A2E" /><Stop offset="1" stopColor="#1A1410" /></LinearGradient>
      </Defs>
      <Path d="M18 48 L132 48 L128 100 L22 100 Z" fill="url(#cb)" stroke={color} strokeWidth="2" />
      <Rect x="68" y="48" width="14" height="52" fill="#2A2018" stroke={color} strokeWidth="1" />
      <Path d="M62 62 L88 62 L88 76 L75 84 L62 76 Z" fill={color} />
      <Path d="M18 48 L22 100 M132 48 L128 100" stroke="#E4C27A" strokeWidth="3" />
    </Svg>
  );
}
function ChestLid({ color }: { color: string }) {
  return (
    <Svg width={150} height={50} viewBox="0 0 150 50">
      <Path d="M14 48 Q16 6 75 4 Q134 6 136 48 Z" fill="#5A4120" stroke={color} strokeWidth="2" />
      <Path d="M75 4 L75 48" stroke="#E4C27A" strokeWidth="3" />
      <Path d="M30 40 Q34 16 75 12" stroke="#E4C27A" strokeOpacity={0.5} strokeWidth="1.5" fill="none" />
    </Svg>
  );
}

export function RewardChestReveal({ event, reduced, onDismiss }: { event: RpgEvent; reduced: boolean; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withTiming(1, { duration: 4200, easing: Easing.linear }); }, [p, reduced]);
  const fl = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => { fl.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true); }, 3200);
    return () => { clearTimeout(t); cancelAnimation(fl); };
  }, [fl, reduced]);
  const floatS = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(fl.value, [0, 1], [2, -5]) }, { rotate: `${interpolate(fl.value, [0, 1], [-4, 4])}deg` }] }));
  const color = arise.gold;
  const items = event.rewards?.items ?? [];
  const R = (v: number[], o: number[]) => interpolate(p.value, v, o, Extrapolation.CLAMP);

  const chest = useAnimatedStyle(() => ({ opacity: R([0, 0.18], [0, 1]), transform: [{ scale: R([0, 0.18, 0.5, 0.62], [0.5, 1, 1, 0.8]) }, { translateY: R([0.62, 1], [0, -10]) }] }));
  const lid = useAnimatedStyle(() => ({ transform: [{ translateY: R([0.5, 0.65], [0, -34]) }, { rotate: `${R([0.5, 0.65], [0, -28])}deg` }] }));
  const gather = useAnimatedStyle(() => ({ opacity: R([0.15, 0.3, 0.5], [0, 0.7, 0]), transform: [{ scale: R([0.15, 0.5], [2.2, 0.4]) }] }));
  const burst = useAnimatedStyle(() => ({ opacity: R([0.5, 0.6, 0.85], [0, 0.9, 0]), transform: [{ scale: R([0.5, 0.85], [0.2, 3]) }] }));
  const list = useAnimatedStyle(() => ({ opacity: R([0.68, 0.85], [0, 1]), transform: [{ translateY: R([0.68, 0.85], [16, 0]) }] }));
  const titleS = useAnimatedStyle(() => ({ opacity: R([0.6, 0.75], [0, 1]) }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View testID="rpg-chest-reveal" style={s.back}>
        <WorldArtwork scene="vault" opacity={0.9} />
        <ParticleField reducedMotion={reduced} />
        <View style={{ paddingTop: insets.top + 16, alignItems: 'center' }}>
          <Text style={[s.sys, { color }]}>SYSTEM · VAULT SEAL BROKEN</Text>
          <View style={s.stage} accessible={false}>
            <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color }, reduced ? { opacity: 0 } : gather]} />
            <Animated.View pointerEvents="none" style={[s.burst, { backgroundColor: '#FFF3CF' }, reduced ? { opacity: 0 } : burst]} />
            <Animated.View style={[{ alignItems: 'center' }, reduced ? null : chest]}>
              <Animated.View style={[{ marginBottom: -4, zIndex: 2 }, reduced ? { transform: [{ translateY: -34 }, { rotate: '-28deg' }] } : lid]}><ChestLid color={color} /></Animated.View>
              <ChestArt color={color} />
            </Animated.View>
          </View>
          <Animated.Text accessibilityRole="header" style={[s.title, reduced ? null : titleS]}>CHEST OPENED</Animated.Text>
          {event.xpDelta ? <Text style={s.xp}>{event.xpDelta > 0 ? '+' : ''}{event.xpDelta} XP</Text> : null}
        </View>
        <ScrollView style={{ flex: 1, alignSelf: 'stretch' }} contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
          <Animated.View style={[s.grid, reduced ? null : list]}>
            {items.map((r) => <RewardItemCard key={r.itemId} itemId={r.itemId} quantity={r.quantity} floatStyle={reduced ? undefined : floatS} />)}
          </Animated.View>
          {!items.length ? <Text style={s.empty}>Chest contents were recorded in your inventory.</Text> : null}
          {items.length ? <Text style={s.empty}>Added to your inventory.</Text> : null}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, alignSelf: 'stretch' }}>
          <HudButton testID="rpg-feedback-dismiss" label="CONTINUE" color={color} solid onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: arise.abyss },
  sys: { fontSize: 11, fontWeight: '800', letterSpacing: 2.4 },
  stage: { width: 240, height: 190, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 2 },
  burst: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  title: { color: arise.ink, fontSize: 24, fontWeight: '800', letterSpacing: 2 },
  xp: { color: arise.gold, fontSize: 18, fontWeight: '800', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  card: { width: 100, borderWidth: 1.5, backgroundColor: 'rgba(6,12,24,0.82)', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, overflow: 'hidden', borderTopLeftRadius: 14, borderBottomRightRadius: 14 },
  cardGlow: { position: 'absolute', top: -30, width: 90, height: 90, borderRadius: 45, opacity: 0.18 },
  rName: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  rQty: { color: arise.ink, fontSize: 14, fontWeight: '800' },
  rRar: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  empty: { color: arise.inkSoft, fontSize: 12, marginTop: 12, textAlign: 'center' },
});
