import { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolPanel } from './shared';

export default function WindDownReview() {
  const { state, studyTools, saveWindDownReview } = useStudy();
  const colors = useColors();
  const saved = studyTools.windDownReviews?.find((item) => item.date === state.date);
  const [review, setReview] = useState('');
  const [tomorrowPriority, setPriority] = useState('');
  const [preparation, setPreparation] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setReview(saved?.review ?? ''); setPriority(saved?.tomorrowPriority ?? ''); setPreparation(saved?.preparation ?? ''); setMessage(''); }, [state.date, saved]);
  const completed = state.quests.filter((quest) => quest.completed);
  return <ToolPanel>
    <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '700' }}>Wind-down · {state.date}</Text>
    <Text style={{ color: colors.mutedForeground, marginVertical: 8 }}>Reminder preference: {String(studyTools.windDownHour).padStart(2, '0')}:00 · in-app review, not an OS alarm.</Text>
    <Text style={{ color: colors.foreground }}>{completed.length ? completed.map((quest) => `✓ ${quest.title}`).join('\n') : 'No quests completed today yet.'}</Text>
    {([{ label: 'Review today’s achievements and challenges', value: review, set: setReview }, { label: 'Tomorrow’s first priority', value: tomorrowPriority, set: setPriority }, { label: 'Prepare your next mission (optional)', value: preparation, set: setPreparation }]).map((field) => <TextInput key={field.label} accessibilityLabel={field.label} placeholder={field.label} placeholderTextColor={colors.mutedForeground} value={field.value} onChangeText={field.set} multiline maxLength={1000} style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginVertical: 8 }} />)}
    <ToolButton label={saved ? 'UPDATE SAVED DAY REVIEW' : 'SAVE DAY REVIEW'} disabled={!review.trim() || !tomorrowPriority.trim()} onPress={() => {
      try { saveWindDownReview({ review, tomorrowPriority, preparation }); setMessage('Day review and tomorrow preparation saved.'); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Review could not be saved.'); }
    }} />
    {message ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground }}>{message}</Text> : null}
    {(studyTools.windDownReviews ?? []).filter((item) => item.date !== state.date).slice(-3).reverse().map((item) => <Text key={item.date} style={{ color: colors.mutedForeground, marginTop: 10 }}>{item.date} · {item.completedQuestIds.length} completed quests{'\n'}{item.review}{'\n'}Next priority: {item.tomorrowPriority}{item.preparation ? `\nPreparation: ${item.preparation}` : ''}</Text>)}
  </ToolPanel>;
}

export { WindDownReview };