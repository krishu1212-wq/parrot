import { Feather } from '@expo/vector-icons';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BatchEditorModal } from '@/components/BatchEditorModal';
import type { BatchEditorState } from '@/components/BatchEditorModal';
import { LinearGradient } from 'expo-linear-gradient';
import { GUARDIAN_NAMES, GuardianArt, guardianKindFor } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { ProgressBar, ScreenHeader } from '@/components/StudyPrimitives';
import { useStudy } from '@/contexts/StudyContext';
import { getNextLectureForSubject, getTopicProgress } from '@/contexts/batchSystem';
import type { StudyLecture, StudyTopic } from '@/contexts/batchSystem';
import { useColors } from '@/hooks/useColors';
import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

function TopicCard({
  topic,
  expanded,
  onToggle,
  onEdit,
  onAddLecture,
  onEditLecture,
  onStartLecture,
  onCompleteLecture,
  locked,
  accent,
}: {
  accent?: string;
  locked: boolean;
  topic: StudyTopic;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddLecture: () => void;
  onEditLecture: (lecture: StudyLecture) => void;
  onStartLecture: (lecture: StudyLecture) => void;
  onCompleteLecture: (lecture: StudyLecture) => void;
}) {
  const baseColors = useColors();
  const colors = accent ? { ...baseColors, primary: accent } : baseColors;
  const tp = getTopicProgress(topic);
  const visibleLectures = { length: tp.total };
  const completed = tp.completed;
  const progress = tp.progress;

  return (
    <View style={[styles.topicCard, { borderLeftWidth: 3, borderLeftColor: accent ?? colors.primary, borderRadius: 4, backgroundColor: colors.card, borderColor: topic.isArchived ? colors.mutedForeground : colors.border, opacity: topic.isArchived ? 0.72 : 1 }]}>
      <View style={styles.topicHeader}>
        <Pressable
          testID={`topic-toggle-${topic.id}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={styles.topicToggle}
        >
          <View style={[styles.topicMarker, { backgroundColor: completed === visibleLectures.length && visibleLectures.length > 0 ? colors.primary : colors.secondary }]}>
            <Feather name={completed === visibleLectures.length && visibleLectures.length > 0 ? 'check' : 'book-open'} size={14} color={completed === visibleLectures.length && visibleLectures.length > 0 ? colors.primaryForeground : colors.primary} />
          </View>
          <View style={styles.topicCopy}>
            <Text style={[styles.topicTitle, { color: colors.foreground }]}>{topic.title}</Text>
            <ProgressBar value={progress} color={progress === 1 && visibleLectures.length > 0 ? colors.primary : colors.accent} />
          </View>
          <Text style={[styles.topicCount, { color: colors.secondaryForeground }]}>{completed}/{tp.total} · {tp.remaining} left · {Math.round(tp.progress * 100)}%</Text>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable testID={`edit-topic-${topic.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${topic.title}`} onPress={onEdit} hitSlop={6} style={[styles.iconButton, { borderColor: colors.border }]}>
          <Feather name="edit-2" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable testID={`add-lecture-${topic.id}`} accessibilityRole="button" accessibilityLabel={`Add lecture to ${topic.title}`} disabled={topic.isArchived} onPress={onAddLecture} style={[styles.iconButton, styles.addIconButton, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: topic.isArchived ? 0.45 : 1 }]}>
          <Feather name="plus" size={15} color={colors.primary} />
        </Pressable>
      </View>

      {expanded ? (
        <View style={[styles.lectureList, { borderTopColor: colors.border }]}>
          {topic.lectures.length ? topic.lectures.map((lecture) => (
            <LectureRow
              key={lecture.id}
              lecture={lecture}
              topicArchived={topic.isArchived}
              locked={locked}
              onEdit={() => onEditLecture(lecture)}
              onStart={() => onStartLecture(lecture)}
              onComplete={() => onCompleteLecture(lecture)}
            />
          )) : (
            <Text style={[styles.emptyLectureText, { color: colors.mutedForeground }]}>No lectures yet. Add the first lecture to this topic.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function LectureRow({
  lecture,
  topicArchived,
  locked,
  onEdit,
  onStart,
  onComplete,
}: {
  locked: boolean;
  lecture: StudyLecture;
  topicArchived: boolean;
  onEdit: () => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  const colors = useColors();
  const archived = lecture.isArchived || topicArchived;
  const completed = lecture.status === 'completed';
  const completionPressAt = useRef(0);
  const statusLabel = archived
    ? 'ARCHIVED · HISTORY KEPT'
    : completed
      ? 'COMPLETED'
      : lecture.status === 'in-progress'
        ? `IN PROGRESS · ${lecture.sessionCount} ${lecture.sessionCount === 1 ? 'SESSION' : 'SESSIONS'}`
        : 'NOT STARTED';

  return (
    <View testID={`lecture-${lecture.id}`} style={[styles.lectureRow, { borderBottomColor: colors.border, opacity: archived ? 0.62 : 1 }]}>
      <View style={styles.lectureTitleLine}>
        <View style={styles.lectureCopy}>
          <Text style={[styles.lectureTitle, { color: colors.foreground }]}>{lecture.title}</Text>
          <Text style={[styles.lectureStatus, { color: completed ? colors.primary : archived ? colors.mutedForeground : colors.accent }]}>{statusLabel}</Text>
          {lecture.firstStartedAt ? (
            <Text style={[styles.lectureMeta, { color: colors.mutedForeground }]}>First session {new Date(lecture.firstStartedAt).toLocaleDateString()}</Text>
          ) : null}
        </View>
        <View style={styles.lectureReward}>
          <Text style={[styles.rewardValue, { color: completed ? colors.primary : colors.secondaryForeground }]}>+{lecture.xpReward}</Text>
          <Text style={[styles.rewardLabel, { color: colors.mutedForeground }]}>XP</Text>
        </View>
        <Pressable testID={`edit-lecture-${lecture.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${lecture.title}`} onPress={(e) => { e.stopPropagation(); onEdit(); }} hitSlop={6} style={[styles.smallIconButton, { borderColor: colors.border, minWidth: 44, minHeight: 44 }]}>
          <Feather name="more-horizontal" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {!archived ? (
        <View style={styles.lectureActions}>
          <Pressable testID={`start-lecture-${lecture.id}`} disabled={locked || completed} onPress={(e) => { e.stopPropagation(); onStart(); }} style={({ pressed }) => [styles.startButton, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: locked || completed ? 0.4 : pressed ? 0.76 : 1 }]}>
            <Feather name={lecture.status === 'in-progress' ? 'play' : 'play-circle'} size={13} color={colors.primary} />
            <Text style={[styles.startButtonText, { color: colors.primary }]}>{completed ? 'LECTURE COMPLETE' : lecture.status === 'in-progress' ? 'CONTINUE SESSION' : 'START LECTURE'}</Text>
          </Pressable>
          <Pressable testID={`complete-lecture-${lecture.id}`} disabled={locked || completed} onPress={(e) => { e.stopPropagation(); completionPressAt.current = Date.now(); onComplete(); }} style={({ pressed }) => [styles.completeButton, { backgroundColor: colors.primary, opacity: locked || completed ? 0.4 : pressed ? 0.76 : 1 }]}>
            <Feather name="check" size={13} color={colors.primaryForeground} />
            <Text style={[styles.completeButtonText, { color: colors.primaryForeground }]}>{completed ? 'COMPLETED' : 'COMPLETE'}</Text>
          </Pressable>
        </View>
      ) : null}
      {!archived && lecture.link ? (
        <Pressable testID={`open-lecture-link-${lecture.id}`} disabled={locked} onPress={(e) => {
          e.stopPropagation();
          // Ignore a click retargeted here while completion updates the layout.
          if (!locked && Date.now() - completionPressAt.current > 350) openLectureLink(lecture.link);
        }} style={[styles.linkButton, { opacity: locked ? 0.4 : 1, minHeight: 44 }]}>
          <Feather name="external-link" size={12} color={colors.accent} />
          <Text numberOfLines={1} style={[styles.linkText, { color: colors.accent }]}>{locked ? 'LINK LOCKED' : 'OPEN LECTURE LINK'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

async function openLectureLink(value: string) {
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open link', 'Check that this lecture link is valid and try again.');
  }
}

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function MathsScreen() {
  const baseColors = useColors();
  const insets = useSafeAreaInsets();
  const {
    state,
    activeBatch,
    activeBatchProgress,
    nextLecture,
    setActiveBatch,
    createBatch,
    updateBatch,
    addBatchSubject,
    updateBatchSubject,
    addBatchTopic,
    updateBatchTopic,
    addBatchLecture,
    updateBatchLecture,
    startLecture,
    completeLecture,
    isSubjectLocked,
  } = useStudy();
  const subjectLocked = (id?: string) => !!id && isSubjectLocked(id);
  const params = useLocalSearchParams<{
    batchId?: string | string[];
    subject?: string | string[];
    topicId?: string | string[];
    topicTitle?: string | string[];
    lectureId?: string | string[];
  }>();
  const requestedBatchId = firstParam(params.batchId);
  const requestedSubject = firstParam(params.subject);
  const requestedTopicId = firstParam(params.topicId);
  const requestedTopicTitle = firstParam(params.topicTitle);
  const requestedLectureId = firstParam(params.lectureId);
  const hasTopicTarget = !!(requestedTopicId || requestedTopicTitle || requestedLectureId);
  const requestedBatchMatches = !requestedBatchId || requestedBatchId === activeBatch.id;
  const requestedSubjectExists = activeBatch.subjects.some((subject) => subject.id === requestedSubject);
  const targetSubject = activeBatch.subjects.find((subject) => subject.id === requestedSubject);
  const targetTopic = targetSubject?.topics.find((topic) =>
    topic.id === requestedTopicId && !topic.isArchived
    && (!requestedTopicTitle || topic.title === requestedTopicTitle));
  const targetLecture = targetTopic?.lectures.find((lecture) =>
    lecture.id === requestedLectureId && !lecture.isArchived);
  const topicTargetValid = hasTopicTarget
    && !!requestedBatchId
    && requestedBatchMatches
    && !!requestedSubject
    && !!targetTopic
    && (!requestedLectureId || !!targetLecture)
    && !subjectLocked(requestedSubject);
  const invalidTopicTarget = hasTopicTarget && !topicTargetValid;
  const [selectedSubjectId, setSelectedSubjectId] = useState(requestedSubject || 'maths');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (requestedBatchId && !requestedBatchMatches) return;
    if (topicTargetValid && requestedSubject && requestedTopicId) {
      setSelectedSubjectId(requestedSubject);
      setExpandedTopicId(requestedTopicId);
      return;
    }
    if (hasTopicTarget) return;
    if (requestedSubject && requestedSubjectExists) {
      setSelectedSubjectId(requestedSubject);
      setExpandedTopicId(undefined);
    }
  }, [
    requestedSubject,
    requestedBatchId,
    requestedBatchMatches,
    activeBatch.id,
    requestedSubjectExists,
    hasTopicTarget,
    requestedTopicId,
    topicTargetValid,
  ]);
  const [editor, setEditor] = useState<BatchEditorState | null>(null);

  const selectedSubject = activeBatch.subjects.find((subject) => subject.id === selectedSubjectId)
    ?? activeBatch.subjects[0];
  const selectedProgress = selectedSubject
    ? activeBatchProgress.find((item) => item.subjectId === selectedSubject.id)
    : undefined;
  const categories = Array.from(new Set((selectedSubject?.topics ?? []).map((topic) => topic.category.trim() || 'TOPICS')));
  const subjectNext = selectedSubject ? getNextLectureForSubject(activeBatch, selectedSubject.id) : null;
  const recommendedTopicId = subjectNext?.topicId ?? (nextLecture?.subjectId === selectedSubject?.id ? nextLecture.topicId : null);
  const openTopicId = expandedTopicId === undefined ? recommendedTopicId : expandedTopicId;
  const subjectOptions = activeBatchProgress;
  const gKind = guardianKindFor(`${selectedSubject?.id ?? ''} ${selectedSubject?.name ?? ''}`);
  const accent = gKind === 'reasoning' ? '#8F7CFF' : gKind === 'english' ? '#38E0CF' : '#6FD8FF';
  const colors = { ...baseColors, primary: accent };

  const editKey = editor
    ? editor.kind === 'batch'
      ? `batch-${editor.batch?.id ?? 'new'}`
      : editor.kind === 'subject'
        ? `subject-${editor.subject?.id ?? 'new'}`
        : editor.kind === 'topic'
          ? `topic-${editor.topic?.id ?? 'new'}`
          : `lecture-${editor.lecture?.id ?? 'new'}-${editor.topicId}`
    : 'closed';

  const saveBatch = (batchId: string | undefined, values: { name: string; source: string; startDate: string }) => {
    if (batchId) updateBatch(batchId, values);
    else createBatch(values);
  };

  const saveTopic = (subjectId: string, topicId: string | undefined, values: { title: string; category: string; isArchived: boolean; lectureCount: number }) => {
    if (topicId) return updateBatchTopic(subjectId, topicId, values);
    const newTopicId = addBatchTopic(subjectId, values.title, values.category, values.lectureCount);
    if (newTopicId) setExpandedTopicId(newTopicId);
    return !!newTopicId;
  };

  const saveLecture = (
    subjectId: string,
    topicId: string,
    lectureId: string | undefined,
    values: { title: string; link: string; xpReward: number; isArchived: boolean },
  ) => {
    if (lectureId) {
      updateBatchLecture(subjectId, topicId, lectureId, values);
      return;
    }
    addBatchLecture(subjectId, topicId, values);
    setExpandedTopicId(topicId);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          kicker="TRAINING DECK"
          title="Batch Courses"
          detail="Switch batches, then add and track the lectures in your current course."
          icon="book-open"
        />
        {selectedSubject ? (
          <View style={{ marginBottom: 16 }} testID="subject-hero-art">
            <View style={{ height: 250, overflow: 'hidden', backgroundColor: baseColors.background, justifyContent: 'flex-end' }}>
              <WorldArtwork scene="guardian" opacity={0.85} />
              <LinearGradient colors={['rgba(4,8,18,0.05)', 'rgba(4,8,18,0.95)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" />
              <View style={{ position: 'absolute', top: 8, alignSelf: 'center' }}><GuardianArt kind={gKind} size={150} /></View>
            </View>
            <HudFrame accent={accent} style={{ marginTop: -22, marginHorizontal: 8 }}>
              <Text style={{ color: accent, fontSize: 10, fontWeight: '700', letterSpacing: 2 }}>{GUARDIAN_NAMES[gKind].toUpperCase()}</Text>
              <Text style={{ color: baseColors.foreground, fontSize: 22, fontWeight: '700', marginTop: 2 }}>{selectedSubject.name}</Text>
              <Text style={{ color: baseColors.mutedForeground, fontSize: 13, marginTop: 2 }}>
                {selectedProgress ? `${selectedProgress.completed}/${selectedProgress.total} lectures · ${Math.round(selectedProgress.progress * 100)}%` : 'No progress data'}
              </Text>
            </HudFrame>
          </View>
        ) : null}
        {invalidTopicTarget ? (
          <View style={[styles.targetError, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
            <Text style={[styles.targetErrorText, { color: colors.destructive }]}>
              This focused lecture link no longer matches an available topic in the selected batch, subject, or phase. The requested target was not opened.
            </Text>
          </View>
        ) : null}

        <View style={styles.batchHeader}>
          <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>YOUR BATCHES</Text>
          <Pressable testID="add-batch" onPress={() => setEditor({ kind: 'batch' })} style={({ pressed }) => [styles.addBatchButton, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}>
            <Feather name="plus" size={14} color={colors.primaryForeground} />
            <Text style={[styles.addBatchText, { color: colors.primaryForeground }]}>NEW BATCH</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.batchPicker}>
          {state.batches.map((batch) => (
            <Pressable
              key={batch.id}
              testID={`select-batch-${batch.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: batch.id === activeBatch.id }}
              onPress={() => {
                setActiveBatch(batch.id);
                setExpandedTopicId(undefined);
                router.setParams({
                  batchId: undefined,
                  topicId: undefined,
                  topicTitle: undefined,
                  lectureId: undefined,
                });
              }}
              style={({ pressed }) => [
                styles.batchChip,
                { backgroundColor: batch.id === activeBatch.id ? colors.secondary : colors.card, borderColor: batch.id === activeBatch.id ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={styles.batchChipTop}>
                <Text numberOfLines={1} style={[styles.batchChipName, { color: batch.id === activeBatch.id ? colors.primary : colors.foreground }]}>{batch.name}</Text>
                {batch.isActive ? <View style={[styles.activeDot, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <Text numberOfLines={1} style={[styles.batchChipMeta, { color: colors.mutedForeground }]}>{batch.isActive ? 'ACTIVE' : 'INACTIVE'}{batch.source ? ` · ${batch.source}` : ''}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.batchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.batchCardCopy}>
            <Text style={[styles.cardEyebrow, { color: colors.primary }]}>ACTIVE BATCH</Text>
            <Text style={[styles.batchTitle, { color: colors.foreground }]}>{activeBatch.name}</Text>
            <Text style={[styles.batchDetail, { color: colors.mutedForeground }]}>
              {activeBatch.source || 'Source not set'}{activeBatch.startDate ? ` · Starts ${activeBatch.startDate}` : ''}
            </Text>
          </View>
          <Pressable testID="edit-active-batch" accessibilityRole="button" accessibilityLabel="Edit active batch" onPress={() => setEditor({ kind: 'batch', batch: activeBatch })} style={[styles.iconButton, { borderColor: colors.border }]}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.subjectHeader}>
          <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>SUBJECTS</Text>
          <Pressable testID="add-subject" onPress={() => setEditor({ kind: 'subject' })} style={styles.textAction}>
            <Feather name="plus" size={14} color={colors.primary} />
            <Text style={[styles.textActionLabel, { color: colors.primary }]}>ADD SUBJECT</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectPicker}>
          {subjectOptions.map((subject) => (
            <View
              key={subject.subjectId}
              style={[styles.subjectChip, { backgroundColor: selectedSubject?.id === subject.subjectId ? colors.primary : colors.card, borderColor: selectedSubject?.id === subject.subjectId ? colors.primary : colors.border }]}
            >
              <Pressable
                testID={`select-subject-${subject.subjectId}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedSubject?.id === subject.subjectId }}
                onPress={() => {
                  setSelectedSubjectId(subject.subjectId);
                  setExpandedTopicId(undefined);
                  router.setParams({
                    subject: subject.subjectId,
                    batchId: undefined,
                    topicId: undefined,
                    topicTitle: undefined,
                    lectureId: undefined,
                  });
                }}
                style={styles.subjectSelect}
              >
                <Text style={[styles.subjectChipName, { color: selectedSubject?.id === subject.subjectId ? colors.primaryForeground : colors.secondaryForeground }]}>{subject.name}</Text>
                <Text style={[styles.subjectChipCount, { color: selectedSubject?.id === subject.subjectId ? colors.primaryForeground : colors.mutedForeground }]}>{subject.completed}/{subject.total} · {subject.remaining} left</Text>
              </Pressable>
              <Pressable
                testID={`edit-subject-${subject.subjectId}`}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${subject.name}`}
                onPress={() => setEditor({ kind: 'subject', subject: activeBatch.subjects.find((item) => item.id === subject.subjectId) })}
                style={[styles.subjectEditButton, { borderColor: selectedSubject?.id === subject.subjectId ? 'rgba(255,255,255,0.3)' : colors.border }]}
              >
                <Feather name="edit-2" size={11} color={selectedSubject?.id === subject.subjectId ? colors.primaryForeground : colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </ScrollView>

        {selectedSubject && selectedProgress ? (
          <>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryCopy}>
                  <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>{selectedSubject.name.toUpperCase()} · COURSE PROGRESS</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedProgress.completed}<Text style={[styles.summaryTotal, { color: colors.mutedForeground }]}> / {selectedProgress.total} LECTURES</Text></Text>
                </View>
                <Text style={[styles.summaryPercent, { color: colors.primary }]}>{Math.round(selectedProgress.progress * 100)}%</Text>
              </View>
              <ProgressBar value={selectedProgress.progress} />
              <Text style={[styles.summaryFootText, { color: colors.secondaryForeground, marginTop: 9 }]}>{selectedProgress.completed} COMPLETED · {selectedProgress.remaining} REMAINING · {selectedProgress.total} TOTAL</Text>
              {subjectLocked(selectedSubject.id) ? (
                <View style={[styles.nextBox, { borderColor: colors.accent, backgroundColor: colors.secondary }]}>
                  <Text style={[styles.summaryFootText, { color: colors.accent, flex: 1, lineHeight: 12 }]}>LEARNING LOCKED · Learning unlocks after you finish the selected batch’s Maths course and NCERT reading. Setup, editing and history stay available. External lecture watching cannot auto-report; completion is manual once unlocked.</Text>
                </View>
              ) : null}
              {subjectNext ? (
                <View style={[styles.nextBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <View style={styles.summaryCopy}>
                    <Text style={[styles.summaryFootText, { color: colors.primary }]}>{subjectNext.lecture.status === 'in-progress' ? 'CURRENT LECTURE' : 'NEXT LECTURE'}</Text>
                    <Text style={[styles.lectureTitle, { color: colors.foreground, marginTop: 3 }]}>{subjectNext.lecture.title}</Text>
                    <Text style={[styles.lectureMeta, { color: colors.mutedForeground }]}>{subjectNext.batchName} · {subjectNext.topicTitle}</Text>
                  </View>
                  <Pressable
                    testID="subject-next-start"
                    disabled={subjectLocked(selectedSubject.id)}
                    accessibilityRole="button"
                    onPress={() => {
                      if (subjectLocked(selectedSubject.id)) return;
                      startLecture(subjectNext.subjectId, subjectNext.topicId, subjectNext.lecture.id);
                      setExpandedTopicId(subjectNext.topicId);
                      if (!subjectLocked(selectedSubject.id) && subjectNext.lecture.link) openLectureLink(subjectNext.lecture.link);
                    }}
                    style={({ pressed }) => [styles.completeButton, { backgroundColor: colors.primary, opacity: subjectLocked(selectedSubject.id) ? 0.4 : pressed ? 0.76 : 1 }]}
                  >
                    <Feather name="play" size={13} color={colors.primaryForeground} />
                    <Text style={[styles.completeButtonText, { color: colors.primaryForeground }]}>{subjectNext.lecture.status === 'in-progress' ? 'CONTINUE' : 'START'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[styles.summaryFootText, { color: colors.mutedForeground, marginTop: 9 }]}>NO REMAINING LECTURES IN THIS SUBJECT</Text>
              )}
              <View style={styles.summaryFooter}>
                <Text style={[styles.summaryFootText, { color: colors.mutedForeground }]}>{selectedSubject.topics.filter((topic) => !topic.isArchived).length} topics · total updates when lectures change</Text>
                <Text style={[styles.summaryFootText, { color: colors.accent }]}>{selectedSubject.name.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.topicListHeader}>
              <View style={styles.topicListCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{selectedSubject.name} topics</Text>
                <Text style={[styles.sectionNote, { color: colors.mutedForeground }]}>Tap a topic to see its lectures. Archived records stay saved but do not count toward progress.</Text>
              </View>
              <Pressable testID="add-topic" onPress={() => setEditor({ kind: 'topic', subjectId: selectedSubject.id })} style={({ pressed }) => [styles.addTopicButton, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addTopicText, { color: colors.primary }]}>TOPIC</Text>
              </Pressable>
            </View>

            {selectedSubject.topics.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="book-open" size={21} color={colors.primary} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No topics in this subject yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add a topic, then add as many lectures as this batch requires.</Text>
              </View>
            ) : (
              categories.map((category) => {
                const topics = selectedSubject.topics.filter((topic) => (topic.category.trim() || 'TOPICS') === category);
                return (
                  <View key={category} style={styles.categorySection}>
                    <View style={styles.categoryHeading}>
                      <Text style={[styles.categoryTitle, { color: colors.secondaryForeground }]}>{category}</Text>
                      <Text style={[styles.categoryCount, { color: colors.mutedForeground }]}>{topics.length} {topics.length === 1 ? 'TOPIC' : 'TOPICS'}</Text>
                    </View>
                    <View style={styles.topicList}>
                      {topics.map((topic) => (
                        <TopicCard
                          accent={accent}
                          key={topic.id}
                          topic={topic}
                          locked={subjectLocked(selectedSubject.id)}
                          expanded={openTopicId === topic.id}
                          onToggle={() => setExpandedTopicId(openTopicId === topic.id ? null : topic.id)}
                          onEdit={() => setEditor({ kind: 'topic', subjectId: selectedSubject.id, topic })}
                          onAddLecture={() => setEditor({ kind: 'lecture', subjectId: selectedSubject.id, topicId: topic.id })}
                          onEditLecture={(lecture) => setEditor({ kind: 'lecture', subjectId: selectedSubject.id, topicId: topic.id, lecture })}
                          onStartLecture={(lecture) => {
                            if (subjectLocked(selectedSubject.id)) return;
                            startLecture(selectedSubject.id, topic.id, lecture.id);
                            if (lecture.link) openLectureLink(lecture.link);
                          }}
                          onCompleteLecture={(lecture) => completeLecture(selectedSubject.id, topic.id, lecture.id)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Add a subject to this batch</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>You can create any subject, then organize its topics and lectures.</Text>
          </View>
        )}
      </ScrollView>

      {editor ? (
        <BatchEditorModal
          key={editKey}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaveBatch={saveBatch}
          onSaveSubject={(name, subjectId) => {
            if (subjectId) return updateBatchSubject(subjectId, name);
            const id = addBatchSubject(name);
            if (id) setSelectedSubjectId(id);
            return id;
          }}
          onSaveTopic={saveTopic}
          onSaveLecture={saveLecture}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 14 },
  targetError: { borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 13 },
  targetErrorText: { fontSize: 12, lineHeight: 17 },
  batchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  addBatchButton: { minHeight: 34, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  addBatchText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  batchPicker: { gap: 8, paddingBottom: 12 },
  batchChip: { width: 164, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9 },
  batchChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  batchChipName: { flex: 1, fontSize: 12, fontWeight: '700' },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  batchChipMeta: { fontSize: 8, fontWeight: '700', letterSpacing: 0.6, marginTop: 5 },
  batchCard: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  batchCardCopy: { flex: 1, paddingRight: 10 },
  cardEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 5 },
  batchTitle: { fontSize: 17, fontWeight: '700' },
  batchDetail: { fontSize: 10, marginTop: 4 },
  iconButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  textActionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  subjectPicker: { gap: 8, paddingBottom: 17 },
  subjectChip: { borderWidth: 1, borderRadius: 12, minWidth: 132, paddingLeft: 11, paddingRight: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  subjectSelect: { flex: 1 },
  subjectChipName: { fontSize: 11, fontWeight: '700' },
  subjectChipCount: { fontSize: 9, fontWeight: '600', marginTop: 3 },
  subjectEditButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderWidth: 1, borderRadius: 17, padding: 15, marginBottom: 23 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  summaryCopy: { flex: 1, paddingRight: 10 },
  summaryValue: { fontSize: 27, fontWeight: '700' },
  summaryTotal: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  summaryPercent: { fontSize: 24, fontWeight: '700' },
  nextBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  summaryFootText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  topicListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  topicListCopy: { flex: 1, paddingRight: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionNote: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  addTopicButton: { minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addTopicText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  categorySection: { marginBottom: 20 },
  categoryHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  categoryTitle: { fontSize: 16, fontWeight: '700' },
  categoryCount: { fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  topicList: { gap: 8 },
  topicCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  topicHeader: { minHeight: 65, flexDirection: 'row', alignItems: 'center', padding: 9, gap: 7 },
  topicToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  topicMarker: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topicCopy: { flex: 1, gap: 7 },
  topicTitle: { fontSize: 12, fontWeight: '700' },
  topicCount: { minWidth: 60, textAlign: 'right', fontSize: 10, fontWeight: '700' },
  addIconButton: { borderWidth: 1 },
  lectureList: { borderTopWidth: 1, paddingHorizontal: 10 },
  emptyLectureText: { fontSize: 11, lineHeight: 16, paddingVertical: 13 },
  lectureRow: { borderBottomWidth: 1, paddingVertical: 11 },
  lectureTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  lectureCopy: { flex: 1, paddingRight: 4 },
  lectureTitle: { fontSize: 12, fontWeight: '600' },
  lectureStatus: { fontSize: 8, fontWeight: '700', letterSpacing: 0.7, marginTop: 4 },
  lectureMeta: { fontSize: 9, marginTop: 3 },
  lectureReward: { alignItems: 'flex-end', minWidth: 30 },
  rewardValue: { fontSize: 12, fontWeight: '700' },
  rewardLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 0.7 },
  smallIconButton: { width: 28, height: 28, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  lectureActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  startButton: { flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  startButtonText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  completeButton: { minHeight: 44, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  completeButtonText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, minHeight: 24 },
  linkText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  emptyCard: { borderWidth: 1, borderRadius: 15, padding: 18, alignItems: 'flex-start', gap: 7 },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 11, lineHeight: 16 },
});