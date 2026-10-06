import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { arise } from '@/constants/colors';
import { openMissionRoute } from '@/components/AriseArt';
import ScreenShell from '@/components/ScreenShell';
import { WorldArtwork } from '@/components/VisualWorld';
import { SectionHead, SegBar } from '@/components/status/Hud';
import { useStudy } from '@/contexts/StudyContext';
import { deriveWeaknessRadar } from '@/contexts/masterProgress';

function RadarFrame({
  accent,
  children,
  style,
}: {
  accent: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, { borderColor: accent }, style]}>
      <LinearGradient colors={['rgba(29,32,45,0.85)', 'rgba(8,10,17,0.95)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View pointerEvents="none" style={[s.accentLine, { backgroundColor: accent }]} />
      {children}
    </View>
  );
}

export default function WeaknessScreen() {
  const { state } = useStudy();
  const radar = deriveWeaknessRadar(state);
  const calc = radar.calculationHistoryAccuracy;
  return (
    <ScreenShell kicker="ACADEMIC ONLY" title="Weakness Radar">
      <View style={s.body}>
        <View style={s.env} testID="weakness-env">
          <WorldArtwork scene="gate" opacity={0.55} />
          <LinearGradient colors={['rgba(40,6,20,0.4)', 'rgba(4,8,18,0.96)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Text style={s.k}>RECOVERY SCAN</Text>
          <Text style={s.hint}>{radar.findings.length ? `${radar.findings.length} topic signal${radar.findings.length === 1 ? '' : 's'} from recorded Boss results` : 'Awaiting recorded Boss results'}</Text>
        </View>
        <RadarFrame accent={arise.silver} style={{ marginTop: 12 }}>
          <Text style={s.t}>Evidence, not mastery</Text>
          <Text style={s.d}>At least 5 recorded answers: Strong ≥80%, Developing 60–79%, Weak &lt;60%. Smaller samples are Insufficient Data. Repeated cards are not independent proof of mastery.</Text>
          <Text style={s.d}>Lecture and vocabulary completion show coverage only. Their accuracy is unknown unless that topic has scored Boss answers. Untested topics remain unknown; no performance is inferred from completion.</Text>
        </RadarFrame>
        {calc ? (
          <RadarFrame accent={arise.cyan} style={{ marginTop: 12 }}>
            <Text style={s.k}>CALCULATION PRACTICE</Text>
            <Text style={s.d}>{radar.calculationEvidenceBand.replace('-', ' ').toUpperCase()} · general calculations, not topic-specific</Text>
            <Text style={s.big}>{Math.round(calc.percent)}%</Text>
            <SegBar value={calc.percent / 100} accent={arise.cyan} />
            <Text style={s.d}>{calc.numerator}/{calc.denominator} correct across retained calculation sessions (the study system keeps up to 20). Status includes older scored ledger samples where available.</Text>
          </RadarFrame>
        ) : (
          <RadarFrame accent={arise.violet} style={{ marginTop: 12 }}>
            <Text style={s.d}>Calculation performance: Insufficient Data.{'\n'}No valid scored calculation sessions are recorded.</Text>
          </RadarFrame>
        )}
        {radar.insufficientData || radar.findings.length === 0 ? (
          <RadarFrame accent={arise.violet} style={{ marginTop: 12 }}>
            <Text style={[s.k, { color: arise.violet }]}>NOT ENOUGH DATA</Text>
            <Text style={s.d}>Topic signals use recorded Boss answers only. Complete a weekly Boss Test to populate this radar. Calculation evidence above is separate; nothing is estimated.</Text>
            <Pressable accessibilityRole="button" style={s.rec} onPress={() => openMissionRoute({ route: '/rituals', routeParams: { mode: 'boss' } })}><Text style={s.recT}>Open weekly Boss Test</Text></Pressable>
          </RadarFrame>
        ) : radar.findings.map((f) => {
          const acc = f.accuracy.percent;
          const accent = f.evidenceBand === 'strong' ? arise.success : f.evidenceBand === 'developing' ? arise.ember : f.evidenceBand === 'weak' ? arise.danger : arise.violet;
          return (
            <View key={f.id} style={s.body}>
              <SectionHead label={`${f.evidenceBand.replace('-', ' ').toUpperCase()}${f.isActiveBatch ? '' : ' · PAST BATCH'}`} accent={accent} />
              <RadarFrame accent={accent}>
                <Text style={s.t}>{f.topicTitle}</Text>
                <Text style={s.d}>{f.subjectName ?? 'Subject'} · {f.batchName ?? 'Batch'}</Text>
                <View style={s.rowB}>
                  <Text style={s.stat}>Accuracy {Math.round(acc)}% ({f.accuracy.numerator}/{f.accuracy.denominator})</Text>
                  <Text style={[s.stat, { color: arise.ember }]}>Missed {f.incorrectCount}</Text>
                </View>
                <SegBar value={acc / 100} accent={accent} />
                <Text style={[s.k, { marginTop: 14, color: arise.ember }]}>{f.evidenceBand === 'weak' || f.evidenceBand === 'developing' ? 'REVISE → PRACTICE → RETEST' : 'OPTIONAL REVIEW'}</Text>
                {f.recommendations.filter((r) => f.evidenceBand !== 'strong' || r.kind === 'review').map((r, i) => (
                  <Pressable key={r.id} testID={`radar-rec-${r.id}`} accessibilityRole="button" onPress={() => openMissionRoute({ route: r.route, routeParams: r.routeParams })} style={s.rec}>
                    <Text style={s.recT}>{i + 1}. {r.title}</Text>
                  </Pressable>
                ))}
                {f.isActiveBatch ? <Pressable accessibilityRole="button" style={s.rec} onPress={() => openMissionRoute({ route: '/rituals', routeParams: { mode: 'boss', batchId: f.batchId } })}><Text style={s.recT}>Retest through the existing weekly Boss flow</Text></Pressable> : <Text style={s.d}>Switch to this batch to review its saved topic evidence.</Text>}
              </RadarFrame>
            </View>
          );
        })}
      </View>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  body: { width: '100%', minWidth: 0, alignSelf: 'stretch' },
  card: { position: 'relative', width: '100%', minWidth: 0, alignSelf: 'stretch', overflow: 'hidden', borderWidth: 1, borderRadius: 4, padding: 16, paddingBottom: 36, backgroundColor: arise.abyss },
  accentLine: { position: 'absolute', top: 5, left: 16, width: 78, height: 2, opacity: 0.72 },
  env: { height: 120, overflow: 'hidden', backgroundColor: arise.abyss, justifyContent: 'flex-end', padding: 14, borderBottomWidth: 1, borderColor: 'rgba(255,111,145,0.4)' },
  hint: { color: arise.ink, fontSize: 16, fontWeight: '600', marginTop: 3, backgroundColor: '#0B1220', padding: 6 },
  k: { color: arise.cyan, fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  big: { color: arise.ink, fontSize: 44, fontWeight: '700' },
  t: { color: arise.ink, fontSize: 19, fontWeight: '700' },
  d: { color: arise.inkSoft, fontSize: 15, lineHeight: 23, marginTop: 4, width: '100%', maxWidth: '100%', minWidth: 0, alignSelf: 'stretch', flexShrink: 1 },
  rowB: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginTop: 10 },
  stat: { color: arise.ink, fontSize: 15 },
  rec: { width: '100%', minWidth: 0, alignSelf: 'stretch', minHeight: 46, justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,111,145,0.25)', marginTop: 6 },
  recT: { color: arise.ink, fontSize: 15, lineHeight: 23, width: '100%', maxWidth: '100%', flexShrink: 1 },
});
