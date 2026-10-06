import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { HudFrame as Frame, WorldArtwork } from '@/components/VisualWorld';
import ScreenShell from '@/components/ScreenShell';
import { useReducedMotionPreference } from '@/components/SystemAnimations';
import { ItemIcon, Pulse, RARITY_COLOR, SuitSilhouette } from '@/components/rpg/rpgArt';
import { HudButton, RpgErrorBanner } from '@/components/rpg/RpgBits';
import { useStudy } from '@/contexts/StudyContext';
import { EQUIPMENT_SLOTS, ITEM_DEFINITIONS, getItemDefinition } from '@/contexts/rpgCatalog';
import type { EquipmentSlot } from '@/contexts/rpgTypes';

const SLOT_LABEL: Record<string, string> = {
  'xp-boost': 'XP BOOST', 'quest-modifier': 'QUEST MOD', revision: 'REVISION', 'boss-entry': 'BOSS ENTRY', 'study-boost': 'STUDY BOOST', 'achievement-relic': 'ACHIEVEMENT',
};

export default function LoadoutScreen() {
  const { rpg, equipItem, unequipSlot } = useStudy();
  const reduced = useReducedMotionPreference();
  const params = useLocalSearchParams<{ item?: string }>();
  const preItem = typeof params.item === 'string' ? getItemDefinition(params.item) : undefined;
  const [slot, setSlot] = useState<EquipmentSlot>((preItem?.equipmentSlot ?? EQUIPMENT_SLOTS[0]) as EquipmentSlot);
  const slots = EQUIPMENT_SLOTS as readonly EquipmentSlot[];
  const equippedId = rpg.loadout[slot];
  const equipped = equippedId ? getItemDefinition(equippedId) : undefined;
  const candidates = ITEM_DEFINITIONS.filter((d) => d.equipmentSlot === slot && (rpg.inventory[d.id]?.quantity ?? 0) > 0);
  const fx = rpg.effects;
  const sig = slots.map((sl) => rpg.loadout[sl] ?? '-').join('|');
  const prevSig = useRef(sig);
  const flash = useSharedValue(0);
  const [flashColor, setFlashColor] = useState<string>(arise.violet);
  useEffect(() => {
    if (prevSig.current === sig) return;
    const a = prevSig.current.split('|'), n = sig.split('|');
    const i = n.findIndex((v, k) => v !== a[k]);
    prevSig.current = sig;
    const d = i >= 0 && n[i] !== '-' ? getItemDefinition(n[i]) : undefined;
    setFlashColor(d ? RARITY_COLOR[d.rarity] : arise.inkSoft);
    if (!reduced) flash.value = withSequence(withTiming(0.55, { duration: 140 }), withTiming(0, { duration: 520 }));
  }, [sig, reduced, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <ScreenShell kicker="ARISE · LOADOUT" title="Equipment">
      <RpgErrorBanner />
      <Frame accent={arise.violet} style={{ marginBottom: 14 }}><View testID="loadout-hero" style={{ alignItems: 'center', overflow: 'hidden' }}>
        <View style={s.stage}>
          <WorldArtwork scene="guardian" opacity={0.9} />
          <Animated.View pointerEvents="none" style={[s.flash, { backgroundColor: flashColor }, flashStyle]} />
          <Pulse reduced={reduced}><SuitSilhouette color={arise.violet} height={250} /></Pulse>
          <View style={s.slots} pointerEvents="box-none">
            {slots.map((sl, i) => {
              const id = rpg.loadout[sl]; const d = id ? getItemDefinition(id) : undefined;
              const left = i % 2 === 0;
              return (
                <Pressable key={sl} testID={`loadout-slot-${sl}`} accessibilityRole="button" accessibilityLabel={`${SLOT_LABEL[sl]} slot, ${d ? d.name : 'empty'}`} onPress={() => setSlot(sl)}
                  style={[s.slot, left ? { left: 8 } : { right: 8 }, { top: Math.floor(i / 2) * 82, borderColor: slot === sl ? '#FFFFFF' : d ? RARITY_COLOR[d.rarity] : arise.rail, borderStyle: d ? 'solid' : 'dashed', borderWidth: slot === sl ? 2 : 1, backgroundColor: d ? `${RARITY_COLOR[d.rarity]}26` : 'rgba(4,10,21,0.8)', shadowColor: d ? RARITY_COLOR[d.rarity] : 'transparent', shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}>
                  {d ? <ItemIcon id={d.id} category={d.category} rarity={d.rarity} size={36} /> : <Text style={s.empty}>+</Text>}
                  <Text style={s.slotL} numberOfLines={1}>{SLOT_LABEL[sl]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View></Frame>

      <Frame accent={RARITY_COLOR[(equipped ?? candidates[0])?.rarity ?? 'epic']} style={{ marginBottom: 14 }}><View style={{ padding: 14 }}>
        <Text style={s.k}>{SLOT_LABEL[slot]} SLOT</Text>
        {equipped ? (
          <View style={{ gap: 6, marginTop: 6 }}>
            <Text style={[s.name, { color: RARITY_COLOR[equipped.rarity] }]}>{equipped.name}</Text>
            <Text style={s.meta}>{equipped.description}</Text>
            {equipped.effectLabel ? <Text style={[s.meta, { color: arise.cyan }]}>{equipped.effectLabel}</Text> : null}
            <HudButton testID={`loadout-unequip-${slot}`} label="UNEQUIP" icon="minus-circle" color={arise.danger} onPress={() => unequipSlot(slot)} />
          </View>
        ) : <Text style={[s.meta, { marginTop: 6 }]}>Slot empty.</Text>}
        <Text style={[s.k, { marginTop: 14 }]}>COMPATIBLE OWNED ITEMS</Text>
        {candidates.length === 0 ? <Text style={[s.meta, { marginTop: 6 }]}>No owned items fit this slot. Clear Gates to earn some.</Text> : candidates.map((d) => {
          const same = equippedId === d.id;
          return (
            <View key={d.id} style={s.cand}>
              <ItemIcon id={d.id} category={d.category} rarity={d.rarity} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { fontSize: 14, color: RARITY_COLOR[d.rarity] }]}>{d.name}</Text>
                <Text style={s.meta}>{d.effectLabel ?? d.description}</Text>
              </View>
              <HudButton testID={`loadout-equip-${d.id}`} label={same ? 'EQUIPPED' : 'EQUIP'} color={arise.violet} solid disabled={same} onPress={() => equipItem(d.id)} />
            </View>
          );
        })}
      </View></Frame>

      <Frame accent={arise.gold}><View style={{ padding: 14 }}>
        <Text style={[s.k, { color: arise.gold }]}>ACTIVE EFFECTS · {slots.filter((sl) => rpg.loadout[sl]).length}/6 SLOTS</Text>
        {fx.labels.length ? fx.labels.map((l) => <Text key={l} style={[s.meta, { color: arise.ink, marginTop: 4 }]}>{l}</Text>) : <Text style={[s.meta, { marginTop: 4 }]}>No effects active.</Text>}
        <Text style={[s.meta, { marginTop: 8 }]}>NCERT +{fx.ncertXpPercent}% · Calculation +{fx.calculationXpPercent}% · Quest +{fx.questXpPercent}% · Gate XP +{fx.gateXpPercent}%</Text>
        <Text style={s.meta}>Revision clock x{fx.revisionTimeMultiplier} · Boss start +{fx.bossTimeBonusSeconds}s</Text>
      </View></Frame>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  stage: { width: '100%', height: 270, alignItems: 'center', justifyContent: 'center' },
  slots: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 6 },
  slot: { position: 'absolute', width: 88, minHeight: 72, borderRadius: 3, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  flash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  slotL: { color: arise.inkSoft, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  empty: { color: arise.lockedTone, fontSize: 26, fontWeight: '300' },
  k: { color: arise.violet, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  name: { color: arise.ink, fontSize: 17, fontWeight: '800' },
  meta: { color: arise.inkSoft, fontSize: 12, lineHeight: 17 },
  cand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
});
