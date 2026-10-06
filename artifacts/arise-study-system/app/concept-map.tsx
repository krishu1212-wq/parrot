import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStudy } from '@/contexts/StudyContext';
import { useColors } from '@/hooks/useColors';
import { ToolButton, ToolHeading, ToolPanel } from '@/components/study-tools/shared';

export default function ConceptMapScreen() {
  const { state, studyTools, addConceptLink, removeConceptLink, logRevision, isSubjectLocked } = useStudy();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<string | null>(null);
  const params = useLocalSearchParams<{ mode?: string; cardIds?: string; batchId?: string }>();
  const [response, setResponse] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const cards = studyTools.reviewCards.filter((card) => card.batchId === state.activeBatchId && !isSubjectLocked(card.subjectId));
  const links = (studyTools.conceptLinks ?? []).filter((link) => link.batchId === state.activeBatchId);
  const navigating = params.mode === 'practice' || params.mode === 'revision';
  const targeted = navigating && params.batchId === state.activeBatchId ? cards.filter((card) => params.cardIds?.split(',').includes(card.id)) : [];
  const currentCard = targeted.find((card) => !reviewed.includes(card.id));
  const navigate = (cardIds: string[], mode: 'revision' | 'practice') => router.push({ pathname: '/concept-map', params: { mode, batchId: state.activeBatchId, cardIds: cardIds.join(',') } });
  if (navigating) return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20 }}>
    <ToolButton secondary label="BACK TO RELATIONSHIPS" onPress={() => router.back()} />
    <ToolHeading kicker="SAVED CARD STUDY" title={params.mode === 'practice' ? 'Practice linked concepts' : 'Revise linked concepts'} detail="Recall before revealing the answer. Completion records actual card review, not an invented score or a new Boss award." />
    <ToolPanel>
      {!targeted.length ? <Text style={{ color: colors.mutedForeground }}>These cards are unavailable or belong to another selected batch. No substitute questions were opened.</Text> : currentCard ? <>
        <Text style={{ color: colors.foreground, fontSize: 18 }}>{currentCard.topicTitle}{'\n'}{currentCard.question}</Text>
        <TextInput accessibilityLabel="Concept practice response" value={response} onChangeText={setResponse} placeholder="Recall in your own words" placeholderTextColor={colors.mutedForeground} multiline style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, padding: 12, marginVertical: 12 }} />
        <ToolButton label="REVEAL ANSWER" disabled={!response.trim()} onPress={() => setRevealed(true)} />
        {revealed ? <>
          <Text style={{ color: colors.foreground, marginVertical: 12 }}>{currentCard.answer}</Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 10 }}>Compare with your response. If you missed a point, revise your answer before continuing.</Text>
          <ToolButton label="REVIEWED · NEXT CARD" onPress={() => { setReviewed([...reviewed, currentCard.id]); setResponse(''); setRevealed(false); }} />
        </> : null}
      </> : <>
        <Text style={{ color: colors.foreground, marginBottom: 12 }}>{reviewed.length} real cards reviewed.</Text>
        <ToolButton label={saved ? 'REVIEW SESSION SAVED' : 'SAVE REVIEW COMPLETION'} disabled={saved} onPress={() => { logRevision(reviewed, state.activeBatchId); setSaved(true); }} />
      </>}
    </ToolPanel>
  </ScrollView>;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}>
    <ToolButton secondary label="BACK" onPress={() => router.back()} />
    <ToolHeading kicker="YOUR KNOWLEDGE GRAPH" title="Concept relationships" detail="Connect real saved review cards in your selected batch. Relationships are authored by you, not invented by AI." />
    <ToolPanel>
      <Text style={{ color: colors.mutedForeground, marginBottom: 10 }}>{source ? 'Choose a related card to save a link.' : 'Choose a source concept, then a related concept.'}</Text>
      {!cards.length ? <Text style={{ color: colors.mutedForeground }}>Save review cards from your lectures first.</Text> : cards.map((card) => <View key={card.id}>
        <ToolButton secondary label={`${source === card.id ? 'SELECTED · ' : ''}${card.topicTitle}: ${card.question}`} onPress={() => {
          if (!source) setSource(card.id);
          else if (source === card.id) setSource(null);
          else { addConceptLink(source, card.id); setSource(null); }
        }} />
        <Text style={{ color: colors.mutedForeground, marginBottom: 8 }}>{studyTools.bossTests.flatMap((test) => test.batchId === state.activeBatchId ? test.results : []).filter((result) => result.cardId === card.id && !result.correct).length} recorded official Boss misses</Text>
      </View>)}
      {source ? <ToolButton label="CANCEL SELECTION" onPress={() => setSource(null)} /> : null}
    </ToolPanel>
    <ToolPanel>
      <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '700', marginBottom: 10 }}>Related → Practice → Mistakes → Revision</Text>
      {!links.length ? <Text style={{ color: colors.mutedForeground }}>No saved relationships yet.</Text> : links.map((link) => {
        const from = cards.find((card) => card.id === link.fromCardId);
        const to = cards.find((card) => card.id === link.toCardId);
        return <View key={link.id} style={{ marginVertical: 10 }}>
          <Text style={{ color: colors.foreground, marginBottom: 8 }}>{from?.topicTitle ?? 'Unavailable card'} ↔ {to?.topicTitle ?? 'Unavailable card'}</Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 8 }}>{from?.question}{'\n'}{to?.question}</Text>
          <ToolButton label="REVISE LINKED CONCEPTS" disabled={!from || !to} onPress={() => navigate([link.fromCardId, link.toCardId], 'revision')} />
          <ToolButton secondary label="PRACTICE LINKED CONCEPTS" disabled={!from || !to} onPress={() => navigate([link.fromCardId, link.toCardId], 'practice')} />
          <ToolButton secondary label="OFFICIAL BOSS MISTAKES" onPress={() => router.push('/rituals?mode=boss')} />
          <ToolButton secondary label="REMOVE RELATIONSHIP" onPress={() => removeConceptLink(link.id)} />
        </View>;
      })}
    </ToolPanel>
  </ScrollView>;
}