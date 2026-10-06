import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CoachResponseReviewCard } from '@workspace/api-client-react';
import type { StudySubject } from '@/contexts/batchSystem';
import { useColors } from '@/hooks/useColors';

export type VerifiedReviewCard = {
  batchId: string;
  subjectId: string;
  topicTitle: string;
  question: string;
  answer: string;
};

export function CoachReviewCard({
  card,
  subjects,
  batchId,
  onSave,
  savingAvailable,
}: {
  card: CoachResponseReviewCard;
  subjects: StudySubject[];
  batchId: string;
  onSave: (details: VerifiedReviewCard) => Promise<void>;
  savingAvailable: boolean;
}) {
  const colors = useColors();
  const [revealed, setRevealed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [topicTitle, setTopicTitle] = useState(card.topicTitle);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!revealed || !verified || !subjectId || !topicTitle.trim() || !savingAvailable || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        batchId,
        subjectId,
        topicTitle: topicTitle.trim(),
        question: card.question.trim(),
        answer: card.answer.trim(),
      });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review card could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={styles.heading}>
        <Feather name="check-square" size={16} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Review this AI-made question</Text>
      </View>
      <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>The answer stays hidden until you choose to reveal it. AI content is not saved automatically.</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>QUESTION</Text>
      <Text style={[styles.question, { color: colors.foreground }]}>{card.question}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: revealed }}
        onPress={() => setRevealed((value) => !value)}
        style={[styles.revealButton, { borderColor: colors.border, backgroundColor: colors.secondary }]}
      >
        <Text style={[styles.actionText, { color: colors.primary }]}>{revealed ? 'HIDE ANSWER' : 'REVEAL ANSWER'}</Text>
        <Feather name={revealed ? 'eye-off' : 'eye'} size={15} color={colors.primary} />
      </Pressable>
      {revealed ? (
        <>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>ANSWER · REVIEW BEFORE SAVING</Text>
          <Text style={[styles.answer, { color: colors.foreground }]}>{card.answer}</Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>SUBJECT</Text>
          {subjects.length ? (
            <View style={styles.subjects}>
              {subjects.map((subject) => {
                const selected = subject.id === subjectId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={subject.id}
                    onPress={() => {
                      setSubjectId(subject.id);
                      setVerified(false);
                    }}
                    style={[styles.subjectChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background }]}
                  >
                    <Text style={[styles.subjectText, { color: selected ? colors.primary : colors.secondaryForeground }]}>{subject.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>Add a subject to the active batch before saving this card.</Text>
          )}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>TOPIC · EDIT TO VERIFY</Text>
          <TextInput
            value={topicTitle}
            maxLength={120}
            onChangeText={(value) => {
              setTopicTitle(value);
              setVerified(false);
            }}
            placeholder="Confirm a topic"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.topicInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: verified }}
            onPress={() => setVerified((value) => !value)}
            style={styles.verifyRow}
          >
            <View style={[styles.check, { borderColor: verified ? colors.primary : colors.border, backgroundColor: verified ? colors.primary : colors.background }]}>
              {verified ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
            </View>
            <Text style={[styles.verifyText, { color: colors.foreground }]}>I checked the question, answer and topic.</Text>
          </Pressable>
          {!savingAvailable ? (
            <Text style={[styles.disclosure, { color: colors.accent }]}>Review-card saving is not available yet. This answer remains local to this screen.</Text>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={[styles.disclosure, { color: colors.destructive }]}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={!savingAvailable || !subjectId || !topicTitle.trim() || !verified || saving || saved}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: saved ? colors.secondary : colors.primary, opacity: (!savingAvailable || !subjectId || !topicTitle.trim() || !verified || saving || saved) ? 0.55 : pressed ? 0.75 : 1 },
            ]}
          >
            <Feather name={saved ? 'check' : 'bookmark'} size={15} color={saved ? colors.primary : colors.primaryForeground} />
            <Text style={[styles.saveText, { color: saved ? colors.primary : colors.primaryForeground }]}>{saved ? 'SAVED TO YOUR STUDY TOOLS' : saving ? 'SAVING…' : 'SAVE VERIFIED CARD'}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 11, gap: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 13, fontWeight: '700' },
  disclosure: { fontSize: 10, lineHeight: 15 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 3 },
  question: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  answer: { fontSize: 12, lineHeight: 18 },
  revealButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  subjectChip: { minHeight: 40, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, justifyContent: 'center' },
  subjectText: { fontSize: 10, fontWeight: '600' },
  topicInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 12 },
  verifyRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  check: { width: 20, height: 20, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  verifyText: { fontSize: 11, flex: 1 },
  saveButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});