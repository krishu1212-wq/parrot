import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arise } from '@/constants/colors';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { SystemEmblem } from '@/components/AriseArt';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { useProfileSession, type ProfileSettings } from '@/contexts/ProfileContext';
import { useStudy } from '@/contexts/StudyContext';

type ProfileAction = 'logout' | 'restore' | null;

export default function ProfileRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAriseAccount();
  const session = useProfileSession();
  const study = useStudy();
  const [nameDraft, setNameDraft] = useState(session.profile?.displayName ?? '');
  const [showAccountCode, setShowAccountCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<ProfileAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const profile = session.profile;

  const records = useMemo(() => {
    const state = study.state;
    const lectureCount = state.batches.reduce((batchTotal, batch) => batchTotal
      + batch.subjects.reduce((subjectTotal, subject) => subjectTotal
        + subject.topics.reduce((topicTotal, topic) => topicTotal
          + topic.lectures.filter((lecture) => lecture.status === 'completed').length, 0), 0), 0);
    const ncertCompleted = state.ncertBooks.reduce((total, book) => total + book.completedSessions, 0);
    const ncertTotal = state.ncertBooks.reduce((total, book) => total + book.totalSessions, 0);
    const completedQuests = state.progressHistory?.systemEvents.filter((event) => event.type === 'quest.completed').length ?? 0;
    const bossRecords = study.studyTools.bossTests.length;
    const highestLevel = state.progressHistory?.systemEvents
      .filter((event) => event.type === 'level.up')
      .reduce((peak, event) => {
        const level = event.metadata?.level;
        return typeof level === 'number' && Number.isFinite(level) ? Math.max(peak, level) : peak;
      }, 0) ?? 0;
    const longestStreak = state.achievementHistory?.highestObservedStreak ?? 0;
    const achievements = state.achievementHistory?.earnedRelicIds.length ?? 0;
    const relics = Object.keys(study.rpg.inventory).length;
    return [
      { label: 'Highest level', value: highestLevel > 0 ? `Level ${highestLevel}` : 'NO RECORDED DATA' },
      { label: 'Total XP', value: `${Math.max(0, Math.floor(state.totalXp)).toLocaleString()} XP` },
      { label: 'Longest streak', value: longestStreak > 0 ? `${longestStreak} days` : 'NO RECORDED DATA' },
      { label: 'Quests completed', value: completedQuests > 0 ? String(completedQuests) : 'NO RECORDED DATA' },
      { label: 'Lectures completed', value: lectureCount > 0 ? String(lectureCount) : 'NO RECORDED DATA' },
      { label: 'NCERT sessions', value: ncertCompleted > 0 ? `${ncertCompleted} / ${ncertTotal}` : 'NO RECORDED DATA' },
      { label: 'Boss records', value: bossRecords > 0 ? String(bossRecords) : 'NO RECORDED DATA' },
      { label: 'Achievements', value: achievements > 0 ? String(achievements) : 'NO RECORDED DATA' },
      { label: 'Relics', value: relics > 0 ? String(relics) : 'NO RECORDED DATA' },
    ];
  }, [study.state, study.studyTools.bossTests.length, study.rpg.inventory]);

  if (!profile) return null;

  const updateSettings = async (next: ProfileSettings) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await session.updateProfile({ settings: next });
      setNotice('Profile settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = (key: 'soundEnabled' | 'hapticsEnabled' | 'notificationsEnabled') => {
    void updateSettings({ ...profile.settings, [key]: !profile.settings[key] });
  };

  const setDisplayName = async () => {
    if (saving || nameDraft.trim() === profile.displayName) return;
    setSaving(true);
    setError(null);
    try {
      await session.updateProfile({ displayName: nameDraft.trim() || 'ARISE Player' });
      setNotice('Player name saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Player name could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profile.accountCode);
        setNotice('Account Code copied.');
      } else {
        await Share.share({ title: 'ARISE Account Code', message: profile.accountCode });
        setNotice('Account Code ready to copy or share.');
      }
    } catch {
      setNotice('Select and copy the Account Code shown on screen.');
    }
  };

  const performAction = async () => {
    if (!action) return;
    setAction(null);
    setError(null);
    try {
      await account.signOut();
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The profile session could not be closed.');
    }
  };

  return (
    <View style={s.root}>
      <WorldArtwork scene="vault" opacity={0.32} />
      <ScrollView contentContainerStyle={{
        paddingHorizontal: 18,
        paddingTop: Math.max(insets.top, 18) + 12,
        paddingBottom: Math.max(insets.bottom, 20) + 28,
      }}>
        <View style={s.column}>
          <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.back}>
            <Feather name="arrow-left" size={18} color={arise.silver} />
            <Text style={s.backText}>BACK</Text>
          </Pressable>
          <Text style={s.eyebrow}>ARISE · PLAYER DOSSIER</Text>
          <Text accessibilityRole="header" style={s.title}>ARISE PROFILE</Text>

          <HudFrame accent={arise.cyan} style={s.hero}>
            <View style={s.heroIdentity}>
              <SystemEmblem size={58} color={arise.cyan} />
              <View style={{ flex: 1 }}>
                <TextInput
                  accessibilityLabel="Player name"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onBlur={() => void setDisplayName()}
                  maxLength={48}
                  returnKeyType="done"
                  onSubmitEditing={() => void setDisplayName()}
                  style={s.nameInput}
                />
                <Text style={s.rankLine}>LEVEL {study.level}  ·  RANK {study.rank}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Save player name" onPress={() => void setDisplayName()} style={s.saveName}>
                <Feather name="check" size={18} color={arise.cyan} />
              </Pressable>
            </View>
            <View style={s.xpHeader}>
              <Text style={s.xpText}>{Math.max(0, Math.floor(study.state.totalXp)).toLocaleString()} XP</Text>
              <Text style={s.xpText}>NEXT LEVEL</Text>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(study.levelProgress * 100) }} style={s.xpTrack}>
              <View style={[s.xpFill, { width: `${Math.max(0, Math.min(100, study.levelProgress * 100))}%` }]} />
            </View>
            <View style={s.heroFacts}>
              <Fact label="CURRENT PHASE" value={study.phaseTwoUnlocked ? 'PHASE 2' : 'PHASE 1'} />
              <Fact label="STREAK" value={`${study.state.streak} DAYS`} accent={arise.gold} />
            </View>
          </HudFrame>

          <SectionTitle title="ACCOUNT" />
          <HudFrame accent={arise.violet} style={s.panel}>
            <Text style={s.label}>ACCOUNT CODE</Text>
            <View style={s.codeRow}>
              <Text selectable style={s.code}>{showAccountCode ? profile.accountCode : 'ARISE-••••-••••'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={showAccountCode ? 'Hide Account Code' : 'Show Account Code'} onPress={() => setShowAccountCode((value) => !value)} style={s.iconButton}>
                <Feather name={showAccountCode ? 'eye-off' : 'eye'} size={18} color={arise.silver} />
              </Pressable>
            </View>
            <View style={s.buttonRow}>
              <SmallButton label={Platform.OS === 'web' ? 'COPY ID' : 'SHARE ID'} icon="copy" onPress={() => void copyCode()} />
              <SmallButton label={showAccountCode ? 'HIDE ID' : 'SHOW ID'} icon={showAccountCode ? 'eye-off' : 'eye'} onPress={() => setShowAccountCode((value) => !value)} secondary />
            </View>
            <Text style={s.hint}>Use this Account Code with your separate recovery key to restore your ARISE profile on another device.</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: account.syncStatus === 'synced' ? arise.success : account.syncStatus === 'error' ? arise.danger : arise.gold }]} />
              <Text style={s.statusText}>BACKUP / SYNC · {account.syncStatus.toUpperCase()}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={s.linkButton}>
              <Feather name="cloud" size={16} color={arise.cyan} />
              <Text style={s.linkText}>SYNC DETAILS & CONFLICTS</Text>
            </Pressable>
          </HudFrame>

          <SectionTitle title="PROFILE RECORDS" />
          <HudFrame accent={arise.gold} style={s.panel}>
            {records.map((record) => (
              <View key={record.label} style={s.recordRow}>
                <Text style={s.recordLabel}>{record.label}</Text>
                <Text style={[s.recordValue, record.value === 'NO RECORDED DATA' && s.emptyValue]}>{record.value}</Text>
              </View>
            ))}
          </HudFrame>

          <SectionTitle title="SETTINGS" />
          <HudFrame accent={arise.cyan} style={s.panel}>
            <SettingSwitch
              title="Sound"
              description="System cues and reward audio"
              value={profile.settings.soundEnabled}
              disabled={saving}
              onValueChange={() => toggleSetting('soundEnabled')}
            />
            <Text style={s.settingSubheading}>VOLUME · {Math.round(profile.settings.soundVolume * 100)}%</Text>
            <View style={s.buttonRow}>
              {[0, 0.25, 0.5, 0.75, 1].map((volume) => (
                <Pressable
                  key={volume}
                  accessibilityRole="radio"
                  accessibilityLabel={`${Math.round(volume * 100)} percent volume`}
                  accessibilityState={{ selected: profile.settings.soundVolume === volume }}
                  disabled={saving}
                  onPress={() => void updateSettings({ ...profile.settings, soundVolume: volume })}
                  style={[s.choice, profile.settings.soundVolume === volume && s.choiceSelected]}
                >
                  <Text style={[s.choiceText, profile.settings.soundVolume === volume && { color: arise.gold }]}>{Math.round(volume * 100)}%</Text>
                </Pressable>
              ))}
            </View>
            <SettingSwitch
              title="Haptic Feedback"
              description="Touch and completion feedback"
              value={profile.settings.hapticsEnabled}
              disabled={saving}
              onValueChange={() => toggleSetting('hapticsEnabled')}
            />
            <ChoiceSetting
              title="Animations"
              options={[['full', 'FULL'], ['reduced', 'REDUCED MOTION']]}
              value={profile.settings.motion}
              disabled={saving}
              onSelect={(motion) => void updateSettings({ ...profile.settings, motion })}
            />
            <SettingSwitch
              title="Notifications"
              description="In-app status and reminder alerts"
              value={profile.settings.notificationsEnabled}
              disabled={saving}
              onValueChange={() => toggleSetting('notificationsEnabled')}
            />
            <ChoiceSetting
              title="Appearance"
              options={[['system', 'SYSTEM'], ['dark', 'DARK']]}
              value={profile.settings.appearance}
              disabled={saving}
              onSelect={(appearance) => void updateSettings({ ...profile.settings, appearance })}
            />
            {saving ? <ActivityIndicator color={arise.cyan} style={{ marginTop: 15 }} /> : null}
          </HudFrame>

          <SectionTitle title="ACCOUNT MANAGEMENT" />
          <HudFrame accent={arise.danger} style={s.panel}>
            <Text style={s.hint}>Logging out clears only this device’s active session. Your Account Code and cloud progress remain saved.</Text>
            <Pressable accessibilityRole="button" onPress={() => setAction('restore')} style={s.managementButton}>
              <Feather name="refresh-cw" size={17} color={arise.cyan} />
              <Text style={s.linkText}>RESTORE ANOTHER ACCOUNT</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAction('logout')} style={[s.managementButton, s.logoutButton]}>
              <Feather name="log-out" size={17} color={arise.danger} />
              <Text style={[s.linkText, { color: arise.danger }]}>LOG OUT</Text>
            </Pressable>
          </HudFrame>

          {action ? (
            <HudFrame accent={action === 'logout' ? arise.danger : arise.gold} style={s.confirmPanel}>
              <Text style={s.optionTitle}>{action === 'logout' ? 'LOG OUT OF THIS PROFILE?' : 'RESTORE ANOTHER PROFILE?'}</Text>
              <Text style={s.hint}>
                {action === 'logout'
                  ? 'This removes the active session from this device only. It does not delete your cloud profile or study progress.'
                  : 'ARISE will clear this device’s active session and return to profile selection. The current cloud profile remains unchanged.'}
              </Text>
              <View style={s.buttonRow}>
                <SmallButton label="CANCEL" icon="x" onPress={() => setAction(null)} secondary />
                <SmallButton label={action === 'logout' ? 'LOG OUT' : 'CONTINUE'} icon={action === 'logout' ? 'log-out' : 'arrow-right'} onPress={() => void performAction()} />
              </View>
            </HudFrame>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          {notice ? <Text style={s.notice}>{notice}</Text> : null}
          {session.sessionError ? <Text accessibilityRole="alert" style={s.error}>{session.sessionError}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function Fact({ label, value, accent = arise.cyan }: { label: string; value: string; accent?: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={[s.factValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function SmallButton({
  label,
  icon,
  onPress,
  secondary = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.smallButton, secondary && s.smallButtonSecondary]}>
      <Feather name={icon} size={14} color={secondary ? arise.silver : arise.abyss} />
      <Text style={[s.smallButtonText, secondary && { color: arise.silver }]}>{label}</Text>
    </Pressable>
  );
}

function SettingSwitch({
  title,
  description,
  value,
  disabled,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: () => void;
}) {
  return (
    <View style={s.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.settingTitle}>{title}</Text>
        <Text style={s.settingDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        trackColor={{ false: arise.rail, true: arise.cyan }}
        thumbColor={value ? arise.ink : arise.silver}
        onValueChange={onValueChange}
      />
    </View>
  );
}

function ChoiceSetting<T extends string>({
  title,
  options,
  value,
  disabled,
  onSelect,
}: {
  title: string;
  options: [T, string][];
  value: T;
  disabled: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={s.choiceSection}>
      <Text style={s.settingTitle}>{title}</Text>
      <View style={s.buttonRow}>
        {options.map(([option, label]) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option }}
            disabled={disabled}
            onPress={() => onSelect(option)}
            style={[s.choice, value === option && s.choiceSelected]}
          >
            <Text style={[s.choiceText, value === option && { color: arise.gold }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: arise.abyss },
  column: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  backText: { color: arise.silver, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  eyebrow: { color: arise.gold, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2.2 },
  title: { color: arise.ink, fontSize: 31, fontFamily: 'Inter_700Bold', marginTop: 8, marginBottom: 18 },
  hero: { padding: 18 },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameInput: { color: arise.ink, fontSize: 18, fontFamily: 'Inter_700Bold', paddingVertical: 5 },
  rankLine: { color: arise.gold, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 5 },
  saveName: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  xpText: { color: arise.silver, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  xpTrack: { height: 8, marginTop: 8, borderRadius: 5, backgroundColor: arise.rail, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: arise.cyan, borderRadius: 5 },
  heroFacts: { flexDirection: 'row', gap: 12, marginTop: 17 },
  fact: { flex: 1, minHeight: 58, padding: 10, borderWidth: 1, borderColor: arise.panelEdge, backgroundColor: 'rgba(5,9,17,0.62)' },
  factLabel: { color: arise.inkSoft, fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  factValue: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 7 },
  sectionTitle: { color: arise.silver, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 24, marginBottom: 9 },
  panel: { padding: 17 },
  label: { color: arise.cyan, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42 },
  code: { color: arise.ink, fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  smallButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, backgroundColor: arise.cyan, borderRadius: 7 },
  smallButtonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: arise.panelEdge },
  smallButtonText: { color: arise.abyss, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  hint: { color: arise.inkSoft, fontSize: 11, lineHeight: 18, marginTop: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: arise.inkSoft, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  linkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  linkText: { color: arise.cyan, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 37, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: arise.panelEdge, gap: 10 },
  recordLabel: { color: arise.inkSoft, fontSize: 11 },
  recordValue: { color: arise.ink, fontSize: 10, fontFamily: 'Inter_700Bold', textAlign: 'right', maxWidth: '55%' },
  emptyValue: { color: arise.inkSoft, fontSize: 8, letterSpacing: 0.5 },
  settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: arise.panelEdge, paddingVertical: 8 },
  settingTitle: { color: arise.ink, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  settingDescription: { color: arise.inkSoft, fontSize: 10, lineHeight: 15, marginTop: 3 },
  settingSubheading: { color: arise.gold, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1, marginTop: 14 },
  choiceSection: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: arise.panelEdge },
  choice: { minHeight: 38, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: arise.panelEdge, borderRadius: 6 },
  choiceSelected: { borderColor: arise.gold, backgroundColor: 'rgba(224,180,91,0.08)' },
  choiceText: { color: arise.inkSoft, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  managementButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  logoutButton: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: arise.panelEdge, marginTop: 5, paddingTop: 7 },
  confirmPanel: { padding: 16, marginTop: 15 },
  optionTitle: { color: arise.ink, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  error: { color: arise.danger, fontSize: 11, lineHeight: 18, marginTop: 14 },
  notice: { color: arise.success, fontSize: 11, lineHeight: 18, marginTop: 14 },
});