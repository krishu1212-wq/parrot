import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetStudyGuildQueryKey,
  getListStudyGuildsQueryKey,
  useGetStudyGuild,
  useLeaveStudyGuild,
  useReviewStudyGuildEvidence,
  useSubmitStudyGuildEvidence,
} from '@workspace/api-client-react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { arise } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

function friendlyError(error: unknown) {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error) return error.message;
  return 'The System could not complete that action. Try again.';
}
function dateLabel(value: string) {
  const day = value.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).toUpperCase();
}
function eventLabel(value: string) {
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function GuildDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ guildId?: string | string[] }>();
  const guildId = Number(Array.isArray(params.guildId) ? params.guildId[0] : params.guildId);
  const validId = Number.isFinite(guildId) && guildId > 0;
  const queryClient = useQueryClient();
  const detailQuery = useGetStudyGuild(validId ? guildId : 0, { query: { enabled: validId, queryKey: getGetStudyGuildQueryKey(validId ? guildId : 0) } });
  const submitMutation = useSubmitStudyGuildEvidence();
  const reviewMutation = useReviewStudyGuildEvidence();
  const leaveMutation = useLeaveStudyGuild();
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [submittedEventIds, setSubmittedEventIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const detail = detailQuery.data;
  const guild = detail?.guild;
  const mySubmissions = detail?.mySubmissions ?? [];
  const submitBusy = submitMutation.isPending;
  const pendingOwnCount = mySubmissions.length;
  const remainingSlots = Math.max(0, 3 - pendingOwnCount);
  const pendingReviews = detail?.pendingReviews ?? [];

  const refreshDetails = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetStudyGuildQueryKey(guildId) }),
      queryClient.invalidateQueries({ queryKey: getListStudyGuildsQueryKey() }),
    ]);
  };
  const toggleEvent = (id: string) => {
    setSelectedEvents((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= remainingSlots ? current : [...current, id]);
  };
  const handleSubmit = async () => {
    if (!guild || !selectedEvents.length || selectedEvents.length > remainingSlots) return;
    setNotice(null);
    let count = 0;
    const newlySent: string[] = [];
    try {
      for (const studyEventId of selectedEvents) {
        await submitMutation.mutateAsync({
          guildId,
          data: { studyEventId, ...(note.trim() ? { evidenceNote: note.trim() } : {}) },
        });
        count += 1;
        newlySent.push(studyEventId);
      }
      setSubmittedEventIds((current) => [...current, ...newlySent]);
      setSelectedEvents([]);
      setNote('');
      await refreshDetails();
      setNotice({ kind: 'success', text: `${count} saved ${count === 1 ? 'event was' : 'events were'} submitted for review.` });
    } catch (error) {
      setSubmittedEventIds((current) => [...current, ...newlySent]);
      await refreshDetails();
      setNotice({ kind: 'error', text: count ? `${count} event submitted. ${friendlyError(error)}` : friendlyError(error) });
    }
  };
  const handleReview = async (submissionId: number, decision: 'approved' | 'rejected') => {
    setNotice(null);
    try {
      await reviewMutation.mutateAsync({ guildId, submissionId, data: { decision } });
      await refreshDetails();
      setNotice({ kind: 'success', text: `Submission ${decision}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: friendlyError(error) });
    }
  };
  const handleLeave = () => {
    const confirm = async () => {
      try {
        await leaveMutation.mutateAsync({ guildId });
        await refreshDetails();
        router.replace('/guilds' as never);
      } catch (error) {
        setNotice({ kind: 'error', text: friendlyError(error) });
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Leave this Guild? Your Guild history will be retained.')) void confirm();
      return;
    }
    Alert.alert('Leave this Guild?', 'Your Guild history will be retained, but you will lose access to this circle.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave Guild', style: 'destructive', onPress: () => void confirm() },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (insets.top === 0 ? 67 : 18), paddingBottom: insets.bottom + 34 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.navRow}>
          <Pressable testID="guild-detail-back" accessibilityRole="link" onPress={() => router.replace('/guilds' as never)} style={styles.back}>
            <Feather name="arrow-left" size={16} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>ALL GUILDS</Text>
          </Pressable>
          {guild ? (
            <Pressable testID="guild-leave" accessibilityRole="button" accessibilityLabel="Leave Guild" onPress={handleLeave} disabled={leaveMutation.isPending} style={styles.leaveButton}>
              {leaveMutation.isPending ? <ActivityIndicator size="small" color={colors.destructive} /> : <Feather name="log-out" size={15} color={colors.destructive} />}
              <Text style={[styles.leaveLabel, { color: colors.destructive }]}>LEAVE</Text>
            </Pressable>
          ) : null}
        </View>

        {notice ? (
          <View testID="guild-detail-notice" accessibilityRole="alert" style={[styles.notice, { borderColor: notice.kind === 'success' ? arise.success : colors.destructive, backgroundColor: colors.card }]}>
            <Feather name={notice.kind === 'success' ? 'check-circle' : 'alert-triangle'} size={16} color={notice.kind === 'success' ? arise.success : colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice.text}</Text>
            <Pressable testID="guild-detail-dismiss-notice" accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setNotice(null)} hitSlop={10}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable>
          </View>
        ) : null}

        {!validId ? (
          <View testID="guild-detail-invalid" style={[styles.statePanel, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Guild record not found.</Text>
            <Pressable accessibilityRole="button" testID="guild-invalid-return" onPress={() => router.replace('/guilds' as never)}><Text style={[styles.retryText, { color: colors.primary }]}>RETURN TO GUILDS</Text></Pressable>
          </View>
        ) : detailQuery.isLoading ? (
          <View testID="guild-detail-loading" accessibilityRole="progressbar" style={[styles.statePanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.skeletonLarge} /><View style={styles.skeletonSmall} /><View style={styles.skeletonLarge} />
            <Text style={[styles.kicker, { color: colors.mutedForeground }]}>RETRIEVING MEMBER INTEL</Text>
          </View>
        ) : detailQuery.isError ? (
          <View testID="guild-detail-error" style={[styles.statePanel, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
            <Feather name="lock" size={21} color={colors.destructive} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Guild access unavailable</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{friendlyError(detailQuery.error)}</Text>
            <Pressable accessibilityRole="button" testID="guild-detail-retry" onPress={() => void detailQuery.refetch()} style={[styles.outlineButton, { borderColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primary }]}>RETRY</Text></Pressable>
          </View>
        ) : guild && detail ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <Text style={[styles.kicker, { color: arise.gold }]}>GUILD / MEMBER VIEW</Text>
                <Text style={[styles.roleTag, { color: guild.role === 'leader' ? arise.gold : arise.cyan }]}>{guild.role.toUpperCase()}</Text>
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>{guild.name}</Text>
              {guild.description ? <Text style={[styles.description, { color: colors.mutedForeground }]}>{guild.description}</Text> : null}
              <View style={[styles.heroMeta, { borderColor: colors.border }]}>
                <View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>SUNDAY TOURNAMENT</Text><Text style={[styles.metaValue, { color: colors.primary }]}>{dateLabel(guild.tournamentDate)}</Text></View>
                <View style={styles.metaDivider} />
                <View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CIRCLE SIZE</Text><Text style={[styles.metaValue, { color: colors.foreground }]}>{guild.memberCount} / 12</Text></View>
                <View style={styles.codeTag}><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>SHARE CODE</Text><Text selectable style={[styles.codeValue, { color: arise.gold }]}>{guild.joinCode}</Text></View>
              </View>
            </View>

            <SectionHeading eyebrow="THE CIRCLE" title="Guild members" detail="Profiles currently sharing this study circle." colors={colors} />
            <View style={[styles.listPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {detail.members.map((member, index) => (
                <View key={`${member.displayName}-${index}`} testID={`guild-member-${index}`} style={[styles.rankRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                  <View style={[styles.memberMark, { backgroundColor: member.isYou ? colors.primary : colors.secondary }]}>
                    <Text style={[styles.memberInitial, { color: member.isYou ? colors.primaryForeground : colors.secondaryForeground }]}>{member.displayName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rankCopy}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{member.displayName}{member.isYou ? '  · YOU' : ''}</Text>
                    <Text style={[styles.eventDate, { color: member.role === 'leader' ? arise.gold : colors.mutedForeground }]}>{member.role === 'leader' ? 'GUILD LEADER' : 'MEMBER'} · JOINED {dateLabel(member.joinedAt)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <SectionHeading eyebrow="THIS SUNDAY" title="Guild leaderboard" detail="Points are based on reviewed Guild submissions only." colors={colors} />
            {detail.leaderboard.length ? (
              <View style={[styles.listPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {detail.leaderboard.map((member, index) => (
                  <View key={`${member.displayName}-${index}`} testID={`guild-rank-${index + 1}`} style={[styles.rankRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                    <View style={[styles.rankNumber, { borderColor: index === 0 ? arise.gold : colors.border }]}>
                      <Text style={[styles.rankNumberText, { color: index === 0 ? arise.gold : colors.mutedForeground }]}>{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                    <View style={[styles.memberMark, { backgroundColor: member.isYou ? colors.primary : colors.secondary }]}>
                      <Text style={[styles.memberInitial, { color: member.isYou ? colors.primaryForeground : colors.secondaryForeground }]}>{member.displayName.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={styles.rankCopy}>
                      <Text style={[styles.memberName, { color: colors.foreground }]}>{member.displayName}{member.isYou ? '  · YOU' : ''}</Text>
                      {member.role === 'leader' ? <Text style={[styles.memberRole, { color: arise.gold }]}>GUILD LEADER</Text> : null}
                    </View>
                    <View style={styles.points}><Text style={[styles.pointsValue, { color: colors.primary }]}>{member.points}</Text><Text style={[styles.pointsLabel, { color: colors.mutedForeground }]}>PTS</Text></View>
                  </View>
                ))}
              </View>
            ) : <EmptyLine text="No reviewed contributions on this Sunday board yet." colors={colors} />}

            <SectionHeading eyebrow="VERIFIED STUDY HISTORY" title="Submit events" detail="Choose up to three distinct saved events for this tournament." colors={colors} />
            <View style={[styles.submitPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.submitPanelHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kicker, { color: arise.cyan }]}>AVAILABLE EVENT LOG</Text>
                  <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 5 }]}>Only server-verified saved study history appears here.</Text>
                </View>
                <Text style={[styles.slots, { color: remainingSlots ? colors.primary : colors.mutedForeground }]}>{remainingSlots} LEFT</Text>
              </View>
              {detail.eligibleEvents.length ? detail.eligibleEvents.map((event) => {
                const selected = selectedEvents.includes(event.id);
                const alreadySubmitted = submittedEventIds.includes(event.id);
                const disabled = alreadySubmitted || (remainingSlots === 0 && !selected) || (!selected && selectedEvents.length >= remainingSlots);
                return (
                  <Pressable
                    key={event.id}
                    testID={`guild-event-${event.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled }}
                    accessibilityLabel={`${eventLabel(event.eventType)}, ${dateLabel(event.eventDate)}${alreadySubmitted ? ', already submitted' : ''}`}
                    disabled={disabled || submitBusy}
                    onPress={() => toggleEvent(event.id)}
                    style={({ pressed }) => [styles.eventRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
                  >
                    <View style={[styles.checkbox, { borderColor: selected ? colors.primary : colors.mutedForeground, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                      {selected ? <Feather name="check" size={12} color={colors.primaryForeground} /> : null}
                    </View>
                    <View style={styles.eventCopy}>
                      <Text style={[styles.eventTitle, { color: colors.foreground }]}>{eventLabel(event.eventType)}</Text>
                      <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>{dateLabel(event.eventDate)} · SAVED STUDY EVENT</Text>
                    </View>
                    {alreadySubmitted ? <Text style={[styles.alreadyTag, { color: arise.success }]}>SENT</Text> : null}
                  </Pressable>
                );
              }) : (
                <View style={styles.eventsEmpty}>
                  <Feather name="archive" size={18} color={colors.mutedForeground} />
                  <Text style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>No eligible saved events are available for this tournament.</Text>
                </View>
              )}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>OPTIONAL NOTE · UP TO 500 CHARACTERS</Text>
              <TextInput
                testID="guild-evidence-note"
                accessibilityLabel="Optional submission note"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
                placeholder="Add context for your circle. A note is not proof of correctness."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.noteInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]}
              />
              <Text style={[styles.noteCaveat, { color: colors.mutedForeground }]}>Notes provide context only; they do not establish correctness.</Text>
              <Pressable
                testID="guild-submit-events"
                accessibilityRole="button"
                accessibilityState={{ disabled: !selectedEvents.length || submitBusy }}
                disabled={!selectedEvents.length || submitBusy}
                onPress={() => void handleSubmit()}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: selectedEvents.length ? colors.primary : colors.muted, opacity: pressed ? 0.75 : 1 }]}
              >
                {submitBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="send" size={14} color={selectedEvents.length ? colors.primaryForeground : colors.mutedForeground} />}
                <Text style={[styles.buttonText, { color: selectedEvents.length ? colors.primaryForeground : colors.mutedForeground }]}>{submitBusy ? 'SENDING TO REVIEW' : `SUBMIT ${selectedEvents.length || ''} ${selectedEvents.length === 1 ? 'EVENT' : 'EVENTS'}`}</Text>
              </Pressable>
            </View>

            <SectionHeading eyebrow="YOUR RECORD" title="Submission status" detail="Current tournament submissions and their review state." colors={colors} />
            {mySubmissions.length ? (
              <View style={[styles.listPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {mySubmissions.map((submission, index) => (
                  <View key={submission.id} testID={`guild-submission-${submission.id}`} style={[styles.submissionRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                    <View style={styles.submissionCopy}>
                      <Text style={[styles.eventTitle, { color: colors.foreground }]}>{eventLabel(submission.eventType)}</Text>
                      {submission.evidenceNote ? <Text style={[styles.submissionNote, { color: colors.mutedForeground }]} numberOfLines={2}>{submission.evidenceNote}</Text> : null}
                      <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>{dateLabel(submission.submittedAt)}</Text>
                    </View>
                    <StatusBadge status={submission.status} />
                  </View>
                ))}
              </View>
            ) : <EmptyLine text="No events submitted for this tournament." colors={colors} />}

            {guild.role === 'leader' ? (
              <>
                <SectionHeading eyebrow="LEADER REVIEW" title="Pending submissions" detail="Review another member's contribution for this Sunday." colors={colors} />
                {pendingReviews.length ? (
                  <View style={styles.reviewStack}>
                    {pendingReviews.map((submission) => (
                      <View key={submission.submissionId} testID={`guild-review-${submission.submissionId}`} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.reviewTop}>
                          <View style={styles.reviewIdentity}>
                            <View style={[styles.memberMark, { backgroundColor: colors.secondary }]}><Text style={[styles.memberInitial, { color: colors.secondaryForeground }]}>{submission.displayName.slice(0, 1).toUpperCase()}</Text></View>
                            <View><Text style={[styles.memberName, { color: colors.foreground }]}>{submission.displayName}</Text><Text style={[styles.eventDate, { color: colors.mutedForeground }]}>{dateLabel(submission.submittedAt)}</Text></View>
                          </View>
                          <Text style={[styles.pendingTag, { color: arise.gold }]}>PENDING</Text>
                        </View>
                        <Text style={[styles.reviewEvent, { color: colors.primary }]}>{eventLabel(submission.eventType)}</Text>
                        {submission.evidenceNote ? <Text style={[styles.reviewNote, { color: colors.mutedForeground }]}>{submission.evidenceNote}</Text> : null}
                        <Text style={[styles.noteCaveat, { color: colors.mutedForeground }]}>The note is context only, not evidence of correctness.</Text>
                        <View style={styles.reviewActions}>
                          <Pressable testID={`guild-review-reject-${submission.submissionId}`} accessibilityRole="button" accessibilityLabel={`Reject submission from ${submission.displayName}`} disabled={reviewMutation.isPending} onPress={() => void handleReview(submission.submissionId, 'rejected')} style={[styles.reviewButton, { borderColor: colors.destructive }]}>
                            <Feather name="x" size={14} color={colors.destructive} /><Text style={[styles.reviewButtonText, { color: colors.destructive }]}>REJECT</Text>
                          </Pressable>
                          <Pressable testID={`guild-review-approve-${submission.submissionId}`} accessibilityRole="button" accessibilityLabel={`Approve submission from ${submission.displayName}`} disabled={reviewMutation.isPending} onPress={() => void handleReview(submission.submissionId, 'approved')} style={[styles.reviewButton, styles.approveButton, { backgroundColor: arise.success, borderColor: arise.success }]}>
                            {reviewMutation.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={14} color={colors.primaryForeground} />}<Text style={[styles.reviewButtonText, { color: colors.primaryForeground }]}>APPROVE</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : <EmptyLine text="The review queue is clear." colors={colors} />}
              </>
            ) : null}

            {detail.achievements.length ? (
              <>
                <SectionHeading eyebrow="GUILD MILESTONES" title="Achievements" detail="Shared recognition earned by this circle." colors={colors} />
                <View style={[styles.achievementPanel, { borderColor: arise.gold, backgroundColor: colors.card }]}>
                  {detail.achievements.map((achievement, index) => (
                    <View key={`${achievement.kind}-${achievement.tournamentDate}-${index}`} style={styles.achievementRow}>
                      <Feather name="award" size={18} color={arise.gold} />
                      <View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.foreground }]}>{achievement.title}</Text><Text style={[styles.eventDate, { color: colors.mutedForeground }]}>{dateLabel(achievement.tournamentDate)} SUNDAY</Text></View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            <Pressable testID="guild-leave-secondary" accessibilityRole="button" onPress={handleLeave} style={[styles.leaveWide, { borderColor: colors.destructive }]}>
              <Feather name="log-out" size={14} color={colors.destructive} />
              <Text style={[styles.leaveWideText, { color: colors.destructive }]}>LEAVE THIS GUILD</Text>
            </Pressable>
          </>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function SectionHeading({ eyebrow, title, detail, colors }: { eyebrow: string; title: string; detail?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.kicker, { color: arise.silver }]}>{eyebrow}</Text>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {detail ? <Text style={[styles.sectionDetail, { color: colors.mutedForeground }]}>{detail}</Text> : null}
    </View>
  );
}

function EmptyLine({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.emptyLine, { borderColor: colors.border }]}><Feather name="minus" size={15} color={colors.mutedForeground} /><Text style={[styles.body, { color: colors.mutedForeground, flex: 1 }]}>{text}</Text></View>;
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const colors = useColors();
  const tint = status === 'approved' ? arise.success : status === 'rejected' ? colors.destructive : arise.gold;
  return <View style={[styles.statusBadge, { borderColor: tint }]}><View style={[styles.statusDot, { backgroundColor: tint }]} /><Text style={[styles.statusText, { color: tint }]}>{status.toUpperCase()}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, maxWidth: 680, width: '100%', alignSelf: 'center' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  leaveButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 5 },
  leaveLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  notice: { minHeight: 48, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  statePanel: { minHeight: 190, borderWidth: 1, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 12, lineHeight: 18 },
  retryText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, padding: 10 },
  outlineButton: { minHeight: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  skeletonLarge: { height: 15, width: '86%', backgroundColor: arise.panelEdge },
  skeletonSmall: { height: 11, width: '54%', backgroundColor: arise.panelEdge },
  hero: { marginBottom: 28, paddingTop: 8 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.45 },
  roleTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 41 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 15, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12, marginTop: 18, flexWrap: 'wrap' },
  metaLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  metaValue: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  metaDivider: { width: 1, height: 26, backgroundColor: arise.rail },
  codeTag: { marginLeft: 'auto' },
  codeValue: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  sectionHeading: { marginBottom: 11, marginTop: 23 },
  sectionTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.45, marginTop: 3 },
  sectionDetail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  listPanel: { borderWidth: 1, paddingHorizontal: 13, marginBottom: 5 },
  rankRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rankNumber: { width: 30, height: 31, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rankNumberText: { fontSize: 9, fontWeight: '900' },
  memberMark: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  memberInitial: { fontSize: 13, fontWeight: '900' },
  rankCopy: { flex: 1 },
  memberName: { fontSize: 12, fontWeight: '800' },
  memberRole: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 3 },
  points: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  pointsValue: { fontSize: 17, fontWeight: '900' },
  pointsLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  emptyLine: { minHeight: 52, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  submitPanel: { borderWidth: 1, padding: 13 },
  submitPanelHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  slots: { fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginLeft: 10 },
  eventRow: { minHeight: 60, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 21, height: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1 },
  eventTitle: { fontSize: 12, fontWeight: '800' },
  eventDate: { fontSize: 8, fontWeight: '700', letterSpacing: 0.55, marginTop: 4 },
  alreadyTag: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  eventsEmpty: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15 },
  fieldLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.9, marginTop: 9, marginBottom: 6 },
  noteInput: { borderWidth: 1, minHeight: 75, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, lineHeight: 17, textAlignVertical: 'top' },
  noteCaveat: { fontSize: 9, lineHeight: 14, marginTop: 6 },
  primaryButton: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  submissionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingVertical: 10 },
  submissionCopy: { flex: 1 },
  submissionNote: { fontSize: 10, lineHeight: 14, marginTop: 4 },
  statusBadge: { minHeight: 25, borderWidth: 1, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  reviewStack: { gap: 9 },
  reviewCard: { borderWidth: 1, padding: 13 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pendingTag: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  reviewEvent: { fontSize: 13, fontWeight: '900', marginTop: 13 },
  reviewNote: { fontSize: 11, lineHeight: 17, marginTop: 5 },
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  reviewButton: { flex: 1, minHeight: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  approveButton: {},
  reviewButtonText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  achievementPanel: { borderWidth: 1, paddingHorizontal: 12, marginBottom: 6 },
  achievementRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11 },
  leaveWide: { minHeight: 46, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28 },
  leaveWideText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
});