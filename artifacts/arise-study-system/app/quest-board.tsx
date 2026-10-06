import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { openMissionRoute } from '@/components/AriseArt';
import { EvidenceHistory } from '@/components/EvidenceHistory';
import { deriveBadges } from '@/components/earnedBadges';
import { SegBar } from '@/components/status/Hud';
import { useStudy } from '@/contexts/StudyContext';
import { getMissionActionForQuest, deriveJourney } from '@/contexts/masterProgress';
import { getWeeklyBossTest, getWeeklyReviewCards } from '@/contexts/learningTools';
import { GATE_DEFINITIONS, getGateEligibility } from '@/contexts/rpgCatalog';
import { arise } from '@/constants/colors';

const TABS = ['Daily', 'Weekly', 'Long-term', 'Special', 'Completed'] as const;
type Tab = typeof TABS[number];

/** Navigation-only board: canonical study screens own every completion and reward. */
export default function QuestBoardScreen() {
  const study = useStudy();
  const { state, rank } = study;
  const [tab, setTab] = useState<Tab>('Daily');
  const cards = getWeeklyReviewCards(state.studyTools.reviewCards, state.activeBatchId, state.date);
  const boss = getWeeklyBossTest(state.studyTools.bossTests, state.activeBatchId, state.date);
  const badges = deriveBadges(state.batches, state.blackBookPage, state.calculationHistory.length, {
    streak: state.streak, bossTests: state.studyTools.bossTests, ncertBooks: state.ncertBooks,
    blackBookTotal: state.blackBookTotal, achievementHistory: state.achievementHistory,
  });
  const gates = GATE_DEFINITIONS.filter((gate) => tab === 'Special' ? gate.type === 'special' : gate.type !== 'special');
  const navigate = (route: string, routeParams?: Record<string, string>) => openMissionRoute({ route, routeParams });
  return <ScreenShell kicker="EXISTING MISSIONS" title="Quest Board">
    <View style={s.surface}>
      <Text style={s.title}>{study.activeBatch.name}</Text>
      <Text style={s.body}>{state.date} · {state.quests.filter((q) => q.completed).length}/{state.quests.length} daily quests complete</Text>
      <Text style={s.body}>One board for existing activities. No extra rewards, invented difficulty or parallel quest completion.</Text>
    </View>
    <View style={s.tabs}>
      {TABS.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === tab }} onPress={() => setTab(item)} style={[s.tab, item === tab && s.selected]}><Text style={s.buttonText}>{item}</Text></Pressable>)}
    </View>
    {tab === 'Daily' ? state.quests.map((quest) => {
      const mission = getMissionActionForQuest(study, quest.id);
      return <View key={quest.id} style={s.surface}>
        <Text style={[s.tag, { color: quest.completed ? arise.success : arise.cyan }]}>{quest.category} · {quest.completed ? 'COMPLETE' : 'PENDING'}</Text>
        <Text style={s.title}>{quest.title}</Text>
        <Text style={s.body}>{quest.subtitle}</Text>
        <Text style={s.body}>{quest.xp} base quest XP · awarded only by the existing activity flow</Text>
        {mission ? <Action label="Open activity" onPress={() => navigate(mission.route, mission.routeParams)} /> : !quest.completed ? <Text style={s.body}>Currently unavailable. Check the active course, saved materials or existing prerequisites.</Text> : null}
      </View>;
    }) : null}
    {tab === 'Weekly' ? <>
      <View style={s.surface}>
        <Text style={s.tag}>OFFICIAL WEEKLY BOSS</Text>
        <Text style={s.title}>{boss ? 'This week’s test is recorded' : cards.length ? 'Saved cards ready for testing' : 'No current-week review cards'}</Text>
        <Text style={s.body}>{cards.length} eligible saved cards in the active batch. This is the existing official test, not Gate practice.</Text>
        {boss ? <Text style={s.body}>{boss.results.filter((r) => r.correct).length}/{boss.results.length} answers correct</Text> : null}
        <Action label={boss ? 'View Boss flow' : 'Open weekly Boss'} onPress={() => navigate('/rituals', { mode: 'boss', batchId: state.activeBatchId })} />
      </View>
      <View style={s.surface}>
        <Text style={s.tag}>RECOVERY · ANY DAY</Text>
        <Text style={s.title}>Review existing saved cards</Text>
        <Text style={s.body}>{state.studyTools.reviewCards.filter((c) => c.batchId === state.activeBatchId).length} saved cards · {state.studyTools.revisionHistory.filter((r) => r.batchId === state.activeBatchId).length} recorded reviews. No fixed weekly completion target exists.</Text>
        {state.recoveryAvailable ? <>
          <Text style={s.body}>A missed-quest Recovery offer is available: {state.recoveryXp} XP through the existing safe revision flow. Accept it on Home; this board cannot award or claim it.</Text>
          <Action label="View Recovery offer on Home" onPress={() => navigate('/(tabs)')} />
        </> : null}
        <Action label="Open Recovery" onPress={() => navigate('/rituals', { mode: 'recovery', batchId: state.activeBatchId })} />
      </View>
    </> : null}
    {tab === 'Weekly' || tab === 'Special' ? <>
      {tab === 'Weekly' ? <Text style={s.section}>Existing Gates · not a weekly reset</Text> : <Text style={s.section}>Special Gate opportunities</Text>}
      {gates.map((gate) => {
        const record = state.rpg?.gates[gate.id];
        const eligibility = getGateEligibility(gate, state.totalXp, rank);
        const attempt = state.rpg?.attempts.find((a) => a.id === state.rpg?.activeAttemptId && a.gateId === gate.id && a.status === 'active');
        return <View key={gate.id} style={s.surface}>
          <Text style={[s.tag, { color: tab === 'Special' ? arise.violet : arise.ember }]}>{gate.type.toUpperCase()} · {record?.completed ? 'CLEARED' : attempt ? 'ACTIVE' : eligibility.eligible ? 'ELIGIBLE' : 'LOCKED'}</Text>
          <Text style={s.title}>{gate.name}</Text>
          <Text style={s.body}>{gate.description}</Text>
          <Text style={s.body}>{gate.objective.label}</Text>
          {attempt ? <><Text style={s.body}>{attempt.progress}/{attempt.goal} in the current attempt · deadline {new Date(attempt.deadlineAt).toLocaleString()}</Text><SegBar value={attempt.progress / attempt.goal} accent={arise.ember} /></> : null}
          {!eligibility.eligible ? <Text style={s.body}>{eligibility.reason}</Text> : null}
          <Text style={s.body}>{gate.rewards.xp} base Gate XP · rewards handled by the Gate system</Text>
          <Action label="Inspect in Gates" onPress={() => navigate('/gates')} />
        </View>;
      })}
      {tab === 'Special' ? <View style={s.surface}>
        <Text style={s.title}>Evidence-based recovery opportunities</Text>
        <Text style={s.body}>Use recorded topic results to choose revision and practice. No special quest or reward is generated here.</Text>
        <Action label="Open Weakness Radar" onPress={() => navigate('/weakness')} />
      </View> : null}
    </> : null}
    {tab === 'Long-term' ? <>
      <Text style={s.section}>Course coverage · not mastery</Text>
      {deriveJourney(study).filter((stage) => !['foundation', 'boss-tests', 'revision'].includes(stage.id)).map((stage) => <View key={stage.id} style={s.surface}>
        <Text style={s.tag}>{stage.status.replace('-', ' ').toUpperCase()}</Text>
        <Text style={s.title}>{stage.title}</Text>
        {stage.progress ? <><Text style={s.body}>{stage.progress.completed}/{stage.progress.total} completed</Text><SegBar value={stage.progress.completed / stage.progress.total} accent={arise.cyan} /></> : null}
        {stage.note ? <Text style={s.body}>{stage.note}</Text> : null}
        <Action label="Open Journey" onPress={() => navigate('/journey')} />
      </View>)}
      <Text style={s.section}>Existing achievement milestones · no XP</Text>
      {badges.map((badge) => <View key={badge.id} style={s.surface}>
        <Text style={[s.tag, { color: badge.earned ? arise.success : arise.gold }]}>{badge.earned ? 'EARNED' : 'NOT YET EARNED'}</Text>
        <Text style={s.title}>{badge.title}</Text>
        <Text style={s.body}>{badge.detail}</Text>
      </View>)}
    </> : null}
    {tab === 'Completed' ? <EvidenceHistory state={state} archive /> : null}
  </ScreenShell>;
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  surface: { padding: 16, backgroundColor: '#0B1220', borderColor: arise.panelEdge, borderWidth: 1, marginBottom: 12 },
  title: { color: arise.ink, fontSize: 20, lineHeight: 28, fontWeight: '700', marginBottom: 6 },
  body: { color: arise.inkSoft, fontSize: 15, lineHeight: 23, marginBottom: 6 },
  tag: { color: arise.cyan, fontSize: 13, lineHeight: 20, fontWeight: '700', marginBottom: 6 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tab: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#151F30', borderWidth: 1, borderColor: arise.panelEdge },
  selected: { borderColor: arise.cyan, backgroundColor: '#163342' },
  buttonText: { color: arise.ink, fontSize: 15, fontWeight: '600' },
  section: { color: arise.gold, fontSize: 18, lineHeight: 26, fontWeight: '600', backgroundColor: '#0B1220', padding: 12, marginBottom: 12 },
  action: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderColor: arise.cyan, borderWidth: 1, backgroundColor: '#142537', marginTop: 8 },
});