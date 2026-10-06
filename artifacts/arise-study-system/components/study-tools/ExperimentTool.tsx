import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import { hasExperimentCheckedInOnDate } from '@/contexts/learningTools';
import { useColors } from '@/hooks/useColors';
import { daysBetweenLocalDates } from './shared';
import { ToolButton, ToolHeading, ToolPanel } from './shared';

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(year, month - 1, day, 12));
};

export default function ExperimentTool() {
  const colors = useColors();
  const { state, studyTools, startExperiment, checkInExperiment, finishExperiment } = useStudy();
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [reflection, setReflection] = useState('');
  const [nextTarget, setNextTarget] = useState('');
  const latestFirst = useMemo(
    () => studyTools.experiments.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [studyTools.experiments],
  );
  const active = latestFirst.find((experiment) => {
    const day = daysBetweenLocalDates(experiment.startDate, state.date);
    return !experiment.result && day >= 0 && day < 7 && experiment.checkIns.length < 7;
  });
  const ended = latestFirst.find((experiment) => !experiment.result && (daysBetweenLocalDates(experiment.startDate, state.date) >= 7 || experiment.checkIns.length >= 7));
  const activeDay = active ? daysBetweenLocalDates(active.startDate, state.date) : -1;
  const checkedInToday = !!active && hasExperimentCheckedInOnDate(active, state.date);
  const withinWindow = !!active && activeDay >= 0 && activeDay < 7;
  const saveResult = (decision: 'continue' | 'change' | 'finish') => {
    if (!ended) return;
    try { finishExperiment(ended.id, reflection, decision, nextTarget); setReflection(''); setNextTarget(''); setMessage('Result and next strategy saved. Recorded check-ins remain unchanged.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Result could not be saved.'); }
  };

  const begin = () => {
    const cleanTarget = target.trim();
    if (!cleanTarget) {
      setMessage('Add a short, specific target before starting.');
      return;
    }
    try {
      startExperiment(cleanTarget);
      setTarget('');
      setMessage('Seven-day target started. Check in once on a local calendar day.');
    } catch {
      setMessage('The experiment could not be started. Please try again.');
    }
  };

  const checkIn = () => {
    if (!active || !withinWindow || checkedInToday) return;
    try {
      checkInExperiment(active.id);
      setMessage('Today’s check-in is saved. Check-ins do not add XP.');
    } catch {
      setMessage('This check-in could not be saved. Please try again.');
    }
  };

  return (
    <>
      <ToolHeading
        kicker="7 LOCAL DAYS · YOUR TARGET"
        title="Run a small experiment"
        detail="Pick one realistic study habit to observe for seven days. This is a reflection tool, not an XP quest."
      />

      {active ? (
        <ToolPanel>
          <View style={styles.activeTop}>
            <View style={[styles.targetIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="target" size={18} color={colors.primary} />
            </View>
            <View style={styles.targetCopy}>
              <Text style={[styles.formKicker, { color: colors.primary }]}>CURRENT TARGET</Text>
              <Text style={[styles.targetText, { color: colors.foreground }]}>{active.target}</Text>
            </View>
          </View>
          <Text style={[styles.windowDetail, { color: colors.mutedForeground }]}>
            Started {formatDate(active.startDate)} · local day {Math.max(1, activeDay + 1)} of 7 · {active.checkIns.length}/7 check-ins
          </Text>
          <View style={styles.dayGrid}>
            {Array.from({ length: 7 }, (_, index) => {
              const dayNumber = index + 1;
              const [year, month, day] = active.startDate.split('-').map(Number);
              const dayKeyDate = new Date(year, month - 1, day + index, 12);
              const key = `${dayKeyDate.getFullYear()}-${String(dayKeyDate.getMonth() + 1).padStart(2, '0')}-${String(dayKeyDate.getDate()).padStart(2, '0')}`;
              const done = active.checkIns.includes(key);
              const today = key === state.date;
              return (
                <View key={key} style={[styles.dayCell, { borderColor: done ? colors.primary : today ? colors.accent : colors.border, backgroundColor: done ? colors.secondary : colors.background }]}>
                  <Text style={[styles.dayNumber, { color: done ? colors.primary : today ? colors.accent : colors.mutedForeground }]}>{dayNumber}</Text>
                  {done ? <Feather name="check" size={12} color={colors.primary} /> : <View style={styles.dayPlaceholder} />}
                </View>
              );
            })}
          </View>
          {withinWindow ? (
            <ToolButton
              testID="experiment-check-in"
              label={checkedInToday ? 'TODAY’S CHECK-IN SAVED' : 'CHECK IN FOR TODAY'}
              icon={checkedInToday ? 'check' : 'calendar'}
              disabled={checkedInToday}
              onPress={checkIn}
            />
          ) : (
            <View style={[styles.endedNote, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.endedTitle, { color: colors.accent }]}>SEVEN-DAY WINDOW ENDED</Text>
              <Text style={[styles.windowDetail, { color: colors.mutedForeground }]}>All recorded check-ins remain in your experiment history.</Text>
            </View>
          )}
        </ToolPanel>
      ) : null}

      {ended ? <ToolPanel>
        <Text style={[styles.endedTitle, { color: colors.accent }]}>SEVEN-DAY RESULT · {ended.target}</Text>
        <Text style={[styles.windowDetail, { color: colors.mutedForeground }]}>{new Set(ended.checkIns).size}/7 recorded days ({Math.round(new Set(ended.checkIns).size / 7 * 100)}% adherence). {7 - new Set(ended.checkIns).size} days have no check-in. This measures recorded consistency, not academic improvement.</Text>
        <TextInput accessibilityLabel="Experiment reflection" placeholder="What worked? What would you change?" placeholderTextColor={colors.mutedForeground} value={reflection} onChangeText={setReflection} multiline maxLength={1000} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <TextInput accessibilityLabel="Changed experiment strategy" placeholder="New target for changed strategy" placeholderTextColor={colors.mutedForeground} value={nextTarget} onChangeText={setNextTarget} maxLength={500} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <ToolButton label="SAVE RESULT · FINISH" disabled={!reflection.trim()} onPress={() => saveResult('finish')} />
        <ToolButton label="CONTINUE SAME STRATEGY · 7 NEW DAYS" disabled={!reflection.trim() || !!active} onPress={() => saveResult('continue')} />
        <ToolButton label="CHANGE STRATEGY · 7 NEW DAYS" disabled={!reflection.trim() || !nextTarget.trim() || !!active} onPress={() => saveResult('change')} />
      </ToolPanel> : null}

      {!active && !ended ? (
        <ToolPanel>
          <Text style={[styles.formKicker, { color: colors.primary }]}>START A NEW 7-DAY TARGET</Text>
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>One habit you want to observe</Text>
          <TextInput
            testID="experiment-target"
            accessibilityLabel="Seven-day experiment target"
            value={target}
            onChangeText={setTarget}
            placeholder="e.g. Review one saved card after study"
            placeholderTextColor={colors.mutedForeground}
            maxLength={100}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />
          <Text style={[styles.windowDetail, { color: colors.mutedForeground }]}>A check-in can be saved once per local day. Missed days remain missed; history is never erased.</Text>
          <ToolButton testID="experiment-start" label="START SEVEN DAYS" icon="play" onPress={begin} />
        </ToolPanel>
      ) : null}

      {message ? <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.mutedForeground }]}>{message}</Text> : null}
      {latestFirst.length ? (
        <ToolPanel>
          <Text style={[styles.formKicker, { color: colors.accent }]}>EXPERIMENT HISTORY</Text>
          {latestFirst.map((experiment) => (
            <View key={experiment.id} style={[styles.historyRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.targetText, { color: colors.foreground }]}>{experiment.target}</Text>
              <Text style={[styles.windowDetail, { color: colors.mutedForeground }]}>
                Started {formatDate(experiment.startDate)} · {experiment.checkIns.length}/7 check-ins · {experiment.checkIns.join(', ') || 'no check-ins yet'}
              </Text>
              {experiment.result ? <Text style={[styles.windowDetail, { color: colors.foreground }]}>{experiment.result.date} · {experiment.result.decision}{'\n'}{experiment.result.reflection}</Text> : null}
            </View>
          ))}
        </ToolPanel>
      ) : null}

      {active && hasExperimentCheckedInOnDate(active, state.date) ? (
        <View style={styles.savedLine}>
          <Feather name="check-circle" size={14} color={colors.primary} />
          <Text style={[styles.savedText, { color: colors.primary }]}>Saved for this local day</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  activeTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  targetIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  targetCopy: { flex: 1 },
  formKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 5 },
  targetText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  windowDetail: { fontSize: 11, lineHeight: 17, marginBottom: 12 },
  dayGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginBottom: 14 },
  dayCell: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayNumber: { fontSize: 12, fontWeight: '700' },
  dayPlaceholder: { height: 12 },
  endedNote: { borderWidth: 1, borderRadius: 12, padding: 12 },
  endedTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginTop: 5, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 13, marginBottom: 10 },
  feedback: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  historyRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 9 },
  savedLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  savedText: { fontSize: 12, fontWeight: '600' },
});