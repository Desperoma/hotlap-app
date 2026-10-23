import '@/features/recording/recorder'; // enregistre la tâche GPS d'arrière-plan au démarrage

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Michroma_400Regular } from '@expo-google-fonts/michroma';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Michroma_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator fontsLoaded={fontsLoaded} />
    </AuthProvider>
  );
}

/**
 * Aiguillage selon l'état du compte :
 *   déconnecté                  -> (auth)       Login / Register (= 20 % de l'onboarding)
 *   connecté, onboarding ouvert -> onboarding   identité, localisation, véhicule, GPS
 *   onboarding terminé          -> (tabs)       l'app
 */
function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { session, profile } = useAuth();
  const ready = fontsLoaded && session !== undefined && !(session && profile === undefined);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drive/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="drive/live" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="drive/finish" options={{ gestureEnabled: false }} />
        <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="garage/index" />
        <Stack.Screen name="garage/edit" />
        <Stack.Screen name="crews/index" />
        <Stack.Screen name="crews/form" />
        <Stack.Screen name="crews/invite" />
        <Stack.Screen name="crews/[id]" />
        <Stack.Screen name="settings/privacy-zone" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings/privacy" />
        <Stack.Screen name="people/[kind]" />
        <Stack.Screen name="notifications" />
      </Stack.Protected>
    </Stack>
  );
}
