import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { GlassPanel, openMissionRoute } from '@/components/AriseArt';
import ScreenShell from '@/components/ScreenShell';
import FocusTimerPanel from '@/components/FocusTimerPanel';
import { useMission } from '@/contexts/MissionContext';
import { useStudy } from '@/contexts/StudyContext';
import { getNextMission } from '@/contexts/masterProgress';

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
};

function Btn({ label, icon, onPress, secondary, testID, disabled }: { disabled?: boolean; label: string; icon: React.ComponentProps<typeof Feather>['name']; onPress: () => void; secondary?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPress={onPress} style={({ pressed }) => [s.btn, secondary ? s.btnSecondary : s.btnPrimary, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <Feather name={icon} size={16} color={secondary ? arise.cyan : arise.onCyan} />
      <Text style={[s.btnText, { color: secondary ? arise.cyan : arise.onCyan }]}>{label}</Text>
    </Pressable>
  );
}

export default function MissionScreen() {
  const study = useStudy();
  const { activeMission, progress, elapsedSeconds, startMission, finishMission, cancelMission, summary, dismissSummary } = useMission();
  const [note, setNote] = useState('');
  const next = getNextMission(study);

  if (summary) {
    return (
      <ScreenShell kicker="MISSION COMPLETE" title="Session Summary">
        <FocusTimerPanel />
        <GlassPanel tone="gold">
          <Text style={s.label}>COMPLETED</Text>
          <Text style={s.big}>{summary.completedTask}</Text>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statV}>{clock(summary.elapsedSeconds)}</Text><Text style={s.label}>STUDY TIME</Text></View>
            <View style={s.stat}><Text style={s.statV}>+{summary.actualXpDelta}</Text><Text style={s.label}>XP GAINED</Text></View>
            <View style={s.stat}>
              <Text style={s.statV}>{summary.accuracy ? `${Math.round(summary.accuracy.percent)}%` : '--'}</Text>
              <Text style={s.label}>{summary.accuracy ? `${summary.accuracy.numerator}/${summary.accuracy.denominator} ACCURACY` : 'ACCURACY N/A'}</Text>
            </View>
          </View>
          {summary.progress.value !== null && summary.progress.total !== null ? (
            <Text style={s.small}>Recorded: {summary.progress.value}/{summary.progress.total} {summary.progress.unit ?? ''}{summary.target.goal ? ` (goal: ${summary.target.goal.count} ${summary.target.goal.unit})` : ''}</Text>
          ) : summary.progress.actualDelta !== null ? (
            <Text style={s.small}>Recorded change: {summary.progress.actualDelta} {summary.progress.unit ?? ''}</Text>
          ) : null}
          <Text style={s.small}>XP reflects only what the study record actually changed. Nothing is added by this screen.</Text>
        </GlassPanel>
        <Text style={[s.label, { marginTop: 18, marginBottom: 8 }]}>NEXT ACTION</Text>
        {summary.nextMission ? (
          <GlassPanel>
            <Text style={s.big}>{summary.nextMission.title}</Text>
            <Text style={s.small}>{summary.nextMission.subtitle}</Text>
            <Btn testID="summary-next-begin" label="BEGIN NEXT MISSION" icon="play" onPress={() => { const m = summary.nextMission!; dismissSummary(); if (startMission(m)) openMissionRoute(m); }} />
          </GlassPanel>
        ) : <Text style={s.small}>No further mission is available right now.</Text>}
        <Btn testID="summary-done" label="BACK TO SYSTEM" icon="home" secondary onPress={() => { dismissSummary(); router.replace('/(tabs)' as never); }} />
      </ScreenShell>
    );
  }

  if (!activeMission) {
    return (
      <ScreenShell kicker="MISSION MODE" title="No Active Mission">
        <FocusTimerPanel />
        <GlassPanel>
          {next ? (
            <>
              <Text style={s.label}>READY</Text>
              <Text style={s.big}>{next.title}</Text>
              <Text style={s.small}>{next.subtitle}</Text>
              <Btn testID="mission-begin" label="BEGIN MISSION" icon="play" onPress={() => { if (startMission(next)) openMissionRoute(next); else setNote('This mission is not available to start right now.'); }} />
              {note ? <Text style={[s.small, { color: arise.danger }]}>{note}</Text> : null}
            </>
          ) : <Text style={s.small}>Nothing is pending. Check the Journey for what to do next.</Text>}
        </GlassPanel>
        <Btn label="OPEN JOURNEY" icon="map" secondary onPress={() => router.push('/journey' as never)} />
      </ScreenShell>
    );
  }

  const m = activeMission;
  const pr = progress;
  const measured = pr && pr.value !== null && pr.total !== null && pr.total > 0;
  const frac = measured ? Math.max(0, Math.min(1, pr!.value! / pr!.total!)) : 0;
  const statusLabel = pr ? pr.status.toUpperCase().replace('-', ' ') : 'WAITING';
  const progressText = pr?.detail ?? 'Waiting for a new recorded record for this exact target.';
  return (
    <ScreenShell kicker="MISSION MODE" title="Focus">
      <FocusTimerPanel />
      <GlassPanel tone="violet" style={{ alignItems: 'center', paddingVertical: 26 }}>
        <Text style={s.label}>ELAPSED (PAUSES IN BACKGROUND)</Text>
        <Text testID="mission-timer" style={s.timer}>{clock(elapsedSeconds)}</Text>
      </GlassPanel>
      <GlassPanel style={{ marginTop: 12 }}>
        <Text style={s.label}>CURRENT TASK</Text>
        <Text style={s.big}>{m.title}</Text>
        <Text style={s.small}>{m.subtitle}</Text>
        <Text style={[s.label, { marginTop: 12 }]}>REWARD</Text>
        <Text style={s.small}>{m.xpReward ? `${m.xpReward} XP, granted only by the recorded activity` : 'Recorded by the activity itself'}</Text>
        <Text style={[s.label, { marginTop: 12 }]}>LIVE PROGRESS</Text>
        {measured ? (
          <>
            <View style={s.track}><View style={[s.fill, { width: `${frac * 100}%` }]} /></View>
            <Text style={s.small}>{pr!.value}/{pr!.total} {pr!.unit ?? ''}</Text>
          </>
        ) : <Text style={[s.label, { color: arise.gold }]}>{statusLabel} · NOT MEASURED</Text>}
        <Text style={s.small}>{progressText}</Text>
      </GlassPanel>
      <Text style={[s.small, { marginTop: 12 }]}>Tip: enable Do Not Disturb on your device before you start.</Text>
      <Btn testID="mission-open" label="OPEN ACTIVITY" icon="external-link" onPress={() => openMissionRoute(m)} />
      <Btn testID="mission-coach" label="ASK AI COACH" icon="message-square" secondary onPress={() => router.push('/(tabs)/assistant' as never)} />
      {pr?.status !== 'complete' ? <Text style={s.small}>Not recorded yet. Complete is available once the activity itself is saved.</Text> : null}
      <Btn testID="mission-finish" label="COMPLETE MISSION" icon="check" secondary disabled={pr?.status !== 'complete'} onPress={() => setNote(finishMission() ? '' : 'No recorded proof yet. Finish the activity first; this button never awards XP.')} />
      {note ? <Text style={[s.small, { color: arise.danger }]}>{note}</Text> : null}
      <Pressable testID="mission-cancel" accessibilityRole="button" onPress={() => { cancelMission(); router.replace('/(tabs)' as never); }} style={s.cancel}>
        <Text style={[s.small, { color: arise.danger }]}>ABANDON MISSION</Text>
      </Pressable>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  label: { color: arise.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 4 },
  big: { color: arise.ink, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  small: { color: arise.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 4 },
  timer: { color: arise.ink, fontSize: 56, fontWeight: '200', letterSpacing: 2, marginTop: 6 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1 },
  statV: { color: arise.gold, fontSize: 22, fontWeight: '800' },
  track: { height: 6, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginVertical: 4 },
  fill: { height: 6, backgroundColor: arise.cyan, borderRadius: 5 },
  btn: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: arise.cyan },
  btnSecondary: { borderWidth: 1, borderColor: arise.panelEdge, backgroundColor: arise.panel },
  btnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
