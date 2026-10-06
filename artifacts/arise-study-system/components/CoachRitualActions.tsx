import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function CoachRitualActions({
  mode,
  onStartExperiment,
  onCheckInExperiment,
  onSetWindDownHour,
  selectedWindDownHour,
  onOpenExperiment,
}: {
  mode: 'wind-down' | 'experiment';
  onStartExperiment?: () => void;
  onCheckInExperiment?: () => void;
  onSetWindDownHour?: (hour: number) => void;
  selectedWindDownHour?: number;
  onOpenExperiment: () => void;
}) {
  const colors = useColors();
  const actionButton = (title: string, icon: string, onPress: () => void, testID: string) => (
    <Pressable
      key={title}
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
    >
      <Feather name={icon as never} size={14} color={colors.primary} />
      <Text style={[styles.buttonText, { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {mode === 'wind-down' ? (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Save a wind-down hour</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {selectedWindDownHour === undefined
              ? 'Choose a time to save it to your local study routine.'
              : `Saved locally for ${String(selectedWindDownHour).padStart(2, '0')}:00. Choose a different time if you like.`}
          </Text>
          <View style={styles.buttons}>
            {[21, 22, 23].map((hour) => actionButton(
              `${String(hour).padStart(2, '0')}:00${selectedWindDownHour === hour ? ' · SAVED' : ''}`,
              selectedWindDownHour === hour ? 'check' : 'moon',
              () => onSetWindDownHour?.(hour),
              `wind-down-${hour}`,
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Use your local experiment flow</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Starting or checking in is always your choice. AI suggestions alone never mark an experiment as started or complete.</Text>
          <View style={styles.buttons}>
            {onStartExperiment ? actionButton('START 7-DAY TRIAL', 'play', onStartExperiment, 'start-experiment') : null}
            {onCheckInExperiment ? actionButton('CHECK IN', 'check', onCheckInExperiment, 'check-in-experiment') : null}
            {actionButton('OPEN EXPERIMENT FLOW', 'arrow-up-right', onOpenExperiment, 'open-experiment')}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 10, gap: 9 },
  title: { fontSize: 13, fontWeight: '700' },
  description: { fontSize: 10, lineHeight: 15 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonText: { fontSize: 10, fontWeight: '700' },
});