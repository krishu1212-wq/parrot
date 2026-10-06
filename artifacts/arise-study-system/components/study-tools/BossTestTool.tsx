import { Feather } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useStudy } from '@/contexts/StudyContext';
import { getWeeklyBossTest, getWeeklyReviewCards, getWeekStart, getWeakTopics } from '@/contexts/learningTools';
import { useColors } from '@/hooks/useColors';
import { BossEmblem, GuardianArt } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import BossBanner from '@/components/BossBanner';
import { deriveWeaknessRadar } from '@/contexts/masterProgress';
import { ToolButton, ToolHeading, ToolNotice, ToolPanel } from './shared';
import { getWeekday } from './shared';
import { getGateDefinition } from '@/contexts/rpgCatalog';
import BossContinuation from './BossContinuation';
import BossPresentation from './BossPresentation';

type TestResult = {
  cardId: string;
  question: string;
  expectedAnswer: string;
  answer: string;
  correct: boolean;
  topicTitle: string;
  subjectId: string;
};

type BossTestToolProps = { gateId?: string };

function BossWorldHeader({ label }: { label: string }) {
  return (
    <View testID="boss-world-header" style={{ height: 150, marginBottom: 12, overflow: 'hidden' }}>
      <WorldArtwork scene="guardian" opacity={0.9} />
      <HudFrame accent="#FF667E" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessible={false}>
          <BossEmblem size={92} color="#FF667E" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FF667E', fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>{label}</Text>
            <Text style={{ color: '#F2F6FF', fontSize: 11, marginTop: 4 }}>Recall readiness: five saved cards, honest self-marking.</Text>
          </View>
          <GuardianArt kind="reasoning" size={56} />
        </View>
      </HudFrame>
    </View>
  );
}

