import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { buildEvidenceLog, LOG_FILTERS, paginateEvidenceLog } from '@/contexts/evidenceSummary';
import type { EvidenceLogEntry, LogCategory } from '@/contexts/evidenceSummary';
import type { StudyState } from '@/contexts/StudyContext';

export function EvidenceHistory({ state, archive = false }: { state: StudyState; archive?: boolean }) {
  const [filter, setFilter] = useState<LogCategory>('all');
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const log = buildEvidenceLog(state);
    return archive ? log.filter((row) => ['quest.completed', 'mission.completed', 'gate.cleared', 'boss.activity', 'achievement.unlocked'].includes(row.type)) : log;
  }, [state, archive]);
  const from = period === 'month' ? `${state.date.slice(0, 7)}-01` : period === 'week' ? (() => {
    const day = new Date(`${state.date}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
  })() : '';
  const result = paginateEvidenceLog(rows, filter, page, 15, from, period === 'all' ? '' : state.date);
  return (
    <View style={s.surface}>
      <Text style={s.body}>Recorded events only. Older saved sessions may have a date without an exact time. Missing historical quests, rewards and unlock dates are not reconstructed.</Text>
      <View style={s.filters}>
        {(archive ? ['all', 'quests', 'gates', 'boss', 'achievements'] as LogCategory[] : LOG_FILTERS).map((item) => (
          <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} testID={`log-filter-${item}`} onPress={() => { setFilter(item); setPage(0); }} style={[s.chip, filter === item && s.selected]}>
            <Text style={s.buttonText}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.filters}>
        {(['all', 'week', 'month'] as const).map((item) => (
          <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: period === item }} onPress={() => { setPeriod(item); setPage(0); }} style={[s.chip, period === item && s.selected]}>
            <Text style={s.buttonText}>{item === 'all' ? 'ALL DATES' : `THIS ${item.toUpperCase()}`}</Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.body}>{result.total} records · Page {result.page + 1} of {result.pages}</Text>
      {result.rows.length ? result.rows.map((row) => <LogRow key={row.id} row={row} />) : <Text style={s.empty}>No recorded events match these filters.</Text>}
      <View style={s.pagination}>
        <Pressable accessibilityRole="button" disabled={result.page === 0} onPress={() => setPage(result.page - 1)} style={[s.chip, result.page === 0 && s.disabled]}><Text style={s.buttonText}>PREVIOUS</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={result.page + 1 >= result.pages} onPress={() => setPage(result.page + 1)} style={[s.chip, result.page + 1 >= result.pages && s.disabled]}><Text style={s.buttonText}>NEXT</Text></Pressable>
      </View>
    </View>
  );
}

function LogRow({ row }: { row: EvidenceLogEntry }) {
  return <View style={s.entry}>
    <Text style={s.date}>{row.dateOnly ? `${row.date} · date only` : new Date(row.timestamp).toLocaleString()}</Text>
    <Text style={s.title}>{row.title}</Text>
    {row.detail ? <Text style={s.body}>{row.detail}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  surface: { backgroundColor: '#0B1220', padding: 16, borderWidth: 1, borderColor: arise.panelEdge },
  body: { color: arise.inkSoft, fontSize: 15, lineHeight: 23 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: arise.panelEdge, backgroundColor: '#151F30' },
  selected: { borderColor: arise.cyan, backgroundColor: '#163342' },
  buttonText: { color: arise.ink, fontSize: 14, fontWeight: '600' },
  entry: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: arise.panelEdge },
  date: { color: arise.inkSoft, fontSize: 14, lineHeight: 21 },
  title: { color: arise.ink, fontSize: 17, fontWeight: '700', marginVertical: 4, textTransform: 'capitalize' },
  empty: { color: arise.inkSoft, fontSize: 16, lineHeight: 24, paddingVertical: 24 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 8 },
  disabled: { opacity: 0.5 },
});