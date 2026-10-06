import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { arise } from '@/constants/colors';
import { BossEmblem, GlassPanel, GuardianArt, guardianKindFor, ParticleField } from '@/components/AriseArt';
import { WorldArtwork } from '@/components/VisualWorld';
import ScreenShell from '@/components/ScreenShell';
import { useReducedMotionPreference } from '@/components/SystemAnimations';
import { GATE_COLOR, GatePortal, ItemIcon, Pulse, RARITY_COLOR, formatSeconds } from '@/components/rpg/rpgArt';
import { HudButton, RpgErrorBanner, goTo } from '@/components/rpg/RpgBits';
import { useStudy } from '@/contexts/StudyContext';
import { GATE_DEFINITIONS, getGateDefinition, getGateEligibility, getItemDefinition } from '@/contexts/rpgCatalog';
import { getActiveGateAttempt } from '@/contexts/rpgSystem';
import type { GateAttempt, GateDefinition } from '@/contexts/rpgTypes';


const challengeRoute = (g: GateDefinition) => {
  if (g.objective.kind === 'boss') return `/rituals?mode=boss&gate=${encodeURIComponent(g.id)}`;
  switch (g.objective.kind) {
    case 'maths-lecture': return '/(tabs)/maths';
    case 'ncert-session': return '/(tabs)/library';
    case 'calculation': return '/(tabs)/practice';
    default: return '/rituals?mode=boss';
  }
};
const challengeLabel = (g: GateDefinition) => ({ 'maths-lecture': 'OPEN MATHS', 'ncert-session': 'OPEN NCERT LIBRARY', calculation: 'START CALCULATION', boss: 'START BOSS RECORD' }[g.objective.kind]);

function useRemaining(attempt: GateAttempt | null, refresh: () => void) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!attempt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attempt]);
  const left = attempt ? (Date.parse(attempt.deadlineAt) - now) / 1000 : 0;
  useEffect(() => {
    if (attempt && left <= 0 && fired.current !== attempt.id) { fired.current = attempt.id; refresh(); }
  }, [attempt, left, refresh]);
  return left;
}

