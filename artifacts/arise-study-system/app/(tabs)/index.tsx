import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isProfileHapticsEnabled } from '@/contexts/profilePreferences';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useIsFocused } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { arise } from '@/constants/colors';
import { GlassPanel, openMissionRoute, ParticleField, RankCrown } from '@/components/AriseArt';
import { WorldArtwork } from '@/components/VisualWorld';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { useMission } from '@/contexts/MissionContext';
import { buildDailyBriefing, deriveJourney, deriveWeaknessRadar, getMissionActionForQuest } from '@/contexts/masterProgress';
import { AscensionOverlay } from '@/components/SystemAnimations';
import { RpgHubLinks } from '@/components/rpg/RpgHubLinks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deriveBadges } from '@/components/earnedBadges';
import { SystemCoreHero } from '@/components/home/SystemCoreHero';
import { GateBossPanel, JourneyStrip, RadarPreview, RelicShelf } from '@/components/home/HomeIntel';
import { QuestConsoleCard } from '@/components/home/QuestConsoleCard';
import { LevelUpEvent, type LevelUpAchievementIcon } from '@/components/home/LevelUpEvent';
import { getActiveGateAttempt } from '@/contexts/rpgSystem';
import { useColors } from '@/hooks/useColors';
import { Quest, useStudy } from '@/contexts/StudyContext';
import { rankProgressionIndex, rankReadiness } from '@/contexts/rankSystem';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';
import {
  SystemNotificationEvent,
  SystemNotificationToast,
  useReducedMotionPreference,
} from '@/components/SystemAnimations';

const briefingShownKeys = new Set<string>();

const stateDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = y && m && d ? new Date(y, m - 1, d, 12) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

