import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CalculationSession } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';

export function CoachRecords({
  sessions,
  onOpenPractice,
}: {
  sessions: CalculationSession[];
  onOpenPractice: () => void;
}) {
  const colors = useColors();
  const bestAccuracy = sessions.length
    ? sessions.reduce((best, session) => session.accuracy > best.accuracy ? session : best)
    : null;
  const mostCorrect = sessions.length
    ? sessions.reduce((best, session) => session.correct > best.correct ? session : best)
    : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <Feather name="award" size={17} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Personal records</Text>
      </View>
      {bestAccuracy && mostCorrect ? (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: colors.primary }]}>{bestAccuracy.accuracy}%</Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>BEST ACCURACY</Text>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>{bestAccuracy.questions} attempted · {bestAccuracy.date}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: colors.accent }]}>{mostCorrect.correct}</Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>MOST CORRECT</Text>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>{mostCorrect.questions} attempted · {mostCorrect.date}</Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>No calculation sessions are recorded yet. Your real records will appear after practice.</Text>
      )}
      <Pressable
        accessibilityRole="link"
        onPress={onOpenPractice}
        style={({ pressed }) => [styles.link, { borderColor: colors.border, backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 }]}
      >
        <Text style={[styles.linkText, { color: colors.primary }]}>OPEN PRACTICE & RECORDS</Text>
        <Feather name="arrow-up-right" size={15} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  title: { fontSize: 14, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 15, marginBottom: 14 },
  stat: { flex: 1 },
  value: { fontSize: 23, fontWeight: '700', marginBottom: 3 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.75, marginBottom: 4 },
  detail: { fontSize: 10, lineHeight: 15 },
  link: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.55 },
});