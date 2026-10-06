import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StudyProvider } from '@/contexts/StudyContext';
import {
  AccountStudySyncBridge,
  AriseAccountProvider,
  useAriseAccount,
} from '@/contexts/AriseAccountContext';
import { ProfileSessionProvider, useProfileSession } from '@/contexts/ProfileContext';
import { MissionProvider } from '@/contexts/MissionContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, usePathname, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { RpgFeedback } from '@/components/rpg/RpgFeedback';
import { SystemExperienceProvider } from '@/contexts/SystemExperienceContext';
import { SystemSoundBridge } from '@/components/system/SystemSoundBridge';
import { SystemActivationHost } from '@/components/system/SystemActivation';

// Hold the native splash until RootLayout has mounted its system-font loading surface.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiDomain) setBaseUrl(`https://${apiDomain}`);

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="account" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="gates" />
      <Stack.Screen name="inventory" />
      <Stack.Screen name="loadout" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

function AccountStartingScreen() {
  const colors = useColors();
  const account = useAriseAccount();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.background }}>
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>ARISE SYSTEM</Text>
      <Text accessibilityRole="alert" style={{ color: colors.foreground, marginTop: 14, textAlign: 'center', lineHeight: 24 }}>
        Preparing your profile and saved progress…
      </Text>
      {account.syncError ? (
        <Text accessibilityRole="alert" style={{ color: colors.accent, marginTop: 12, textAlign: 'center' }}>
          {account.syncError}
        </Text>
      ) : null}
      {account.isSignedIn ? (
        <Pressable onPress={() => void account.retrySync()} style={{ marginTop: 22, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}>
          <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>RETRY PROFILE SYNC</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AccountSyncNotice() {
  const colors = useColors();
  const account = useAriseAccount();
  const router = useRouter();
  if (!account.isSignedIn || (!account.conflict && !account.syncError)) return null;
  return (
    <View style={{
      marginHorizontal: 14,
      marginTop: 8,
      marginBottom: 6,
      padding: 12,
      borderWidth: 1,
      borderColor: account.conflict ? colors.accent : colors.border,
      borderRadius: 12,
      backgroundColor: colors.card,
    }}>
      <Text accessibilityRole="alert" style={{ color: colors.foreground, fontWeight: '700' }}>
        {account.conflict ? 'Progress needs your review' : 'Account sync needs attention'}
      </Text>
      <Text style={{ color: colors.mutedForeground, marginTop: 4, lineHeight: 19 }}>
        {account.syncError ?? 'Your progress is kept separately until you choose how to resolve it.'}
      </Text>
      <Pressable onPress={() => router.push('/account' as never)} style={{ alignSelf: 'flex-start', marginTop: 8, paddingVertical: 5 }}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>REVIEW ACCOUNT PROGRESS</Text>
      </Pressable>
    </View>
  );
}

function FontStatusScreen({
  loading,
  fallback,
  fontFailed,
}: {
  loading: boolean;
  fallback: boolean;
  fontFailed: boolean;
}) {
  if (!loading && !fallback) return null;
  return (
    <View
      accessibilityRole={loading ? 'progressbar' : undefined}
      style={loading ? {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 2000,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        backgroundColor: '#07101f',
        pointerEvents: 'auto',
      } : {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 2000,
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#142238',
        pointerEvents: 'none',
      }}
    >
      {loading ? (
        <>
          <Text style={{ color: '#72e7f8', fontSize: 13, fontWeight: '800', letterSpacing: 3 }}>ARISE</Text>
          <Text accessibilityRole="alert" style={{ color: '#f4f7fb', marginTop: 14, textAlign: 'center', lineHeight: 23 }}>
            Loading display fonts. The app is preparing with system fonts.
          </Text>
        </>
      ) : (
        <Text accessibilityRole="alert" style={{ color: '#f4f7fb', textAlign: 'center', lineHeight: 20 }}>
          {fontFailed
            ? 'Display fonts could not be loaded; using system fonts.'
            : 'Display fonts are taking longer; using system fonts for now.'}
        </Text>
      )}
    </View>
  );
}

function AccountApplication() {
  const account = useAriseAccount();
  const profileSession = useProfileSession();
  const pathname = usePathname();
  const accountStarting = account.status === 'loading'
    || (account.isSignedIn && !account.isBootstrapped);
  const isEntryRoute = pathname === '/' || pathname === '';
  if (!profileSession.ready) return <AccountStartingScreen />;
  if (!profileSession.profile) {
    return isEntryRoute ? <RootLayoutNav /> : <Redirect href="/" />;
  }
  if (profileSession.recoveryKeyToShow && isEntryRoute) return <RootLayoutNav />;
  if (accountStarting) return <AccountStartingScreen />;
  const activeUserId = account.isSignedIn ? account.userId : null;
  const missionScope = activeUserId
    ? `account:${activeUserId}:${account.sessionScope}`
    : 'anonymous';
  return (
    <StudyProvider
      accountUserId={activeUserId}
      initialAccountState={activeUserId && account.isBootstrapped ? account.initialStudyState : undefined}
      accountPersistenceAllowed={activeUserId
        ? account.isBootstrapped && account.accountPersistenceAllowed
        : true}
      storageWritesEnabled={!accountStarting}
      accountPayloadMetadata={activeUserId ? account.accountPayloadMetadata : undefined}
    >
      <MissionProvider key={missionScope}>
        <SystemExperienceProvider>
        <AccountStudySyncBridge />
        <AccountSyncNotice />
        <View style={{ flex: 1 }}>
          <RootLayoutNav />
          <RpgFeedback />
          <SystemSoundBridge />
          <SystemActivationHost />
          {accountStarting ? (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000 }}>
              <AccountStartingScreen />
            </View>
          ) : null}
        </View>
        </SystemExperienceProvider>
      </MissionProvider>
    </StudyProvider>
  );
}

function AuthenticatedApplication() {
  return (
    <ProfileSessionProvider>
      <AriseAccountProvider>
        <AccountApplication />
      </AriseAccountProvider>
    </ProfileSessionProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontFallback, setFontFallback] = useState(false);

  useEffect(() => {
    void SplashScreen.hideAsync();
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => {
      setFontFallback(true);
      void SplashScreen.hideAsync();
    }, 2200);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  const fontLoading = !fontsLoaded && !fontError && !fontFallback;
  const fontFallbackNotice = !fontsLoaded && (!!fontError || fontFallback);
  const authenticatedTree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthenticatedApplication />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          {authenticatedTree}
          <FontStatusScreen loading={fontLoading} fallback={fontFallbackNotice} fontFailed={!!fontError} />
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
