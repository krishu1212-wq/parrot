import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useStudy } from '@/contexts/StudyContext';
import { getMissedReviewCards } from '@/contexts/learningTools';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolHeading, ToolNotice, ToolPanel } from './shared';
import { getWeekday } from './shared';

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function RecoveryTool() {
  const colors = useColors();
  const { state, activeBatch, acceptRecoveryQuest, logRevision, isSubjectLocked } = useStudy();
  const params = useLocalSearchParams<{
    batchId?: string | string[];
    subjectId?: string | string[];
    topicId?: string | string[];
    topicTitle?: string | string[];
    cardIds?: string | string[];
  }>();
  const requestedBatchId = firstParam(params.batchId);
  const requestedSubjectId = firstParam(params.subjectId);
  const requestedTopicId = firstParam(params.topicId);
  const requestedTopicTitle = firstParam(params.topicTitle);
  const requestedCardIds = firstParam(params.cardIds);
  const hasScopedTarget = [
    requestedSubjectId,
    requestedTopicId,
    requestedTopicTitle,
    requestedCardIds,
  ].some((value) => value !== undefined);
  const hasRouteTarget = !!requestedBatchId || hasScopedTarget;
  const date = state.date;
  const isSunday = getWeekday(date) === 0;
  const allBatchCards = useMemo(
    () => state.studyTools.reviewCards.filter((card) => card.batchId === activeBatch.id),
    [activeBatch.id, state.studyTools.reviewCards],
  );
  const targetSubject = activeBatch.subjects.find((subject) => subject.id === requestedSubjectId);
  const targetTopic = targetSubject?.topics.find((topic) =>
    topic.id === requestedTopicId && !topic.isArchived && topic.title === requestedTopicTitle);
  const targetTopicRequested = requestedTopicId !== undefined || requestedTopicTitle !== undefined;
  const hasTargetCardList = requestedCardIds !== undefined;
  const routeTargetError = !hasRouteTarget
    ? null
    : !requestedBatchId
      ? hasScopedTarget ? 'This focused review link is missing its batch identity. No cards were selected.' : null
      : requestedBatchId !== activeBatch.id
        ? 'This review link belongs to a different batch than the one currently selected. No cards from another batch were opened.'
        : !hasScopedTarget
          ? null
          : !requestedSubjectId || !targetSubject
            ? 'The requested subject is not available in the selected batch. No other subject was substituted.'
            : isSubjectLocked(requestedSubjectId)
              ? 'This subject is still locked by the selected batch’s Phase 2 gate. Focused review was not opened.'
              : targetTopicRequested && (!requestedTopicId || !requestedTopicTitle || !targetTopic)
                ? 'The requested topic no longer matches an available topic in the selected batch and subject. No other topic was substituted.'
                : null;
  const latestTest = state.studyTools.bossTests
    .filter((test) => test.batchId === activeBatch.id)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const missedCards = useMemo(
    () => getMissedReviewCards(allBatchCards, latestTest, activeBatch.id),
    [activeBatch.id, allBatchCards, latestTest],
  );
  const targetCardIdSet = useMemo(
    () => new Set((requestedCardIds ?? '').split(',').filter(Boolean)),
    [requestedCardIds],
  );
  const focusedCards = useMemo(() => {
    if (!hasScopedTarget || routeTargetError || !requestedSubjectId) return [];
    return allBatchCards.filter((card) =>
      card.subjectId === requestedSubjectId
      && (!hasTargetCardList || targetCardIdSet.has(card.id))
      && (!targetTopicRequested || card.topicTitle === requestedTopicTitle));
  }, [
    allBatchCards,
    hasScopedTarget,
    requestedSubjectId,
    requestedCardIds,
    hasTargetCardList,
    requestedTopicTitle,
    routeTargetError,
    targetCardIdSet,
    targetTopicRequested,
  ]);
  const isFocusedTarget = hasScopedTarget && !routeTargetError;
  const focusedTargetEmpty = isFocusedTarget && focusedCards.length === 0;
  const targetNotice = routeTargetError
    ?? (focusedTargetEmpty
      ? 'No current saved cards match this exact target in the selected batch. Other cards were not substituted.'
      : null);
  const reviewBatchId = useRef(activeBatch.id);
  const [cardSource, setCardSource] = useState<'missed' | 'all'>(missedCards.length ? 'missed' : 'all');
  const [selectedSubjectId, setSelectedSubjectId] = useState('all');
  const sourceCards = hasRouteTarget
    ? routeTargetError ? [] : isFocusedTarget ? focusedCards : cardSource === 'missed' && missedCards.length > 0 ? missedCards : allBatchCards
    : cardSource === 'missed' && missedCards.length > 0 ? missedCards : allBatchCards;
  const availableSubjects = activeBatch.subjects.filter(
    (subject) => sourceCards.some((card) => card.subjectId === subject.id),
  );
  const cards = reviewBatchId.current !== activeBatch.id ? [] : isFocusedTarget
    ? focusedCards
    : sourceCards.filter((card) => selectedSubjectId === 'all' || card.subjectId === selectedSubjectId);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [recall, setRecall] = useState('');
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const savedRef = useRef(false);
  const currentCard = cards[index];

  const resetReview = () => {
    savedRef.current = false;
    setIndex(0);
    setRevealed(false);
    setRecall('');
    setReviewedIds([]);
    setSaved(false);
    setError('');
  };

  useEffect(() => {
    if (reviewBatchId.current === activeBatch.id) return;
    reviewBatchId.current = activeBatch.id;
    setSelectedSubjectId('all');
    setCardSource(missedCards.length ? 'missed' : 'all');
    resetReview();
  }, [activeBatch.id, missedCards.length]);

  const chooseCardSource = (source: 'missed' | 'all') => {
    if (source === cardSource) return;
    setCardSource(source);
    setSelectedSubjectId('all');
    resetReview();
  };

  const chooseSubject = (subjectId: string) => {
    if (subjectId === selectedSubjectId) return;
    setSelectedSubjectId(subjectId);
    resetReview();
  };

  const markReviewed = () => {
    if (reviewBatchId.current !== activeBatch.id || !currentCard || !revealed) return;
    setReviewedIds((current) => current.includes(currentCard.id) ? current : [...current, currentCard.id]);
    setIndex((current) => current + 1);
    setRevealed(false);
    setRecall('');
  };

  const finishReview = () => {
    if (reviewBatchId.current !== activeBatch.id || savedRef.current || reviewedIds.length === 0) return;
    try {
      savedRef.current = true;
      logRevision(reviewedIds, activeBatch.id);
      setError('');
      setSaved(true);
    } catch {
      savedRef.current = false;
      setError('This review could not be saved. Your reviewed card list is still available; try again.');
    }
  };

  return (
    <>
      <ToolHeading
        kicker={isFocusedTarget ? 'FOCUSED · SAVED-CARD RECALL' : isSunday ? 'SUNDAY · RECOVERY' : 'SAVED-CARD REVIEW'}
        title={isFocusedTarget
          ? targetTopic ? `Focused recall · ${targetTopic.title}` : 'Focused saved-card recall'
          : isSunday ? 'A calm reset' : 'Review saved cards'}
        detail={isFocusedTarget
          ? `${cards.length} matching saved card${cards.length === 1 ? '' : 's'} from ${targetSubject?.name ?? 'the selected subject'} · ${activeBatch.name}. Only this batch, subject, topic, and card set is used.`
          : isSunday
          ? 'Sunday is the scheduled reset. Saved-card review and accepted recovery quests remain available every day.'
          : 'Review real saved questions any day. Sunday is highlighted on the local calendar, not an XP-only day.'}
      />
      {targetNotice ? (
        <ToolNotice
          icon="alert-circle"
          title="FOCUSED REVIEW NOT AVAILABLE"
          message={targetNotice}
        />
      ) : null}
      <View style={[styles.weekStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, offset) => {
          const active = getWeekday(date) === ((offset + 1) % 7);
          return (
            <View key={`${day}-${offset}`} style={[styles.weekdayCell, active && { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
              <Text style={[styles.weekday, { color: active ? colors.primary : colors.mutedForeground }]}>{day}</Text>
              {offset === 6 ? <View style={[styles.sundayDot, { backgroundColor: active ? colors.primary : colors.accent }]} /> : <View style={styles.sundayDot} />}
            </View>
          );
        })}
      </View>
      {!isSunday ? (
        <ToolNotice
          icon="calendar"
          title="SUNDAY RECOVERY IS SCHEDULED"
          message="Sunday is highlighted on the local calendar. Saving reviewed cards can complete an already accepted Recovery Quest any day."
        />
      ) : (
        <ToolNotice
          icon="rotate-ccw"
          title="RECOVERY IS A RESET, NOT A PENALTY"
          message="Start with weak topics from your latest saved boss test when available. Otherwise, use the batch’s saved questions."
        />
      )}
      {latestTest ? (
        <ToolNotice
          icon="target"
          title={`LATEST BOSS TEST · ${latestTest.date}`}
          message={`WEEK OF ${latestTest.weekStart}. ${missedCards.length
            ? `${missedCards.length} saved card${missedCards.length === 1 ? '' : 's'} match incorrect result IDs from this test. You can also switch to all saved cards.`
            : latestTest.results.some((result) => !result.correct)
              ? `No saved cards match the incorrect result IDs from this test. You can review actual saved cards from ${activeBatch.name}.`
              : `This test has no incorrect results. You can choose any subject with saved cards from ${activeBatch.name}.`}`}
        />
      ) : null}

      {state.recoveryAvailable ? (
        <ToolPanel>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>A recovery quest is available</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            Accept the existing {state.recoveryXp || 80} XP recovery quest before finishing this review. Saving reviewed cards will complete it; review alone does not create recovery XP.
          </Text>
          <ToolButton
            testID="recovery-accept-quest"
            label={`ACCEPT RECOVERY QUEST · ${state.recoveryXp || 80} XP`}
            icon="check"
            onPress={acceptRecoveryQuest}
          />
        </ToolPanel>
      ) : null}

      {allBatchCards.length > 0 && !saved && !isFocusedTarget && !routeTargetError ? (
        <ToolPanel>
          {missedCards.length > 0 ? (
            <>
              <Text style={[styles.filterLabel, { color: colors.primary }]}>REVIEW SET</Text>
              <View style={styles.filterList}>
                <Pressable
                  testID="recovery-source-missed"
                  accessibilityRole="button"
                  accessibilityState={{ selected: cardSource === 'missed' }}
                  onPress={() => chooseCardSource('missed')}
                  style={[styles.filterOption, { backgroundColor: cardSource === 'missed' ? colors.secondary : colors.card, borderColor: cardSource === 'missed' ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.filterText, { color: cardSource === 'missed' ? colors.primary : colors.mutedForeground }]}>MISSED IN TEST · {latestTest?.date}</Text>
                </Pressable>
                <Pressable
                  testID="recovery-source-all"
                  accessibilityRole="button"
                  accessibilityState={{ selected: cardSource === 'all' }}
                  onPress={() => chooseCardSource('all')}
                  style={[styles.filterOption, { backgroundColor: cardSource === 'all' ? colors.secondary : colors.card, borderColor: cardSource === 'all' ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.filterText, { color: cardSource === 'all' ? colors.primary : colors.mutedForeground }]}>ALL SAVED CARDS</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          <Text style={[styles.filterLabel, { color: colors.primary }]}>SUBJECT</Text>
          <View style={styles.filterList}>
            <Pressable
              testID="recovery-subject-all"
              accessibilityRole="button"
              accessibilityState={{ selected: selectedSubjectId === 'all' }}
              onPress={() => chooseSubject('all')}
              style={[styles.filterOption, { backgroundColor: selectedSubjectId === 'all' ? colors.secondary : colors.card, borderColor: selectedSubjectId === 'all' ? colors.primary : colors.border }]}
            >
              <Text style={[styles.filterText, { color: selectedSubjectId === 'all' ? colors.primary : colors.mutedForeground }]}>ALL SUBJECTS</Text>
            </Pressable>
            {availableSubjects.map((subject) => (
              <Pressable
                key={subject.id}
                testID={`recovery-subject-${subject.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedSubjectId === subject.id }}
                onPress={() => chooseSubject(subject.id)}
                style={[styles.filterOption, { backgroundColor: selectedSubjectId === subject.id ? colors.secondary : colors.card, borderColor: selectedSubjectId === subject.id ? colors.primary : colors.border }]}
              >
                <Text style={[styles.filterText, { color: selectedSubjectId === subject.id ? colors.primary : colors.mutedForeground }]}>{subject.name.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </ToolPanel>
      ) : null}

      {cards.length === 0 ? (
        <ToolPanel>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="book-open" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {targetNotice ? 'Focused review unavailable' : 'No saved cards for this batch yet'}
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            {targetNotice ?? 'Review uses only your saved questions and answers. Add a real question before starting a recall session.'}
          </Text>
          {!hasScopedTarget && !routeTargetError ? (
            <>
              <ToolButton testID="recovery-add-question" label="SAVE A QUESTION" icon="bookmark" onPress={() => router.push('/rituals?mode=boss' as never)} />
              <ToolButton label="OPEN STUDY COACH" icon="message-square" secondary onPress={() => router.push('/(tabs)/assistant' as never)} />
            </>
          ) : null}
        </ToolPanel>
      ) : null}

      {cards.length > 0 && !saved && currentCard ? (
        <ToolPanel>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardCount, { color: colors.primary }]}>CARD {index + 1} OF {cards.length}</Text>
            <Text numberOfLines={1} style={[styles.topic, { color: colors.mutedForeground }]}>{currentCard.topicTitle}</Text>
          </View>
          <Text style={[styles.question, { color: colors.foreground }]}>{currentCard.question}</Text>
          <TextInput
            testID="recovery-recall"
            accessibilityLabel="Your recalled answer, optional"
            value={recall}
            onChangeText={setRecall}
            editable={!revealed}
            placeholder="Your recall (optional)"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.recallInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, opacity: revealed ? 0.72 : 1 }]}
          />
          {!revealed ? (
            <>
              <Text style={[styles.recallHint, { color: colors.mutedForeground }]}>Write an answer or recall it silently before revealing. Your draft is not stored.</Text>
              <ToolButton testID="recovery-reveal" label="REVEAL SAVED ANSWER" icon="eye" onPress={() => setRevealed(true)} />
            </>
          ) : (
            <>
              <View style={[styles.answerReveal, { borderColor: colors.accent, backgroundColor: colors.secondary }]}>
                <Text style={[styles.answerLabel, { color: colors.accent }]}>SAVED ANSWER</Text>
                <Text style={[styles.answerText, { color: colors.foreground }]}>{currentCard.answer}</Text>
              </View>
              <Text style={[styles.recallHint, { color: colors.mutedForeground }]}>Mark this card reviewed, whether recalled or not.</Text>
              <ToolButton testID="recovery-mark-reviewed" label="MARK REVIEWED & CONTINUE" icon="check" onPress={markReviewed} />
            </>
          )}
          {reviewedIds.length ? (
            <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>{reviewedIds.length} card{reviewedIds.length === 1 ? '' : 's'} reviewed in this session</Text>
          ) : null}
        </ToolPanel>
      ) : null}

      {cards.length > 0 && !saved && index >= cards.length ? (
        <ToolPanel>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="check" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Cards reviewed</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Save the reviewed-card list once to your revision history.</Text>
          <ToolButton testID="recovery-finish" label="FINISH & SAVE REVIEW" icon="save" onPress={finishReview} disabled={reviewedIds.length === 0} />
        </ToolPanel>
      ) : null}

      {cards.length > 0 && saved ? (
        <ToolPanel>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="check" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Review saved</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            {reviewedIds.length} card{reviewedIds.length === 1 ? '' : 's'} added to revision history. Recovery XP requires an accepted Recovery Quest for today. If this batch's Maths course is already complete, reviewing one of its actual Maths cards can also satisfy the existing Maths daily goal; lecture counts and lecture XP are unchanged.
          </Text>
          {state.quests.some((quest) => quest.id === `recovery-${date}` && quest.completed)
            ? <Text style={[styles.recoveryDone, { color: colors.primary }]}>Accepted Recovery Quest marked complete.</Text>
            : null}
        </ToolPanel>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  weekStrip: { borderWidth: 1, borderRadius: 14, padding: 8, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' },
  weekdayCell: { width: 38, minHeight: 48, borderWidth: 1, borderColor: 'transparent', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 12, fontWeight: '700' },
  sundayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptyCopy: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 12 },
  cardCount: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  topic: { flex: 1, textAlign: 'right', fontSize: 11 },
  question: { fontSize: 17, fontWeight: '600', lineHeight: 25 },
  recallInput: { minHeight: 68, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, textAlignVertical: 'top', marginTop: 12 },
  recallHint: { fontSize: 12, lineHeight: 18, marginTop: 12, marginBottom: 10 },
  answerReveal: { borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 13 },
  answerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 6 },
  answerText: { fontSize: 14, lineHeight: 21 },
  reviewCount: { fontSize: 11, textAlign: 'center', marginTop: 11 },
  recoveryDone: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  filterLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  filterList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterOption: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  error: { fontSize: 12, lineHeight: 18, marginBottom: 11 },
});