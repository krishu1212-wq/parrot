import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GuardianArt, guardianKindFor, RelicArt } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import type { JourneyStage, WeaknessRadar } from '@/contexts/masterProgress';
import { getGateDefinition } from '@/contexts/rpgCatalog';
import type { GateAttempt } from '@/contexts/rpgTypes';

type Badge = { id: string; title: string; detail: string; earned: boolean };

const GATE_COLOR: Record<string, string> = { normal: '#7FA8FF', difficult: '#B896FF', special: '#E4C27A', boss: '#FF5C7A' };

export function GateBossPanel({ attempt, bossStage, weeklyBossDone }: { attempt: GateAttempt | null; bossStage?: JourneyStage; weeklyBossDone: boolean | null }) {
  const def = attempt ? getGateDefinition(attempt.gateId) : undefined;
  const color = def ? GATE_COLOR[def.type] ?? '#B896FF' : '#B896FF';
  const pct = attempt && attempt.goal > 0 ? Math.min(1, attempt.progress / attempt.goal) : 0;
  const bossText = weeklyBossDone === null ? 'Needs saved review cards' : weeklyBossDone ? 'Weekly Boss recorded' : 'Weekly Boss available';
  return (
    <View style={s.row}>
      <Pressable testID="home-gate-panel" accessibilityRole="link" onPress={() => router.push('/gates' as never)} style={({ pressed }) => [s.half, { opacity: pressed ? 0.8 : 1 }]}>
        <HudFrame accent={color} style={s.halfFrame}>
          <WorldArtwork scene="gate" opacity={0.7} />
          <Text style={[s.kick, { color }]}>GATE</Text>
          <Text style={s.big} numberOfLines={2}>{def ? def.name : 'No active Gate'}</Text>
          <Text style={s.small}>{attempt ? `${attempt.progress}/${attempt.goal} · ${def?.type.toUpperCase() ?? ''}` : 'Open the Gate list'}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: color }]} /></View>
        </HudFrame>
      </Pressable>
      <Pressable testID="home-boss-panel" accessibilityRole="link" onPress={() => router.push('/rituals?mode=boss' as never)} style={({ pressed }) => [s.half, { opacity: pressed ? 0.8 : 1 }]}>
        <HudFrame accent="#FF5C7A" style={s.halfFrame}>
          <WorldArtwork scene="guardian" opacity={0.55} />
          <Text style={[s.kick, { color: '#FF5C7A' }]}>BOSS</Text>
          <Text style={s.big} numberOfLines={2}>{bossText}</Text>
          <Text style={s.small}>{bossStage ? `${bossStage.activityCount ?? 0} recorded this batch` : 'Official weekly data'}</Text>
          <View style={s.track}><View style={[s.fill, { width: weeklyBossDone ? '100%' : '6%', backgroundColor: '#FF5C7A' }]} /></View>
        </HudFrame>
      </Pressable>
    </View>
  );
}

export function RadarPreview({ radar }: { radar: WeaknessRadar }) {
  const items = radar.findings.slice(0, 3);
  return (
    <Pressable testID="home-radar-preview" accessibilityRole="link" onPress={() => router.push('/weakness' as never)} style={{ marginBottom: 14 }}>
      <HudFrame accent="#B896FF" style={{ padding: 14 }}>
        <View style={s.head}>
          <Text style={[s.kick, { color: '#B896FF' }]}>WEAKNESS RADAR</Text>
          <Feather name="crosshair" size={15} color="#B896FF" />
        </View>
        {items.length === 0 ? (
          <Text style={s.small}>Not enough Boss results yet. Record an official Boss Test to reveal weak topics.</Text>
        ) : items.map((f) => {
          const pct = f.accuracy.percent;
          const c = pct < 50 ? '#FF6F91' : pct < 75 ? '#FFB454' : '#6DF0B4';
          return (
            <View key={f.id} style={{ marginTop: 9 }}>
              <View style={s.head}>
                <Text style={s.item} numberOfLines={1}>{f.topicTitle}</Text>
                <Text style={[s.item, { color: c }]}>{pct.toFixed(0)}%</Text>
              </View>
              <View style={s.track}><View style={[s.fill, { width: `${Math.max(3, pct)}%`, backgroundColor: c }]} /></View>
            </View>
          );
        })}
      </HudFrame>
    </Pressable>
  );
}

export function JourneyStrip({ stages }: { stages: JourneyStage[] }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.kick, { color: '#E4C27A', marginBottom: 8 }]}>JOURNEY · GUARDIANS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {stages.map((st) => {
          const locked = st.status === 'locked';
          const pct = st.progressPercent;
          return (
            <Pressable key={st.id} testID={`home-journey-${st.id}`} accessibilityRole="link" onPress={() => router.push('/journey' as never)} style={[s.node, { opacity: locked ? 0.55 : 1 }]}>
              <GuardianArt kind={guardianKindFor(st.subjectId ?? st.id)} size={56} dim={locked} />
              <Text numberOfLines={1} style={s.item}>{st.title}</Text>
              <Text style={s.small}>{locked ? 'LOCKED' : pct !== null ? `${Math.round(pct)}%` : 'NO DATA'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function RelicShelf({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.kick, { color: '#6DF0B4', marginBottom: 8 }]}>RELICS · {earned}/{badges.length} EARNED</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {badges.map((b) => (
          <View key={b.id} testID={`relic-${b.id}`} style={[s.relic, { borderColor: b.earned ? '#E4C27A' : '#203A5B', opacity: b.earned ? 1 : 0.55 }]}>
            <RelicArt id={b.id} earned={b.earned} size={54} />
            <Text numberOfLines={2} style={[s.item, { textAlign: 'center' }]}>{b.title}</Text>
            <Text style={[s.small, { color: b.earned ? '#6DF0B4' : '#8EA6C5' }]}>{b.earned ? 'EARNED' : 'LOCKED'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  half: { flex: 1 },
  halfFrame: { padding: 12, minHeight: 138, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kick: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  big: { color: '#F2F6FF', fontSize: 15, fontWeight: '700', marginTop: 6, minHeight: 38 },
  small: { color: '#9DB3D0', fontSize: 12, lineHeight: 16, marginTop: 2 },
  item: { color: '#F2F6FF', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  track: { height: 5, backgroundColor: 'rgba(32,58,91,0.9)', marginTop: 8 },
  fill: { height: 5 },
  node: { width: 104, minHeight: 44, borderWidth: 1, borderColor: '#203A5B', backgroundColor: 'rgba(8,20,42,0.8)', padding: 10, alignItems: 'center', gap: 3 },
  relic: { width: 104, borderWidth: 1, backgroundColor: 'rgba(8,20,42,0.8)', padding: 10, alignItems: 'center', gap: 3 },
});
