import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassPanel } from '@/components/AriseArt';
import { arise } from '@/constants/colors';
import { useMission } from '@/contexts/MissionContext';
import { useStudy } from '@/contexts/StudyContext';
import type { FocusPreset } from '@/contexts/focusClock';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function FocusTimerPanel() {
  const { focusClock, focusRemainingSeconds, focusError, startFocus, stopFocus } = useMission();
  const { state } = useStudy();
  const history = (state.studyTools.focusHistory ?? []).slice(-5).reverse();
  return (
    <GlassPanel tone="violet" style={{ marginVertical: 12 }}>
      <Text style={s.label}>FOCUS / REST PROTOCOL</Text>
      {focusClock ? (
        <>
          <Text style={s.title}>{focusClock.kind === 'break' ? 'Rest break' : focusClock.task}</Text>
          <Text testID="focus-countdown" style={s.clock}>{time(focusRemainingSeconds ?? 0)}</Text>
          <Text style={s.copy}>Foreground timer · pauses in background. Finishing this timer does not complete a mission or award XP.</Text>
          <Pressable testID="focus-stop" accessibilityRole="button" onPress={stopFocus} style={s.button}>
            <Text style={s.buttonText}>END & SAVE TIMER</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={s.copy}>Choose a study interval or a rest break. History records actual foreground time, not grades or XP.</Text>
          <View style={s.row}>
            {([25, 50, 5, 10] as FocusPreset[]).map((minutes) => (
              <Pressable key={minutes} testID={`focus-preset-${minutes}`} accessibilityRole="button" onPress={() => startFocus(minutes)} style={s.button}>
                <Text style={s.buttonText}>{minutes}m {minutes < 25 ? 'BREAK' : 'FOCUS'}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {focusError ? <Text accessibilityRole="alert" style={[s.copy, { color: arise.danger }]}>{focusError}</Text> : null}
      {history.length ? <Text style={[s.label, { marginTop: 14 }]}>RECENT SAVED INTERVALS</Text> : null}
      {history.map((record) => (
        <Text key={record.id} style={s.copy}>{record.date} · {record.kind} · {time(record.durationSeconds)} / {record.presetMinutes}m · {record.completed ? 'completed' : 'ended early'}{record.kind === 'focus' ? ` · ${record.task}` : ''}</Text>
      ))}
    </GlassPanel>
  );
}

const s = StyleSheet.create({
  label: { color: arise.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: arise.ink, fontSize: 18, fontWeight: '700', marginTop: 8 },
  clock: { color: arise.ink, fontSize: 44, fontWeight: '300', marginVertical: 8 },
  copy: { color: arise.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: arise.panelEdge, borderRadius: 12, marginTop: 10 },
  buttonText: { color: arise.cyan, fontSize: 12, fontWeight: '800' },
});