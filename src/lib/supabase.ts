import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Faux tant que .env.local n'est pas rempli : l'app tourne alors en mode démo. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('xxxxxxxx'));

export const supabase = createClient(
  url ?? 'https://demo.invalid',
  anonKey ?? 'demo-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Rafraîchit le jeton seulement quand l'app est au premier plan (recommandation Supabase pour RN).
if (Platform.OS !== 'web' && isSupabaseConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
