import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CoachDraft, CoachTool } from '@/coach/coachClient';

type Palette = ReturnType<typeof import('@/hooks/useColors').useColors>;

const fieldInfo: Partial<Record<CoachTool, { name: keyof CoachDraft; label: string; placeholder: string; multiline?: boolean; maxLength: number }[]>> = {
  'read-recall': [
    { name: 'notes', label: 'SOURCE NOTES', placeholder: 'Paste or type the notes you read…', multiline: true, maxLength: 4000 },
    { name: 'question', label: 'RECALL QUESTION', placeholder: 'What question were you trying to answer?', maxLength: 1200 },
    { name: 'recall', label: 'YOUR RECALL', placeholder: 'Write what you remember without looking…', multiline: true, maxLength: 2500 },
  ],
  mistake: [
    { name: 'question', label: 'QUESTION', placeholder: 'Enter the original problem…', multiline: true, maxLength: 1200 },
    { name: 'attempt', label: 'YOUR ATTEMPT', placeholder: 'Show the answer or steps you tried…', multiline: true, maxLength: 1800 },
    { name: 'correctAnswer', label: 'VERIFIED CORRECT ANSWER', placeholder: 'Enter the answer you have checked…', multiline: true, maxLength: 1800 },
  ],
  'one-more-question': [
    { name: 'material', label: 'YOUR MATERIAL', placeholder: 'Paste the source material for a new question…', multiline: true, maxLength: 4000 },
    { name: 'topic', label: 'OPTIONAL TOPIC', placeholder: 'Keep the new question focused on…', maxLength: 120 },
  ],
  'concept-map': [
    { name: 'notes', label: 'YOUR NOTES', placeholder: 'Paste the notes to map. Only this source will be used…', multiline: true, maxLength: 4000 },
  ],
  'wind-down': [
    { name: 'reflection', label: 'OPTIONAL REFLECTION', placeholder: 'What would you like to set down for tonight?', multiline: true, maxLength: 1200 },
  ],
  experiment: [
    { name: 'goal', label: 'ONE SMALL THING TO TRY', placeholder: 'For example: review one topic before lunch…', multiline: true, maxLength: 500 },
  ],
};

export function CoachToolPicker({
  value,
  onChange,
  colors,
}: {
  value: CoachTool;
  onChange: (value: CoachTool) => void;
  colors: Palette;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
      {([
        ['coach', 'Coach', 'message-circle'],
        ['read-recall', 'Read → Recall', 'book-open'],
        ['mistake', 'Mistake', 'alert-circle'],
        ['one-more-question', 'One More', 'help-circle'],
        ['concept-map', 'Concept Map', 'git-branch'],
        ['next-best-action', 'Next Action', 'target'],
        ['wind-down', 'Wind-down', 'moon'],
        ['experiment', '7-day Trial', 'calendar'],
        ['records', 'Records', 'award'],
      ] as [CoachTool, string, string][]).map(([id, title, icon]) => {
        const selected = id === value;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(id)}
            style={({ pressed }) => [
              styles.modeChip,
              {
                backgroundColor: selected ? colors.primary : colors.card,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Feather name={icon as never} size={14} color={selected ? colors.primaryForeground : colors.secondaryForeground} />
            <Text style={[styles.modeText, { color: selected ? colors.primaryForeground : colors.secondaryForeground }]}>{title}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CoachToolForm({
  tool,
  draft,
  onChange,
  colors,
}: {
  tool: CoachTool;
  draft: CoachDraft;
  onChange: (key: keyof CoachDraft, value: string) => void;
  colors: Palette;
}) {
  if (tool === 'coach' || tool === 'records') return null;
  if (tool === 'next-best-action') {
    return (
      <View style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.toolTitle, { color: colors.foreground }]}>A small next step, grounded in your progress</Text>
        <Text style={[styles.toolNote, { color: colors.mutedForeground }]}>
          This shares only the top three quest and subject records, streak, today’s XP and the current next-lecture summary shown below when you tap Send. No lesson content or full saved data is sent.
        </Text>
      </View>
    );
  }

  const fields = fieldInfo[tool] ?? [];
  return (
    <View style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {tool === 'read-recall' ? (
        <Text style={[styles.toolNote, { color: colors.mutedForeground }]}>Your source, question and unaided recall are compared for focused feedback.</Text>
      ) : null}
      {tool === 'mistake' ? (
        <Text style={[styles.toolNote, { color: colors.mutedForeground }]}>Enter the answer you have verified; the Coach will check the reasoning rather than assume either answer is correct.</Text>
      ) : null}
      {tool === 'one-more-question' ? (
        <Text style={[styles.toolNote, { color: colors.mutedForeground }]}>A new question is generated only from material you provide. Its solution stays hidden until you reveal it.</Text>
      ) : null}
      {tool === 'experiment' ? (
        <Text style={[styles.toolNote, { color: colors.mutedForeground }]}>The Coach can help refine a seven-day idea. Starting and checking in use your local study tools; nothing is marked complete automatically.</Text>
      ) : null}
      {fields.map((field) => (
        <View key={field.name} style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <TextInput
            value={draft[field.name]}
            onChangeText={(value) => onChange(field.name, value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            placeholderTextColor={colors.mutedForeground}
            multiline={field.multiline}
            textAlignVertical={field.multiline ? 'top' : 'center'}
            style={[
              styles.fieldInput,
              field.multiline && styles.multilineInput,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 8, paddingVertical: 3, paddingRight: 20 },
  modeChip: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  modeText: { fontSize: 11, fontWeight: '700' },
  toolCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 14, gap: 10 },
  toolTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  toolNote: { fontSize: 11, lineHeight: 16 },
  fieldGroup: { gap: 5 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.85 },
  fieldInput: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, fontSize: 12 },
  multilineInput: { minHeight: 72, maxHeight: 150 },
});