import { Feather } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BossTestTool from '@/components/study-tools/BossTestTool';
import ExperimentTool from '@/components/study-tools/ExperimentTool';
import RecoveryTool from '@/components/study-tools/RecoveryTool';
import TrainingMapTool from '@/components/study-tools/TrainingMapTool';
import WorkoutTool from '@/components/study-tools/WorkoutTool';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';

const modes = [
  { id: 'workout', label: 'WORKOUT', icon: 'activity' as const },
  { id: 'boss', label: 'BOSS TEST', icon: 'target' as const },
  { id: 'recovery', label: 'RECOVERY', icon: 'rotate-ccw' as const },
  { id: 'experiment', label: 'EXPERIMENT', icon: 'compass' as const },
  { id: 'map', label: 'TRAINING MAP', icon: 'map' as const },
] as const;
type RitualMode = typeof modes[number]['id'];

const isMode = (value: string | undefined): value is RitualMode =>
  modes.some((mode) => mode.id === value);

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function RitualsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    batchId?: string | string[];
    subjectId?: string | string[];
    topicId?: string | string[];
    topicTitle?: string | string[];
    cardIds?: string | string[];
    gate?: string | string[];
  }>();
  const modeParam = firstParam(params.mode);
  const mode = isMode(modeParam) ? modeParam : 'map';
  const invalidMode = modeParam !== undefined && !isMode(modeParam);
  const { state, activeBatch, refreshStudyDay } = useStudy();
  const requestedBatchId = firstParam(params.batchId);
  const hasFocusedTarget = [
    firstParam(params.subjectId),
    firstParam(params.topicId),
    firstParam(params.topicTitle),
    firstParam(params.cardIds),
  ].some((value) => value !== undefined);
  const targetError = requestedBatchId && requestedBatchId !== activeBatch.id
    ? 'This activity link belongs to a different selected batch. No activity was opened for another batch.'
    : hasFocusedTarget && mode !== 'recovery'
      ? 'Topic-focused saved-card activity is supported in Recovery only.'
      : null;
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    refreshStudyDay();
  }, [refreshStudyDay]);

  const title = modes.find((item) => item.id === mode)?.label ?? 'TRAINING MAP';
  const content = targetError ? null : mode === 'workout'
    ? <WorkoutTool />
    : mode === 'boss'
      ? <BossTestTool key={`boss:${firstParam(params.gate) ?? 'official'}`} gateId={firstParam(params.gate)} />
      : mode === 'recovery'
        ? <RecoveryTool />
        : mode === 'experiment'
          ? <ExperimentTool />
          : <TrainingMapTool />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: `ARISE · ${title}`,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        testID="rituals-scroll"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 12 : 8,
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 12) + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          testID="rituals-back"
          accessibilityRole="button"
          accessibilityLabel="Go back to the previous screen, or ARISE home when opened directly"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.secondaryForeground }]}>BACK</Text>
        </Pressable>
        <View style={styles.routeHeader}>
          <View style={styles.routeHeaderCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>ARISE · LEARNING TOOLS</Text>
            <Text style={[styles.routeTitle, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{state.date} · LOCAL STUDY DAY</Text>
          </View>
          <View style={[styles.headerIcon, { borderColor: colors.primary }]}>
            <Feather name={modes.find((item) => item.id === mode)?.icon ?? 'map'} size={19} color={colors.primary} />
          </View>
        </View>
        {invalidMode ? (
          <View style={[styles.errorBanner, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>Unknown study tool mode. Showing the training map instead.</Text>
          </View>
        ) : null}
        {targetError ? (
          <View style={[styles.errorBanner, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{targetError}</Text>
          </View>
        ) : null}
        <View style={styles.modeList}>
          {modes.map((item) => {
            const selected = item.id === mode;
            return (
              <Pressable
                key={item.id}
                testID={`ritual-mode-${item.id}`}
                accessibilityRole="link"
                accessibilityState={{ selected }}
                onPress={() => router.replace(`/rituals?mode=${item.id}` as never)}
                style={({ pressed }) => [styles.modeButton, { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.76 : 1 }]}
              >
                <Feather name={item.icon} size={13} color={selected ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.modeText, { color: selected ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {mode === 'recovery' && !targetError
          ? <RecoveryTool key={`${requestedBatchId ?? ''}:${firstParam(params.subjectId) ?? ''}:${firstParam(params.topicId) ?? ''}:${firstParam(params.topicTitle) ?? ''}:${firstParam(params.cardIds) ?? ''}`} />
          : content}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Feather name="shield" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Progress is based on your saved study data. Rituals do not invent course content or add a new XP rule.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18 },
  backButton: { minHeight: 44, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 17 },
  backText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  routeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  routeHeaderCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5 },
  routeTitle: { fontSize: 27, fontWeight: '700', letterSpacing: 0.2 },
  dateText: { fontSize: 10, letterSpacing: 0.7, marginTop: 5 },
  headerIcon: { width: 42, height: 42, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 11 },
  errorText: { fontSize: 12, lineHeight: 17 },
  modeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 12 },
  modeButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  modeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  footer: { borderTopWidth: 1, marginTop: 6, paddingTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  footerText: { flex: 1, fontSize: 10, lineHeight: 15 },
});