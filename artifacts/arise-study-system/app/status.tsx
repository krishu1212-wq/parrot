import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { arise } from '@/constants/colors';
import { RankCrown, RelicArt } from '@/components/AriseArt';
import { deriveBadges } from '@/components/earnedBadges';
import ScreenShell from '@/components/ScreenShell';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { SectionHead, SegBar, Stat } from '@/components/status/Hud';
import { useStudy } from '@/contexts/StudyContext';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { selectProgressPersonalRecords } from '@/contexts/progressHistoryTransitions';
import { summarizeEvidence } from '@/contexts/evidenceSummary';

const SUBJECT_ACCENT: Record<string, string> = { maths: '#4FC3FF', reasoning: '#8F7CFF', english: '#38E0CF', ncert: '#B07CFF', vocab: '#D86BFF' };
const accentFor = (key: string) => {
  const k = key.toLowerCase();
  return k.includes('reason') ? SUBJECT_ACCENT.reasoning : k.includes('english') ? SUBJECT_ACCENT.english : SUBJECT_ACCENT.maths;
};

function Attr({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <View style={s.rowB}><Text style={[s.k, { color: accent }]}>{label}</Text><Text style={s.d}>{detail}</Text></View>
      <SegBar value={value} accent={accent} />
    </View>
  );
}