function GateCard({ gate, onInspect, left }: { gate: GateDefinition; onInspect: () => void; left: number }) {
  const { rpg, state, rank, enterGate, abandonGate, setActiveBatch } = useStudy();
  const reduced = useReducedMotionPreference();
  const rec = rpg.gates[gate.id];
  const elig = getGateEligibility(gate, state.totalXp, rank);
  const active = getActiveGateAttempt(rpg);
  const mine = active && active.gateId === gate.id ? active : null;
  const color = GATE_COLOR[gate.type];
  const unlocked = !!rec?.unlocked || elig.eligible;
  const cleared = !!rec?.completed;
  const attempts = rpg.attempts.filter((a) => a.gateId === gate.id);
  const goal = mine?.goal ?? gate.objective.target;
  const prog = mine ? mine.progress : rec?.progress ?? 0;
  const pct = Math.min(1, goal ? prog / goal : 0);
  const canEnter = unlocked && !cleared && !active;
  return (
    <GlassPanel tone={gate.type === 'boss' ? 'gold' : gate.type === 'special' ? 'violet' : gate.type === 'difficult' ? 'danger' : 'cyan'} style={{ marginBottom: 14, opacity: unlocked || cleared ? 1 : 0.85 }}>
      <Pressable testID={`gate-card-${gate.id}`} accessibilityRole="button" accessibilityLabel={`Inspect ${gate.name}`} onPress={onInspect} style={{ flexDirection: 'row', gap: 12 }}>
        <Pulse reduced={reduced || !mine}><GatePortal type={gate.type} size={86} locked={!unlocked && !cleared} cleared={cleared} /></Pulse>
        <View style={{ flex: 1 }}>
          <Text style={[s.type, { color }]}>{gate.type.toUpperCase()} GATE · {gate.requiredRankId.replace('rank-', '').toUpperCase()}-RANK · LV {gate.requiredLevel}</Text>
          <Text style={s.name}>{gate.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {gate.type === 'boss' ? <BossEmblem size={28} color={color} /> : <GuardianArt kind={guardianKindFor(gate.subject)} size={28} />}
            <Text style={[s.type, { color }]}>{gate.subject.toUpperCase()}</Text>
          </View>
          <Text style={s.meta}>{gate.objective.label}</Text>
          <Text style={s.meta}>{Math.round(gate.timeLimitSeconds / 60)} min limit · {gate.rewards.xp} XP</Text>
        </View>
      </Pressable>
      {!unlocked && !cleared ? <Text style={s.lock}><Feather name="lock" size={12} color={arise.danger} /> {elig.reason}</Text> : null}
      {mine ? <Text testID={`gate-batch-${gate.id}`} style={s.meta}>Bound to batch: {state.batches.find((x) => x.id === mine.batchId)?.name ?? mine.batchId}</Text> : null}
      {gate.objective.kind === 'boss' ? <Text style={s.meta}>Boss record needs at least 5 saved review cards, prepared before you enter. Runs any weekday and does not replace the Saturday Boss.</Text> : null}
      <View style={s.bar}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: color }]} /></View>
      <View style={s.row}>
        <Text style={s.meta}>{cleared ? 'CLEARED PERMANENTLY' : `${prog}/${goal} progress`}</Text>
        {mine ? <Text testID={`gate-timer-${gate.id}`} style={[s.timer, { color: left < 60 ? arise.danger : color }]}>{formatSeconds(left)}</Text> : <Text style={s.meta}>{attempts.length} attempt{attempts.length === 1 ? '' : 's'}</Text>}
      </View>
      <View style={s.rewardRow}>
        {gate.rewards.items.map((r) => { const d = getItemDefinition(r.itemId); return d ? <View key={r.itemId} style={s.rw}><ItemIcon id={d.id} category={d.category} rarity={d.rarity} size={30} /><Text style={s.meta}>x{r.quantity}</Text></View> : null; })}
      </View>
      <View style={[s.row, { marginTop: 10, gap: 8 }]}>
        {canEnter ? <View style={{ flex: 1 }}><HudButton testID={`gate-enter-${gate.id}`} label="ENTER GATE" icon="log-in" color={color} solid onPress={() => enterGate(gate.id)} /></View> : null}
        {mine ? <View style={{ flex: 1 }}><HudButton testID={`gate-challenge-${gate.id}`} label={challengeLabel(gate)} icon="play" color={color} solid onPress={() => { if (state.activeBatchId !== mine.batchId) setActiveBatch(mine.batchId); goTo(challengeRoute(gate)); }} /></View> : null}
        {mine ? <HudButton testID="gate-abandon" label="ABANDON" color={arise.danger} onPress={() => abandonGate(mine.id)} /> : null}
        {!canEnter && !mine ? <View style={{ flex: 1 }}><HudButton label={cleared ? 'CLEARED' : active ? 'ANOTHER GATE ACTIVE' : 'LOCKED'} color={arise.lockedTone} disabled onPress={() => undefined} /></View> : null}
      </View>
    </GlassPanel>
  );
}


