import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import type { WordEvidence } from '@/contexts/learningTools';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolPanel } from './shared';

const stages = ['learn', 'recall', 'practice', 'revision'] as const;

export default function WordLearningPanel() {
  const { state, studyTools, saveWordAttempt } = useStudy();
  const colors = useColors();
  const words = state.ncertBooks.flatMap((book) => book.vocabulary.map((word) => ({ bookId: book.id, bookTitle: book.title, word })));
  const [selected, setSelected] = useState<{ bookId: string; word: string } | null>(null);
  const [meaning, setMeaning] = useState('');
  const [response, setResponse] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState('');
  const entry = studyTools.wordEvidence?.find((item) => item.bookId === selected?.bookId && item.word === selected.word);
  const stage: WordEvidence['attempts'][number]['stage'] = stages.find((item) => !entry?.attempts.some((attempt) => attempt.stage === item && attempt.correct)) ?? 'revision';
  const open = (word: typeof words[number]) => {
    setSelected(word);
    setMeaning(studyTools.wordEvidence?.find((item) => item.bookId === word.bookId && item.word === word.word)?.meaning ?? '');
    setResponse('');
    setRevealed(false);
    setMessage('');
  };
  const record = (correct: boolean) => {
    try {
      saveWordAttempt(selected!.bookId, selected!.word, meaning, { stage, response, correct });
      setResponse('');
      setRevealed(false);
      setMessage(correct ? 'Evidence saved. Continue to the next stage or revisit Revision.' : 'Miss saved. Try this stage again when ready.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Word evidence could not be saved.'); }
  };
  const inputStyle = { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginVertical: 8 };
  return (
    <ToolPanel>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 17 }}>Word learning · real collected words</Text>
      <Text style={{ color: colors.mutedForeground, marginVertical: 8 }}>Learn → Recall → Practice → Revision. Responses are self-marked against your saved meaning. Historical word counts do not create words or learning evidence.</Text>
      {!words.length ? <Text style={{ color: colors.mutedForeground }}>Open an NCERT book and collect a word to begin.</Text> : words.map((word) => {
        const evidence = studyTools.wordEvidence?.find((item) => item.bookId === word.bookId && item.word === word.word);
        const completed = stages.filter((stage) => evidence?.attempts.some((attempt) => attempt.stage === stage && attempt.correct));
        return <View key={`${word.bookId}:${word.word}`} style={{ marginVertical: 4 }}>
          <ToolButton secondary label={`${word.word} · ${completed.length}/4 stages`} onPress={() => open(word)} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{word.bookTitle} · {evidence?.attempts.length ?? 0} saved attempts</Text>
        </View>;
      })}
      {selected ? <View style={{ marginTop: 12 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{selected.word} · {stage.toUpperCase()}</Text>
        {stage === 'learn' ? <TextInput accessibilityLabel="Word meaning" placeholder="Add the meaning from your reading" placeholderTextColor={colors.mutedForeground} value={meaning} onChangeText={setMeaning} style={inputStyle} multiline maxLength={1000} /> : null}
        <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>{stage === 'practice' ? 'Use the word in your own sentence.' : stage === 'learn' ? 'Write a short explanation in your own words.' : 'Recall the meaning without looking.'}</Text>
        <TextInput accessibilityLabel="Word learning response" placeholder="Your response" placeholderTextColor={colors.mutedForeground} value={response} onChangeText={setResponse} style={inputStyle} multiline maxLength={1000} />
        {stage !== 'learn' ? <ToolButton secondary label="REVEAL SAVED MEANING" disabled={!response.trim()} onPress={() => setRevealed(true)} /> : null}
        {revealed ? <Text style={{ color: colors.foreground, marginVertical: 10 }}>{meaning}</Text> : null}
        <ToolButton label={stage === 'learn' ? 'SAVE LEARNED EXPLANATION' : 'SELF-MARK CORRECT'} disabled={!meaning.trim() || !response.trim() || (stage !== 'learn' && !revealed)} onPress={() => record(true)} />
        {stage !== 'learn' ? <ToolButton secondary label="SAVE MISS · TRY AGAIN" disabled={!response.trim() || !revealed} onPress={() => record(false)} /> : null}
        {entry?.attempts.slice(-5).map((attempt, index) => <Text key={index} style={{ color: colors.mutedForeground, marginVertical: 4, fontSize: 12 }}>{attempt.date} · {attempt.stage} · {attempt.correct ? 'self-marked correct' : 'miss'} · {attempt.response}</Text>)}
      </View> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, marginTop: 8 }}>{message}</Text> : null}
    </ToolPanel>
  );
}