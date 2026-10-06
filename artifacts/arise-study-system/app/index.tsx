import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arise } from '@/constants/colors';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { ParticleField, SystemEmblem } from '@/components/AriseArt';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { useProfileSession } from '@/contexts/ProfileContext';
import { createCleanAccountStudyState } from '@/contexts/StudyContext';

type EntryMode = 'select' | 'restore' | 'found';

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const item = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const status = item.status ?? item.statusCode ?? item.response?.status;
  return typeof status === 'number' ? status : null;
}

export default function LaunchRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAriseAccount();
  const session = useProfileSession();
  const deviceReducedMotion = useReducedMotion();
  const reducedMotion = deviceReducedMotion || session.profile?.settings.motion === 'reduced';
  const [mode, setMode] = useState<EntryMode>('select');
  const [displayName, setDisplayName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [candidateToken, setCandidateToken] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const recoveryKeyInput = useRef<TextInput>(null);

  useEffect(() => {
    if (session.profile && account.isBootstrapped && !session.recoveryKeyToShow) {
      router.replace('/(tabs)');
    }
  }, [account.isBootstrapped, router, session.profile, session.recoveryKeyToShow]);

  const createGuest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await session.createGuest(
        displayName.trim() || 'ARISE Player',
        createCleanAccountStudyState(),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A new profile could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCandidateToken('');
    try {
      const result = await session.prepareRestore(accountCode, recoveryKey);
      setCandidateToken(result.candidateToken);
      setVerifiedCode(result.accountCode);
      setMode('found');
    } catch (cause) {
      setError(statusCode(cause) === 400 || (cause instanceof Error && /400|invalid/i.test(cause.message))
        ? 'INVALID ACCOUNT CODE'
        : cause instanceof Error
          ? cause.message
          : 'The profile could not be verified right now.');
    } finally {
      setBusy(false);
    }
  };

  const restoreProfile = async () => {
    if (busy || !candidateToken) return;
    setBusy(true);
    setError(null);
    try {
      await session.confirmRestore(candidateToken);
      setCandidateToken('');
      setRecoveryKey('');
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Restore confirmation expired. Verify the code and key again.');
      setMode('restore');
      setCandidateToken('');
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (label: string, value: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        await Share.share({ title: label, message: value });
      }
      setCopyStatus(`${label} ready to save.`);
    } catch {
      setCopyStatus(`Select and copy the ${label.toLowerCase()} shown above.`);
    }
  };

  const finishRecoveryBackup = () => {
    session.clearRecoveryKey();
    setCopyStatus(null);
  };

  if (session.profile && session.recoveryKeyToShow) {
    return (
      <View style={s.root}>
        <WorldArtwork scene="vault" opacity={0.45} />
        <ParticleField reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
        <ScrollView
          contentContainerStyle={[
            s.content,
            {
              paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 22) + 22,
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 22) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SystemEmblem size={66} color={arise.gold} />
          <Text style={[s.eyebrow, { color: arise.gold, marginTop: 20 }]}>NEW PROFILE CREATED</Text>
          <Text accessibilityRole="header" style={s.title}>Save your recovery details</Text>
          <Text style={s.subtitle}>
            Keep both values somewhere safe. Restoring on another device requires the Account Code and the separate recovery key.
          </Text>
          <HudFrame accent={arise.cyan} style={s.panel}>
            <Text style={s.label}>ACCOUNT CODE</Text>
            <Text selectable style={s.codeValue}>{session.profile.accountCode}</Text>
            <ActionButton
              label="COPY ACCOUNT CODE"
              icon="copy"
              onPress={() => void copyValue('Account Code', session.profile!.accountCode)}
              disabled={busy}
            />
            <Text style={[s.label, { marginTop: 24, color: arise.gold }]}>ONE-TIME RECOVERY KEY</Text>
            <Text selectable style={s.keyValue}>{session.recoveryKeyToShow}</Text>
            <ActionButton
              label="COPY RECOVERY KEY"
              icon="key"
              onPress={() => void copyValue('Recovery key', session.recoveryKeyToShow!)}
              secondary
            />
            {copyStatus ? <Text style={s.copyStatus}>{copyStatus}</Text> : null}
          </HudFrame>
          {session.sessionError ? <Text accessibilityRole="alert" style={s.error}>{session.sessionError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={finishRecoveryBackup}
            style={s.primaryButton}
          >
            <Text style={s.primaryButtonText}>I SAVED BOTH VALUES · CONTINUE</Text>
          </Pressable>
          <Text style={s.warning}>
            The recovery key is shown only now. ARISE cannot retrieve it later. Your cloud profile and progress are already saved.
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <WorldArtwork scene="core" opacity={0.42} />
      <ParticleField reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.content,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 20) + 18,
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 20) + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={72}
      >
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(350)} style={s.hero}>
            <SystemEmblem size={76} />
            <Text style={s.eyebrow}>ARISE · PROFILE SYSTEM</Text>
            <Text accessibilityRole="header" style={s.title}>ARISE SYSTEM</Text>
            <Text style={s.subtitle}>SELECT YOUR PROFILE</Text>
          </Animated.View>

          {mode === 'select' ? (
            <View style={s.options}>
              <HudFrame accent={arise.cyan} style={s.optionFrame}>
                <Text style={s.optionTitle}>NEW GUEST</Text>
                <Text style={s.optionDescription}>Create a new ARISE profile with fresh progress.</Text>
                <TextInput
                  accessibilityLabel="Player name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Player name (optional)"
                  placeholderTextColor={arise.silver}
                  maxLength={48}
                  style={s.input}
                  returnKeyType="go"
                  onSubmitEditing={() => void createGuest()}
                />
                <ActionButton
                  label={busy ? 'CREATING PROFILE…' : 'NEW GUEST'}
                  icon="plus"
                  onPress={() => void createGuest()}
                  disabled={busy}
                />
              </HudFrame>
              <HudFrame accent={arise.violet} style={s.optionFrame}>
                <Text style={s.optionTitle}>ENTER ACCOUNT CODE</Text>
                <Text style={s.optionDescription}>Restore an existing ARISE profile.</Text>
                <ActionButton
                  label="ENTER ACCOUNT CODE"
                  icon="key"
                  onPress={() => {
                    setError(null);
                    setMode('restore');
                  }}
                  secondary
                />
              </HudFrame>
              <Text style={s.privacyNote}>
                Existing Google sessions and old local profiles are not opened automatically.
              </Text>
            </View>
          ) : mode === 'restore' ? (
            <HudFrame accent={arise.violet} style={s.formPanel}>
              <Pressable accessibilityRole="button" onPress={() => { setMode('select'); setError(null); }}>
                <Text style={s.back}>‹  BACK TO PROFILE SELECTION</Text>
              </Pressable>
              <Text style={s.optionTitle}>ENTER ACCOUNT CODE</Text>
              <Text style={s.optionDescription}>Enter both values from your saved ARISE recovery details.</Text>
              <Text style={s.label}>ACCOUNT CODE</Text>
              <TextInput
                accessibilityLabel="Account Code"
                value={accountCode}
                onChangeText={setAccountCode}
                placeholder="ARISE-XXXX-XXXX"
                placeholderTextColor={arise.silver}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={24}
                style={s.input}
                returnKeyType="next"
                onSubmitEditing={() => recoveryKeyInput.current?.focus()}
              />
              <Text style={[s.label, { marginTop: 14, color: arise.gold }]}>RECOVERY KEY</Text>
              <View style={s.keyInputRow}>
                <TextInput
                  ref={recoveryKeyInput}
                  accessibilityLabel="Recovery key"
                  value={recoveryKey}
                  onChangeText={setRecoveryKey}
                  placeholder="Enter your recovery key"
                  placeholderTextColor={arise.silver}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showRecoveryKey}
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  returnKeyType="go"
                  onSubmitEditing={() => void verifyCode()}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showRecoveryKey ? 'Hide recovery key' : 'Show recovery key'}
                  onPress={() => setShowRecoveryKey((value) => !value)}
                  style={s.visibilityButton}
                >
                  <Feather name={showRecoveryKey ? 'eye-off' : 'eye'} size={18} color={arise.silver} />
                </Pressable>
              </View>
              <ActionButton
                label={busy ? 'VERIFYING…' : 'VERIFY ACCOUNT'}
                icon="search"
                onPress={() => void verifyCode()}
                disabled={busy || accountCode.trim().length < 8 || recoveryKey.length < 32}
              />
              {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
            </HudFrame>
          ) : (
            <HudFrame accent={arise.success} style={s.formPanel}>
              <View style={s.foundMark}><Feather name="check-circle" size={30} color={arise.success} /></View>
              <Text style={[s.optionTitle, { textAlign: 'center', color: arise.success }]}>ACCOUNT FOUND</Text>
              <Text style={s.optionDescription}>
                Verified profile {verifiedCode}. Confirm to load its saved progress and settings.
              </Text>
              <ActionButton
                label={busy ? 'RESTORING PROFILE…' : 'RESTORE PROGRESS'}
                icon="refresh-cw"
                onPress={() => void restoreProfile()}
                disabled={busy || !candidateToken}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode('restore');
                  setCandidateToken('');
                  setError(null);
                }}
                style={s.cancelButton}
              >
                <Text style={s.cancelText}>CANCEL</Text>
              </Pressable>
              {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
            </HudFrame>
          )}
          {busy ? <ActivityIndicator color={arise.cyan} style={{ marginTop: 18 }} /> : null}
          {session.sessionError && !session.recoveryKeyToShow ? (
            <Text accessibilityRole="alert" style={s.error}>{session.sessionError}</Text>
          ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.actionButton,
        secondary && s.actionButtonSecondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Feather name={icon} size={16} color={secondary ? arise.silver : arise.abyss} />
      <Text style={[s.actionText, secondary && { color: arise.silver }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: arise.abyss },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  hero: { alignItems: 'center', width: '100%', maxWidth: 600 },
  eyebrow: {
    color: arise.cyan,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2.3,
    marginTop: 18,
  },
  title: {
    color: arise.ink,
    fontSize: 34,
    lineHeight: 42,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    color: arise.silver,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: 9,
  },
  options: { width: '100%', maxWidth: 530, marginTop: 28, gap: 14 },
  optionFrame: { padding: 19, gap: 5 },
  formPanel: { width: '100%', maxWidth: 530, padding: 20, marginTop: 28 },
  panel: { width: '100%', maxWidth: 530, padding: 20, marginTop: 24 },
  optionTitle: {
    color: arise.ink,
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  optionDescription: { color: arise.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 9 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: arise.panelEdge,
    backgroundColor: 'rgba(4,9,18,0.8)',
    borderRadius: 8,
    color: arise.ink,
    paddingHorizontal: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 8,
  },
  label: { color: arise.cyan, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginTop: 13 },
  actionButton: {
    minHeight: 48,
    marginTop: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 8,
    backgroundColor: arise.cyan,
    borderWidth: 1,
    borderColor: `${arise.cyan}aa`,
  },
  actionButtonSecondary: {
    backgroundColor: 'rgba(7,11,20,0.86)',
    borderColor: arise.violet,
  },
  actionText: { color: arise.abyss, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  primaryButton: {
    width: '100%',
    maxWidth: 530,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 17,
    borderRadius: 9,
    backgroundColor: arise.gold,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: arise.abyss, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.65, textAlign: 'center' },
  warning: { maxWidth: 530, marginTop: 13, color: arise.inkSoft, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  privacyNote: { color: arise.inkSoft, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4, paddingHorizontal: 12 },
  codeValue: { color: arise.ink, fontSize: 23, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 8 },
  keyValue: {
    color: arise.gold,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 8,
    letterSpacing: 0.4,
  },
  copyStatus: { color: arise.success, fontSize: 12, marginTop: 10 },
  back: { color: arise.silver, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, paddingVertical: 8, marginBottom: 14 },
  keyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  visibilityButton: { minWidth: 46, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: arise.panelEdge, borderRadius: 8 },
  foundMark: { alignItems: 'center', marginBottom: 12 },
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 },
  cancelText: { color: arise.inkSoft, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  error: { color: arise.danger, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 },
});