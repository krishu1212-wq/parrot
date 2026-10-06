import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton, ScreenHeader } from '@/components/StudyPrimitives';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { calculationTrend } from '@/contexts/calculationEvidence';
import type { CalculationAnswer } from '@/contexts/calculationEvidence';
import { percentageClass4QuestionBank } from '@/contexts/questionBank';
import {
  advanceQuestionPractice,
  createQuestionPracticeFlow,
  revealQuestionSolution,
  selectQuestionOption,
  submitQuestionOption,
} from '@/contexts/questionPractice';
import type { QuestionPracticeFlow } from '@/contexts/questionPractice';

type CalculationQuestion = { prompt: string; answer: number };

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const questionBank: CalculationQuestion[] = [
  { prompt: '18 + 27', answer: 45 },
  { prompt: '96 ÷ 8', answer: 12 },
  { prompt: '14 × 7', answer: 98 },
  { prompt: '125 − 68', answer: 57 },
  { prompt: '15% of 200', answer: 30 },
  { prompt: '3² + 4²', answer: 25 },
  { prompt: '45 ÷ 5 + 6', answer: 15 },
  { prompt: '72 − 9 × 4', answer: 36 },
  { prompt: '⅓ of  ninety', answer: 30 },
  { prompt: '7 × 8 − 13', answer: 43 },
];

const SESSION_DURATION_SECONDS = 90;

