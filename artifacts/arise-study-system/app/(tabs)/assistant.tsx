import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/build/react-navigation/bottom-tabs';
import { CoachReviewCard, type VerifiedReviewCard } from '@/components/CoachReviewCard';
import { CoachRecords } from '@/components/CoachRecords';
import { CoachRitualActions } from '@/components/CoachRitualActions';
import { CoachToolForm, CoachToolPicker } from '@/components/CoachTools';
import { ScreenHeader } from '@/components/StudyPrimitives';
import type { CoachResponseReviewCard } from '@workspace/api-client-react';
import {
  getCheckCoachStatusQueryKey,
  useCheckCoachStatus,
  useCreateCoachResponse,
} from '@workspace/api-client-react';
import type { CoachProgress, CoachRequest, CoachResponse } from '@workspace/api-client-react';
import { coachApiConfigured, createEmptyCoachDraft, makeCoachRequest, type CoachDraft, type CoachTool } from '@/coach/coachClient';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';

type CoachMessage = {
  id: string;
  role: 'user' | 'coach';
  text: string;
  reviewCard?: CoachResponseReviewCard;
  ritualMode?: 'wind-down' | 'experiment';
  ritualGoal?: string;
};

function readableError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return 'The AI Coach could not respond. Check the connection and retry.';
}

function statusErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = error.data;
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return undefined;
}

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const study = useStudy();
  const [tool, setTool] = useState<CoachTool>('coach');
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<CoachDraft>(createEmptyCoachDraft);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sendError, setSendError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const pendingRequest = useRef<{ body: CoachRequest; label: string } | null>(null);

  const statusQuery = useCheckCoachStatus({
    query: {
      queryKey: getCheckCoachStatusQueryKey(),
      enabled: coachApiConfigured,
      retry: false,
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });
  const createResponse = useCreateCoachResponse();
  const checkingStatus = coachApiConfigured && statusQuery.isFetching;
  const statusAvailable = coachApiConfigured
    && !checkingStatus
    && !statusQuery.isError
    && statusQuery.data?.status === 'available';
  const statusMessage = !coachApiConfigured
    ? 'The configured API domain is missing. Set EXPO_PUBLIC_DOMAIN to connect; requests will not fall back to Metro or localhost.'
    : checkingStatus
      ? 'Checking the AI Coach server configuration…'
      : statusQuery.isError
        ? statusErrorMessage(statusQuery.error) ?? 'The AI Coach server configuration could not be checked. Retry the status check.'
        : (
          statusQuery.data?.message
          ?? 'The AI Coach server configuration could not be checked. Retry the status check.'
        );
  const selectedQuests = study.state.quests.slice(0, 3).map((quest) => ({
    title: quest.title,
    completed: quest.completed,
  }));
  const selectedSubjects = study.activeBatchProgress.slice(0, 3).map((subject) => ({
    name: subject.name,
    completed: subject.completed,
    total: subject.total,
  }));
  const selectedNextLecture = study.nextLecture
    ? {
      subject: study.nextLecture.subjectName,
      topic: study.nextLecture.topicTitle,
      title: study.nextLecture.lecture.title,
    }
    : undefined;
  const currentExperiment = study.studyTools.experiments.find((experiment) => {
    const start = new Date(`${experiment.startDate}T00:00:00`);
    const current = new Date(`${study.state.date}T00:00:00`);
    const days = Math.round((current.getTime() - start.getTime()) / 86_400_000);
    return days >= 0 && days < 7;
  });
  const canCheckInExperiment = currentExperiment !== undefined
    && !currentExperiment.checkIns.includes(study.state.date);
  const progress: CoachProgress = {
    streak: study.state.streak,
    todayXp: study.todayXp,
    quests: selectedQuests,
    subjects: selectedSubjects,
    ...(selectedNextLecture ? { nextLecture: selectedNextLecture } : {}),
  };
  const progressSummary = [
    `${study.state.streak}-day streak`,
    `${study.todayXp} XP today`,
    `quests: ${selectedQuests.length ? selectedQuests.map((quest) => `${quest.title} · ${quest.completed ? 'complete' : 'open'}`).join(', ') : 'none selected'}`,
    `subjects: ${selectedSubjects.length ? selectedSubjects.map((subject) => `${subject.name} ${subject.completed}/${subject.total}`).join(', ') : 'none selected'}`,
    ...(selectedNextLecture ? [`next: ${selectedNextLecture.subject} · ${selectedNextLecture.topic} · ${selectedNextLecture.title}`] : []),
  ].join(' · ');

  const changeDraft = (key: keyof CoachDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const getRequestForCurrentTool = (): CoachRequest => {
    const nextDraft = { ...draft, text: input };
    return makeCoachRequest(
      tool === 'records' ? 'coach' : tool,
      nextDraft,
      tool === 'next-best-action' ? progress : undefined,
    );
  };

  const validateCurrentTool = (body: CoachRequest) => {
    const fields = body.fields;
    if (tool === 'coach' && !fields.text?.trim()) return 'Enter a study question first.';
    if (tool === 'read-recall' && (!fields.notes?.trim() || !fields.question?.trim() || !fields.recall?.trim())) {
      return 'Add your source notes, recall question and unaided recall before requesting feedback.';
    }
    if (tool === 'mistake' && (!fields.question?.trim() || !fields.attempt?.trim() || !fields.correctAnswer?.trim())) {
      return 'Add the question, your attempt and a verified correct answer first.';
    }
    if (tool === 'one-more-question' && !fields.material?.trim()) return 'Add material to base the new question on.';
    if (tool === 'concept-map' && !fields.notes?.trim()) return 'Add the notes you want mapped.';
    if (tool === 'experiment' && !fields.goal?.trim()) return 'Describe one small thing you want to try for seven days.';
    return '';
  };

  const sendRequest = async (request: { body: CoachRequest; label: string }, addUserMessage: boolean) => {
    if (createResponse.isPending || !statusAvailable) return;
    if (addUserMessage) {
      const id = `${Date.now()}-user`;
      setMessages((current) => [...current, { id, role: 'user', text: request.label }]);
    }
    pendingRequest.current = request;
    setSendError('');
    setActionNotice('');
    try {
      const response: CoachResponse = await createResponse.mutateAsync({ data: request.body });
      const message: CoachMessage = {
        id: `${Date.now()}-coach`,
        role: 'coach',
        text: response.reply,
        reviewCard: response.reviewCard,
        ...(request.body.mode === 'wind-down' || request.body.mode === 'experiment' ? { ritualMode: request.body.mode } : {}),
        ...(request.body.mode === 'experiment' ? { ritualGoal: request.body.fields.goal } : {}),
      };
      setMessages((current) => [...current, message]);
      pendingRequest.current = null;
      setInput('');
      setDraft(createEmptyCoachDraft());
    } catch (error) {
      setSendError(readableError(error));
    }
  };

  const ask = () => {
    if (tool === 'records') {
      router.push('/practice' as never);
      return;
    }
    if (!statusAvailable) return;
    const body = getRequestForCurrentTool();
    const validationMessage = validateCurrentTool(body);
    if (validationMessage) {
      pendingRequest.current = null;
      setSendError(validationMessage);
      return;
    }
    const label = tool === 'coach'
      ? body.fields.text ?? ''
      : tool === 'read-recall'
        ? `Read → Recall · ${body.fields.question}`
        : tool === 'mistake'
          ? `Mistake explanation · ${body.fields.question}`
          : tool === 'one-more-question'
            ? 'One More Question · source material sent'
            : tool === 'concept-map'
              ? 'Concept Map · source notes sent'
              : tool === 'next-best-action'
                ? 'Next Best Action · selected progress summary sent'
                : tool === 'wind-down'
                  ? 'Wind-down · optional reflection sent'
                  : `7-day experiment · ${body.fields.goal}`;
    void sendRequest({ body, label }, true);
  };

  const retry = () => {
    if (!pendingRequest.current) return;
    void sendRequest(pendingRequest.current, false);
  };

  const saveReviewCard = async (details: VerifiedReviewCard) => {
    const duplicate = study.studyTools.reviewCards.some((card) => card.batchId === details.batchId
      && card.subjectId === details.subjectId
      && card.question === details.question.trim()
      && card.answer === details.answer.trim());
    if (duplicate) {
      throw new Error('This exact question and answer are already saved for that subject.');
    }
    study.saveReviewCard(details);
  };

  const setWindDownHour = (hour: number) => {
    try {
      study.setWindDownHour(hour);
      setActionNotice(`Wind-down hour saved locally as ${String(hour).padStart(2, '0')}:00.`);
    } catch {
      setActionNotice('The wind-down hour could not be saved. Please retry from the local ritual flow.');
    }
  };

  const startExperiment = (goal: string) => {
    if (!goal.trim()) {
      setActionNotice('Open the experiment flow to set up a local seven-day trial.');
      return;
    }
    try {
      study.startExperiment(goal.trim());
      setActionNotice('Your seven-day experiment was started in local study tools.');
    } catch {
      setActionNotice('The experiment could not be started. Open the local experiment flow to retry.');
    }
  };

  const checkInExperiment = (experimentId: string) => {
    if (!experimentId) {
      setActionNotice('Experiment check-in is unavailable in local study tools right now.');
      return;
    }
    try {
      study.checkInExperiment(experimentId);
      setActionNotice('Your experiment check-in was recorded locally.');
    } catch {
      setActionNotice('The check-in could not be saved. Open the local experiment flow to retry.');
    }
  };

  const openExperiment = () => router.push('/rituals?mode=experiment' as never);
  const activeBatchSubjects = study.activeBatch.subjects;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingBottom: tabBarHeight }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          kicker="AI STUDY COACH"
          title="Study Coach"
          detail="Focused explanations, recall feedback and practical tools. You choose what to send."
          icon="message-square"
        />
        <View style={[styles.modeBanner, { backgroundColor: statusAvailable ? colors.secondary : colors.card, borderColor: statusAvailable ? colors.primary : colors.border }]}>
          <Feather name={statusAvailable ? 'check-circle' : checkingStatus ? 'loader' : 'wifi-off'} size={15} color={statusAvailable ? colors.primary : colors.accent} />
          <View style={styles.modeCopy}>
            <View style={styles.statusHeading}>
              <Text style={[styles.modeTitle, { color: statusAvailable ? colors.primary : colors.accent }]}>
                {!coachApiConfigured ? 'API DOMAIN NOT CONFIGURED' : checkingStatus ? 'CHECKING SETUP' : statusAvailable ? 'AI COACH CONFIGURED' : 'AI COACH UNAVAILABLE'}
              </Text>
              {coachApiConfigured && !checkingStatus ? (
                <Pressable accessibilityRole="button" onPress={() => void statusQuery.refetch()} style={styles.statusRetry}>
                  <Text style={[styles.statusRetryText, { color: colors.primary }]}>{statusAvailable ? 'CHECK SETUP' : 'RETRY'}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.modeText, { color: colors.mutedForeground }]}>
              {statusMessage} Requests use Replit AI Integrations; no API key is needed and AI usage is billed to your credits. {coachApiConfigured ? 'This live check verifies server SDK/configuration only; provider availability is confirmed after you tap Send.' : 'The status probe is paused until the API domain is configured.'}
            </Text>
            <Text style={[styles.consentText, { color: colors.mutedForeground }]}>
              Nothing is sent until you tap Send. That shares only this tool’s entered text; Next Action sends the small progress summary shown below. AI chats are not saved as server history.
            </Text>
          </View>
        </View>

        <CoachToolPicker value={tool} onChange={(nextTool) => {
          setTool(nextTool);
          setSendError('');
          setActionNotice('');
        }} colors={colors} />

        {tool === 'coach' ? (
          <View style={styles.suggestionList}>
            {['Explain a maths problem step by step', 'Help me plan a focused revision session', 'How can I recover after a missed day?'].map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => {
                  setInput(suggestion);
                  setSendError('');
                }}
                style={({ pressed }) => [styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.suggestionText, { color: colors.secondaryForeground }]}>{suggestion}</Text>
                <Feather name="arrow-up-right" size={15} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {tool === 'records' ? (
          <CoachRecords
            sessions={study.state.calculationHistory}
            onOpenPractice={() => router.push('/practice' as never)}
          />
        ) : (
          <CoachToolForm
            tool={tool}
            draft={draft}
            onChange={changeDraft}
            colors={colors}
          />
        )}

        {tool === 'next-best-action' ? (
          <View style={[styles.progressNote, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="database" size={13} color={colors.primary} />
            <Text style={[styles.progressText, { color: colors.secondaryForeground }]}>Selected progress to send: {progressSummary}</Text>
          </View>
        ) : null}

        <View style={styles.messageList}>
          {messages.length === 0 ? (
            <View style={[styles.emptyMessage, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={tool === 'records' ? 'award' : 'cpu'} size={18} color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {tool === 'records'
                  ? 'Personal records below are read from your local practice history.'
                  : 'Ready when you are. Your entered text is shared only after you press Send.'}
              </Text>
            </View>
          ) : null}
          {messages.map((message) => (
            <View key={message.id} style={message.role === 'user' ? styles.userMessageBlock : styles.coachMessageBlock}>
              <View style={[styles.messageRow, message.role === 'user' && styles.userMessageRow]}>
                {message.role === 'coach' ? (
                  <View style={[styles.messageIcon, { backgroundColor: colors.primary }]}>
                    <Feather name="cpu" size={14} color={colors.primaryForeground} />
                  </View>
                ) : null}
                <View style={[styles.messageBubble, { backgroundColor: message.role === 'user' ? colors.secondary : colors.card, borderColor: message.role === 'user' ? colors.accent : colors.border }]}>
                  <Text style={[styles.messageText, { color: colors.foreground }]}>{message.text}</Text>
                </View>
              </View>
              {message.reviewCard ? (
                <CoachReviewCard
                  card={message.reviewCard}
                  subjects={activeBatchSubjects}
                  batchId={study.activeBatch.id}
                  onSave={saveReviewCard}
                  savingAvailable
                />
              ) : null}
              {message.ritualMode === 'experiment' ? (
                <CoachRitualActions
                  mode="experiment"
                  onStartExperiment={!currentExperiment ? () => startExperiment(message.ritualGoal ?? '') : undefined}
                  onCheckInExperiment={canCheckInExperiment && currentExperiment ? () => checkInExperiment(currentExperiment.id) : undefined}
                  onOpenExperiment={openExperiment}
                />
              ) : null}
              {message.ritualMode === 'wind-down' ? (
                <CoachRitualActions
                  mode="wind-down"
                  onSetWindDownHour={setWindDownHour}
                  selectedWindDownHour={study.studyTools.windDownHour}
                  onOpenExperiment={openExperiment}
                />
              ) : null}
            </View>
          ))}
          {createResponse.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>The AI Coach is working…</Text>
            </View>
          ) : null}
          {actionNotice ? <Text style={[styles.actionNotice, { color: colors.primary }]}>{actionNotice}</Text> : null}
        </View>
      </ScrollView>

      {sendError ? (
        <View style={[styles.errorCard, styles.footerError, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive }]}>{sendError}</Text>
          {pendingRequest.current && statusAvailable ? (
            <Pressable
              testID="assistant-retry"
              accessibilityRole="button"
              onPress={retry}
              style={[styles.retryButton, { backgroundColor: colors.secondary }]}
            >
              <Feather name="refresh-cw" size={14} color={colors.primary} />
              <Text style={[styles.retryText, { color: colors.primary }]}>RETRY THIS REQUEST</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          testID="assistant-input"
          value={input}
          onChangeText={(value) => {
            setInput(value);
            setSendError('');
          }}
          onSubmitEditing={ask}
          maxLength={2500}
          returnKeyType="send"
          editable={tool !== 'records' && tool !== 'next-best-action'}
          placeholder={tool === 'coach' ? 'Ask a study question' : tool === 'records' ? 'Personal records open in Practice' : tool === 'next-best-action' ? 'Next Action sends progress only' : 'Optional direction for this tool'}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, opacity: tool === 'records' || tool === 'next-best-action' ? 0.7 : 1 }]}
        />
        <Pressable
          testID="assistant-send"
          accessibilityRole="button"
          accessibilityLabel={tool === 'records' ? 'Open Practice' : 'Send to AI Coach'}
          disabled={tool !== 'records' && (!coachApiConfigured || !statusAvailable || createResponse.isPending)}
          onPress={ask}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: tool === 'records' || statusAvailable ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          {createResponse.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name={tool === 'records' ? 'arrow-up-right' : 'arrow-up'} size={19} color={tool === 'records' || statusAvailable ? colors.primaryForeground : colors.mutedForeground} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 14 },
  modeBanner: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  modeCopy: { flex: 1, marginLeft: 10 },
  modeTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  modeText: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  consentText: { fontSize: 10, lineHeight: 15, marginTop: 5 },
  statusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusRetry: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  statusRetryText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  suggestionList: { gap: 7, marginBottom: 12 },
  suggestion: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionText: { flex: 1, fontSize: 11, fontWeight: '600' },
  progressNote: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  progressText: { flex: 1, fontSize: 10, lineHeight: 15 },
  messageList: { gap: 12 },
  emptyMessage: { minHeight: 66, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 3 },
  emptyText: { flex: 1, fontSize: 11, lineHeight: 16 },
  userMessageBlock: { alignSelf: 'flex-end', maxWidth: '94%' },
  coachMessageBlock: { maxWidth: '97%' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '100%' },
  userMessageRow: { alignSelf: 'flex-end' },
  messageIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  messageBubble: { borderWidth: 1, borderRadius: 15, padding: 13, flexShrink: 1 },
  messageText: { fontSize: 13, lineHeight: 19 },
  loadingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 },
  loadingText: { fontSize: 11 },
  errorCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 8 },
  footerError: { marginHorizontal: 20, marginBottom: 8 },
  errorText: { fontSize: 11, lineHeight: 16 },
  retryButton: { minHeight: 44, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.55 },
  actionNotice: { fontSize: 11, lineHeight: 16 },
  composer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 47, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 13 },
  send: { width: 47, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});