function GateHero({ left }: { left: number }) {
  const { rpg, state, rank } = useStudy();
  const reduced = useReducedMotionPreference();
  const { width } = useWindowDimensions();
  const active = getActiveGateAttempt(rpg);
  const first = GATE_DEFINITIONS.find((g) => !rpg.gates[g.id]?.completed && (rpg.gates[g.id]?.unlocked || getGateEligibility(g, state.totalXp, rank).eligible));
  const gate = (active ? getGateDefinition(active.gateId) : undefined) ?? first ?? GATE_DEFINITIONS[0];
  const color = GATE_COLOR[gate.type];
  const frame = Math.min(280, width - 32 - 30);
  const art = Math.round(frame * 0.82);
  const unlocked = GATE_DEFINITIONS.filter((g) => rpg.gates[g.id]?.unlocked || getGateEligibility(g, state.totalXp, rank).eligible).length;
  const cleared = GATE_DEFINITIONS.filter((g) => rpg.gates[g.id]?.completed).length;
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduced) { spin.value = 0; return; }
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin, reduced]);
  const rot = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const rot2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 0.6}deg` }] }));
  const status = active ? 'ATTEMPT ACTIVE' : rpg.gates[gate.id]?.completed ? 'CLEARED' : unlocked ? 'READY TO ENTER' : 'SEALED';
  return (
    <View testID="gates-hero" style={[s.world, { borderColor: `${color}88` }]}>
      <WorldArtwork scene="gate" opacity={0.95} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: 0.1 }]} />
      <ParticleField reducedMotion={reduced} />
      <Text style={[s.type, { color }]}>{gate.type.toUpperCase()} GATE · {status}</Text>
      <View style={{ width: frame, height: frame, alignItems: 'center', justifyContent: 'center', marginVertical: 8 }} accessible={false}>
        <View pointerEvents="none" style={{ position: 'absolute', width: frame * 0.8, height: frame * 0.8, borderRadius: frame, backgroundColor: color, opacity: 0.12 }} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, reduced ? null : rot]}>
          <Svg width={frame} height={frame} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeOpacity={0.55} strokeWidth="0.6" strokeDasharray="2 4" />
            <Path d="M50 1 L50 7 M99 50 L93 50 M50 99 L50 93 M1 50 L7 50" stroke={color} strokeWidth="1.4" />
            <Circle cx="50" cy="2" r="1.8" fill={color} />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, reduced ? null : rot2]}>
          <Svg width={frame * 0.92} height={frame * 0.92} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeOpacity={0.8} strokeWidth="1" strokeDasharray="22 10 6 10" />
            <Circle cx="98" cy="50" r="2" fill="#F2F6FF" />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, reduced ? null : rot]}>
          <Svg width={frame * 0.98} height={frame * 0.98} viewBox="0 0 100 100">
            <Path d="M50 4 A46 46 0 0 1 96 50" stroke="#F2F6FF" strokeWidth="1.2" fill="none" strokeOpacity={0.8} />
            <Path d="M50 96 A46 46 0 0 1 4 50" stroke={color} strokeWidth="2" fill="none" />
            <Polygon points="50,0 54,6 46,6" fill={color} />
            <Polygon points="50,100 54,94 46,94" fill={color} />
          </Svg>
        </Animated.View>
        <Pulse reduced={reduced}><GatePortal type={gate.type} size={art} locked={!active && !unlocked} cleared={!!rpg.gates[gate.id]?.completed} /></Pulse>
      </View>
      <Text style={[s.name, { fontSize: 22, textAlign: 'center', letterSpacing: 1 }]}>{gate.name}</Text>
      <Text style={[s.meta, { textAlign: 'center' }]}>{gate.objective.label} · {gate.rewards.xp} XP</Text>
      {active ? <Text testID="gates-hero-timer" style={[s.timer, { color: left < 60 ? arise.danger : color, fontSize: 32 }]}>{formatSeconds(left)}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignSelf: 'stretch' }}>
        {[['NETWORK', GATE_DEFINITIONS.length], ['UNLOCKED', unlocked], ['CLEARED', cleared], ['ACTIVE', active ? 1 : 0]].map(([k, v]) => (
          <View key={String(k)} style={[s.stat, { borderColor: `${color}55` }]}>
            <Text style={[s.statV, { color }]}>{v}</Text>
            <Text style={s.statK}>{k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Detail({ gate, onClose }: { gate: GateDefinition; onClose: () => void }) {
  const { rpg } = useStudy();
  const color = GATE_COLOR[gate.type];
  const attempts = rpg.attempts.filter((a) => a.gateId === gate.id).slice().reverse();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.mBack}>
        <View style={[s.sheet, { borderColor: color }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center' }}><GatePortal type={gate.type} size={120} /></View>
            <Text style={[s.type, { color, textAlign: 'center' }]}>{gate.type.toUpperCase()} GATE</Text>
            <Text style={[s.name, { textAlign: 'center' }]}>{gate.name}</Text>
            <Text style={[s.meta, { textAlign: 'center', marginVertical: 8 }]}>{gate.description}</Text>
            <Text style={s.meta}>Subject: {gate.subject} · {gate.topic}</Text>
            <Text style={s.meta}>Difficulty {gate.difficulty} · Level {gate.requiredLevel} · {gate.requiredRankId.replace('rank-', '').toUpperCase()}-Rank</Text>
            <Text style={s.meta}>Time limit {Math.round(gate.timeLimitSeconds / 60)} min</Text>
            <Text style={s.meta}>Objective: {gate.objective.label}</Text>
            {gate.objective.minimumQuestions ? <Text style={s.meta}>Minimum {gate.objective.minimumQuestions} questions{gate.objective.minimumAccuracy ? ` at ${gate.objective.minimumAccuracy}%+` : ''}</Text> : null}
            <Text style={[s.type, { color: arise.gold, marginTop: 10 }]}>REWARDS · {gate.rewards.xp} XP</Text>
            {gate.rewards.items.map((r) => { const d = getItemDefinition(r.itemId); return d ? <Text key={r.itemId} style={[s.meta, { color: RARITY_COLOR[d.rarity] }]}>{d.name} x{r.quantity} ({d.rarity})</Text> : null; })}
            <Text style={[s.type, { color, marginTop: 10 }]}>ATTEMPT HISTORY</Text>
            {attempts.length ? attempts.map((a) => <Text key={a.id} style={s.meta}>{new Date(a.startedAt).toLocaleString()} · {a.status.toUpperCase()} · {a.progress}/{a.goal}</Text>) : <Text style={s.meta}>No attempts recorded.</Text>}
          </ScrollView>
          <HudButton testID="gate-detail-close" label="CLOSE" color={color} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function GatesScreen() {
  const [sel, setSel] = useState<GateDefinition | null>(null);
  const { rpg, refreshRpgClock } = useStudy();
  const active = getActiveGateAttempt(rpg);
  const left = useRemaining(active, refreshRpgClock);
  return (
    <ScreenShell kicker="ARISE · GATES" title="Gate Network">
      <RpgErrorBanner />
      <Text style={[s.meta, { marginBottom: 14 }]}>One gate at a time. Real recorded study after entry clears it; there is no manual clear.</Text>
      <GateHero left={left} />
      {GATE_DEFINITIONS.map((g) => <GateCard key={g.id} gate={g} left={left} onInspect={() => setSel(g)} />)}
      {sel ? <Detail gate={sel} onClose={() => setSel(null)} /> : null}
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  world: { marginBottom: 16, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, borderWidth: 1, overflow: 'hidden', borderTopLeftRadius: 4, borderBottomRightRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 4, backgroundColor: arise.abyss },
  type: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  name: { color: arise.ink, fontSize: 18, fontWeight: '800', marginVertical: 3 },
  meta: { color: arise.inkSoft, fontSize: 12, lineHeight: 17 },
  lock: { color: arise.danger, fontSize: 12, marginTop: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: arise.rail, marginTop: 12, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 6, alignItems: 'center', backgroundColor: 'rgba(8,20,42,0.6)' },
  statV: { fontSize: 18, fontWeight: '800' },
  statK: { color: arise.inkDim, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  timer: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rewardRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rw: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mBack: { flex: 1, backgroundColor: 'rgba(3,8,18,0.8)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: arise.deep, borderTopWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 12 },
});
