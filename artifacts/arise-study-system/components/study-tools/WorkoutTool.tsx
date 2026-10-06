import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolNotice, ToolPanel, ToolHeading } from './shared';

const routineOptions = [
  { minutes: 2, title: 'Two-minute reset', steps: ['Easy shoulder rolls', 'A relaxed standing or seated stretch'] },
  { minutes: 3, title: 'Three-minute gentle routine', steps: ['Easy walking at your own pace', 'Shoulder rolls, then a quiet pause'] },
  { minutes: 5, title: 'Five-minute light movement', steps: ['Gentle walking or seated movement', 'Pause, breathe normally, and finish when ready'] },
];

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function WorkoutTool() {
  const colors = useColors();
  const { state, logWorkout } = useStudy();
  const [minutes, setMinutes] = useState(3);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const finishedRef = useRef(false);
  const alreadyLogged = state.studyTools.workoutSessions.some((session) => session.date === state.date);
  const routine = routineOptions.find((option) => option.minutes === minutes) ?? routineOptions[1];
  const elapsed = startedAt === null ? 0 : Math.min(minutes * 60, Math.floor((now - startedAt) / 1000));
  const remaining = Math.max(0, minutes * 60 - elapsed);

  useEffect(() => {
    if (startedAt === null || finished) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [finished, startedAt]);

  const finishSession = () => {
    if (finishedRef.current || startedAt === null) return;
    const durationSeconds = Math.min(minutes * 60, Math.floor((Date.now() - startedAt) / 1000));
    if (durationSeconds <= 0) {
      setError('Wait at least one full second before saving this session.');
      return;
    }
    try {
      finishedRef.current = true;
      logWorkout(durationSeconds);
      setNow(Date.now());
      setError('');
      setFinished(true);
    } catch {
      finishedRef.current = false;
      setError('This session could not be saved. Your workout has not been marked complete; please try again.');
    }
  };

  return (
    <>
      <ToolHeading
        kicker="OPTIONAL · GENTLE MOVEMENT"
        title="Reset your pace"
        detail="Choose a short, comfortable routine or simply use the timer for a quiet break."
      />
      <ToolNotice
        icon="heart"
        title="YOUR CHOICE, YOUR PACE"
        message="Keep movement easy and optional. Rest or stop whenever you want; this is not medical guidance."
      />
      {finished ? (
        <ToolPanel>
          <View style={[styles.completeMark, { backgroundColor: colors.secondary }]}><Feather name="check" size={22} color={colors.primary} /></View>
          <Text style={[styles.completeTitle, { color: colors.foreground }]}>Session logged</Text>
          <Text style={[styles.completeDetail, { color: colors.mutedForeground }]}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} of optional movement recorded. Existing quest rules, if applicable, are unchanged.
          </Text>
        </ToolPanel>
      ) : alreadyLogged ? (
        <ToolPanel>
          <View style={[styles.completeMark, { backgroundColor: colors.secondary }]}><Feather name="check" size={22} color={colors.primary} /></View>
          <Text style={[styles.completeTitle, { color: colors.foreground }]}>Session already logged today</Text>
          <Text style={[styles.completeDetail, { color: colors.mutedForeground }]}>One workout session per local study day. Your saved session remains in history.</Text>
        </ToolPanel>
      ) : (
        <>
          <ToolPanel>
            <Text style={[styles.panelKicker, { color: colors.primary }]}>CHOOSE A TIMER</Text>
            <View style={styles.durationRow}>
              {routineOptions.map((option) => {
                const selected = option.minutes === minutes;
                return (
                  <Pressable
                    key={option.minutes}
                    testID={`workout-duration-${option.minutes}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={startedAt !== null}
                    onPress={() => setMinutes(option.minutes)}
                    style={[styles.durationOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background, opacity: startedAt !== null ? 0.65 : 1 }]}
                  >
                    <Text style={[styles.durationValue, { color: selected ? colors.primary : colors.foreground }]}>{option.minutes}</Text>
                    <Text style={[styles.durationUnit, { color: colors.mutedForeground }]}>MIN</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.routineTitle, { color: colors.foreground }]}>{routine.title}</Text>
            {routine.steps.map((step, index) => (
              <View key={step} style={styles.routineStep}>
                <Text style={[styles.stepNumber, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={[styles.stepText, { color: colors.secondaryForeground }]}>{step}</Text>
              </View>
            ))}
            <View style={[styles.timerDisplay, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Feather name="clock" size={18} color={colors.accent} />
              <Text accessibilityLiveRegion="polite" style={[styles.timerText, { color: colors.foreground }]}>
                {startedAt === null ? formatClock(minutes * 60) : formatClock(remaining)}
              </Text>
              <Text style={[styles.timerCaption, { color: colors.mutedForeground }]}>
                {startedAt === null ? 'READY' : remaining === 0 ? 'TIME COMPLETE' : 'REMAINING'}
              </Text>
            </View>
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            {startedAt === null ? (
              <ToolButton
                testID="workout-start"
                label="START TIMER"
                icon="play"
                onPress={() => { setNow(Date.now()); setStartedAt(Date.now()); }}
              />
            ) : (
              <ToolButton
                testID="workout-finish"
                label="FINISH & SAVE SESSION"
                icon="check"
                onPress={finishSession}
                disabled={elapsed <= 0}
              />
            )}
          </ToolPanel>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  panelKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 13 },
  durationRow: { flexDirection: 'row', gap: 9, marginBottom: 15 },
  durationOption: { flex: 1, minHeight: 70, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  durationValue: { fontSize: 24, fontWeight: '700' },
  durationUnit: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  routineTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  routineStep: { flexDirection: 'row', alignItems: 'center', minHeight: 37 },
  stepNumber: { fontSize: 10, fontWeight: '700', width: 32 },
  stepText: { fontSize: 13, lineHeight: 18, flex: 1 },
  timerDisplay: { minHeight: 91, borderWidth: 1, borderRadius: 15, marginTop: 14, marginBottom: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  timerText: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timerCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 1, position: 'absolute', bottom: 8 },
  error: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  completeMark: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  completeTitle: { fontSize: 19, fontWeight: '700', marginBottom: 5 },
  completeDetail: { fontSize: 13, lineHeight: 19 },
});