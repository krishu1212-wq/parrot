import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import type { BossTestRecord } from '@/contexts/learningTools';
import { getBossRevisionCards, hasBossRevision } from '@/contexts/bossContinuation';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolPanel } from './shared';

export default function BossContinuation({ test }: { test: BossTestRecord }) {
  const { state, logRevision, saveBossRetest } = useStudy();
  const colors = useColors();
  const missed = getBossRevisionCards(test, state.studyTools.reviewCards);
  const [stage, setStage] = useState<'ready' | 'revision' | 'retest'>('ready');
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<BossTestRecord['results']>([]);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const latest = (state.studyTools.bossRetests ?? []).filter((record) => record.sourceTestId === test.id).slice(-1)[0];
  const revised = hasBossRevision(test, missed.map((item) => item.cardId), state.studyTools.revisionHistory);
  const card = missed[index];
  const reset = (next: 'revision' | 'retest') => {
    setIndex(0); setAnswer(''); setRevealed(false); setResults([]); setError('');
    submitting.current = false; setStage(next);
  };
  const finishReviewCard = () => {
    if (!card) return;
    if (index + 1 < missed.length) { setIndex(index + 1); return; }
    try {
      logRevision(missed.map((item) => item.cardId), test.batchId);
      setStage('ready');
      setError('');
    } catch { setError('Revision could not be saved. Try again.'); }
  };
  const mark = (correct: boolean) => {
    if (!card || !revealed || submitting.current) return;
    const next = [...results, { ...card, answer: answer.trim(), correct }];
    if (index + 1 < missed.length) {
      setResults(next); setIndex(index + 1); setAnswer(''); setRevealed(false); return;
    }
    submitting.current = true;
    try {
      saveBossRetest({ sourceTestId: test.id, batchId: test.batchId, date: state.date, results: next });
      setStage('ready');
      setError('');
    } catch {
      submitting.current = false;
      setError('Retest could not be saved. Your final answer is retained; try marking it again.');
    }
  };
  const copy = { color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginVertical: 6 };
  return (
    <ToolPanel>
      <Text style={{ color: colors.accent, fontWeight: '800', letterSpacing: 1 }}>TARGETED REVISION → PRACTICE RETEST</Text>
      <Text style={copy}>Source: official test {test.date}. Only its stored missed questions are used. The official grade and weekly reward are never replaced or repeated.</Text>
      {test.results.some((item) => !item.correct) && !missed.length ? (
        <Text accessibilityRole="alert" style={copy}>The missed cards are no longer available in this batch. Their original answers remain in the official result; no substitute questions are created.</Text>
      ) : !missed.length ? <Text style={copy}>No missed questions were self-reported in this test.</Text> : null}
      {stage === 'ready' && missed.length ? (
        <>
          <Text style={copy}>{missed.length} stored missed question(s) available{missed.length < test.results.filter((item) => !item.correct).length ? ' · some original cards are no longer available' : ''}.</Text>
          <ToolButton testID="boss-targeted-revision" label="REVISE MISSED QUESTIONS" icon="book-open" onPress={() => reset('revision')} />
          <ToolButton testID="boss-start-retest" label="START SEPARATE PRACTICE RETEST" icon="refresh-cw" secondary disabled={!revised} onPress={() => reset('retest')} />
          {!revised ? <Text style={copy}>Review all available missed questions first. Saved revision evidence unlocks the practice retest.</Text> : null}
        </>
      ) : null}
      {stage !== 'ready' && card ? (
        <View>
          <Text style={copy}>{stage === 'revision' ? 'CONCEPT REVISION' : 'PRACTICE RETEST · NO WEEKLY AWARD'} · {index + 1}/{missed.length} · {card.topicTitle}</Text>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700', marginVertical: 10 }}>{card.question}</Text>
          {stage === 'revision' ? (
            <>
              <Text style={copy}>Original missed answer: {card.answer || 'No written answer'}</Text>
              <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 23 }}>{card.expectedAnswer}</Text>
              <Text style={copy}>Review the concept, then explain the expected answer in your own words before continuing.</Text>
              <ToolButton testID="boss-revision-next" label={index + 1 === missed.length ? 'SAVE TARGETED REVISION' : 'REVIEWED · NEXT'} icon="check" onPress={finishReviewCard} />
            </>
          ) : (
            <>
              <TextInput testID="boss-retest-answer" accessibilityLabel="Practice retest recalled answer" value={answer} onChangeText={setAnswer} editable={!revealed} multiline placeholder="Recall without looking at the answer" placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 84 }} />
              {revealed ? (
                <>
                  <Text style={[copy, { color: colors.foreground }]}>Saved expected answer: {card.expectedAnswer}</Text>
                  <ToolButton testID="boss-retest-correct" label="I RECALLED IT" icon="check" onPress={() => mark(true)} />
                  <ToolButton testID="boss-retest-incorrect" label="STILL NEEDS REVIEW" icon="rotate-ccw" secondary onPress={() => mark(false)} />
                </>
              ) : <ToolButton testID="boss-retest-reveal" label="REVEAL & SELF-MARK" icon="eye" onPress={() => setRevealed(true)} />}
            </>
          )}
          <ToolButton label="CANCEL PRACTICE" secondary onPress={() => setStage('ready')} />
        </View>
      ) : null}
      {stage === 'ready' && latest ? (
        <>
          <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 12 }}>LATEST PRACTICE RETEST · {latest.date}</Text>
          <Text style={copy}>{latest.results.filter((item) => item.correct).length}/{latest.results.length} self-marked recalled · no XP award · official result unchanged</Text>
          {latest.results.filter((item) => !item.correct).map((item) => <Text key={item.cardId} style={copy}>Still revise: {item.topicTitle} · {item.question}</Text>)}
        </>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={[copy, { color: colors.destructive }]}>{error}</Text> : null}
    </ToolPanel>
  );
}