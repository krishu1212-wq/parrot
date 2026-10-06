import { StyleSheet, Text, View } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { EvidenceHistory } from '@/components/EvidenceHistory';
import { useStudy } from '@/contexts/StudyContext';
import { summarizeEvidence } from '@/contexts/evidenceSummary';
import { arise } from '@/constants/colors';

export default function SystemLogScreen() {
  const { state } = useStudy();
  const summary = summarizeEvidence(state);
  return <ScreenShell kicker="READ-ONLY LEDGER" title="System History">
    <View style={s.coverage}>
      <Text style={s.heading}>Tracking coverage</Text>
      <Text style={s.body}>{summary.trackingStartedAt ? `Event ledger started ${new Date(summary.trackingStartedAt).toLocaleDateString()}.` : 'No event-ledger start has been recorded yet.'} Historical XP before tracking is not included in period totals.</Text>
      <Text style={s.value}>This week: {summary.weeklyXp.toLocaleString()} net XP</Text>
      <Text style={s.value}>This month: {summary.monthlyXp.toLocaleString()} net XP</Text>
      <Text style={s.body}>Week starts Monday. Signed ledger XP includes reversals; it is not a lifetime total. No activity or reward can be claimed here.</Text>
    </View>
    <EvidenceHistory state={state} />
  </ScreenShell>;
}
const s = StyleSheet.create({
  coverage: { padding: 16, backgroundColor: '#0B1220', borderColor: arise.panelEdge, borderWidth: 1, marginBottom: 16 },
  heading: { color: arise.cyan, fontSize: 19, fontWeight: '700', marginBottom: 8 },
  body: { color: arise.inkSoft, fontSize: 15, lineHeight: 23 },
  value: { color: arise.gold, fontSize: 20, fontWeight: '700', marginVertical: 10 },
});