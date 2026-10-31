import '@/features/recording/recorder'; // enregistre la tâche GPS d'arrière-plan au démarrage

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Michroma_400Regular } from '@expo-google-fonts/michroma';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { LanguageProvider, type Lang } from '@/i18n';
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
    <LanguageProvider>
      {(langReady, lang) => (
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator fontsLoaded={fontsLoaded && langReady} lang={lang} />
        </AuthProvider>
      )}
    </LanguageProvider>
  );
}

/**
 * Aiguillage selon l'état du compte :
 *   déconnecté                  -> (auth)       Login / Register (= 20 % de l'onboarding)
 *   connecté, onboarding ouvert -> onboarding   identité, localisation, véhicule, GPS
 *   onboarding terminé          -> (tabs)       l'app
 */
function RootNavigator({ fontsLoaded, lang }: { fontsLoaded: boolean; lang: Lang }) {
  const { session, profile } = useAuth();
  const ready = fontsLoaded && session !== undefined && !(session && profile === undefined);
  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // Changer de langue remonte la pile (key={lang}) pour que tous les écrans se redessinent ;
  // depuis Settings, on y revient au lieu de rester sur l'accueil.
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    if (!signedIn || !onboarded) return;
    const id = setTimeout(() => { router.push('/settings'); router.push('/settings/language'); }, 0);
    return () => clearTimeout(id);
  }, [lang, signedIn, onboarded]);

  if (!ready) return null;

  return (
    <Stack key={lang} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/security" />
        <Stack.Screen name="settings/birth-date" />
        <Stack.Screen name="settings/blocked" />
        <Stack.Screen name="settings/reports" />
        <Stack.Screen name="settings/language" />
        <Stack.Screen name="settings/dev" />
        <Stack.Screen name="ranks" />
        <Stack.Screen name="circuit/edit" />
        <Stack.Screen name="people/[kind]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="circuit/[id]" />
        <Stack.Screen name="circuit/live" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
      </Stack.Protected>
    </Stack>
  );
}
