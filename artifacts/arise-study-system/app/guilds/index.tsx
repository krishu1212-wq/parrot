import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  getGetStudyGuildQueryKey,
  getListStudyGuildsQueryKey,
  useCreateStudyGuild,
  useJoinStudyGuild,
  useListStudyGuilds,
} from '@workspace/api-client-react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arise } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

function friendlyError(error: unknown) {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error) return error.message;
  return 'The System could not complete that action. Try again.';
}

function dateLabel(value: string) {
  const day = value.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).toUpperCase();
}

export default function GuildsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const guildQuery = useListStudyGuilds();
  const createGuild = useCreateStudyGuild();
  const joinGuild = useJoinStudyGuild();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const busy = createGuild.isPending || joinGuild.isPending;
  const guilds = guildQuery.data?.guilds ?? [];

  const refreshGuildCaches = (guildId: number) => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListStudyGuildsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetStudyGuildQueryKey(guildId) }),
  ]);

  const handleCreate = async () => {
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setNotice({ kind: 'error', text: 'Guild names need at least 3 characters.' });
      return;
    }
    setNotice(null);
    try {
      const guild = await createGuild.mutateAsync({
        data: { name: cleanName, ...(description.trim() ? { description: description.trim() } : {}) },
      });
      await refreshGuildCaches(guild.id);
      setName('');
      setDescription('');
      setNotice({ kind: 'success', text: `${guild.name} is live. You are its leader.` });
      router.push(`/guilds/${guild.id}` as never);
    } catch (error) {
      setNotice({ kind: 'error', text: friendlyError(error) });
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setNotice({ kind: 'error', text: 'Enter a Guild share code to continue.' });
      return;
    }
    setNotice(null);
    try {
      const guild = await joinGuild.mutateAsync({ data: { joinCode: code } });
      await refreshGuildCaches(guild.id);
      setJoinCode('');
      setNotice({ kind: 'success', text: `Joined ${guild.name}. Your circle is ready.` });
      router.push(`/guilds/${guild.id}` as never);
    } catch (error) {
      setNotice({ kind: 'error', text: friendlyError(error) });
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (insets.top === 0 ? 67 : 18), paddingBottom: insets.bottom + 34 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={28}
      >
        <Pressable testID="guilds-back-home" accessibilityRole="link" onPress={() => router.replace('/(tabs)' as never)} style={styles.back}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>SYSTEM HOME</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={[styles.kicker, { color: arise.gold }]}>ARISE / SOCIAL PROTOCOL</Text>
            <View style={[styles.liveMark, { borderColor: arise.cyan }]}>
              <View style={[styles.liveDot, { backgroundColor: arise.cyan }]} />
              <Text style={[styles.liveText, { color: arise.cyan }]}>SUNDAY CIRCUIT</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Guilds</Text>
          <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
            Small study circles. Verified saved sessions. One shared Sunday board.
          </Text>
          <View style={[styles.heroRule, { backgroundColor: colors.border }]}><View style={[styles.heroRuleAccent, { backgroundColor: arise.cyan }]} /></View>
        </View>

        {notice ? (
          <View testID="guilds-notice" accessibilityRole="alert" style={[styles.notice, {
            borderColor: notice.kind === 'success' ? arise.success : colors.destructive,
            backgroundColor: colors.card,
          }]}>
            <Feather name={notice.kind === 'success' ? 'check-circle' : 'alert-triangle'} size={16} color={notice.kind === 'success' ? arise.success : colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice.text}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" testID="guilds-dismiss-notice" onPress={() => setNotice(null)} hitSlop={10}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sectionHead, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.kicker, { color: arise.silver }]}>YOUR CURRENT CIRCLE</Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Guilds</Text>
          </View>
          <Text style={[styles.count, { color: colors.primary }]}>{guilds.length.toString().padStart(2, '0')}</Text>
        </View>

        {guildQuery.isLoading ? (
          <View testID="guilds-loading" accessibilityRole="progressbar" style={[styles.statePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: '58%' }]} />
            <View style={[styles.skeletonLine, { width: '78%', height: 42 }]} />
            <Text style={[styles.stateLabel, { color: colors.mutedForeground }]}>SYNCING GUILD RECORDS</Text>
          </View>
        ) : guildQuery.isError ? (
          <View testID="guilds-error" style={[styles.statePanel, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Feather name="wifi-off" size={21} color={colors.destructive} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Guild records unavailable</Text>
            <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>{friendlyError(guildQuery.error)}</Text>
            <Pressable testID="guilds-retry" accessibilityRole="button" onPress={() => void guildQuery.refetch()} style={[styles.secondaryButton, { borderColor: colors.primary }]}>
              <Text style={[styles.buttonText, { color: colors.primary }]}>RETRY SYNC</Text>
            </Pressable>
          </View>
        ) : guilds.length === 0 ? (
          <View testID="guilds-empty" style={[styles.emptyPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptySigil, { borderColor: arise.gold }]}>
              <Feather name="users" size={21} color={arise.gold} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>No circle claimed yet.</Text>
            <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>Create a Guild or enter an invite code from someone you study with.</Text>
            <Text style={[styles.emptyFoot, { color: arise.gold }]}>A SHARED BOARD OPENS EVERY SUNDAY</Text>
          </View>
        ) : (
          <View style={styles.guildStack}>
            {guilds.map((guild, index) => (
              <Pressable
                key={guild.id}
                testID={`guild-card-${guild.id}`}
                accessibilityRole="link"
                accessibilityLabel={`Open ${guild.name}, ${guild.memberCount} members`}
                onPress={() => router.push(`/guilds/${guild.id}` as never)}
                style={({ pressed }) => [styles.guildCard, {
                  backgroundColor: colors.card,
                  borderColor: pressed ? colors.primary : colors.border,
                  opacity: pressed ? 0.86 : 1,
                }]}
              >
                <View style={styles.guildCardTop}>
                  <View style={[styles.guildIndex, { borderColor: index === 0 ? arise.gold : colors.border }]}>
                    <Text style={[styles.guildIndexText, { color: index === 0 ? arise.gold : colors.mutedForeground }]}>{String(index + 1).padStart(2, '0')}</Text>
                  </View>
                  <View style={styles.guildCardCopy}>
                    <Text style={[styles.guildName, { color: colors.foreground }]} numberOfLines={1}>{guild.name}</Text>
                    <Text style={[styles.guildDescription, { color: colors.mutedForeground }]} numberOfLines={2}>{guild.description || 'A focused circle in the ARISE System.'}</Text>
                  </View>
                  <Feather name="arrow-up-right" size={17} color={colors.primary} />
                </View>
                <View style={[styles.guildMeta, { borderTopColor: colors.border }]}>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}><Text style={{ color: colors.primary }}>{guild.memberCount}</Text> / 12 MEMBERS</Text>
                  <Text style={[styles.roleTag, { color: guild.role === 'leader' ? arise.gold : colors.primary }]}>{guild.role.toUpperCase()}</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>SUNDAY {dateLabel(guild.tournamentDate)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.actionPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelHeading}>
            <View style={[styles.panelIcon, { borderColor: arise.gold }]}>
              <Feather name="plus" size={16} color={arise.gold} />
            </View>
            <View style={styles.panelHeadingCopy}>
              <Text style={[styles.kicker, { color: arise.gold }]}>FOUND A NEW CIRCLE</Text>
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>Create a Guild</Text>
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GUILD NAME</Text>
          <TextInput
            testID="guild-create-name"
            accessibilityLabel="Guild name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. The Night Shift"
            placeholderTextColor={colors.mutedForeground}
            maxLength={36}
            returnKeyType="next"
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DESCRIPTION · OPTIONAL</Text>
          <TextInput
            testID="guild-create-description"
            accessibilityLabel="Guild description, optional"
            value={description}
            onChangeText={setDescription}
            placeholder="What are you working toward together?"
            placeholderTextColor={colors.mutedForeground}
            maxLength={160}
            multiline
            style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]}
          />
          <Pressable
            testID="guild-create-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || name.trim().length < 3 }}
            disabled={busy || name.trim().length < 3}
            onPress={() => void handleCreate()}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: busy || name.trim().length < 3 ? 0.45 : pressed ? 0.78 : 1 }]}
          >
            {createGuild.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="shield" size={15} color={colors.primaryForeground} />}
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{createGuild.isPending ? 'FORMING CIRCLE' : 'CREATE GUILD'}</Text>
          </Pressable>
        </View>

        <View style={[styles.joinPanel, { borderColor: colors.border }]}>
          <View style={styles.panelHeading}>
            <View style={[styles.panelIcon, { borderColor: arise.cyan }]}>
              <Feather name="log-in" size={15} color={arise.cyan} />
            </View>
            <View style={styles.panelHeadingCopy}>
              <Text style={[styles.kicker, { color: arise.cyan }]}>HAVE AN INVITE</Text>
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>Join a Guild</Text>
            </View>
          </View>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Ask a Guild member for their share code.</Text>
          <View style={styles.joinRow}>
            <TextInput
              testID="guild-join-code"
              accessibilityLabel="Guild share code"
              value={joinCode}
              onChangeText={(value) => setJoinCode(value.toUpperCase())}
              placeholder="ARISE-XXXXXXXXXX"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              maxLength={16}
              returnKeyType="go"
              onSubmitEditing={() => void handleJoin()}
              style={[styles.input, styles.codeInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
            />
            <Pressable
              testID="guild-join-submit"
              accessibilityRole="button"
              accessibilityLabel="Join Guild"
              disabled={busy || !joinCode.trim()}
              onPress={() => void handleJoin()}
              style={({ pressed }) => [styles.joinButton, { backgroundColor: joinCode.trim() ? arise.cyan : colors.muted, opacity: pressed ? 0.74 : 1 }]}
            >
              {joinGuild.isPending ? <ActivityIndicator size="small" color={arise.onCyan} /> : <Feather name="arrow-right" size={18} color={joinCode.trim() ? arise.onCyan : colors.mutedForeground} />}
            </Pressable>
          </View>
        </View>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>Guild standings use only server-verified saved study events. They never change personal XP or progress.</Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, maxWidth: 680, width: '100%', alignSelf: 'center' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 12 },
  backText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.35 },
  hero: { marginBottom: 28, paddingTop: 10 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.55 },
  liveMark: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 42, fontWeight: '800', letterSpacing: -1.5, lineHeight: 48 },
  heroBody: { fontSize: 14, lineHeight: 21, maxWidth: 340, marginTop: 7 },
  heroRule: { height: 1, marginTop: 22 },
  heroRuleAccent: { height: 2, width: 64, marginTop: -1 },
  notice: { minHeight: 48, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 20 },
  noticeText: { fontSize: 12, lineHeight: 17, flex: 1 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 11, borderBottomWidth: 1, marginBottom: 14 },
  sectionTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 3 },
  count: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  statePanel: { borderWidth: 1, minHeight: 144, padding: 18, marginBottom: 26, justifyContent: 'center', gap: 10 },
  skeletonLine: { height: 11, width: '88%', backgroundColor: arise.panelEdge },
  stateLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 3 },
  stateTitle: { fontSize: 17, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  stateBody: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 290 },
  secondaryButton: { borderWidth: 1, minHeight: 42, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  emptyPanel: { borderWidth: 1, minHeight: 202, padding: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  emptySigil: { width: 50, height: 50, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12, transform: [{ rotate: '45deg' }] },
  emptyFoot: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 18 },
  guildStack: { gap: 10, marginBottom: 26 },
  guildCard: { borderWidth: 1, padding: 14 },
  guildCardTop: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  guildIndex: { width: 33, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  guildIndexText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  guildCardCopy: { flex: 1 },
  guildName: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  guildDescription: { fontSize: 11, lineHeight: 16 },
  guildMeta: { marginTop: 13, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  metaText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  roleTag: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  actionPanel: { borderWidth: 1, padding: 16, marginBottom: 14 },
  joinPanel: { borderWidth: 1, padding: 16, marginBottom: 16, backgroundColor: arise.panel },
  panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  panelIcon: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panelHeadingCopy: { gap: 4 },
  panelTitle: { fontSize: 17, fontWeight: '800' },
  fieldLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6 },
  fieldHint: { fontSize: 11, marginTop: -9, marginBottom: 12 },
  input: { borderWidth: 1, minHeight: 46, paddingHorizontal: 12, fontSize: 13, marginBottom: 13 },
  multiline: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 1 },
  joinRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  codeInput: { flex: 1, marginBottom: 0, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  joinButton: { width: 50, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  footerNote: { fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6, marginBottom: 15 },
});