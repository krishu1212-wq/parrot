import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { BossEmblem, GUARDIAN_NAMES, GuardianArt, guardianKindFor, openMissionRoute } from '@/components/AriseArt';
import type { GuardianKind } from '@/components/AriseArt';
import ScreenShell from '@/components/ScreenShell';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { SegBar } from '@/components/status/Hud';
import { useStudy } from '@/contexts/StudyContext';
import { deriveJourney, getNextMission } from '@/contexts/masterProgress';

const STATUS_LABEL = { locked: 'LOCKED', available: 'AVAILABLE', 'in-progress': 'IN PROGRESS', complete: 'COMPLETE', 'insufficient-data': 'NO DATA' } as const;
const BOSS = '#E0314F';
const KIND_ACCENT: Record<GuardianKind, string> = { maths: '#4FC3FF', ncert: '#B07CFF', vocabulary: '#D86BFF', reasoning: '#8F7CFF', english: '#38E0CF' };

export default function JourneyScreen() {
  const study = useStudy();
  const stages = deriveJourney(study);
  const next = getNextMission(study);
  const active = stages.find((x) => x.status === 'in-progress') ?? stages.find((x) => x.status === 'available');
  const aKind = guardianKindFor(active?.subjectId ?? active?.id);
  const aBoss = active?.id === 'boss-tests';
  const aAccent = aBoss ? BOSS : KIND_ACCENT[aKind];
  return (
    <ScreenShell kicker="SSC CGL" title="Study Journey">
      <View style={s.hero} testID="journey-hero-art">
        <WorldArtwork scene="guardian" opacity={0.9} />
        <LinearGradient colors={['rgba(4,8,18,0.1)', 'rgba(4,8,18,0.95)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={{ position: 'absolute', top: 10, alignSelf: 'center' }}>{aBoss ? <BossEmblem size={170} color={BOSS} /> : <GuardianArt kind={aKind} size={170} />}</View>
        <View style={{ padding: 14 }}>
          <Text style={[s.status, { color: aAccent }]}>{active ? 'ACTIVE GUARDIAN' : 'NO ACTIVE STAGE'}</Text>
          <Text style={s.heroName}>{aBoss ? 'The Recordkeeper' : GUARDIAN_NAMES[aKind]}</Text>
          {active ? <Text style={s.detail}>{active.title}{active.progressPercent !== null ? ` · ${Math.round(active.progressPercent)}%` : ''}</Text> : null}
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        {stages.map((st, i) => {
          const locked = st.status === 'locked';
          const done = st.status === 'complete';
          const kind = guardianKindFor(st.subjectId ?? st.id);
          const isBoss = st.id === 'boss-tests';
          const sub = isBoss ? BOSS : KIND_ACCENT[kind];
          const gName = isBoss ? 'The Recordkeeper' : GUARDIAN_NAMES[kind];
          const tone = done ? arise.success : locked ? arise.lockedTone : sub;
          return (
            <View key={st.id} style={s.row} testID={`journey-${st.id}`}>
              <View style={s.rail}>
                <View style={[s.node, { borderColor: tone, backgroundColor: done ? tone : arise.abyss }]}>
                  {done ? <Feather name="check" size={13} color={arise.onCyan} /> : locked ? <Feather name="lock" size={11} color={tone} /> : <View style={[s.dot, { backgroundColor: tone }]} />}
                </View>
                {i < stages.length - 1 ? <View style={[s.line, { backgroundColor: done ? arise.success : arise.rail }]} /> : null}
              </View>
              <HudFrame accent={tone} style={{ flex: 1, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {isBoss ? <BossEmblem size={58} color={locked ? arise.lockedTone : BOSS} /> : <GuardianArt kind={kind} size={58} dim={locked} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.status, { color: tone }]}>{STATUS_LABEL[st.status]} · {gName.toUpperCase()}</Text>
                    <Text style={s.title}>{st.title}</Text>
                    <Text style={s.detail}>
                      {st.progress ? `${st.progress.completed}/${st.progress.total}` : 'No progress data'}
                      {st.progressPercent !== null ? ` · ${Math.round(st.progressPercent)}%` : ''}
                      {st.activityCount !== null ? ` · ${st.activityCount} recorded` : ''}
                    </Text>
                    {st.progressPercent !== null ? <SegBar value={st.progressPercent / 100} accent={tone} segments={16} /> : null}
                    {st.note ? <Text style={s.detail}>{st.note}</Text> : null}
                  </View>
                </View>
              </HudFrame>
            </View>
          );
        })}
      </View>
      {next ? (
        <HudFrame accent={arise.gold}>
          <Text style={[s.status, { color: arise.gold }]}>NEXT BEST ACTION</Text>
          <Text style={s.title}>{next.title}</Text>
          <Text style={s.detail}>{next.subtitle}</Text>
          <Pressable testID="journey-go" accessibilityRole="button" onPress={() => openMissionRoute(next)} style={[s.btn, { backgroundColor: arise.gold }]}><Text style={s.btnText}>OPEN</Text></Pressable>
        </HudFrame>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/weakness' as never)} style={[s.btn, { backgroundColor: 'rgba(255,111,145,0.08)', borderWidth: 1, borderColor: 'rgba(255,111,145,0.55)' }]}><Text style={[s.btnText, { color: arise.danger }]}>WEAKNESS RADAR</Text></Pressable>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  hero: { height: 300, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: arise.abyss, borderBottomWidth: 1, borderColor: 'rgba(143,124,255,0.45)' },
  heroName: { color: arise.ink, fontSize: 26, fontWeight: '700', marginTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 26, alignItems: 'center' },
  node: { width: 24, height: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 20, transform: [{ rotate: '45deg' }] },
  dot: { width: 8, height: 8 },
  line: { flex: 1, width: 2, marginTop: 2 },
  status: { color: arise.cyan, fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: arise.ink, fontSize: 17, fontWeight: '700', marginTop: 2 },
  detail: { color: arise.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 2 },
  btn: { minHeight: 48, borderRadius: 3, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnText: { color: arise.onCyan, fontWeight: '700', letterSpacing: 1.6, fontSize: 12 },
});