export default function StatusScreen() {
  const study = useStudy();
  const account = useAriseAccount();
  const { state, level, rank, levelProgress, nextLevelXp, activeBatchProgress, phaseTwoUnlocked } = study;
  const badges = deriveBadges(state.batches as never, state.blackBookPage, state.calculationHistory.length, {
    streak: state.streak, bossTests: state.studyTools.bossTests, ncertBooks: state.ncertBooks, blackBookTotal: state.blackBookTotal, achievementHistory: state.achievementHistory,
  });
  const records = selectProgressPersonalRecords(state.progressHistory);
  const evidence = summarizeEvidence(state);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Action failed. Try again.'); } finally { setBusy(false); }
  };
  const conflict = account.conflict;
  const earned = badges.filter((b) => b.earned);
  const acct = account.isSignedIn ? 'PROFILE ACTIVE' : 'SELECT PROFILE';
  const recRows: { k: string; v: string }[] = [];
  if (records.highestDailyNetXp !== null) recRows.push({ k: 'BEST DAY XP', v: records.highestDailyNetXp.toLocaleString() });
  if (records.longestActiveDayStreak !== null) recRows.push({ k: 'LONGEST STREAK', v: `${records.longestActiveDayStreak} d` });
  if (records.mostLecturesCompleted !== null) recRows.push({ k: 'MOST LECTURES / DAY', v: String(records.mostLecturesCompleted) });
  if (records.mostNCERTSessions !== null) recRows.push({ k: 'MOST NCERT SESSIONS', v: String(records.mostNCERTSessions) });
  if (records.bestCalculationResult) recRows.push({ k: 'BEST CALCULATION', v: `${records.bestCalculationResult.correct}/${records.bestCalculationResult.questions}` });
  if (records.bestBossResult) recRows.push({ k: 'BEST BOSS TEST', v: `${records.bestBossResult.correct}/${records.bestBossResult.total}` });

  return (
    <ScreenShell kicker="ARISE SYSTEM" title="Status Window">
      <View style={s.hero} testID="status-hero-art">
        <WorldArtwork scene="core" opacity={0.95} />
        <LinearGradient colors={['rgba(4,8,18,0)', 'rgba(4,8,18,0.92)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={s.crownWrap}><RankCrown rank={rank} size={150} /></View>
        <View style={s.heroInfo}>
          <Text style={s.k}>{acct} · {String(account.syncStatus).toUpperCase()}</Text>
          <Text style={s.rank} testID="status-rank">{rank}</Text>
        </View>
      </View>
      <HudFrame accent={arise.gold} style={{ marginTop: -26, marginHorizontal: 8 }}>
        <View style={s.lvRow}>
          <View>
            <Text style={s.k}>LEVEL</Text>
            <Text style={s.lvNum} testID="status-level">{String(level).padStart(2, '0')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.rowB}><Text style={[s.k, { color: arise.gold }]}>XP</Text><Text style={s.d}>{state.totalXp.toLocaleString()} / {nextLevelXp.toLocaleString()}</Text></View>
            <SegBar value={levelProgress} accent={arise.gold} segments={24} />
            <View style={[s.rowB, { marginTop: 10 }]}>
              <Text style={s.d}>Streak {state.streak} days</Text>
              <Text style={[s.d, { color: phaseTwoUnlocked ? arise.success : arise.inkDim }]}>Phase 02 {phaseTwoUnlocked ? 'UNLOCKED' : 'LOCKED'}</Text>
            </View>
          </View>
        </View>
      </HudFrame>

      <SectionHead label="ACADEMIC ATTRIBUTES" accent={SUBJECT_ACCENT.maths} right="REAL PROGRESS" />
      <HudFrame accent={SUBJECT_ACCENT.maths}>
        <Text style={s.d}>Completion measures course coverage, not accuracy or mastery.</Text>
        {activeBatchProgress.map((p) => (
          <Attr key={p.subjectId} label={p.name.toUpperCase()} value={p.progress ?? 0} detail={`${p.completed}/${p.total}`} accent={accentFor(`${p.subjectId} ${p.name}`)} />
        ))}
        <Attr label="NCERT" value={state.ncertTotal ? state.ncertCompleted / state.ncertTotal : 0} detail={`${state.ncertCompleted}/${state.ncertTotal}`} accent={SUBJECT_ACCENT.ncert} />
        <Attr label="VOCABULARY" value={state.blackBookTotal ? state.blackBookPage / state.blackBookTotal : 0} detail={`${state.blackBookPage}/${state.blackBookTotal}`} accent={SUBJECT_ACCENT.vocab} />
      </HudFrame>

      <SectionHead label="PERFORMANCE & CONSISTENCY" accent={arise.cyan} />
      <HudFrame accent={arise.cyan}>
        <Text style={s.metric}>Calculation accuracy: {evidence.calculationAccuracy === null ? 'Not recorded' : `${Math.round(evidence.calculationAccuracy)}%`}</Text>
        <Text style={s.d}>{evidence.questions ? `${evidence.correct}/${evidence.questions} correct across saved calculation sessions and ledger samples, counted once. Weighted by questions, not session percentages.` : 'Complete a calculation session to measure accuracy.'}</Text>
        <Text style={s.metric}>Recorded study time: {evidence.timedSessions ? `${Math.floor(evidence.studySeconds / 60)}m ${Math.round(evidence.studySeconds % 60)}s` : 'Not recorded'}</Text>
        <Text style={s.d}>{evidence.timedSessions} timed calculation sessions. Lecture, reading, vocabulary and revision duration is not tracked; workout time is excluded. This is not total study time.</Text>
        <Text style={s.metric}>Consistency: {evidence.trackedWeekDays ? `${evidence.activeDaysThisWeek}/${evidence.trackedWeekDays} tracked days this week` : 'Not recorded'}</Text>
        {evidence.trackedWeekDays ? <SegBar value={evidence.activeDaysThisWeek / evidence.trackedWeekDays} accent={arise.success} /> : null}
        <Text style={s.d}>Active days observed in the ledger, Monday through today within tracking coverage. Days before tracking are unknown, not missed. Focus is shown only as recorded timed practice, not a fabricated score.</Text>
        <Text style={s.metric}>This week: {evidence.weeklyXp.toLocaleString()} net XP</Text>
        <Text style={s.metric}>This month: {evidence.monthlyXp.toLocaleString()} net XP</Text>
        <Text style={s.d}>{evidence.trackingStartedAt ? `Event tracking started ${new Date(evidence.trackingStartedAt).toLocaleDateString()}.` : 'Event tracking has not started.'} Period XP includes recorded gains and reversals only, not untracked historical XP.</Text>
        <Text style={s.metric}>Study activity since tracking started</Text>
        <Text style={s.d}>{evidence.trackedLectures} lecture completions · {evidence.trackedReading} NCERT sessions · {evidence.trackedVocabulary} vocabulary activities. These are observed ledger events, not inferred lifetime activity or page counts.</Text>
        <Btn label="OPEN SYSTEM HISTORY" secondary onPress={() => router.push('/system-log' as never)} testID="status-system-log" />
        <Btn label="OPEN QUEST BOARD" secondary onPress={() => router.push('/quest-board' as never)} testID="status-quest-board" />
        <Btn label="OPEN WEAKNESS RADAR" secondary onPress={() => router.push('/weakness' as never)} testID="status-weakness" />
      </HudFrame>

      <SectionHead label="ACADEMIC RECORDS" accent={arise.gold} right="OBSERVED" />
      <HudFrame accent={arise.gold}>
        <View style={s.wrap}>
          <Stat label="CALCULATION SESSIONS" value={String(state.calculationHistory.length)} accent={arise.cyan} />
          <Stat label="ACTIVE DAYS TRACKED" value={String(records.trackedActiveDays)} accent={arise.ink} />
          {recRows.map((r) => <Stat key={r.k} label={r.k} value={r.v} accent={arise.gold} />)}
        </View>
        {!recRows.length ? <Text style={[s.d, { marginTop: 10 }]}>No personal records observed yet. They appear as you complete activities.</Text> : null}
      </HudFrame>

      <SectionHead label="ACHIEVEMENTS AND RELICS" accent={arise.success} right={`${earned.length}/${badges.length} · NO XP`} />
      <View style={s.grid}>
        {badges.map((b) => (
          <HudFrame key={b.id} accent={b.earned ? arise.success : arise.lockedTone} style={s.relic}>
            <View style={{ alignItems: 'center' }}>
              <RelicArt id={b.id} earned={b.earned} size={60} />
              <Text style={s.rt}>{b.title}</Text>
              <Text style={s.rd}>{b.earned ? 'EARNED · ' : 'LOCKED · '}{b.detail}</Text>
            </View>
          </HudFrame>
        ))}
      </View>

      <SectionHead label="ARISE PROFILE" accent={arise.violet} right={`${String(account.status).toUpperCase()} · SYNC ${String(account.syncStatus).toUpperCase()}`} />
      <HudFrame accent={arise.violet}>
        {account.loginError ? <Text style={[s.d, { color: arise.danger }]}>{account.loginError}</Text> : null}
        {account.syncError ? <Text style={[s.d, { color: arise.danger }]}>{account.syncError}</Text> : null}
        {err ? <Text style={[s.d, { color: arise.danger }]}>{err}</Text> : null}
        <Btn testID="status-retry" label="RETRY SYNC" secondary disabled={busy || !account.isSignedIn} onPress={() => run(account.retrySync)} />
        <Btn testID="status-open-profile" label="OPEN ARISE PROFILE" onPress={() => router.push('/profile')} />
        {conflict ? (
          <View style={s.conflict}>
            <Text style={[s.k, { color: arise.danger }]}>PROGRESS CONFLICT</Text>
             <Text style={s.d}>Device and cloud progress differ and the cloud copy is paused. Newer cloud progress is never rolled back to an older device copy. Choose how to proceed.</Text>
            {conflict.kind === 'revision'
              && conflict.baseRevision !== null
              && conflict.baseRevision < conflict.serverRevision
              && conflict.baseState
              && conflict.cloudState ? (
              <>
                <Btn testID="conflict-merge" label="MERGE SAFELY" disabled={busy} onPress={() => run(() => account.resolveConflict('merge'))} />
                <Text style={s.d}>A common saved baseline exists, so changes from both sides can be combined without guessing.</Text>
              </>
            ) : <Text style={s.d}>No common baseline was found, so merging is not offered. Your device copy is kept separately until you decide.</Text>}
            <Btn testID="conflict-cloud" label="KEEP CLOUD" secondary disabled={busy} onPress={() => run(() => account.resolveConflict('keep-cloud'))} />
            <Text style={s.d}>Uses the cloud copy on this device. The device copy is not applied to the cloud.</Text>
          </View>
        ) : null}
      </HudFrame>
    </ScreenShell>
  );
}

function Btn({ label, onPress, secondary, disabled, testID }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.btn, secondary ? s.btn2 : null, { opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[s.btnT, secondary ? { color: arise.violet } : null]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 3, backgroundColor: arise.violet, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 12 },
  btn2: { backgroundColor: 'rgba(184,150,255,0.08)', borderWidth: 1, borderColor: 'rgba(184,150,255,0.5)' },
  btnT: { color: arise.onCyan, fontWeight: '700', letterSpacing: 1, fontSize: 14 },
  conflict: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: arise.panelEdge },
  hero: { height: 330, overflow: 'hidden', backgroundColor: arise.abyss, alignItems: 'center', justifyContent: 'flex-start', borderBottomWidth: 1, borderColor: 'rgba(228,194,122,0.4)' },
  crownWrap: { marginTop: 24 },
  heroInfo: { position: 'absolute', left: 16, right: 16, bottom: 36, backgroundColor: '#0B1220', padding: 12 },
  k: { color: arise.cyan, fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  rank: { color: arise.ink, fontSize: 34, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  lvRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  lvNum: { color: arise.gold, fontSize: 56, fontWeight: '700', lineHeight: 60 },
  d: { color: arise.inkSoft, fontSize: 15, lineHeight: 23 },
  metric: { color: arise.ink, fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  rowB: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  relic: { width: '48%', flexGrow: 1 },
  rt: { color: arise.ink, fontSize: 16, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  rd: { color: arise.inkSoft, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 4 },
});
