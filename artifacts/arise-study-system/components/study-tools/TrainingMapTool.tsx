import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { ProgressBar } from '@/components/StudyPrimitives';
import { ToolButton, ToolHeading, ToolNotice, ToolPanel } from './shared';

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
};

export default function TrainingMapTool() {
  const colors = useColors();
  const {
    state,
    activeBatch,
    activeBatchProgress,
    phaseTwoUnlocked,
    studyTools,
    setWindDownHour,
  } = useStudy();
  const mathsProgress = activeBatchProgress.find((subject) => subject.subjectId === 'maths')
    ?? activeBatchProgress.find((subject) => subject.name.toLowerCase() === 'maths')
    ?? { subjectId: 'maths', name: 'Maths', completed: 0, total: 0, remaining: 0, progress: 0 };
  const additionalSubjects = activeBatchProgress.filter((subject) =>
    subject.subjectId !== mathsProgress.subjectId && subject.name.toLowerCase() !== 'maths',
  );
  const phaseOneTotal = mathsProgress.total + state.ncertTotal;
  const phaseOneProgress = phaseOneTotal === 0
    ? 0
    : (mathsProgress.completed + state.ncertCompleted) / phaseOneTotal;
  const phaseTwoTotal = additionalSubjects.reduce((total, subject) => total + subject.total, 0);
  const phaseTwoDone = additionalSubjects.reduce((total, subject) => total + subject.completed, 0);
  const phaseTwoProgress = phaseTwoTotal > 0 ? phaseTwoDone / phaseTwoTotal : 0;

  const changeWindDown = (delta: number) => {
    setWindDownHour(Math.min(23, Math.max(0, studyTools.windDownHour + delta)));
  };

  return (
    <>
      <ToolHeading
        kicker="LIVE PROGRESS · SELECTED BATCH"
        title="Training map"
        detail={`A bounded view of real progress in ${activeBatch.name}. Routes below open the actual Maths and Library screens.`}
      />
      <ToolPanel>
        <View style={styles.phaseHeader}>
          <View style={[styles.phaseIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="activity" size={17} color={colors.primary} />
          </View>
          <View style={styles.phaseCopy}>
            <Text style={[styles.phaseKicker, { color: colors.primary }]}>PHASE 01 · FOUNDATION</Text>
            <Text style={[styles.phaseTitle, { color: colors.foreground }]}>Required tracked progress</Text>
          </View>
          <Text style={[styles.phasePercent, { color: colors.primary }]}>{Math.round(phaseOneProgress * 100)}%</Text>
        </View>
        <Text style={[styles.batchName, { color: colors.mutedForeground }]}>ACTIVE BATCH · {activeBatch.name}</Text>
        <View style={styles.progressBlock}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowLabel, { color: colors.secondaryForeground }]}>MATHS COURSE</Text>
            <Text style={[styles.rowCount, { color: colors.mutedForeground }]}>{mathsProgress.completed}/{mathsProgress.total} · {Math.round(mathsProgress.progress * 100)}%</Text>
          </View>
          <ProgressBar value={mathsProgress.progress} color={colors.accent} track={colors.muted} />
          <Pressable
            testID="map-open-maths"
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/(tabs)/maths', params: { subject: mathsProgress.subjectId } })}
            style={({ pressed }) => [styles.routeButton, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="arrow-up-right" size={14} color={colors.primary} />
            <Text style={[styles.routeText, { color: colors.primary }]}>OPEN MATHS COURSE</Text>
          </Pressable>
        </View>
        <View style={[styles.ncertRow, { borderTopColor: colors.border }]}>
          <View style={styles.ncertCopy}>
            <Text style={[styles.rowLabel, { color: colors.secondaryForeground }]}>NCERT LIBRARY</Text>
            <Text style={[styles.rowCount, { color: colors.mutedForeground }]}>{state.ncertCompleted}/{state.ncertTotal} books</Text>
          </View>
          <Pressable
            testID="map-open-library"
            accessibilityRole="link"
            onPress={() => router.push('/(tabs)/library' as never)}
            style={({ pressed }) => [styles.smallRouteButton, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.routeText, { color: colors.primary }]}>OPEN LIBRARY</Text>
          </Pressable>
        </View>
        <ProgressBar value={state.ncertTotal > 0 ? state.ncertCompleted / state.ncertTotal : 0} color={colors.accent} track={colors.muted} />
        <ToolNotice
          icon={phaseTwoUnlocked ? 'unlock' : 'lock'}
          title={phaseTwoUnlocked ? 'PHASE 02 IS UNLOCKED' : 'PHASE 02 IS LOCKED'}
          message={phaseTwoUnlocked
            ? 'The selected batch’s Maths and NCERT gate is complete.'
            : 'The actual gate is selected-batch Maths plus NCERT completion. Setup data remains visible; learning routes stay locked.'}
          accent={phaseTwoUnlocked ? colors.primary : colors.mutedForeground}
        />
      </ToolPanel>

      <ToolPanel>
        <View style={styles.phaseHeader}>
          <View style={[styles.phaseIcon, { backgroundColor: colors.secondary }]}>
            <Feather name={phaseTwoUnlocked ? 'unlock' : 'lock'} size={17} color={phaseTwoUnlocked ? colors.primary : colors.mutedForeground} />
          </View>
          <View style={styles.phaseCopy}>
            <Text style={[styles.phaseKicker, { color: phaseTwoUnlocked ? colors.accent : colors.mutedForeground }]}>PHASE 02 · ASCENSION</Text>
            <Text style={[styles.phaseTitle, { color: colors.foreground }]}>Other saved subject courses</Text>
          </View>
          {phaseTwoUnlocked ? <Text style={[styles.phasePercent, { color: colors.primary }]}>{Math.round(phaseTwoProgress * 100)}%</Text> : null}
        </View>
        {!phaseTwoUnlocked ? (
          <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>Complete this batch’s Maths course and NCERT books to unlock learning routes in Phase 02.</Text>
        ) : additionalSubjects.length === 0 ? (
          <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>No other subject courses are configured for this batch. Add them in Batch Courses to see real progress here.</Text>
        ) : (
          additionalSubjects.map((subject) => (
            <View key={subject.subjectId} style={[styles.subjectRow, { borderTopColor: colors.border }]}>
              <View style={styles.subjectRowTop}>
                <View style={styles.subjectCopy}>
                  <Text style={[styles.rowLabel, { color: colors.secondaryForeground }]}>{subject.name.toUpperCase()}</Text>
                  <Text style={[styles.rowCount, { color: colors.mutedForeground }]}>{subject.completed}/{subject.total} · {subject.remaining} left</Text>
                </View>
                <Text style={[styles.rowCount, { color: colors.primary }]}>{Math.round(subject.progress * 100)}%</Text>
              </View>
              <ProgressBar value={subject.progress} color={colors.accent} track={colors.muted} />
              <ToolButton
                testID={`map-open-subject-${subject.subjectId}`}
                label={`OPEN ${subject.name.toUpperCase()}`}
                icon="arrow-up-right"
                secondary
                onPress={() => router.push({ pathname: '/(tabs)/maths', params: { subject: subject.subjectId } })}
              />
            </View>
          ))
        )}
      </ToolPanel>

      <ToolPanel>
        <View style={styles.phaseHeader}>
          <View style={[styles.phaseIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="moon" size={17} color={colors.accent} />
          </View>
          <View style={styles.phaseCopy}>
            <Text style={[styles.phaseKicker, { color: colors.accent }]}>LOCAL REMINDER</Text>
            <Text style={[styles.phaseTitle, { color: colors.foreground }]}>Wind-down hour</Text>
          </View>
        </View>
        <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>An on-screen reminder only. This setting does not schedule a notification or push alert.</Text>
        <View style={styles.hourControl}>
          <Pressable
            testID="wind-down-earlier"
            accessibilityRole="button"
            accessibilityLabel="Set wind-down reminder one hour earlier"
            disabled={studyTools.windDownHour === 0}
            onPress={() => changeWindDown(-1)}
            style={[styles.hourButton, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: studyTools.windDownHour === 0 ? 0.4 : 1 }]}
          >
            <Feather name="minus" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.hourValue}>
            <Text style={[styles.hourText, { color: colors.primary }]}>{hourLabel(studyTools.windDownHour)}</Text>
            <Text style={[styles.hourCaption, { color: colors.mutedForeground }]}>LOCAL TIME</Text>
          </View>
          <Pressable
            testID="wind-down-later"
            accessibilityRole="button"
            accessibilityLabel="Set wind-down reminder one hour later"
            disabled={studyTools.windDownHour === 23}
            onPress={() => changeWindDown(1)}
            style={[styles.hourButton, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: studyTools.windDownHour === 23 ? 0.4 : 1 }]}
          >
            <Feather name="plus" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </ToolPanel>
    </>
  );
}

const styles = StyleSheet.create({
  phaseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  phaseIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  phaseCopy: { flex: 1 },
  phaseKicker: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 3 },
  phaseTitle: { fontSize: 15, fontWeight: '700' },
  phasePercent: { fontSize: 18, fontWeight: '700' },
  batchName: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 14 },
  progressBlock: { marginBottom: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  rowCount: { fontSize: 10, fontWeight: '600' },
  routeButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, marginTop: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  routeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  ncertRow: { borderTopWidth: 1, paddingTop: 12, marginTop: 3, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ncertCopy: { gap: 4 },
  smallRouteButton: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 11, justifyContent: 'center' },
  lockedText: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  subjectRow: { borderTopWidth: 1, paddingTop: 11, marginTop: 9, gap: 9 },
  subjectRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subjectCopy: { gap: 4 },
  hourControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  hourButton: { width: 48, height: 48, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hourValue: { alignItems: 'center' },
  hourText: { fontSize: 20, fontWeight: '700' },
  hourCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 3 },
});