export default function PracticeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, addCalculationSession, recordQuestionBankAttempt } = useStudy();
  const params = useLocalSearchParams<{
    batchId?: string | string[];
    subjectId?: string | string[];
    topicId?: string | string[];
    topicTitle?: string | string[];
    cardIds?: string | string[];
  }>();
  const hasUnsupportedTopicTarget = !!(
    firstParam(params.subjectId)
    || firstParam(params.topicId)
    || firstParam(params.topicTitle)
    || firstParam(params.cardIds)
  );
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [seconds, setSeconds] = useState(SESSION_DURATION_SECONDS);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [input, setInput] = useState('');
  const [sessionBank, setSessionBank] = useState(questionBank);
  const [questionBankMode, setQuestionBankMode] = useState<'menu' | 'practice' | 'complete'>('menu');
  const [questionFlow, setQuestionFlow] = useState<QuestionPracticeFlow | null>(null);
  const [questionBankCorrect, setQuestionBankCorrect] = useState(0);
  const [questionBankWrong, setQuestionBankWrong] = useState(0);
  const [questionBankSaveError, setQuestionBankSaveError] = useState(false);
  const bankRef = useRef(questionBank);
  const questionBankSubmitLocked = useRef(false);
  const evidenceRef = useRef<CalculationAnswer[]>([]);
  const questionStartedAt = useRef(0);
  const answersRef = useRef<number[]>([]);
  const sessionSaved = useRef(false);
  const sessionActive = useRef(false);
  const submissionLocked = useRef(false);
  const sessionStartedAt = useRef<number | null>(null);
  const deadline = useRef<number | null>(null);

  const finishSession = (finalAnswers = answersRef.current) => {
    if (!sessionActive.current || sessionSaved.current) return;
    sessionSaved.current = true;
    sessionActive.current = false;
    submissionLocked.current = true;
    const correct = finalAnswers.reduce((score, answer, index) => score + (answer === bankRef.current[index]?.answer ? 1 : 0), 0);
    const elapsed = sessionStartedAt.current === null
      ? 0
      : Math.min(SESSION_DURATION_SECONDS, Math.max(0, (Date.now() - sessionStartedAt.current) / 1000));
    setDuration(elapsed);
    setRunning(false);
    setFinished(true);
    setInput('');
    addCalculationSession({
      questions: finalAnswers.length,
      correct,
      accuracy: finalAnswers.length ? Math.round((correct / finalAnswers.length) * 100) : 0,
      duration: elapsed,
      answers: evidenceRef.current,
    });
  };
  const finishSessionRef = useRef(finishSession);
  finishSessionRef.current = finishSession;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const endAt = deadline.current;
      if (endAt === null) return;
      const remainingMs = endAt - Date.now();
      const remainingSeconds = Math.max(0, Math.min(SESSION_DURATION_SECONDS, Math.ceil(remainingMs / 1000)));
      setSeconds((value) => (value === remainingSeconds ? value : remainingSeconds));
      if (remainingMs <= 0) finishSessionRef.current(answersRef.current);
    }, 250);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (running) submissionLocked.current = false;
  }, [current, running]);

  const startSession = (bank = questionBank) => {
    if (sessionActive.current) return;
    const now = Date.now();
    bankRef.current = bank;
    setSessionBank(bank);
    evidenceRef.current = [];
    questionStartedAt.current = now;
    answersRef.current = [];
    setAnswers([]);
    setInput('');
    setCurrent(0);
    setSeconds(SESSION_DURATION_SECONDS);
    setDuration(0);
    setFinished(false);
    sessionSaved.current = false;
    sessionActive.current = true;
    submissionLocked.current = false;
    sessionStartedAt.current = now;
    deadline.current = now + SESSION_DURATION_SECONDS * 1000;
    setRunning(true);
  };

  const submitAnswer = () => {
    if (!sessionActive.current || submissionLocked.current) return;
    const endAt = deadline.current;
    if (endAt !== null && Date.now() >= endAt) {
      finishSession(answersRef.current);
      return;
    }
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    const answer = Number(trimmedInput);
    if (!Number.isFinite(answer)) return;
    Keyboard.dismiss();
    if (deadline.current !== null && Date.now() >= deadline.current) {
      finishSession(answersRef.current);
      return;
    }
    const nextAnswers = [...answersRef.current, answer];
    const question = bankRef.current[nextAnswers.length - 1];
    const now = Date.now();
    evidenceRef.current = [...evidenceRef.current, { prompt: question.prompt, expectedAnswer: question.answer, answer, correct: answer === question.answer, elapsedSeconds: Math.max(0, (now - questionStartedAt.current) / 1000) }];
    questionStartedAt.current = now;
    answersRef.current = nextAnswers;
    submissionLocked.current = true;
    setAnswers(nextAnswers);
    setInput('');
    if (nextAnswers.length >= bankRef.current.length) {
      finishSession(nextAnswers);
    } else {
      setCurrent(nextAnswers.length);
    }
  };

  const score = answers.reduce((total, answer, index) => total + (answer === sessionBank[index]?.answer ? 1 : 0), 0);
  const accuracy = answers.length ? Math.round((score / answers.length) * 100) : 0;
  const hasValidInput = Boolean(input.trim()) && Number.isFinite(Number(input.trim()));
  const bestAccuracySession = state.calculationHistory.length
    ? state.calculationHistory.reduce((best, session) => session.accuracy > best.accuracy ? session : best)
    : null;
  const bestCorrectSession = state.calculationHistory.length
    ? state.calculationHistory.reduce((best, session) => session.correct > best.correct ? session : best)
    : null;
  const trend = calculationTrend(state.calculationHistory);
  const mistakes = state.calculationHistory.flatMap((session) => (session.answers ?? []).filter((answer) => !answer.correct).map((answer) => ({ ...answer, sessionId: session.id, date: session.date })));
  const retryMistakes = () => {
    const unique = new Map(mistakes.map((item) => [item.prompt, { prompt: item.prompt, answer: item.expectedAnswer }]));
    if (unique.size) startSession([...unique.values()].slice(0, 10));
  };
  const percentageAttempts = state.studyTools.questionBankAttempts
    .filter((attempt) => attempt.bankId === percentageClass4QuestionBank.id);
  const latestPercentageAttempts = new Map(
    percentageAttempts.map((attempt) => [attempt.questionId, attempt]),
  );
  const openPercentageMistakes = [...latestPercentageAttempts.values()]
    .filter((attempt) => attempt.mistakeStatus === 'OPEN');
  const startPercentagePractice = () => {
    questionBankSubmitLocked.current = false;
    setQuestionBankCorrect(0);
    setQuestionBankWrong(0);
    setQuestionBankSaveError(false);
    setQuestionFlow(createQuestionPracticeFlow(Date.now()));
    setQuestionBankMode('practice');
  };
  const submitPercentageAnswer = () => {
    if (!questionFlow || questionBankSubmitLocked.current) return;
    const question = percentageClass4QuestionBank.questions[questionFlow.questionIndex];
    const submitted = submitQuestionOption(questionFlow, question, Date.now());
    if (submitted === questionFlow || !submitted.result) return;
    questionBankSubmitLocked.current = true;
    const saved = recordQuestionBankAttempt({
      bankId: percentageClass4QuestionBank.id,
      questionId: question.id,
      selectedOptionLabel: submitted.result.selectedOptionLabel,
      timeTakenSeconds: submitted.result.timeTakenSeconds,
    });
    if (!saved) {
      questionBankSubmitLocked.current = false;
      setQuestionBankSaveError(true);
      return;
    }
    if (submitted.result.isCorrect) setQuestionBankCorrect((count) => count + 1);
    else setQuestionBankWrong((count) => count + 1);
    setQuestionBankSaveError(false);
    setQuestionFlow(submitted);
  };
  const showPercentageSolution = () => {
    if (questionFlow) setQuestionFlow(revealQuestionSolution(questionFlow));
  };
  const advancePercentageQuestion = () => {
    if (!questionFlow) return;
    const next = advanceQuestionPractice(
      questionFlow,
      percentageClass4QuestionBank.questions.length,
      Date.now(),
    );
    setQuestionFlow(next);
    if (next.phase === 'complete') setQuestionBankMode('complete');
    else questionBankSubmitLocked.current = false;
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        kicker={questionBankMode === 'practice' ? 'SOURCE QUESTION BANK' : 'SPEED LAB'}
        title={questionBankMode === 'practice' ? 'Percentage · Class 4' : 'Calculation Practice'}
        detail={questionBankMode === 'practice'
          ? 'Mathematics · Percentage · Class 4'
          : `Timed calculations and the published ${percentageClass4QuestionBank.questions.length}-question Percentage bank.`}
        icon="clock"
      />
      {questionBankMode === 'menu' ? (
      <>
      <View testID="percentage-class-4-bank-card" style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <Text style={[styles.bankEyebrow, { color: colors.primary }]}>PUBLISHED QUESTION BANK</Text>
        <Text style={[styles.bankTitle, { color: colors.foreground }]}>Mathematics · Percentage · Class 4</Text>
        <Text style={[styles.bankDetail, { color: colors.mutedForeground }]}>
          {percentageClass4QuestionBank.questions.length} source questions across COMPARISION and FRACTION, in PDF page order. Each attempt is saved with its question, topic, result, time, and mistake status. This practice flow does not award XP or progression rewards.
        </Text>
        <Text style={[styles.bankCaveat, { color: colors.accent }]}>
          Correct/wrong checks match the source’s handwritten answer to its printed option. The mathematics has not been independently verified; source-rights review is still {percentageClass4QuestionBank.source.rightsStatus}.
        </Text>
        <ActionButton label="PRACTICE PERCENTAGE · CLASS 4" icon="book-open" disabled={running} onPress={startPercentagePractice} />
        <Text style={[styles.bankHistory, { color: colors.mutedForeground }]}>
          {percentageAttempts.length} saved attempts · {openPercentageMistakes.length} open mistakes
        </Text>
      </View>
      {percentageAttempts.length ? (
        <View style={[styles.recordsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.recordsTitle, { color: colors.foreground }]}>Percentage attempt history</Text>
          {[...percentageAttempts].reverse().slice(0, 10).map((attempt) => {
            const question = percentageClass4QuestionBank.questions.find((item) => item.id === attempt.questionId);
            return (
              <Text key={attempt.id} style={[styles.bankHistoryRow, { color: colors.mutedForeground }]}>
                {attempt.date} · {attempt.topic} Q{question?.sourceQuestionNumber ?? '—'} · Attempt {attempt.attemptNumber} · {attempt.isCorrect ? 'Correct' : 'Wrong'} · {attempt.timeTakenSeconds.toFixed(1)}s · Mistake {attempt.mistakeStatus}
              </Text>
            );
          })}
        </View>
      ) : null}
      {hasUnsupportedTopicTarget ? (
        <View style={[styles.targetNotice, { borderColor: colors.accent, backgroundColor: colors.card }]}>
          <Text style={[styles.targetNoticeText, { color: colors.secondaryForeground }]}>
            Topic-focused calculation questions are not available here. This session uses the general question bank and is not attributed to the requested topic, subject, or batch.
          </Text>
        </View>
      ) : null}

      {!running && !finished ? (
        <View style={[styles.startCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.startIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="zap" size={25} color={colors.primary} />
          </View>
          <Text style={[styles.startTitle, { color: colors.foreground }]}>Ready the timer</Text>
          <Text style={[styles.startText, { color: colors.mutedForeground }]}>Answer as many as you can from the {questionBank.length} distinct questions available. Your score, accuracy, and time stay in general practice history.</Text>
           <ActionButton label="START DAILY CHALLENGE" icon="play" onPress={() => startSession()} />
        </View>
      ) : null}

      {running ? (
        <View style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <View style={styles.sessionTop}>
            <View>
              <Text style={[styles.sessionLabel, { color: colors.mutedForeground }]}>QUESTION {current + 1} / {sessionBank.length}</Text>
              <Text style={[styles.sessionTimer, { color: seconds < 20 ? colors.destructive : colors.primary }]}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</Text>
            </View>
            <View style={[styles.livePill, { borderColor: colors.primary }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.liveText, { color: colors.primary }]}>LIVE</Text>
            </View>
          </View>
          <View style={[styles.questionBox, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.question, { color: colors.foreground }]}>{sessionBank[current].prompt}</Text>
          </View>
          <TextInput
            testID="calculation-answer"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submitAnswer}
            keyboardType="numeric"
            returnKeyType="done"
            placeholder="Type answer"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            style={[styles.answerInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          {input.trim() && !hasValidInput ? <Text style={[styles.inputError, { color: colors.destructive }]}>Enter a finite number to submit.</Text> : null}
          <ActionButton label="SUBMIT ANSWER" icon="arrow-right" onPress={submitAnswer} disabled={!hasValidInput} />
          <ActionButton label="FINISH SESSION" icon="check" onPress={() => finishSession(answersRef.current)} />
        </View>
      ) : null}

      {finished ? (
        <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={[styles.sessionLabel, { color: colors.mutedForeground }]}>SESSION RESULTS</Text>
              <Text style={[styles.resultTitle, { color: colors.foreground }]}>{score} correct · {answers.length} attempted</Text>
            </View>
            <Feather name={accuracy >= 70 ? 'check-circle' : 'activity'} size={30} color={accuracy >= 70 ? colors.primary : colors.accent} />
          </View>
          <View style={styles.resultStats}>
            <View><Text style={[styles.resultValue, { color: colors.primary }]}>{accuracy}%</Text><Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>ACCURACY</Text></View>
            <View><Text style={[styles.resultValue, { color: colors.accent }]}>{duration.toFixed(1)}s</Text><Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>DURATION</Text></View>
            <View><Text style={[styles.resultValue, { color: colors.foreground }]}>{answers.length} / {sessionBank.length}</Text><Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>ATTEMPTED / AVAILABLE</Text></View>
          </View>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>{duration > 0 ? `${(answers.length * 60 / duration).toFixed(1)} attempted/min · ${(duration / Math.max(1, answers.length)).toFixed(1)} seconds/answer` : 'Speed needs a timed attempt.'}</Text>
          <ActionButton label="RUN AGAIN" icon="refresh-cw" onPress={() => startSession()} />
        </View>
      ) : null}

      <View style={styles.historyHeader}>
        <Text style={[styles.historyTitle, { color: colors.foreground }]}>Practice history</Text>
        <Text style={[styles.historyCount, { color: colors.mutedForeground }]}>{state.calculationHistory.length} sessions</Text>
      </View>
      <View style={[styles.recordsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.recordsTitle, { color: colors.foreground }]}>Speed & improvement</Text>
        <Text style={{ color: colors.mutedForeground }}>{trend.speed === null ? 'No timed answers recorded yet.' : `${trend.speed.toFixed(1)} attempted/min across ${trend.recentCount} recent sessions.`}</Text>
        <Text style={{ color: colors.mutedForeground, marginTop: 6 }}>{trend.accuracyChange === null ? 'Accuracy trend needs at least six timed sessions; no improvement is inferred yet.' : `${trend.accuracyChange >= 0 ? '+' : ''}${trend.accuracyChange.toFixed(1)} accuracy points · ${trend.recentCount} recent vs ${trend.earlierCount} earlier timed sessions.`}</Text>
      </View>
      <View style={[styles.recordsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.recordsTitle, { color: colors.foreground }]}>Saved mistakes · retry loop</Text>
        <Text style={{ color: colors.mutedForeground, marginBottom: 8 }}>Older aggregate sessions have no question details. Only recorded wrong answers are shown; retries create separate real sessions.</Text>
        {mistakes.slice(0, 10).map((item, index) => <Text key={`${item.sessionId}:${index}`} style={{ color: colors.foreground, marginBottom: 8 }}>{item.date} · {item.prompt}{'\n'}Your answer: {item.answer} · Expected: {item.expectedAnswer} · {item.elapsedSeconds.toFixed(1)}s</Text>)}
        {!mistakes.length ? <Text style={{ color: colors.mutedForeground }}>No question-level mistakes saved.</Text> : <ActionButton label="RETRY SAVED MISTAKES" icon="refresh-cw" disabled={running} onPress={retryMistakes} />}
      </View>
      {bestAccuracySession && bestCorrectSession ? (
        <View style={[styles.recordsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.recordsTitle, { color: colors.foreground }]}>Personal records</Text>
          <View style={styles.recordsRow}>
            <View style={styles.recordItem}>
              <Text style={[styles.recordValue, { color: colors.primary }]}>{bestAccuracySession.accuracy}%</Text>
              <Text style={[styles.recordLabel, { color: colors.mutedForeground }]}>BEST ACCURACY</Text>
              <Text style={[styles.recordCount, { color: colors.mutedForeground }]}>{bestAccuracySession.questions} questions recorded</Text>
            </View>
            <View style={styles.recordItem}>
              <Text style={[styles.recordValue, { color: colors.accent }]}>{bestCorrectSession.correct}</Text>
              <Text style={[styles.recordLabel, { color: colors.mutedForeground }]}>MOST CORRECT</Text>
              <Text style={[styles.recordCount, { color: colors.mutedForeground }]}>{bestCorrectSession.questions} questions recorded</Text>
            </View>
          </View>
        </View>
      ) : null}
      {state.calculationHistory.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="bar-chart-2" size={19} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Your first session will appear here.</Text>
        </View>
      ) : (
        <View style={styles.historyList}>
          {state.calculationHistory.slice(0, 5).map((session) => (
            <View key={session.id} style={[styles.historyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.historyIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="trending-up" size={15} color={colors.primary} />
              </View>
              <View style={styles.historyCopy}>
                <Text style={[styles.historyScore, { color: colors.foreground }]}>{session.correct}/{session.questions} correct</Text>
                <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{session.date} · {session.duration}s</Text>
              </View>
              <Text style={[styles.historyAccuracy, { color: session.accuracy >= 70 ? colors.primary : colors.accent }]}>{session.accuracy}%</Text>
            </View>
          ))}
        </View>
      )}
      </>
      ) : questionBankMode === 'practice' && questionFlow ? (
        (() => {
          const question = percentageClass4QuestionBank.questions[questionFlow.questionIndex];
          const selectedOption = question.options.find((option) => option.label === questionFlow.selectedOptionLabel);
          const sourceOption = question.options.find((option) => option.label === question.sourceProvidedAnswer.optionLabel)!;
          return (
            <View testID="percentage-question-flow" style={[styles.bankCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <View style={styles.bankProgressRow}>
                <Text style={[styles.bankEyebrow, { color: colors.primary }]}>{question.sectionLabel} · Q{question.sourceQuestionNumber}</Text>
                <Text style={[styles.bankHistory, { color: colors.mutedForeground }]}>{questionFlow.questionIndex + 1} / {percentageClass4QuestionBank.questions.length}</Text>
              </View>
              <Text style={[styles.bankQuestion, { color: colors.foreground }]}>{question.englishText}</Text>
              <Text style={[styles.bankHindiLabel, { color: colors.mutedForeground }]}>Hindi source text · raw PDF text layer · needs review</Text>
              <Text selectable style={[styles.bankHindi, { color: colors.secondaryForeground }]}>{question.hindiTextRaw}</Text>
              <Text style={[styles.bankPage, { color: colors.mutedForeground }]}>
                Question p.{question.questionPage} · options p.{question.optionPages.join(', ')}
              </Text>
              {questionFlow.phase === 'answering' ? (
                <>
                  <View style={styles.bankOptions}>
                    {question.options.map((option) => {
                      const selected = questionFlow.selectedOptionLabel === option.label;
                      return (
                        <Pressable
                          key={option.label}
                          testID={`percentage-option-${option.label}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setQuestionFlow(selectQuestionOption(questionFlow, question, option.label))}
                          style={[
                            styles.bankOption,
                            { backgroundColor: selected ? colors.secondary : colors.background, borderColor: selected ? colors.primary : colors.border },
                          ]}
                        >
                          <Text style={[styles.bankOptionLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>{option.label})</Text>
                          <Text style={[styles.bankOptionText, { color: colors.foreground }]}>{option.text}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <ActionButton label="SUBMIT ANSWER" icon="check" disabled={!questionFlow.selectedOptionLabel} onPress={submitPercentageAnswer} />
                  {questionBankSaveError ? <Text accessibilityRole="alert" style={[styles.inputError, { color: colors.destructive }]}>This answer could not be recorded. Select an option and submit again.</Text> : null}
                </>
              ) : null}
              {questionFlow.phase === 'result' && questionFlow.result ? (
                <View testID="percentage-answer-result" style={[styles.bankResult, { borderColor: questionFlow.result.isCorrect ? colors.primary : colors.destructive, backgroundColor: colors.secondary }]}>
                  <Text style={[styles.bankResultTitle, { color: questionFlow.result.isCorrect ? colors.primary : colors.destructive }]}>
                    {questionFlow.result.isCorrect ? 'CORRECT' : 'WRONG'}
                  </Text>
                  <Text style={[styles.bankDetail, { color: colors.foreground }]}>
                    Your answer {questionFlow.result.isCorrect ? 'matches' : 'does not match'} the source-marked option. Attempt recorded · {questionFlow.result.timeTakenSeconds.toFixed(1)} seconds · {questionFlow.result.isCorrect ? 'no mistake' : 'mistake OPEN'}.
                  </Text>
                  <ActionButton label="SHOW SOURCE SOLUTION" icon="eye" onPress={showPercentageSolution} />
                </View>
              ) : null}
              {questionFlow.phase === 'solution' && questionFlow.result ? (
                <View testID="percentage-source-solution" style={[styles.bankSolution, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <Text style={[styles.bankEyebrow, { color: colors.primary }]}>SOURCE-PROVIDED ANSWER · NOT INDEPENDENTLY MATH-VERIFIED</Text>
                  <Text style={[styles.bankDetail, { color: colors.foreground }]}>
                    Handwritten result: {question.sourceProvidedAnswer.result} · option {sourceOption.label}) {sourceOption.text}
                  </Text>
                  <Text style={[styles.bankSolutionText, { color: colors.foreground }]}>{question.sourceProvidedSolution.transcription}</Text>
                  <Text style={[styles.bankPage, { color: colors.mutedForeground }]}>
                    Answer p.{question.sourceProvidedAnswer.sourcePage} · solution p.{question.sourceProvidedSolution.sourcePages.join(', ')}
                  </Text>
                  <ActionButton
                    label={questionFlow.questionIndex + 1 === percentageClass4QuestionBank.questions.length ? 'FINISH BANK' : 'NEXT QUESTION'}
                    icon="arrow-right"
                    onPress={advancePercentageQuestion}
                  />
                </View>
              ) : null}
              <Text style={[styles.bankStatusNote, { color: colors.mutedForeground }]}>
                Source-provided handwritten working and the original Hindi text layer are shown unchanged. Hindi text remains flagged for review.
              </Text>
              <ActionButton label="BACK TO PRACTICE MENU" icon="arrow-left" onPress={() => setQuestionBankMode('menu')} />
            </View>
          );
        })()
      ) : (
        <View testID="percentage-practice-complete" style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <Text style={[styles.bankEyebrow, { color: colors.primary }]}>BANK COMPLETE</Text>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>35 questions attempted</Text>
          <Text style={[styles.bankDetail, { color: colors.mutedForeground }]}>
            {questionBankCorrect} correct · {questionBankWrong} wrong. Each answer and elapsed time is saved to your study profile. No XP, Rank, Boss, Gate, Guild, or other progression reward was added.
          </Text>
          <ActionButton label="PRACTICE PERCENTAGE · CLASS 4 AGAIN" icon="refresh-cw" onPress={startPercentagePractice} />
          <ActionButton label="BACK TO PRACTICE" icon="arrow-left" onPress={() => setQuestionBankMode('menu')} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14 },
  targetNotice: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  targetNoticeText: { fontSize: 12, lineHeight: 18 },
  bankCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  bankEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 7 },
  bankTitle: { fontSize: 18, fontWeight: '700', marginBottom: 7 },
  bankDetail: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  bankCaveat: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  bankHistory: { fontSize: 11, marginTop: 10 },
  bankHistoryRow: { fontSize: 11, lineHeight: 17, marginBottom: 7 },
  bankProgressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bankQuestion: { fontSize: 19, lineHeight: 27, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  bankHindiLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  bankHindi: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  bankPage: { fontSize: 10, lineHeight: 15, marginBottom: 12 },
  bankOptions: { gap: 8, marginBottom: 14 },
  bankOption: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankOptionLabel: { width: 22, fontSize: 14, fontWeight: '700' },
  bankOptionText: { flex: 1, fontSize: 15, lineHeight: 21 },
  bankResult: { borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 4 },
  bankResultTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  bankSolution: { borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 10 },
  bankSolutionText: { fontSize: 13, lineHeight: 20, marginVertical: 10 },
  bankStatusNote: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  startCard: { borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center' },
  startIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  startTitle: { fontSize: 21, fontWeight: '700', marginBottom: 7 },
  startText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  sessionCard: { borderWidth: 1, borderRadius: 20, padding: 17 },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  sessionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  sessionTimer: { fontSize: 29, fontWeight: '700', letterSpacing: 1.2 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  questionBox: { minHeight: 125, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  question: { fontSize: 31, fontWeight: '700', letterSpacing: 0.4 },
  answerInput: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 18, marginBottom: 11 },
  inputError: { fontSize: 12, marginBottom: 10 },
  resultCard: { borderWidth: 1, borderRadius: 20, padding: 18 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  resultTitle: { fontSize: 23, fontWeight: '700', marginTop: 4 },
  resultStats: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 24 },
  resultValue: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  resultLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 29, marginBottom: 11 },
  historyTitle: { fontSize: 20, fontWeight: '700' },
  historyCount: { fontSize: 11 },
  recordsCard: { borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 12 },
  recordsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  recordsRow: { flexDirection: 'row', gap: 16 },
  recordItem: { flex: 1 },
  recordValue: { fontSize: 20, fontWeight: '700', marginBottom: 3 },
  recordLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7, marginBottom: 4 },
  recordCount: { fontSize: 10 },
  empty: { minHeight: 75, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyText: { fontSize: 12 },
  historyList: { gap: 9 },
  historyRow: { minHeight: 68, borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center' },
  historyIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  historyCopy: { flex: 1 },
  historyScore: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  historyDate: { fontSize: 10 },
  historyAccuracy: { fontSize: 16, fontWeight: '700' },
});