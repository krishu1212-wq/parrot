import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppState, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { arise } from '@/constants/colors';
import { ParticleField } from '@/components/AriseArt';
import { WorldArtwork } from '@/components/VisualWorld';
import { SystemNotificationToast, useReducedMotionPreference } from '@/components/SystemAnimations';
import { useStudy } from '@/contexts/StudyContext';
import { getGateDefinition, getItemDefinition } from '@/contexts/rpgCatalog';
import { getActiveGateAttempt } from '@/contexts/rpgSystem';
import type { RpgEvent } from '@/contexts/rpgTypes';
import { GATE_COLOR, GatePortal, ItemIcon, RARITY_COLOR } from './rpgArt';
import { HudButton } from './RpgBits';
import { RewardChestReveal, RewardItemCard } from './RewardChestReveal';


const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export function RpgFeedback() {
  const { rpg, acknowledgeRpgPresentation, refreshRpgClock } = useStudy();
  const reduced = useReducedMotionPreference();
  const refreshRef = useRef(refreshRpgClock);
  refreshRef.current = refreshRpgClock;
  const rpgRef = useRef(rpg);
  rpgRef.current = rpg;

  // Clock expiry check: resume + sparse interval; never writes state itself.
  useEffect(() => {
    const check = () => {
      const a = getActiveGateAttempt(rpgRef.current);
      if (a && Date.parse(a.deadlineAt) <= Date.now()) refreshRef.current();
    };
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    const t = setInterval(check, 5000);
    check();
    return () => { sub.remove(); clearInterval(t); };
  }, []);

  const event: RpgEvent | undefined = useMemo(() => {
    const id = rpg?.presentationQueue?.[0];
    return id ? rpg.events.find((e) => e.id === id) : undefined;
  }, [rpg]);

  const dismiss = () => { if (event) acknowledgeRpgPresentation(event.id); };
  // Unknown/invalid queue head: ack so queue never wedges.
  useEffect(() => {
    const id = rpg?.presentationQueue?.[0];
    if (id && !event) acknowledgeRpgPresentation(id);
  }, [event, rpg, acknowledgeRpgPresentation]);

  const insets = useSafeAreaInsets();
  const queueRef = useRef(rpg.presentationQueue);
  queueRef.current = rpg.presentationQueue;
  const ackRef = useRef(acknowledgeRpgPresentation);
  ackRef.current = acknowledgeRpgPresentation;
  const eventId = event?.id;
  // Toast auto-ack: only if this event is still the queue head (account-switch safe); never awards.
  const toastDone = useCallback(() => {
    if (eventId && queueRef.current?.[0] === eventId) ackRef.current(eventId);
  }, [eventId]);

  if (!event) return null;
  if (event.type === 'equipment.equipped' || event.type === 'equipment.unequipped') {
    const item = getItemDefinition(typeof event.metadata?.itemId === 'string' ? event.metadata.itemId : '');
    const slot = typeof event.metadata?.slot === 'string' ? event.metadata.slot.replace('-', ' ') : '';
    const equipped = event.type === 'equipment.equipped';
    return (
      <SystemNotificationToast
        key={event.id}
        event={{ id: event.id, kind: equipped ? 'equipment-equipped' : 'equipment-unequipped', detail: `${item?.name ?? 'Item'}${slot ? ` · ${slot} slot` : ''}${equipped && item?.effectLabel ? ` · ${item.effectLabel}` : ''}` }}
        top={insets.top + (Platform.OS === 'web' ? 67 : 8)}
        reducedMotion={reduced}
        onDismiss={toastDone}
      />
    );
  }
  if (event.type === 'chest.opened') return <RewardChestReveal key={event.id} event={event} reduced={reduced} onDismiss={dismiss} />;
  return <Reveal key={event.id} event={event} reduced={reduced} onDismiss={dismiss} />;
}

