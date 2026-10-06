import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { MAX_TOPIC_LECTURES, getProtectedLectureCount } from '@/contexts/batchSystem';
import type { StudyBatch, StudyLecture, StudySubject, StudyTopic } from '@/contexts/batchSystem';
import { useColors } from '@/hooks/useColors';

export type BatchEditorState =
  | { kind: 'batch'; batch?: StudyBatch }
  | { kind: 'subject'; subject?: StudySubject }
  | { kind: 'topic'; subjectId: string; topic?: StudyTopic }
  | { kind: 'lecture'; subjectId: string; topicId: string; lecture?: StudyLecture };

type Props = {
  editor: BatchEditorState;
  onClose: () => void;
  onSaveBatch: (batchId: string | undefined, values: { name: string; source: string; startDate: string }) => void;
  onSaveSubject: (name: string, subjectId?: string) => string | null;
  onSaveTopic: (subjectId: string, topicId: string | undefined, values: { title: string; category: string; isArchived: boolean; lectureCount: number }) => boolean;
  onSaveLecture: (subjectId: string, topicId: string, lectureId: string | undefined, values: { title: string; link: string; xpReward: number; isArchived: boolean }) => void;
};

const validDate = (value: string) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function BatchEditorModal({
  editor,
  onClose,
  onSaveBatch,
  onSaveSubject,
  onSaveTopic,
  onSaveLecture,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const initialTitle = editor.kind === 'batch'
    ? editor.batch?.name ?? ''
    : editor.kind === 'subject'
      ? editor.subject?.name ?? ''
      : editor.kind === 'topic'
        ? editor.topic?.title ?? ''
        : editor.lecture?.title ?? '';
  const [title, setTitle] = useState(initialTitle);
  const [source, setSource] = useState(editor.kind === 'batch' ? editor.batch?.source ?? '' : '');
  const [startDate, setStartDate] = useState(editor.kind === 'batch' ? editor.batch?.startDate ?? '' : '');
  const [category, setCategory] = useState(editor.kind === 'topic' ? editor.topic?.category ?? '' : '');
  const [link, setLink] = useState(editor.kind === 'lecture' ? editor.lecture?.link ?? '' : '');
  const [xpReward, setXpReward] = useState(String(editor.kind === 'lecture' ? editor.lecture?.xpReward ?? 50 : 50));
  const [isArchived, setIsArchived] = useState(
    editor.kind === 'topic' ? editor.topic?.isArchived ?? false : editor.kind === 'lecture' ? editor.lecture?.isArchived ?? false : false,
  );
  const activeCount = editor.kind === 'topic' && editor.topic ? editor.topic.lectures.filter((l) => !l.isArchived).length : 0;
  const protectedCount = editor.kind === 'topic' && editor.topic ? getProtectedLectureCount(editor.topic) : 0;
  const [lectureCount, setLectureCount] = useState(String(activeCount));
  const [error, setError] = useState('');

  const heading = editor.kind === 'batch'
    ? editor.batch ? 'Edit batch' : 'Add a batch'
    : editor.kind === 'subject'
      ? editor.subject ? 'Edit subject' : 'Add a subject'
      : editor.kind === 'topic'
        ? editor.topic ? 'Edit topic' : 'Add a topic'
        : editor.lecture ? 'Edit lecture' : 'Add a lecture';

  const save = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(editor.kind === 'subject' ? 'Enter a subject name.' : 'Enter a name.');
      return;
    }

    if (editor.kind === 'batch') {
      if (!validDate(startDate.trim())) {
        setError('Use a valid date in YYYY-MM-DD format, or leave it blank.');
        return;
      }
      onSaveBatch(editor.batch?.id, { name: cleanTitle, source: source.trim(), startDate: startDate.trim() });
    } else if (editor.kind === 'subject') {
      if (!onSaveSubject(cleanTitle, editor.subject?.id)) {
        setError('That subject already exists in this batch.');
        return;
      }
    } else if (editor.kind === 'topic') {
      const raw = lectureCount.trim();
      const count = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(count) || count < 0 || count > MAX_TOPIC_LECTURES) {
        setError(`Lecture count must be a whole number from 0 to ${MAX_TOPIC_LECTURES}.`);
        return;
      }
      if (count < protectedCount) {
        setError(`${protectedCount} lectures are started, completed or hold XP history. The count cannot go below that.`);
        return;
      }
      if (!onSaveTopic(editor.subjectId, editor.topic?.id, { title: cleanTitle, category: category.trim(), isArchived, lectureCount: count })) {
        setError('Could not save this topic. Check the name is unique in this subject and the lecture count is valid.');
        return;
      }
    } else {
      const parsedXp = Number(xpReward);
      if (!Number.isFinite(parsedXp) || parsedXp < 0) {
        setError('XP reward must be zero or a positive number.');
        return;
      }
      onSaveLecture(editor.subjectId, editor.topicId, editor.lecture?.id, {
        title: cleanTitle,
        link: link.trim(),
        xpReward: Math.floor(parsedXp),
        isArchived,
      });
    }

    Keyboard.dismiss();
    onClose();
  };

  const fieldStyle = [styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.kicker, { color: colors.primary }]}>BATCH COURSE SETUP</Text>
              <Text style={[styles.heading, { color: colors.foreground }]}>{heading}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close editor" onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            bottomOffset={82}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              {editor.kind === 'batch' ? 'BATCH NAME' : editor.kind === 'subject' ? 'SUBJECT NAME' : editor.kind === 'topic' ? 'TOPIC NAME' : 'LECTURE TITLE'}
            </Text>
            <TextInput
              testID="batch-editor-title"
              value={title}
              onChangeText={(value) => { setTitle(value); setError(''); }}
              placeholder={editor.kind === 'batch' ? 'e.g. SSC CGL · Batch 2' : editor.kind === 'subject' ? 'e.g. General Awareness' : editor.kind === 'topic' ? 'e.g. Percentage' : 'e.g. Percentage basics'}
              placeholderTextColor={colors.mutedForeground}
              style={fieldStyle}
              returnKeyType="next"
            />

            {editor.kind === 'batch' ? (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>SOURCE / PLATFORM</Text>
                <TextInput
                  value={source}
                  onChangeText={setSource}
                  placeholder="e.g. Careerwill"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  returnKeyType="next"
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>START DATE · OPTIONAL</Text>
                <TextInput
                  value={startDate}
                  onChangeText={(value) => { setStartDate(value); setError(''); }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                />
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>Adding a batch keeps the current batch and its progress. Standard subjects start empty.</Text>
              </>
            ) : null}

            {editor.kind === 'topic' ? (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>GROUP · OPTIONAL</Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. Arithmetic"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  returnKeyType="next"
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>NUMBER OF LECTURES</Text>
                <TextInput
                  testID="topic-lecture-count"
                  value={lectureCount}
                  onChangeText={(value) => { setLectureCount(value); setError(''); }}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  New lectures are numbered and worth 50 XP each. Lowering the count only archives lectures you have never started; nothing is deleted and history is kept. Raising it restores archived placeholders first, then adds new ones. Minimum now: {protectedCount}. Maximum: {MAX_TOPIC_LECTURES}.
                </Text>
              </>
            ) : null}

            {editor.kind === 'lecture' ? (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>LECTURE LINK · OPTIONAL</Text>
                <TextInput
                  testID="lecture-link-input"
                  value={link}
                  onChangeText={setLink}
                  placeholder="Paste a lecture URL"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>XP REWARD</Text>
                <TextInput
                  testID="lecture-xp-input"
                  value={xpReward}
                  editable={!editor.lecture?.xpAwarded}
                  onChangeText={(value) => { setXpReward(value); setError(''); }}
                  placeholder="50"
                  placeholderTextColor={colors.mutedForeground}
                  style={fieldStyle}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{editor.lecture?.xpAwarded ? 'Earned XP is kept unchanged when you edit this lecture.' : 'A lecture awards XP once, when you mark it complete.'}</Text>
              </>
            ) : null}

            {editor.kind === 'topic' && editor.topic ? (
              <Pressable onPress={() => setIsArchived((value) => !value)} style={[styles.archiveToggle, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Feather name={isArchived ? 'rotate-ccw' : 'archive'} size={15} color={isArchived ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.archiveText, { color: colors.foreground }]}>{isArchived ? 'Restore topic to progress' : 'Archive topic and keep its history'}</Text>
              </Pressable>
            ) : null}

            {editor.kind === 'lecture' && editor.lecture ? (
              <Pressable onPress={() => setIsArchived((value) => !value)} style={[styles.archiveToggle, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Feather name={isArchived ? 'rotate-ccw' : 'archive'} size={15} color={isArchived ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.archiveText, { color: colors.foreground }]}>{isArchived ? 'Restore lecture to progress' : 'Archive lecture and keep its history'}</Text>
              </Pressable>
            ) : null}

            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive ?? colors.accent }]}>{error}</Text> : null}
            <Pressable testID="batch-editor-save" onPress={save} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}>
              <Feather name="check" size={15} color={colors.primaryForeground} />
              <Text style={[styles.saveText, { color: colors.primaryForeground }]}>{editor.kind === 'batch' && editor.batch ? 'SAVE BATCH' : 'SAVE'}</Text>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,7,17,0.82)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  panel: { width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  headerCopy: { flex: 1 },
  kicker: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  heading: { fontSize: 21, fontWeight: '700' },
  closeButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formScroll: { flexGrow: 0 },
  formContent: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginTop: 13, marginBottom: 6 },
  input: { minHeight: 45, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  archiveToggle: { minHeight: 43, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  archiveText: { flex: 1, fontSize: 11, fontWeight: '600' },
  error: { fontSize: 11, marginTop: 12 },
  saveButton: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 17 },
  saveText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});