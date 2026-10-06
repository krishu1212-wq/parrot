import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAriseAccount,
  type AccountConflictResolution,
} from '@/contexts/AriseAccountContext';
import { useColors } from '@/hooks/useColors';

const xpSummary = (totalXp: number) => `${Math.max(0, Math.floor(totalXp)).toLocaleString()} XP`;

export default function AccountRoute() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const account = useAriseAccount();
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const runAction = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The account action could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  const resolve = (resolution: AccountConflictResolution) => {
    void runAction(() => account.resolveConflict(resolution));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingTop: Math.max(insets.top, 25) + 12,
        paddingBottom: Math.max(insets.bottom, 25) + 24,
      }}
    >
      <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center' }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: '700' }}>‹  BACK</Text>
        </Pressable>
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 3, marginTop: 18 }}>ARISE · PROFILE STORAGE</Text>
        <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: '900', marginTop: 10 }}>Progress & sync</Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22, marginTop: 8 }}>
          Your study vault is owned by the active ARISE profile. Cloud progress is never replaced without a verified profile session and a matching revision.
        </Text>

        <View style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 22 }}>
          <Text style={{ color: colors.foreground, fontWeight: '800' }}>
            {account.isSignedIn ? 'PROFILE ACTIVE' : 'NO ACTIVE PROFILE'}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 6 }}>
            Sync status: {account.syncStatus.toUpperCase()}
          </Text>
          {account.syncError ? (
            <Text accessibilityRole="alert" style={{ color: colors.destructive, lineHeight: 20, marginTop: 10 }}>{account.syncError}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            <ActionButton label="RETRY SYNC" disabled={working || !account.isSignedIn} onPress={() => void runAction(account.retrySync)} colors={colors} />
            <ActionButton label="ARISE PROFILE" disabled={working} onPress={() => router.push('/profile')} colors={colors} secondary />
          </View>
        </View>

        {account.conflict ? (
          <View style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.card, marginTop: 14 }}>
            <Text style={{ color: colors.accent, fontWeight: '900', letterSpacing: 0.6 }}>CHOOSE HOW TO RESOLVE</Text>
            <Text style={{ color: colors.mutedForeground, lineHeight: 20, marginTop: 7 }}>
              Both versions are preserved in a local recovery backup. Cloud is never replaced by an older device copy; a merge is offered only when a verified common baseline makes it safe.
            </Text>
            <ProgressComparison
              title="THIS DEVICE"
              state={account.conflict.localState}
              color={colors.foreground}
              muted={colors.mutedForeground}
            />
            <ProgressComparison
              title="CLOUD ACCOUNT"
              state={account.conflict.cloudState}
              color={colors.foreground}
              muted={colors.mutedForeground}
            />
            <View style={{ gap: 9, marginTop: 15 }}>
              <ActionButton label="KEEP CLOUD VERSION" disabled={working} onPress={() => resolve('keep-cloud')} colors={colors} />
              {account.conflict.kind === 'revision'
                && account.conflict.baseRevision !== null
                && account.conflict.baseRevision < account.conflict.serverRevision
                && account.conflict.baseState
                && account.conflict.cloudState ? (
                <ActionButton label="MERGE NON-CONFLICTING CHANGES" disabled={working} onPress={() => resolve('merge')} colors={colors} secondary />
              ) : (
                <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>
                  Automatic merge is disabled because these versions do not share a verified cloud base.
                </Text>
              )}
            </View>
          </View>
        ) : null}

        {actionError ? (
          <Text accessibilityRole="alert" style={{ color: colors.destructive, lineHeight: 21, marginTop: 15 }}>{actionError}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  colors,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: ReturnType<typeof useColors>;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: secondary ? colors.secondary : colors.primary,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: secondary ? colors.secondaryForeground : colors.primaryForeground, fontSize: 11, fontWeight: '900', letterSpacing: 0.45 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProgressComparison({
  title,
  state,
  color,
  muted,
}: {
  title: string;
  state: { totalXp: number; streak: number } | null;
  color: string;
  muted: string;
}) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(4,10,21,0.55)', marginTop: 11 }}>
      <Text style={{ color: muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{title}</Text>
      <Text style={{ color, fontSize: 16, fontWeight: '800', marginTop: 5 }}>
        {state ? xpSummary(state.totalXp) : 'No saved progress yet'}
      </Text>
      {state ? <Text style={{ color: muted, fontSize: 12, marginTop: 3 }}>Current streak · {state.streak} days</Text> : null}
    </View>
  );
}