function Reveal({ event, reduced, onDismiss }: { event: RpgEvent; reduced: boolean; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [p, reduced]);
  const emb = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: interpolate(p.value, [0, 1], [0.6, 1]) }] }));
  const halo = useAnimatedStyle(() => ({ opacity: p.value * 0.5, transform: [{ scale: interpolate(p.value, [0, 1], [0.3, 1.3]) }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 1 - p.value * 0.6, transform: [{ scale: interpolate(p.value, [0, 1], [0.4, 1.6]) }] }));

  const md = event.metadata ?? {};
  const gate = getGateDefinition(str(md.gateId) ?? '');
  const item = getItemDefinition(str(md.itemId) ?? '');
  const slot = str(md.slot);
  const t = event.type;
  let title = 'SYSTEM UPDATE'; let sub = ''; let color: string = arise.cyan;
  let scene: 'core' | 'guardian' | 'gate' | 'vault' = 'core';
  let art: React.ReactNode = null;
  if (t.startsWith('gate.') && gate) {
    color = GATE_COLOR[gate.type]; scene = 'gate';
    art = <GatePortal type={gate.type} size={170} cleared={t === 'gate.cleared'} locked={t === 'gate.failed'} />;
    sub = gate.name;
    title = t === 'gate.unlocked' ? 'GATE AVAILABLE' : t === 'gate.entered' ? 'GATE ENTERED' : t === 'gate.cleared' ? 'GATE CLEARED' : 'GATE FAILED';
    if (t === 'gate.failed') color = arise.danger;
    if (t === 'gate.cleared') color = arise.gold;
  } else if (item) {
    color = RARITY_COLOR[item.rarity]; scene = item.rarity === 'legendary' || item.rarity === 'mythic' ? 'vault' : 'guardian';
    art = <ItemIcon id={item.id} category={item.category} rarity={item.rarity} size={140} />;
    sub = item.name;
    title = t === 'item.used' ? 'ITEM USED' : t === 'item.acquired' ? `${item.rarity.toUpperCase()} ACQUIRED` : t === 'equipment.equipped' ? 'EQUIPPED' : t === 'equipment.unequipped' ? 'UNEQUIPPED' : 'SYSTEM UPDATE';
  } else if (t.startsWith('equipment.')) { title = t === 'equipment.equipped' ? 'EQUIPPED' : 'UNEQUIPPED'; sub = slot ?? ''; }

  const rewardItems = event.rewards?.items ?? [];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View testID="rpg-reveal" style={s.back}>
        <WorldArtwork scene={scene} opacity={0.85} />
        <ParticleField reducedMotion={reduced} />
        <Animated.View pointerEvents="none" style={[s.halo, { backgroundColor: color, top: insets.top + 60 }, reduced ? { opacity: 0.2 } : halo]} />
        <ScrollView style={{ flex: 1, alignSelf: 'stretch' }} contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 16 }}>
          <Animated.View style={[{ alignItems: 'center' }, reduced ? null : emb]}>
            <Text style={[s.sys, { color }]}>[SYSTEM]</Text>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color }, reduced ? { opacity: 0.4 } : ring]} />
              {art}
            </View>
            <Text accessibilityRole="header" style={[s.title, { textShadowColor: color }]}>{title}</Text>
            {sub ? <Text style={s.sub}>{sub}</Text> : null}
            {event.xpDelta ? <Text testID="rpg-reveal-xp" style={[s.xp, { color: arise.gold }]}>{event.xpDelta > 0 ? '+' : ''}{event.xpDelta} XP</Text> : null}
            {rewardItems.length ? (
              <View style={s.rewards}>
                {rewardItems.map((r) => <RewardItemCard key={r.itemId} itemId={r.itemId} quantity={r.quantity} />)}
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, alignSelf: 'stretch' }}>
          <HudButton testID="rpg-feedback-dismiss" label="CONTINUE" color={color} onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: arise.abyss },
  halo: { position: 'absolute', alignSelf: 'center', width: 300, height: 300, borderRadius: 150 },
  ring: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 2 },
  sys: { fontSize: 11, fontWeight: '800', letterSpacing: 2.4, marginBottom: 12 },
  title: { color: arise.ink, fontSize: 26, fontWeight: '800', letterSpacing: 2, marginTop: 14, textAlign: 'center', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  sub: { color: '#C3D3EA', fontSize: 14, marginTop: 6, textAlign: 'center' },
  xp: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16 },
});
export default RpgFeedback;