export default function BossTestTool({ gateId }: BossTestToolProps) {
  const colors = useColors();
  const {
    state, rpg, activeBatch, saveBossTest, saveGateBossTest, saveReviewCard,
  } = useStudy();
  const date = state.date;
  const saturday = getWeekday(date) === 6;
  const currentWeekCards = useMemo(
    () => getWeeklyReviewCards(state.studyTools.reviewCards, activeBatch.id, date),
    [activeBatch.id, date, state.studyTools.reviewCards],
  );
  const existingTest = getWeeklyBossTest(state.studyTools.bossTests, activeBatch.id, date);
  const history = state.studyTools.bossTests
    .filter((test) => test.batchId === activeBatch.id && !test.gateAttemptId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const gateRequested = gateId !== undefined;
  const activeAttempt = rpg.attempts.find((attempt) => attempt.id === rpg.activeAttemptId
    && attempt.status === 'active');
  const gateDefinition = gateId ? getGateDefinition(gateId) : undefined;
  const gateAttempt = gateRequested
    ? (activeAttempt?.gateId === gateId
      ? activeAttempt
      : [...rpg.attempts].reverse().find((attempt) => attempt.gateId === gateId))
    : undefined;
  const validGate = !!gateId && gateDefinition?.type === 'boss'
    && !!activeAttempt && activeAttempt.gateId === gateId && activeAttempt.batchId === activeBatch.id;
  const gateCards = state.studyTools.reviewCards.filter((reviewCard) => reviewCard.batchId === activeBatch.id);
  const gateRecords = state.studyTools.bossTests.filter((test) => test.gateAttemptId === gateAttempt?.id
    && test.batchId === activeBatch.id);
  const gateRecorded = gateRecords[gateRecords.length - 1];
  const gateDeadlineOpen = !!activeAttempt && Date.parse(activeAttempt.deadlineAt) > Date.now();
  const gateCanRun = validGate && gateDeadlineOpen && gateCards.length >= 5;

  const radar = useMemo(() => deriveWeaknessRadar(state), [state]);
  const bossWeak = radar.findings.find((f) => f.isActiveBatch);
  const recorded = existingTest ?? null;
  const bossResult = recorded && recorded.results.length
    ? { correct: recorded.results.filter((r) => r.correct).length, total: recorded.results.length }
    : null;

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [saved, setSaved] = useState(false);
  const [started, setStarted] = useState(false);
  const [gateRetakeStarted, setGateRetakeStarted] = useState(false);
  const [error, setError] = useState('');
  const submissionStarted = useRef(false);

  const [saveSubjectId, setSaveSubjectId] = useState(activeBatch.subjects[0]?.id ?? '');
  const [saveTopic, setSaveTopic] = useState('');
  const [saveQuestion, setSaveQuestion] = useState('');
  const [saveAnswer, setSaveAnswer] = useState('');
  const [saveCardMessage, setSaveCardMessage] = useState('');
  const card = currentWeekCards[index];
  const officialReady = saturday && !existingTest && !saved && currentWeekCards.length > 0;
  const awaitingSubmission = saturday && !existingTest && !saved && currentWeekCards.length > 0 && started;

  const recordAnswer = (correct: boolean) => {
    if (!awaitingSubmission || !card || !revealed || submissionStarted.current) return;
    const next: TestResult = {
      cardId: card.id,
      question: card.question,
      expectedAnswer: card.answer,
      answer: answer.trim(),
      correct,
      topicTitle: card.topicTitle,
      subjectId: card.subjectId,
    };
    const nextResults = [...results, next];
    setResults(nextResults);
    setAnswer('');
    setRevealed(false);
    if (index + 1 < currentWeekCards.length) setIndex(index + 1);
    else {
      const payload = {
        batchId: activeBatch.id,
        date,
        weekStart: getWeekStart(date),
        results: nextResults,
        weakTopics: getWeakTopics(nextResults),
      };
      if (submissionStarted.current || getWeeklyBossTest(state.studyTools.bossTests, activeBatch.id, date)) {
        setError('An official test has already been recorded for this batch and week.');
        return;
      }
      submissionStarted.current = true;
      try {
        saveBossTest(payload);
        setSaved(true);
        setError('');
      } catch {
        submissionStarted.current = false;
        setError('The test could not be saved. Your answers are still on this screen; try marking the final answer again.');
        setIndex(currentWeekCards.length - 1);
        setResults(nextResults.slice(0, -1));
        setAnswer(next.answer);
        setRevealed(true);
      }
    }
  };

  const recordGateAnswer = (correct: boolean) => {
    const gateCard = gateCards[index];
    if (!gateCanRun || !gateCard || !revealed) return;
    const next: TestResult = {
      cardId: gateCard.id,
      question: gateCard.question,
      expectedAnswer: gateCard.answer,
      answer: answer.trim(),
      correct,
      topicTitle: gateCard.topicTitle,
      subjectId: gateCard.subjectId,
    };
    const nextResults = [...results, next];
    setResults(nextResults);
    setAnswer('');
    setRevealed(false);
    if (index + 1 < 5) {
      setIndex(index + 1);
      return;
    }
    if (submissionStarted.current) return;
    submissionStarted.current = true;
    try {
      saveGateBossTest({
        batchId: activeBatch.id,
        date,
        weekStart: getWeekStart(date),
        results: nextResults,
        weakTopics: getWeakTopics(nextResults),
      });
      setSaved(true);
      setError('');
    } catch {
      submissionStarted.current = false;
      setError('The Gate challenge could not be saved. Your answers are still on this screen; try marking the final answer again.');
      setIndex(4);
      setResults(nextResults.slice(0, -1));
      setAnswer(next.answer);
      setRevealed(true);
    }
  };

  const restartGateChallenge = () => {
    setIndex(0);
    setAnswer('');
    setRevealed(false);
    setResults([]);
    setSaved(false);
    setGateRetakeStarted(true);
    setError('');
    submissionStarted.current = false;
  };

  const saveQuestionCard = () => {
    const topicTitle = saveTopic.trim();
    const question = saveQuestion.trim();
    const answerText = saveAnswer.trim();
    if (!saveSubjectId || !topicTitle || !question || !answerText) {
      setSaveCardMessage('Choose a saved subject and enter a topic, question, and expected answer.');
      return;
    }
    if (!activeBatch.subjects.some((subject) => subject.id === saveSubjectId)) {
      setSaveCardMessage('Choose a subject from the active batch before saving.');
      return;
    }
    if (state.studyTools.reviewCards.some((item) => item.batchId === activeBatch.id
      && item.subjectId === saveSubjectId && item.question === question && item.answer === answerText)) {
      setSaveCardMessage('A matching question and answer are already saved in this batch.');
      return;
    }
    try {
      saveReviewCard({
        batchId: activeBatch.id,
        subjectId: saveSubjectId,
        topicTitle,
        question,
        answer: answerText,
      });
      setSaveTopic('');
      setSaveQuestion('');
      setSaveAnswer('');
      setSaveCardMessage('Question saved to this batch. It will be eligible for this week when its saved date is in this week.');
    } catch {
      setSaveCardMessage('This question could not be saved. Please try again.');
    }
  };

  if (gateRequested) {
    const gateDisplayStatus = gateAttempt?.status;
    const gateProgress = gateRecorded
      ? `${gateRecorded.results.filter((item) => item.correct).length}/${gateRecorded.results.length}`
      : null;
    const gateCard = gateCards[index];
    return (
      <>
        <BossWorldHeader label="BOSS GATE CHALLENGE" />
        <ToolHeading
          kicker="GATE CHALLENGE · SAVED CARDS"
          title="Boss test"
          detail={`Practice for ${gateDefinition?.name ?? 'the selected Gate'} with saved questions from ${activeBatch.name}. This is separate from the official weekly test.`}
        />
        {!gateDefinition || gateDefinition.type !== 'boss' || !gateAttempt ? (
          <ToolNotice
            icon="lock"
            title="NO MATCHING ACTIVE BOSS GATE"
            message="Gate practice opens only from the matching, currently active boss Gate. This link cannot start or unlock an attempt."
          />
        ) : !validGate ? (
          <ToolNotice
            icon="lock"
            title="GATE ATTEMPT IS NOT ACTIVE"
            message={`This Gate attempt is ${gateAttempt.status}. Gate practice cannot resume or change a completed, failed, or abandoned attempt.`}
          />
        ) : !gateDeadlineOpen ? (
          <ToolNotice
            icon="clock"
            title="GATE ATTEMPT IS NO LONGER ACTIVE"
            message="The active attempt deadline has passed. Return to the Gate to see its engine-recorded outcome."
          />
        ) : gateCards.length < 5 ? (
          <ToolPanel>
            <Text style={[styles.formKicker, { color: colors.accent }]}>PREPARE 5 SAVED CARDS</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              This Gate challenge needs at least 5 existing review cards in the active batch. You currently have {gateCards.length}. Review or save more real questions before returning; no questions are generated here.
            </Text>
            <ToolButton label="OPEN SAVED-CARD REVISION" icon="rotate-ccw" secondary onPress={() => router.push('/rituals?mode=recovery' as never)} />
          </ToolPanel>
        ) : (
          <>
            <BossBanner
              level={history.length + 1}
              answered={saved ? results.length : gateRecorded?.results.length ?? 0}
              total={5}
              weakness={bossWeak ? `${bossWeak.topicTitle} (${Math.round(bossWeak.accuracy.percent)}% recalled)` : null}
              result={gateRecorded ? {
                correct: gateRecorded.results.filter((item) => item.correct).length,
                total: gateRecorded.results.length,
              } : null}
            />
            <ToolPanel>
              <Text style={[styles.formKicker, { color: colors.primary }]}>ACTIVE ATTEMPT · {gateDefinition?.name}</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                {gateCards.length} saved cards available · {activeAttempt?.goal ?? 5} Gate objective · attempt deadline {activeAttempt?.deadlineAt}
              </Text>
              {gateRecorded && !saved ? (
                <>
                  <Text style={[styles.savedHeading, { color: colors.foreground }]}>Gate challenge result · {gateRecorded.date}</Text>
                  <Text style={[styles.savedScore, { color: colors.primary }]}>{gateProgress} self-marked as recalled</Text>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Engine status: {gateDisplayStatus ?? 'inactive'}. The challenge result itself does not claim a Gate clear.</Text>
                  {gateRecorded.results.map((result) => (
                    <View key={`${result.cardId}-${result.question}`} style={[styles.resultRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.resultQuestion, { color: colors.foreground }]}>{result.question}</Text>
                      <Text style={[styles.historyLine, { color: result.correct ? colors.primary : colors.accent }]}>{result.correct ? 'RECALLED' : 'REVIEW'} · {result.topicTitle}</Text>
                      <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>Your answer: {result.answer || 'No written answer'} · Expected: {result.expectedAnswer}</Text>
                    </View>
                  ))}
                  {gateCanRun ? (
                    <ToolButton label="RETAKE GATE CHALLENGE" icon="rotate-ccw" secondary onPress={restartGateChallenge} />
                  ) : null}
                </>
              ) : null}
              {gateCanRun && !saved && (!gateRecorded || gateRetakeStarted) ? (
                <>
                  <Text style={[styles.formKicker, { color: colors.primary, marginTop: 12 }]}>QUESTION {index + 1} OF 5</Text>
                  <Text style={[styles.progressTag, { color: colors.mutedForeground }]}>{gateCard?.topicTitle}</Text>
                  <Text style={[styles.question, { color: colors.foreground }]}>{gateCard?.question}</Text>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Recall before revealing. Mark your answer honestly against the saved answer.</Text>
                  <TextInput
                    testID="boss-answer"
                    accessibilityLabel="Your recalled answer"
                    value={answer}
                    onChangeText={setAnswer}
                    editable={!revealed}
                    placeholder="Type what you remember"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    style={[styles.input, styles.multiline, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, opacity: revealed ? 0.72 : 1 }]}
                  />
                  {revealed ? (
                    <>
                      <View style={[styles.answerReveal, { borderColor: colors.accent, backgroundColor: colors.secondary }]}>
                        <Text style={[styles.answerLabel, { color: colors.accent }]}>SAVED EXPECTED ANSWER</Text>
                        <Text style={[styles.answerText, { color: colors.foreground }]}>{gateCard?.answer}</Text>
                      </View>
                      <View style={styles.markRow}>
                        <View style={styles.markButton}>
                          <ToolButton testID="boss-mark-correct" label="I GOT IT" icon="check" onPress={() => recordGateAnswer(true)} />
                        </View>
                        <View style={styles.markButton}>
                          <ToolButton testID="boss-mark-incorrect" label="NEEDS REVIEW" icon="rotate-ccw" secondary onPress={() => recordGateAnswer(false)} />
                        </View>
                      </View>
                    </>
                  ) : (
                    <ToolButton testID="boss-reveal" label="REVEAL SAVED ANSWER" icon="eye" onPress={() => setRevealed(true)} />
                  )}
                </>
              ) : null}
              {saved ? (
                <>
                  <Text style={[styles.savedHeading, { color: colors.foreground }]}>Gate challenge submitted</Text>
                  <Text style={[styles.savedScore, { color: colors.primary }]}>{results.filter((result) => result.correct).length}/{results.length} self-marked as recalled</Text>
                  <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>The engine determines Gate progress and clear status from its own criteria. This separate challenge never replaces your official weekly test.</Text>
                  {results.map((result) => (
                    <View key={`${result.cardId}-${result.question}`} style={[styles.resultRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.resultQuestion, { color: colors.foreground }]}>{result.question}</Text>
                      <Text style={[styles.historyLine, { color: result.correct ? colors.primary : colors.accent }]}>{result.correct ? 'RECALLED' : 'REVIEW'} · {result.topicTitle}</Text>
                      <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>Your answer: {result.answer || 'No written answer'} · Expected: {result.expectedAnswer}</Text>
                    </View>
                  ))}
                  {gateCanRun ? <ToolButton label="RETAKE GATE CHALLENGE" icon="rotate-ccw" secondary onPress={restartGateChallenge} /> : null}
                </>
              ) : null}
            </ToolPanel>
          </>
        )}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </>
    );
  }

  return (
    <>
      <BossWorldHeader label="SATURDAY BOSS" />
      <ToolHeading
        kicker="OFFICIAL · SATURDAY ONLY"
        title="Boss test"
        detail={`Real questions saved to ${activeBatch.name} this local week. Honest self-marking; rewards belong only to canonical study records.`}
      />
      <BossBanner
        level={history.length + 1}
        answered={existingTest ? currentWeekCards.length : results.length}
        total={currentWeekCards.length}
        weakness={bossWeak ? `${bossWeak.topicTitle} (${Math.round(bossWeak.accuracy.percent)}% recalled)` : null}
        result={bossResult}
      />
      {!saturday ? (
        <ToolNotice
          icon="lock"
          title="OFFICIAL TEST IS LOCKED"
          message="The official weekly boss test opens on Saturday. Your saved questions stay available for review in the meantime."
        />
      ) : null}

      {currentWeekCards.length === 0 && !existingTest ? (
        <ToolPanel>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="bookmark" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved questions for this week</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            The official test uses only questions you save to this active batch during the local Monday–Sunday week.
          </Text>
          <View style={[styles.formDivider, { borderTopColor: colors.border }]} />
          <Text style={[styles.formKicker, { color: colors.primary }]}>COACH QUESTION BANK</Text>
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Saved subject</Text>
          <View style={styles.subjectRow}>
            {activeBatch.subjects.map((subject) => {
              const selected = subject.id === saveSubjectId;
              return (
                <Pressable
                  key={subject.id}
                  testID={`boss-card-subject-${subject.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSaveSubjectId(subject.id)}
                  style={[styles.subjectPill, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background }]}
                >
                  <Text style={[styles.subjectPillText, { color: selected ? colors.primary : colors.mutedForeground }]}>{subject.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Topic title</Text>
          <TextInput
            testID="boss-card-topic"
            accessibilityLabel="Topic title"
            value={saveTopic}
            onChangeText={setSaveTopic}
            maxLength={200}
            placeholder="Use a topic from your batch"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Your question</Text>
          <TextInput
            testID="boss-card-question"
            accessibilityLabel="Your study question"
            value={saveQuestion}
            onChangeText={setSaveQuestion}
            maxLength={4000}
            placeholder="Write a question you want to recall"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.input, styles.multiline, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Expected answer</Text>
          <TextInput
            testID="boss-card-answer"
            accessibilityLabel="Expected answer"
            value={saveAnswer}
            onChangeText={setSaveAnswer}
            maxLength={10000}
            placeholder="Add your own answer"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.input, styles.multiline, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
          />
          {saveCardMessage ? <Text accessibilityRole={saveCardMessage.startsWith('Question saved') ? 'text' : 'alert'} style={[styles.feedback, { color: saveCardMessage.startsWith('Question saved') ? colors.primary : colors.mutedForeground }]}>{saveCardMessage}</Text> : null}
          <ToolButton testID="boss-save-card" label="SAVE MY QUESTION" icon="bookmark" onPress={saveQuestionCard} />
          <ToolButton label="OPEN STUDY COACH" icon="message-square" secondary onPress={() => router.push('/(tabs)/assistant' as never)} />
        </ToolPanel>
      ) : null}

      {officialReady && !started ? (
        <ToolPanel>
          <BossPresentation />
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{currentWeekCards.length} saved question(s) · Saturday official test · one recorded result per batch this week.</Text>
          <ToolButton testID="boss-start-official" label="START OFFICIAL BOSS TEST" icon="play" onPress={() => setStarted(true)} />
        </ToolPanel>
      ) : null}

      {awaitingSubmission ? (
        <ToolPanel>
          <View style={styles.testProgress}>
            <Text style={[styles.formKicker, { color: colors.primary }]}>QUESTION {index + 1} OF {currentWeekCards.length}</Text>
            <Text style={[styles.progressTag, { color: colors.mutedForeground }]}>{card?.topicTitle}</Text>
          </View>
          <Text style={[styles.question, { color: colors.foreground }]}>{card?.question}</Text>
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Recall before revealing. Your response is optional.</Text>
          <TextInput
            testID="boss-answer"
            accessibilityLabel="Your recalled answer"
            value={answer}
            onChangeText={setAnswer}
            editable={!revealed}
            placeholder="Type what you remember"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.input, styles.multiline, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, opacity: revealed ? 0.72 : 1 }]}
          />
          {revealed ? (
            <>
              <View style={[styles.answerReveal, { borderColor: colors.accent, backgroundColor: colors.secondary }]}>
                <Text style={[styles.answerLabel, { color: colors.accent }]}>SAVED EXPECTED ANSWER</Text>
                <Text style={[styles.answerText, { color: colors.foreground }]}>{card?.answer}</Text>
              </View>
              <Text style={[styles.selfMark, { color: colors.mutedForeground }]}>Mark yourself honestly against the saved answer.</Text>
              <View style={styles.markRow}>
                <View style={styles.markButton}>
                  <ToolButton testID="boss-mark-correct" label="I GOT IT" icon="check" onPress={() => recordAnswer(true)} />
                </View>
                <View style={styles.markButton}>
                  <ToolButton testID="boss-mark-incorrect" label="NEEDS REVIEW" icon="rotate-ccw" secondary onPress={() => recordAnswer(false)} />
                </View>
              </View>
            </>
          ) : (
            <ToolButton testID="boss-reveal" label="REVEAL SAVED ANSWER" icon="eye" onPress={() => setRevealed(true)} />
          )}
        </ToolPanel>
      ) : null}

      {existingTest ? (
        <ToolPanel>
          <BossPresentation result={{ correct: existingTest.results.filter((result) => result.correct).length, total: existingTest.results.length }} />
          <Text style={[styles.formKicker, { color: colors.primary }]}>THIS WEEK IS RECORDED</Text>
          <Text style={[styles.savedHeading, { color: colors.foreground }]}>Official test · {existingTest.date}</Text>
          <Text style={[styles.savedScore, { color: colors.primary }]}>
            {existingTest.results.filter((result) => result.correct).length}/{existingTest.results.length} self-marked as recalled
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>Weak topics for review</Text>
          {existingTest.weakTopics.length
            ? existingTest.weakTopics.map((topic) => <Text key={topic} style={[styles.historyLine, { color: colors.accent }]}>• {topic}</Text>)
            : <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>No missed topics were self-reported.</Text>}
          {existingTest.results.map((result) => (
            <View key={`${result.cardId}-${result.question}`} style={[styles.resultRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.resultQuestion, { color: colors.foreground }]}>{result.question}</Text>
              <Text style={[styles.historyLine, { color: result.correct ? colors.primary : colors.accent }]}>
                {result.correct ? 'RECALLED' : 'REVIEW'} · {result.topicTitle}
              </Text>
              <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>Your answer: {result.answer || 'No written answer'}</Text>
              <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>Expected: {result.expectedAnswer}</Text>
            </View>
          ))}
          <ToolButton label="REVIEW SAVED CARDS" icon="rotate-ccw" secondary onPress={() => router.replace('/rituals?mode=recovery' as never)} />
        </ToolPanel>
      ) : null}

      {saved && !existingTest ? (
        <ToolPanel>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="check" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Test recorded</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Your answers and weak-topic history are saved. This batch has one official test for this week. Rewards are recorded by the study engine, never this presentation.</Text>
          <Text style={[styles.savedScore, { color: colors.primary }]}>
            {results.filter((result) => result.correct).length}/{results.length} self-marked as recalled
          </Text>
          {getWeakTopics(results).length
            ? getWeakTopics(results).map((topic) => <Text key={topic} style={[styles.historyLine, { color: colors.accent }]}>• {topic}</Text>)
            : null}
          {results.map((result) => (
            <View key={`${result.cardId}-${result.question}`} style={[styles.resultRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.resultQuestion, { color: colors.foreground }]}>{result.question}</Text>
              <Text style={[styles.historyLine, { color: result.correct ? colors.primary : colors.accent }]}>{result.correct ? 'RECALLED' : 'REVIEW'} · {result.topicTitle}</Text>
              <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>Your answer: {result.answer || 'No written answer'} · Expected: {result.expectedAnswer}</Text>
            </View>
          ))}
          <ToolButton label="REVIEW SAVED CARDS" icon="rotate-ccw" secondary onPress={() => router.replace('/rituals?mode=recovery' as never)} />
        </ToolPanel>
      ) : null}

      {existingTest ?? history[0] ? <BossContinuation key={(existingTest ?? history[0]).id} test={existingTest ?? history[0]} /> : null}

      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

      {history.length ? (
        <ToolPanel>
          <Text style={[styles.formKicker, { color: colors.accent }]}>BATCH TEST HISTORY</Text>
          {history.map((test) => (
            <View key={test.id} style={[styles.historyRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.historyDate, { color: colors.foreground }]}>{test.date} · {test.results.filter((result) => result.correct).length}/{test.results.length}</Text>
              <Text style={[styles.historyLine, { color: colors.mutedForeground }]}>{test.weakTopics.length ? `Review: ${test.weakTopics.join(', ')}` : 'No weak topics self-reported'}</Text>
            </View>
          ))}
        </ToolPanel>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptyCopy: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  formDivider: { borderTopWidth: 1, marginVertical: 13 },
  formKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 9 },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  subjectPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  subjectPillText: { fontSize: 11, fontWeight: '600' },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, marginBottom: 4 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  feedback: { fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 9 },
  testProgress: { marginBottom: 13 },
  progressTag: { fontSize: 11, marginTop: 3 },
  question: { fontSize: 17, fontWeight: '600', lineHeight: 25, marginBottom: 9 },
  answerReveal: { borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 12 },
  answerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 6 },
  answerText: { fontSize: 14, lineHeight: 21 },
  selfMark: { fontSize: 11, lineHeight: 16, marginVertical: 11 },
  markRow: { flexDirection: 'row', gap: 8 },
  markButton: { flex: 1 },
  savedHeading: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  savedScore: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  historyLine: { fontSize: 11, lineHeight: 17, marginBottom: 3 },
  resultRow: { borderTopWidth: 1, paddingTop: 11, marginTop: 9 },
  resultQuestion: { fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 6 },
  historyRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  historyDate: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  error: { fontSize: 12, lineHeight: 18, marginBottom: 11 },
});