function ProgressBar({ value, color, track }: { value: number; color: string; track: string }) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: track }]}>
      <View style={[styles.progressFill, { width: `${Math.max(3, value * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function ProgressRow({ label, detail, value }: { label: string; detail: string; value: number }) {
  const colors = useColors();
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressRowTop}>
        <Text style={[styles.progressLabel, { color: colors.secondaryForeground }]}>{label}</Text>
        <Text style={[styles.progressDetail, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
      <ProgressBar value={value} color={colors.accent} track={colors.muted} />
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const mission = useMission();
  const experience = useSystemExperience();
  const insets = useSafeAreaInsets();
  const homeTopPadding =
    Platform.OS === 'android'
      ? insets.top
      : Math.max(insets.top + 20, Platform.OS === 'web' ? 20 : 56);
  const homeSidePadding =
    Platform.OS === 'android' ? Math.max(insets.left, insets.right, 4) : 14;
  const reducedMotion = useReducedMotionPreference();
  const {
    state,
    hydrated,
    activeBatch,
    activeBatchProgress,
    nextLecture,
    todayXp,
    level,
    nextLevelXp,
    levelProgress,
    rank,
    completedCount,
    setActiveBatch,
    phaseTwoUnlocked,
    levelUp,
    refreshStudyDay,
    isSubjectLocked,
    toggleQuest,
    startLecture,
    acceptRecoveryQuest,
    dismissLevelUp,
  } = useStudy();
  const studyView = useStudy();
  const rankStatus = rankReadiness(state.totalXp, state.progressHistory);
  // Start milestones only when their stage is visible, not behind a persisted RPG reveal.
  const rpgPresentationPending = studyView.rpg.presentationQueue.length > 0;
  const homeDate = stateDate(state.date);
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(homeDate).toUpperCase();
  const dateLabel = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(homeDate).toUpperCase();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    refreshStudyDay();
    setTimeout(() => setRefreshing(false), 400);
  };
  const [toasts, setToasts] = useState<SystemNotificationEvent[]>([]);
  const baseline = useRef<{ xp: number; level: number; done: number; phase: boolean; rank: string; badges: Set<string> } | null>(null);
  const notifiedProgressEventIds = useRef<Set<string> | null>(null);
  const notificationOwner = useRef<string | null>(null);
  const [ascensions, setAscensions] = useState<{ kind: 'rank' | 'phase'; rank?: string; previousRank?: string }[]>([]);
  const ascension = ascensions[0] ?? null;
  const [briefingOpen, setBriefingOpen] = useState(false);
  const { userId: accountUserId, status: accountStatus } = useAriseAccount();
  const focused = useIsFocused();
  useEffect(() => {
    if (!hydrated || !focused || accountStatus === 'loading' || accountStatus === 'signing-in') return;
    const now = new Date();
    const key = `arise.briefingSeen.v1|${accountUserId ?? 'anonymous'}|${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (briefingShownKeys.has(key)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AsyncStorage.getItem(key).then((seen) => {
      if (cancelled) return;
      if (seen) { briefingShownKeys.add(key); return; }
      // Short delay so a transient Home render during a root redirect never flashes the briefing.
      timer = setTimeout(() => {
        if (cancelled) return;
        briefingShownKeys.add(key);
        AsyncStorage.setItem(key, '1').catch(() => {});
        setBriefingOpen(true);
      }, 700);
    }).catch(() => { /* storage unreadable: stay silent rather than nag */ briefingShownKeys.add(key); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [hydrated, focused, accountStatus, accountUserId, ]);
  const badges = deriveBadges(state.batches as never, state.blackBookPage, state.calculationHistory.length, {
    streak: state.streak, bossTests: state.studyTools.bossTests, ncertBooks: state.ncertBooks, blackBookTotal: state.blackBookTotal, achievementHistory: state.achievementHistory,
  });
  const earnedKey = badges.filter((b) => b.earned).map((b) => b.id).join(',');
  const progressEvents = state.progressHistory?.systemEvents ?? [];
  const progressEventKey = progressEvents.map((event) => event.id).join('|');
  const todayLevelUpActivities = progressEvents
    .filter((event) => event.metadata.activityDate === state.date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .flatMap((event) => {
      const metadata = event.metadata ?? {};
      const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
      let title: string | undefined;
      let detail: string | undefined;
      let icon: LevelUpAchievementIcon = 'check-circle';
      if (event.type === 'quest.completed') {
        icon = 'target';
        title = text(metadata.questTitle);
        detail = 'QUEST COMPLETE';
      } else if (event.type === 'lecture.completed') {
        icon = 'play';
        title = text(metadata.lectureTitle);
        detail = 'LECTURE COMPLETE';
      } else if (event.type === 'ncert.session') {
        icon = 'book-open';
        title = text(metadata.bookTitle);
        detail = typeof metadata.sessionNumber === 'number' ? `NCERT SESSION ${metadata.sessionNumber}` : 'NCERT READING';
      } else if (event.type === 'ncert.book.completed') {
        icon = 'book-open';
        title = text(metadata.bookTitle);
        detail = 'BOOK COMPLETED';
      } else if (event.type === 'vocabulary.activity') {
        icon = 'type';
        title = text(metadata.word) ?? text(metadata.sectionTitle);
        detail = 'VOCABULARY';
      } else if (event.type === 'calculation.session') {
        icon = 'hash';
        title = 'Calculation practice';
        detail = typeof metadata.correct === 'number' && typeof metadata.questions === 'number'
          ? `${metadata.correct}/${metadata.questions} CORRECT` : 'SESSION COMPLETE';
      } else if (event.type === 'boss.activity') {
        icon = 'activity';
        title = 'Boss test';
        detail = typeof metadata.score === 'number' ? `${Math.round(metadata.score)}% SCORE` : 'TEST COMPLETE';
      } else if (event.type === 'achievement.unlocked') {
        icon = 'award';
        const achievementId = text(metadata.achievementId);
        title = badges.find((badge) => badge.id === achievementId)?.title ?? 'Achievement unlocked';
        detail = 'SYSTEM ACHIEVEMENT';
      }
      return title ? [{ id: event.id, title, detail: detail ?? 'COMPLETED', icon }] : [];
    })
    .filter((item, index, items) => items.findIndex((candidate) => candidate.title.toLocaleLowerCase() === item.title.toLocaleLowerCase()) === index)
    .slice(0, 3);
  useEffect(() => {
    if (!hydrated) return;
    const earned = new Set(earnedKey ? earnedKey.split(',') : []);
    const prev = baseline.current;
    const owner = accountUserId ?? 'anonymous';
    const ownerChanged = notificationOwner.current !== owner;
    notificationOwner.current = owner;
    baseline.current = { xp: state.totalXp, level, done: completedCount, phase: phaseTwoUnlocked, rank, badges: earned };
    if (!prev || ownerChanged) {
      notifiedProgressEventIds.current = new Set(progressEvents.map((event) => event.id));
      if (ownerChanged) setAscensions([]);
      return;
    }
    const newAscensions: { kind: 'rank' | 'phase'; rank?: string; previousRank?: string }[] = [];
    if (phaseTwoUnlocked && !prev.phase) newAscensions.push({ kind: 'phase' });
    const seen = notifiedProgressEventIds.current ?? new Set<string>();
    const notifications: SystemNotificationEvent[] = [];
    for (const event of progressEvents) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      const metadata = event.metadata ?? {};
      if (event.type === 'quest.completed') {
        notifications.push({ id: event.id, kind: 'quest-complete' });
      } else if (event.type === 'xp.awarded' && Number(metadata.amount) > 0) {
        const amount = Number(metadata.amount);
        notifications.push({
          id: event.id,
          kind: 'xp-gained',
          amount,
          detail: `+${amount} XP added to your total.`,
        });
      } else if (event.type === 'level.up') {
        notifications.push({ id: event.id, kind: 'level-up', level: Number(metadata.level) });
      } else if (event.type === 'rank.changed'
        && rankProgressionIndex(metadata.rankId) > rankProgressionIndex(metadata.previousRankId)) {
        // Only a newly observed durable transition can announce a rank. Merely
        // recalculating an existing save must not present a fabricated ascent.
        newAscensions.push({
          kind: 'rank',
          previousRank: prev.rank,
          rank: typeof metadata.rankId === 'string' ? metadata.rankId : String(metadata.rank ?? rank),
        });
      } else if (event.type === 'phase.unlocked') {
        notifications.push({ id: event.id, kind: 'phase-unlocked' });
      } else if (event.type === 'achievement.unlocked') {
        const badge = badges.find((item) => item.id === metadata.achievementId);
        notifications.push({
          id: event.id,
          kind: 'achievement-unlocked',
          detail: badge?.title ?? String(metadata.achievementId ?? 'Achievement unlocked'),
        });
      }
    }
    notifiedProgressEventIds.current = seen;
    if (newAscensions.length) setAscensions((queue) => [...queue, ...newAscensions]);
    if (notifications.length) setToasts((queue) => [...queue, ...notifications]);
  }, [hydrated, accountUserId, state.totalXp, level, completedCount, phaseTwoUnlocked, earnedKey, rank, progressEventKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismissToast = useCallback(() => setToasts((q) => q.slice(1)), []);

  const windHour = state.studyTools.windDownHour;
  const windShown = useRef<string | null>(null);
  const [windVisible, setWindVisible] = useState(false);
  useEffect(() => {
    if (!hydrated || windHour === undefined) return;
    const check = () => {
      const now = new Date();
      const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (now.getHours() >= windHour && windShown.current !== key) {
        windShown.current = key;
        setWindVisible(true);
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [hydrated, windHour]);

  const journey = deriveJourney(studyView);
  const briefing = buildDailyBriefing(studyView);
  const radar = deriveWeaknessRadar(state);
  const activeGate = getActiveGateAttempt(studyView.rpg);
  const bossStage = journey.find((st) => st.id === 'boss-tests');
  const est = briefing.estimatedStudyTime;
  const estTotal = (est as { totalMinutes?: number | null }).totalMinutes ?? est.minutes;
  const missionForQuest = (questId: string) => getMissionActionForQuest(studyView, questId);
  const focusQuest = (questId: string) => {
    const m = missionForQuest(questId);
    if (m && mission.startMission(m)) { setBriefingOpen(false); router.push('/mission' as never); return; }
    Alert.alert('Mission unavailable', 'This target is locked or not available to focus on right now.');
  };
  const beginMission = () => {
    experience.play('quest');
    if (isProfileHapticsEnabled()) void Haptics.selectionAsync().catch(() => undefined);
    setBriefingOpen(false);
    const m = briefing.nextMission;
    if (m && mission.startMission(m)) { router.push('/mission' as never); return; }
    if (m) openMissionRoute(m);
  };
  const nextQuest = state.quests.find((q) => !q.completed);
  const mathsProgress = activeBatchProgress.find((item) => item.subjectId === 'maths')
    ?? activeBatchProgress.find((item) => item.name.trim().toLowerCase() === 'maths');
  const mathsComplete = !!mathsProgress && mathsProgress.total > 0 && mathsProgress.remaining === 0;
  const questRoute = (q: Quest) => {
    if (q.isRecovery) return { path: '/rituals?mode=recovery', label: 'OPEN RECOVERY REVIEW' };
    if (q.id === 'maths-lecture') {
      if (mathsComplete) return { path: '/rituals?mode=recovery', label: 'OPEN MATHS REVISION' };
      return { path: '/(tabs)/maths', label: 'OPEN MATHS' };
    }
    const t = `${q.category} ${q.title}`.toLowerCase();
    if (/ncert|black|vocab|synonym|antonym/.test(t)) return { path: '/(tabs)/library', label: 'OPEN LIBRARY' };
    if (/calc|practice/.test(t)) return { path: '/practice', label: 'OPEN PRACTICE' };
    if (/workout|ritual/.test(t)) return { path: '/rituals?mode=workout', label: 'OPEN WORKOUT' };
    if (mathsComplete) return { path: '/rituals?mode=recovery', label: 'OPEN MATHS REVISION' };
    return { path: '/(tabs)/maths', label: 'OPEN MATHS' };
  };
  const day = homeDate.getDay();
  const actionLinks: { label: string; mode: string; note?: string }[] = [
    { label: 'WORKOUT', mode: 'workout' },
    ...(day === 6 ? [{ label: 'SATURDAY BOSS', mode: 'boss' }] : []),
    ...(day === 0 ? [{ label: 'SUNDAY RECOVERY', mode: 'recovery' }] : []),
    { label: 'TRAINING MAP', mode: 'map' },
    { label: '7-DAY EXPERIMENT', mode: 'experiment' },
  ];
  const questsProgress = state.quests.length ? completedCount / state.quests.length : 0;
  const ncertProgress = state.ncertCompleted / state.ncertTotal;
  const vocabularyProgress = state.blackBookPage / state.blackBookTotal;

  const startNextLecture = (resume = false) => {
    if (nextQuest && !resume) { router.push(questRoute(nextQuest).path as never); return; }
    if (!nextLecture) {
      router.push('/(tabs)/maths');
      return;
    }
    if (isSubjectLocked(nextLecture.subjectId)) {
      router.push({ pathname: '/(tabs)/maths', params: { subject: nextLecture.subjectId } });
      return;
    }
    startLecture(nextLecture.subjectId, nextLecture.topicId, nextLecture.lecture.id);
    if (nextLecture.lecture.link) {
      const url = /^https?:\/\//i.test(nextLecture.lecture.link)
        ? nextLecture.lecture.link
        : `https://${nextLecture.lecture.link}`;
      Linking.openURL(url).catch(() => Alert.alert('Unable to open link', 'Check that this lecture link is valid and try again.'));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <WorldArtwork scene="core" opacity={0.34} />
      <ParticleField reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: homeTopPadding, paddingBottom: insets.bottom + 100, paddingHorizontal: homeSidePadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <SystemCoreHero weekday={weekday} dateLabel={dateLabel} rank={rank} level={level} totalXp={state.totalXp} nextLevelXp={nextLevelXp} levelProgress={levelProgress} streak={state.streak} todayXp={todayXp} done={completedCount} total={state.quests.length} reducedMotion={reducedMotion} onBriefing={() => setBriefingOpen(true)} />

        <GateBossPanel attempt={activeGate} bossStage={journey.find((st) => st.id === 'boss-tests')} weeklyBossDone={bossStage ? (bossStage.status === 'insufficient-data' ? null : bossStage.status === 'complete') : null} />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {([['journey', 'map', 'JOURNEY', '#E4C27A'], ['weakness', 'crosshair', 'RADAR', '#B896FF'], ['status', 'user', 'STATUS', '#70E7FF']] as const).map(([r, icon, label, tone]) => (
            <Pressable key={r} testID={`home-nav-${r}`} accessibilityRole="link" onPress={() => router.push(`/${r}` as never)} style={({ pressed }) => [{ flex: 1, minHeight: 56, borderWidth: 1, borderBottomWidth: 3, borderColor: arise.panelEdge, borderBottomColor: tone, backgroundColor: 'rgba(8,20,42,0.85)', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.75 : 1 }]}>
              <Feather name={icon} size={16} color={tone} />
              <Text style={[styles.batchPillText, { color: colors.secondaryForeground }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <RadarPreview radar={radar} />

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionKicker, { color: colors.primary }]}>DAILY QUESTS</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today&apos;s Quests</Text>
          </View>
          <View style={[styles.completionBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.completionCount, { color: colors.primary }]}>{completedCount}/{state.quests.length}</Text>
            <Text style={[styles.completionLabel, { color: colors.mutedForeground }]}>DONE</Text>
          </View>
        </View>

        <View style={[styles.dailyProgress, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.dailyProgressTop}>
            <Text style={[styles.dailyProgressTitle, { color: colors.secondaryForeground }]}>DAILY PROGRESS</Text>
            <Text style={[styles.dailyProgressValue, { color: colors.primary }]}>{Math.round(questsProgress * 100)}%</Text>
          </View>
          <ProgressBar value={questsProgress} color={colors.primary} track={colors.muted} />
        </View>

        {state.recoveryAvailable ? (
          <View style={[styles.recoveryCard, { borderColor: colors.accent, backgroundColor: '#1A1734' }]}>
            <View style={[styles.recoveryIcon, { backgroundColor: colors.accent }]}>
              <Feather name="rotate-ccw" size={18} color="#161029" />
            </View>
            <View style={styles.recoveryCopy}>
              <Text style={[styles.recoveryTitle, { color: colors.accent }]}>RECOVERY PROTOCOL READY</Text>
              <Text style={[styles.recoveryText, { color: colors.secondaryForeground }]}>A missed quest is not a failure. Recover {state.recoveryXp} XP through one safe revision session.</Text>
            </View>
            <Pressable testID="accept-recovery" onPress={acceptRecoveryQuest} style={({ pressed }) => [styles.recoveryButton, { backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.recoveryButtonText, { color: '#161029' }]}>ACCEPT</Text>
            </Pressable>
          </View>
        ) : null}

        {windVisible ? (
          <Pressable accessibilityRole="button" onPress={() => setWindVisible(false)} style={[styles.signalCard, { borderColor: colors.accent, backgroundColor: colors.secondary, marginBottom: 12, minHeight: 44 }]}>
            <Feather name="moon" size={17} color={colors.accent} />
            <View style={styles.signalCopy}>
              <Text style={[styles.signalTitle, { color: colors.foreground }]}>WIND-DOWN TIME</Text>
              <Text style={[styles.signalText, { color: colors.mutedForeground }]}>It is past {windHour}:00. On-screen reminder only. Tap to dismiss.</Text>
            </View>
          </Pressable>
        ) : null}
        <Text style={[styles.signalText, { color: colors.mutedForeground, marginBottom: 10 }]}>Checkbox = self-reported completion. External lecture watching cannot auto-report; mark it manually.</Text>
        <View style={styles.questList}>
          {state.quests.map((quest) => { const route = questRoute(quest); return <QuestConsoleCard key={quest.id} quest={quest} onToggle={() => toggleQuest(quest.id)} onFocus={() => focusQuest(quest.id)} onOpen={() => router.push(route.path as never)} openLabel={route.label} />; })}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {actionLinks.map((a) => (
            <Pressable key={a.mode} testID={`home-link-${a.mode}`} accessibilityRole="link" onPress={() => router.push(`/rituals?mode=${a.mode}` as never)} style={[styles.batchPill, { borderColor: colors.border, backgroundColor: colors.card, minHeight: 44, justifyContent: 'center' }]}>
              <Text style={[styles.batchPillText, { color: colors.primary }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {day !== 6 && day !== 0 ? <Text style={[styles.signalText, { color: colors.mutedForeground, marginBottom: 14 }]}>Saturday Boss and Sunday Recovery appear on their days.</Text> : null}
        <RpgHubLinks />
        <Pressable
          testID="home-link-guilds"
          accessibilityRole="link"
          accessibilityLabel="Open study Guilds"
          onPress={() => router.push('/guilds' as never)}
          style={({ pressed }) => [styles.guildHomeLink, { borderColor: arise.cyan, backgroundColor: arise.panel, opacity: pressed ? 0.76 : 1 }]}
        >
          <View style={[styles.guildHomeIcon, { borderColor: arise.gold }]}>
            <Feather name="users" size={16} color={arise.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.batchPillText, { color: arise.cyan, letterSpacing: 1.1 }]}>GUILD CIRCUIT</Text>
            <Text style={[styles.signalText, { color: colors.mutedForeground, marginTop: 3 }]}>Study together · Sunday leaderboard</Text>
          </View>
          <Feather name="arrow-up-right" size={17} color={arise.cyan} />
        </Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {([['/quest-board', 'QUEST BOARD'], ['/system-log', 'HISTORY & ANALYTICS'], ['/settings', 'SETTINGS']] as const).map(([path, label]) => (
            <Pressable key={path} accessibilityRole="link" onPress={() => router.push(path as never)} style={[styles.batchPill, { minHeight: 48, justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.batchPillText, { color: colors.foreground }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {state.batches.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.batchRow} style={styles.batchRowWrap}>
            {state.batches.map((batch) => {
              const on = batch.id === activeBatch.id;
              return (
                <Pressable
                  key={batch.id}
                  testID={`home-select-batch-${batch.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setActiveBatch(batch.id)}
                  style={[styles.batchPill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.secondary : colors.card }]}
                >
                  <Text numberOfLines={1} style={[styles.batchPillText, { color: on ? colors.primary : colors.mutedForeground }]}>{batch.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={[styles.nextActionCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <View style={styles.nextActionTop}>
            <View style={[styles.nextActionIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={nextLecture ? 'play' : 'check'} size={16} color={colors.primary} />
            </View>
            <View style={styles.nextActionCopy}>
              <Text style={[styles.sectionKicker, { color: colors.primary }]}>NEXT BEST ACTION</Text>
              <Text style={[styles.nextActionTitle, { color: colors.foreground }]}>
                {nextQuest ? nextQuest.title : nextLecture ? nextLecture.lecture.title : 'All daily goals done'}
              </Text>
              <Text style={[styles.nextActionDetail, { color: colors.mutedForeground }]}>
                {nextQuest
                  ? `Earliest unfinished goal · ${nextQuest.category}${nextLecture ? ` · then resume: ${nextLecture.lecture.title}` : ''}`
                  : nextLecture
                  ? `${activeBatch.name} · ${nextLecture.subjectName} · ${nextLecture.topicTitle}`
                  : `${activeBatch.name} has no remaining lectures. Add courses in Batch Courses.`}
              </Text>
            </View>
          </View>
          <Pressable
            testID="next-best-action-start"
            onPress={() => startNextLecture()}
            style={({ pressed }) => [styles.nextActionButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
          >
            <Feather name={nextLecture ? 'play' : 'arrow-right'} size={14} color={colors.primaryForeground} />
            <Text style={[styles.nextActionButtonText, { color: colors.primaryForeground }]}>
              {nextQuest ? questRoute(nextQuest).label : nextLecture ? (nextLecture.lecture.status === 'in-progress' ? 'CONTINUE SESSION' : 'START NEXT LECTURE') : 'OPEN BATCH COURSES'}
            </Text>
            {nextLecture ? <Text style={[styles.nextActionXp, { color: colors.primaryForeground }]}>+{nextLecture.lecture.xpReward} XP</Text> : null}
          </Pressable>
        </View>

        {nextQuest && nextLecture ? (
          <Pressable testID="resume-next-lecture" onPress={() => startNextLecture(true)} style={{ minHeight: 44, justifyContent: 'center', marginTop: -18, marginBottom: 24 }}>
            <Text style={[styles.openSubjectText, { color: colors.primary }]}>RESUME LECTURE: {nextLecture.lecture.title.toUpperCase()}</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionKicker, { color: colors.accent }]}>UNLOCK PATH</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Phase Control</Text>
          </View>
          <Feather name={phaseTwoUnlocked ? 'unlock' : 'lock'} size={19} color={phaseTwoUnlocked ? colors.primary : colors.mutedForeground} />
        </View>

        <View style={[styles.phaseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.phaseHeader}>
            <View>
              <Text style={[styles.phaseLabel, { color: colors.primary }]}>PHASE 01</Text>
              <Text style={[styles.phaseTitle, { color: colors.foreground }]}>The Foundation</Text>
              <Text style={[styles.phaseBatch, { color: colors.mutedForeground }]}>ACTIVE BATCH · {activeBatch.name}</Text>
            </View>
            <Text style={[styles.phaseStatus, { color: colors.primary }]}>ACTIVE</Text>
          </View>
          {activeBatchProgress.map((subject) => (
            <View key={subject.subjectId}>
              <ProgressRow
                label={`${subject.name.toUpperCase()} COURSE`}
                detail={`${subject.completed} done · ${subject.remaining} left · ${subject.total} total · ${Math.round(subject.progress * 100)}%`}
                value={subject.progress}
              />
              <Pressable
                testID={`open-subject-${subject.subjectId}`}
                accessibilityRole="link"
                accessibilityLabel={`Open ${subject.name}`}
                onPress={() => router.push({ pathname: '/(tabs)/maths', params: { subject: subject.subjectId } })}
                style={styles.openSubject}
              >
                <Text style={[styles.openSubjectText, { color: colors.primary }]}>{isSubjectLocked(subject.subjectId) ? 'LOCKED · FINISH SELECTED-BATCH MATHS + NCERT READING · SETUP ONLY' : 'OPEN SUBJECT'}</Text>
                <Feather name="arrow-right" size={11} color={colors.primary} />
              </Pressable>
            </View>
          ))}
          <ProgressRow label="NCERT LIBRARY" detail={`${state.ncertCompleted}/${state.ncertTotal} books`} value={ncertProgress} />
          <ProgressRow label="BLACK BOOK" detail={`${state.blackBookPage}/${state.blackBookTotal} pages`} value={vocabularyProgress} />
          <View style={[styles.phaseDivider, { backgroundColor: colors.border }]} />
          <View style={styles.lockedPhase}>
            <View style={[styles.lockIcon, { borderColor: colors.mutedForeground }]}>
              <Feather name={phaseTwoUnlocked ? 'unlock' : 'lock'} size={15} color={colors.mutedForeground} />
            </View>
            <View style={styles.lockedCopy}>
              <Text style={[styles.lockedTitle, { color: colors.foreground }]}>PHASE 02 · ASCENSION</Text>
              <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>{phaseTwoUnlocked ? 'Unlocked · new missions available' : 'Finish the selected batch’s Maths course and NCERT reading to unlock. Setup and history stay available.'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.signalCard, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
          <Feather name="radio" size={17} color={colors.accent} />
          <View style={styles.signalCopy}>
            <Text style={[styles.signalTitle, { color: colors.foreground }]}>SYSTEM NOTE</Text>
            <Text style={[styles.signalText, { color: colors.mutedForeground }]}>Consistency outranks intensity. Complete one quest to keep the chain alive.</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <RelicShelf badges={badges} />
          <JourneyStrip stages={journey} />
        </View>

        {!hydrated ? <View style={[styles.loadingBar, { backgroundColor: colors.muted }]} /> : null}
      </ScrollView>

      <AscensionOverlay visible={ascension !== null && levelUp === null && !rpgPresentationPending} previousRank={ascension?.previousRank} kind={ascension?.kind ?? 'rank'} rank={ascension?.rank} pathTitle="Phase 02 · Ascension" guardian="reasoning" reducedMotion={reducedMotion} onDismiss={() => setAscensions((queue) => queue.slice(1))} />

      <Modal visible={briefingOpen} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setBriefingOpen(false)}>
        <View style={styles.modalBackdrop}>
          <WorldArtwork scene="core" opacity={0.42} />
          <ParticleField reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
          <GlassPanel style={{ width: '100%', maxWidth: 440, maxHeight: '92%', padding: 0, backgroundColor: 'rgba(5,13,28,0.97)' }}>
            <ScrollView contentContainerStyle={styles.briefingContent} showsVerticalScrollIndicator={false}>
              <View style={styles.briefingHeader}>
                <View style={styles.briefingCrest}>
                  <RankCrown rank={briefing.rank} size={58} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionKicker, { color: arise.cyan }]}>ARISE · MISSION BRIEFING</Text>
                  <Text style={[styles.briefingRank, { color: colors.foreground }]}>{briefing.rank}</Text>
                  <Text style={[styles.briefingDate, { color: colors.mutedForeground }]}>{weekday} // {dateLabel} · LEVEL {briefing.level}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close mission briefing" onPress={() => setBriefingOpen(false)} style={styles.briefingClose}>
                  <Feather name="x" size={17} color={colors.secondaryForeground} />
                </Pressable>
              </View>

              <View style={styles.briefingRankPanel}>
                <View style={styles.briefingPanelHeading}>
                  <View>
                    <Text style={[styles.sectionKicker, { color: arise.cyan }]}>RANK PROGRESSION</Text>
                    <Text style={[styles.briefingPanelTitle, { color: colors.foreground }]}>
                      {rankStatus.nextRank ? `NEXT · ${rankStatus.nextRank.displayName}` : 'SSS · ENDGAME'}
                    </Text>
                  </View>
                  <View style={styles.briefingXpBadge}>
                    <Text style={styles.briefingXpValue}>{briefing.totalXp.toLocaleString()}</Text>
                    <Text style={styles.briefingXpLabel}>TOTAL XP</Text>
                  </View>
                </View>
                {rankStatus.requirements ? ([
                  {
                    key: 'xp',
                    label: 'EXPERIENCE',
                    value: briefing.totalXp,
                    target: rankStatus.requirements.minimumXp,
                    progress: rankStatus.progress.xp,
                    suffix: 'XP',
                    color: arise.cyan,
                  },
                  {
                    key: 'days',
                    label: 'STUDY DAYS',
                    value: rankStatus.evidence.activeDays,
                    target: rankStatus.requirements.minimumActiveDays,
                    progress: rankStatus.progress.activeDays,
                    suffix: 'DAYS',
                    color: arise.azure,
                  },
                  {
                    key: 'actions',
                    label: 'COMPLETED STUDY ACTIONS',
                    value: rankStatus.evidence.completedStudyActivities,
                    target: rankStatus.requirements.minimumStudyActivities,
                    progress: rankStatus.progress.completedStudyActivities,
                    suffix: 'ACTIONS',
                    color: arise.gold,
                  },
                ].map((item) => (
                  <View key={item.key} style={styles.briefingMetric}>
                    <View style={styles.briefingMetricHeading}>
                      <Text style={styles.briefingMetricLabel}>{item.label}</Text>
                      <Text style={styles.briefingMetricValue}>{item.value.toLocaleString()} / {item.target.toLocaleString()} {item.suffix}</Text>
                    </View>
                    <View style={styles.briefingMetricTrack}>
                      <View style={[styles.briefingMetricFill, { width: `${item.progress * 100}%`, backgroundColor: item.color }]} />
                    </View>
                  </View>
                ))) : (
                  <Text style={styles.briefingSmallCopy}>The full rank ladder is complete. Your study record remains saved.</Text>
                )}
                <Text style={styles.briefingSmallCopy}>
                  {briefing.streak} day streak · {rankStatus.evidence.activeDays} recorded study days · {rankStatus.evidence.completedStudyActivities} completed activities
                </Text>
              </View>

              <View style={styles.briefingPlanPanel}>
                <View style={styles.briefingPanelHeading}>
                  <View>
                    <Text style={[styles.sectionKicker, { color: arise.gold }]}>TODAY'S STUDY PLAN</Text>
                    <Text style={[styles.briefingPanelTitle, { color: colors.foreground }]}>
                      {estTotal !== null ? `ABOUT ${estTotal} MIN` : 'TIME ESTIMATE UNAVAILABLE'}
                    </Text>
                  </View>
                  <View style={styles.briefingTodayXp}>
                    <Text style={styles.briefingTodayXpValue}>+{briefing.todayXp}</Text>
                    <Text style={styles.briefingXpLabel}>TODAY XP</Text>
                  </View>
                </View>
                <Text style={styles.briefingSmallCopy}>
                  {estTotal !== null ? `Based on ${est.status === 'partial' ? 'partial' : 'available'} task estimates.` : 'No recorded estimate is available yet.'}
                </Text>
                <Text style={styles.briefingDisclaimer}>{est.disclaimer}</Text>
                {est.tasks.map((task) => (
                  <View key={task.questId} style={styles.briefingEstimateRow}>
                    <Text numberOfLines={1} style={styles.briefingEstimateTitle}>{task.title}</Text>
                    <Text style={styles.briefingEstimateTime}>{task.minutes} min</Text>
                    <Text style={styles.briefingEstimateSource}>
                      {task.estimateSource === 'recorded-duration' ? `${task.recordedSamples} recorded` : 'planned'}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.briefingQuestPanel}>
                <View style={styles.briefingPanelHeading}>
                  <View>
                    <Text style={[styles.sectionKicker, { color: arise.cyan }]}>PRIORITY QUESTS</Text>
                    <Text style={[styles.briefingPanelTitle, { color: colors.foreground }]}>Today's objectives</Text>
                  </View>
                  <Text style={styles.briefingQuestCount}>{briefing.quests.filter((quest) => quest.completed).length}/{briefing.quests.length}</Text>
                </View>
                {briefing.quests.map((quest) => {
                  const order = briefing.pendingQuestIds.indexOf(quest.id);
                  return (
                    <View key={quest.id} style={[styles.briefingQuestRow, quest.completed && styles.briefingQuestCompleted]}>
                      <Feather name={quest.completed ? 'check-circle' : 'target'} size={17} color={quest.completed ? arise.success : arise.cyan} />
                      <View style={styles.briefingQuestCopy}>
                        <Text style={styles.briefingQuestCategory}>{quest.category.toUpperCase()}</Text>
                        <Text style={styles.briefingQuestTitle}>{order >= 0 ? `${order + 1}. ` : ''}{quest.title}</Text>
                        <Text style={styles.briefingQuestSubtitle}>{quest.subtitle}</Text>
                      </View>
                      <View style={styles.briefingQuestReward}>
                        <Text style={styles.briefingQuestXp}>+{quest.xp}</Text>
                        <Text style={styles.briefingXpLabel}>XP</Text>
                      </View>
                      {!quest.completed ? (
                        <Pressable testID={`briefing-focus-${quest.id}`} accessibilityRole="button" accessibilityLabel={`Focus: ${quest.title}`} onPress={() => focusQuest(quest.id)} style={styles.briefingFocusButton}>
                          <Feather name="crosshair" size={16} color={arise.cyan} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {briefing.importantPendingMission ? (
                <View style={styles.briefingAlertPanel}>
                  <Feather name="alert-triangle" size={17} color={arise.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionKicker, { color: arise.danger }]}>
                      {briefing.importantPendingMission.source === 'weakness-radar' ? 'REVISION PRIORITY' : 'IMPORTANT PENDING'}
                    </Text>
                    <Text style={styles.briefingAlertTitle}>{briefing.importantPendingMission.title}</Text>
                    <Text style={styles.briefingSmallCopy}>{briefing.importantPendingMission.subtitle}</Text>
                  </View>
                </View>
              ) : null}
              <Pressable testID="briefing-begin" accessibilityRole="button" onPress={beginMission} style={styles.briefingBeginButton}>
                <Feather name="zap" size={16} color={colors.primaryForeground} />
                <Text style={[styles.continueButtonText, { color: colors.primaryForeground }]}>{briefing.nextMission ? 'BEGIN MISSION' : 'OPEN JOURNEY'}</Text>
              </Pressable>
              <Pressable testID="briefing-dismiss" accessibilityRole="button" onPress={() => setBriefingOpen(false)} style={styles.briefingDismiss}>
                <Text style={[styles.signalText, { color: colors.mutedForeground }]}>NOT NOW</Text>
              </Pressable>
            </ScrollView>
          </GlassPanel>
        </View>
      </Modal>

      {toasts[0] ? <SystemNotificationToast event={toasts[0]} top={insets.top + 8} reducedMotion={reducedMotion} onDismiss={dismissToast} /> : null}

      <LevelUpEvent level={rpgPresentationPending ? null : levelUp} rank={rank} totalXp={state.totalXp} nextLevelXp={nextLevelXp} levelProgress={levelProgress} reducedMotion={reducedMotion} onDismiss={dismissLevelUp} todayAchievements={todayLevelUpActivities} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 7 },
  brand: { fontSize: 35, fontWeight: '700', letterSpacing: 4 },
  brandSub: { fontSize: 10, fontWeight: '600', letterSpacing: 2.2, marginTop: 1 },
  systemIcon: { width: 46, height: 46, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  levelCard: { borderRadius: 20, borderWidth: 1, padding: 19, marginBottom: 28 },
  levelTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  rank: { fontSize: 26, fontWeight: '700', letterSpacing: 1.2 },
  levelNumberWrap: { alignItems: 'flex-end' },
  levelLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  levelNumber: { fontSize: 45, fontWeight: '700', lineHeight: 50 },
  xpLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, marginBottom: 8 },
  xpCaption: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6 },
  progressTrack: { height: 7, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  levelBottom: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: 'rgba(7,16,31,0.32)' },
  statPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  sectionTitle: { fontSize: 23, fontWeight: '700', letterSpacing: 0.2 },
  completionBadge: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  completionCount: { fontSize: 15, fontWeight: '700' },
  completionLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  dailyProgress: { borderRadius: 14, borderWidth: 1, padding: 15, marginBottom: 12 },
  dailyProgressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  dailyProgressTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  dailyProgressValue: { fontSize: 12, fontWeight: '700' },
  questList: { gap: 10, marginBottom: 30 },
  questCardFrame: { borderRadius: 16, shadowOffset: { width: 0, height: 0 } },
  questCard: { minHeight: 85, borderRadius: 16, borderWidth: 1, backgroundColor: '#0D1A2E', padding: 13, flexDirection: 'row', alignItems: 'center' },
  questCheckbox: { width: 28, height: 28, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  questCopy: { flex: 1, paddingRight: 8 },
  questCategory: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  questTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  questTitleComplete: { textDecorationLine: 'line-through', opacity: 0.62 },
  questSubtitle: { fontSize: 12, lineHeight: 17 },
  questReward: { alignItems: 'flex-end', minWidth: 42 },
  xpGain: { position: 'absolute', bottom: 25, right: 0, zIndex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  xpGainText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  xpSpark: { position: 'absolute', top: 2, left: 3, width: 5, height: 5, borderRadius: 3 },
  xpSparkSmall: { width: 4, height: 4, borderRadius: 2 },
  xpSparkTiny: { width: 3, height: 3, borderRadius: 2 },
  questXp: { fontSize: 16, fontWeight: '700' },
  xpLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  recoveryCard: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  recoveryIcon: { width: 33, height: 33, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  recoveryCopy: { flex: 1, paddingRight: 7 },
  recoveryTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 4 },
  recoveryText: { fontSize: 11, lineHeight: 16 },
  recoveryButton: { minHeight: 44, justifyContent: 'center', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 },
  recoveryButtonText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  nextActionCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 28 },
  nextActionTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  nextActionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  nextActionCopy: { flex: 1 },
  nextActionTitle: { fontSize: 14, fontWeight: '700', marginTop: 3 },
  nextActionDetail: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  nextActionButton: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  nextActionButtonText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7, flexShrink: 1 },
  nextActionXp: { fontSize: 10, fontWeight: '700', marginLeft: 'auto' },
  batchRowWrap: { marginBottom: 12, marginTop: -16 },
  batchRow: { gap: 8 },
  batchPill: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 190 },
  batchPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  openSubject: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: -9, marginBottom: 6, minHeight: 44 },
  openSubjectText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  phaseCard: { borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 14 },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  phaseLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  phaseTitle: { fontSize: 21, fontWeight: '700' },
  phaseBatch: { fontSize: 8, fontWeight: '700', letterSpacing: 0.7, marginTop: 4 },
  phaseStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 1, borderWidth: 1, borderColor: '#70E7FF55', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  progressRow: { marginBottom: 15 },
  progressRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  progressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  progressDetail: { fontSize: 11 },
  phaseDivider: { height: 1, marginVertical: 3, marginBottom: 16 },
  guildHomeLink: { minHeight: 66, borderWidth: 1, borderBottomWidth: 3, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  guildHomeIcon: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lockedPhase: { flexDirection: 'row', alignItems: 'center' },
  lockIcon: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  lockedCopy: { flex: 1 },
  lockedTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  lockedText: { fontSize: 11 },
  signalCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'flex-start' },
  signalCopy: { flex: 1, marginLeft: 11 },
  signalTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  signalText: { fontSize: 12, lineHeight: 17 },
  loadingBar: { height: 3, borderRadius: 3, marginTop: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,7,17,0.84)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  briefingContent: { padding: 16, gap: 12 },
  briefingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(112,231,255,0.22)' },
  briefingCrest: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(34,98,162,0.2)', borderWidth: 1, borderColor: 'rgba(112,231,255,0.3)' },
  briefingRank: { fontSize: 22, fontWeight: '800', letterSpacing: 1.1 },
  briefingDate: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 3 },
  briefingClose: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(143,179,218,0.25)', alignItems: 'center', justifyContent: 'center' },
  briefingRankPanel: { borderWidth: 1, borderColor: 'rgba(112,231,255,0.32)', backgroundColor: 'rgba(8,27,49,0.82)', padding: 13, gap: 10 },
  briefingPlanPanel: { borderWidth: 1, borderColor: 'rgba(228,194,122,0.32)', backgroundColor: 'rgba(23,25,34,0.86)', padding: 13, gap: 7 },
  briefingQuestPanel: { borderWidth: 1, borderColor: 'rgba(112,231,255,0.24)', backgroundColor: 'rgba(7,16,31,0.82)', padding: 13, gap: 8 },
  briefingPanelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  briefingPanelTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.65 },
  briefingXpBadge: { alignItems: 'flex-end', paddingLeft: 10 },
  briefingXpValue: { color: arise.cyan, fontSize: 17, fontWeight: '800' },
  briefingXpLabel: { color: 'rgba(191,211,230,0.68)', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  briefingMetric: { gap: 5 },
  briefingMetricHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  briefingMetricLabel: { color: 'rgba(191,211,230,0.78)', fontSize: 8, fontWeight: '800', letterSpacing: 0.9, flexShrink: 1 },
  briefingMetricValue: { color: '#EAF6FF', fontSize: 9, fontWeight: '700', textAlign: 'right' },
  briefingMetricTrack: { height: 5, overflow: 'hidden', backgroundColor: 'rgba(130,157,187,0.16)' },
  briefingMetricFill: { height: '100%' },
  briefingSmallCopy: { color: 'rgba(198,214,231,0.74)', fontSize: 10, lineHeight: 15 },
  briefingTodayXp: { alignItems: 'flex-end', paddingLeft: 8 },
  briefingTodayXpValue: { color: arise.gold, fontSize: 17, fontWeight: '800' },
  briefingDisclaimer: { color: 'rgba(178,198,219,0.55)', fontSize: 9, lineHeight: 13 },
  briefingEstimateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(178,198,219,0.14)', paddingTop: 5 },
  briefingEstimateTitle: { color: '#E2EDF8', flex: 1, fontSize: 10 },
  briefingEstimateTime: { color: arise.gold, fontSize: 10, fontWeight: '800' },
  briefingEstimateSource: { color: 'rgba(178,198,219,0.6)', fontSize: 8, minWidth: 55, textAlign: 'right' },
  briefingQuestCount: { color: arise.cyan, fontSize: 18, fontWeight: '800' },
  briefingQuestRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(178,198,219,0.14)', paddingVertical: 8 },
  briefingQuestCompleted: { opacity: 0.62 },
  briefingQuestCopy: { flex: 1, minWidth: 0 },
  briefingQuestCategory: { color: 'rgba(151,190,224,0.72)', fontSize: 8, fontWeight: '800', letterSpacing: 0.9, marginBottom: 2 },
  briefingQuestTitle: { color: '#F1F7FF', fontSize: 11, fontWeight: '700' },
  briefingQuestSubtitle: { color: 'rgba(198,214,231,0.64)', fontSize: 9, lineHeight: 13, marginTop: 2 },
  briefingQuestReward: { alignItems: 'flex-end', minWidth: 32 },
  briefingQuestXp: { color: arise.cyan, fontSize: 12, fontWeight: '800' },
  briefingFocusButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(112,231,255,0.22)', backgroundColor: 'rgba(32,96,148,0.14)' },
  briefingAlertPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderLeftWidth: 3, borderColor: 'rgba(255,91,105,0.46)', backgroundColor: 'rgba(71,17,31,0.34)', padding: 13 },
  briefingAlertTitle: { color: '#FFF1F3', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  briefingBeginButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, backgroundColor: arise.azure, borderWidth: 1, borderBottomWidth: 3, borderColor: arise.cyan, borderBottomColor: arise.cyan },
  briefingDismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  levelUpModal: { width: '100%', maxWidth: 340, borderWidth: 1, borderRadius: 22, alignItems: 'center', padding: 28 },
  levelUpIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  levelUpKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.8, marginBottom: 4 },
  levelUpTitle: { fontSize: 31, fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  levelUpBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 22 },
  continueButton: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
  continueButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
});
