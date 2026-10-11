import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Profile, Vehicle } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ProfilePatch = Partial<
  Pick<Profile, 'first_name' | 'last_name' | 'birth_date' | 'country_code' | 'region' | 'home_city' |
    'display_name' | 'bio' | 'avatar_url' | 'onboarded_at'>
>;
export type VehicleInput = { make: string; model: string; year: number | null; modelId?: number | null };

/**
 * Vérifications (voir « Onboarding » dans le doc de cadrage) :
 * - l'email est obligatoire et vérifié par un code à 6 chiffres reçu par email avant toute connexion ;
 * - le téléphone est facultatif et NON vérifié : la vérification SMS est payante (fournisseur tiers),
 *   donc abandonnée. Il reste privé et ne sert pas à se connecter.
 * Côté Supabase : Auth > Providers > Email > « Confirm email » activé, et le modèle d'email
 * « Confirm signup » doit contenir {{ .Token }}.
 */
type AuthState = {
  /** undefined = chargement, null = déconnecté */
  session: Session | null | undefined;
  /** undefined = pas encore chargé */
  profile: Profile | null | undefined;
  primaryVehicle: Vehicle | null | undefined;
  isDemo: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  /** Renvoie true si un code de vérification a été envoyé par email */
  signUp: (input: { username: string; email: string; password: string; phone?: string }) => Promise<boolean>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendEmailCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  saveVehicle: (v: VehicleInput) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEMO_SESSION = { user: { id: 'demo-user' } } as unknown as Session;
const isCode = (c: string) => /^\d{6}$/.test(c.trim());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [demoSignup, setDemoSignup] = useState<{ username: string; phone: string | null } | null>(null);

  // --- Session ---------------------------------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Profil + véhicule principal -----------------------------------------
  const userId = session?.user.id;
  useEffect(() => {
    if (session === null) {
      setProfile(null);
      setPrimaryVehicle(null);
      return;
    }
    if (!userId || !isSupabaseConfigured) return;
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('vehicles').select('*').eq('owner_id', userId).eq('is_primary', true).maybeSingle(),
    ]).then(([{ data: p }, { data: v }]) => {
      if (cancelled) return;
      setProfile((p as Profile) ?? null);
      setPrimaryVehicle((v as Vehicle) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [session, userId]);

  // --- Connexion / inscription ------------------------------------------------
  const signIn = useCallback<AuthState['signIn']>(async (identifier, password) => {
    if (!isSupabaseConfigured) {
      // Démo : un « ancien » compte, onboarding déjà fait.
      const p = demoProfile(identifier.split('@')[0] || 'driver');
      setProfile({ ...p, first_name: 'Demo', birth_date: '1995-05-01', country_code: 'FR', home_city: 'Metz', onboarded_at: p.created_at });
      setPrimaryVehicle(demoVehicle({ make: 'Audi', model: 'A3 e-tron', year: 2017 }));
      setSession(DEMO_SESSION);
      return;
    }
    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_username', { p_username: email });
      if (error || !data) throw new Error('Utilisateur introuvable');
      email = data as string;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('not confirmed')) throw new Error('Email non vérifié : utilise le code reçu par email.');
      throw error;
    }
  }, []);

  const signUp = useCallback<AuthState['signUp']>(async ({ username, email, password, phone }) => {
    if (!isSupabaseConfigured) {
      setDemoSignup({ username, phone: phone?.trim() || null });
      return true; // démo : on simule l'envoi du code
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // lus par le trigger handle_new_user (supabase/migrations/0001_init.sql)
      options: { data: { username: username.trim(), phone: phone?.trim() || '' } },
    });
    if (error) throw error;
    return !data.session; // pas de session = « Confirm email » actif, un code a été envoyé
  }, []);

  const verifyEmail = useCallback<AuthState['verifyEmail']>(async (email, code) => {
    if (!isCode(code)) throw new Error('Le code fait 6 chiffres.');
    if (!isSupabaseConfigured) {
      setProfile({ ...demoProfile(demoSignup?.username ?? 'driver'), phone: demoSignup?.phone ?? null });
      setPrimaryVehicle(null);
      setSession(DEMO_SESSION);
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' });
    if (error) throw new Error('Code invalide ou expiré.');
  }, [demoSignup]);

  const resendEmailCode = useCallback<AuthState['resendEmailCode']>(async (email) => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setSession(null);
  }, []);

  // --- Profil et véhicule -------------------------------------------------------
  const updateProfile = useCallback<AuthState['updateProfile']>(
    async (patch) => {
      if (!userId) return;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
        if (error) {
          if (error.message.includes('birth_date_locked')) throw new Error('La date de naissance ne peut plus être modifiée. Contacte le support.');
          throw error;
        }
        setProfile(data as Profile);
      } else {
        setProfile((p) => (p ? { ...p, ...patch } : p));
      }
    },
    [userId],
  );

  const saveVehicle = useCallback<AuthState['saveVehicle']>(
    async ({ make, model, year, modelId }) => {
      if (!userId) return;
      if (!isSupabaseConfigured) {
        setPrimaryVehicle(demoVehicle({ make, model, year }));
        return;
      }
      // Remplace le véhicule principal s'il existe déjà (onboarding repris).
      await supabase.from('vehicles').update({ is_primary: false }).eq('owner_id', userId).eq('is_primary', true);
      const { data, error } = await supabase
        .from('vehicles')
        .insert({ owner_id: userId, make, model, year, model_id: modelId ?? null, is_primary: true })
        .select()
        .single();
      if (error) throw error;
      setPrimaryVehicle(data as Vehicle);
    },
    [userId],
  );

  const value = useMemo<AuthState>(
    () => ({
      session, profile, primaryVehicle, isDemo: !isSupabaseConfigured,
      signIn, signUp, verifyEmail, resendEmailCode, signOut, updateProfile, saveVehicle,
    }),
    [session, profile, primaryVehicle, signIn, signUp, verifyEmail, resendEmailCode, signOut, updateProfile, saveVehicle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

function demoProfile(username: string): Profile {
  return {
    id: 'demo-user', username, display_name: username, first_name: null, last_name: null,
    birth_date: null, phone: null, country_code: null, region: null, home_city: null,
    avatar_url: null, bio: null, onboarded_at: null, created_at: new Date().toISOString(),
  };
}

function demoVehicle({ make, model, year }: { make: string; model: string; year: number | null }): Vehicle {
  return {
    id: 'demo-vehicle', owner_id: 'demo-user', model_id: null, make, model, year,
    nickname: null, photo_url: null, is_primary: true, created_at: new Date().toISOString(),
  };
}
