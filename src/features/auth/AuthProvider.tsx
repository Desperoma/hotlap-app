import type { Session } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Profile, Vehicle } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ProfilePatch = Partial<
  Pick<Profile, 'first_name' | 'last_name' | 'birth_date' | 'phone' | 'country_code' | 'region' | 'home_city' |
    'display_name' | 'bio' | 'avatar_url' | 'onboarded_at'>
>;
export type VehicleInput = { make: string; model: string; year: number | null; modelId?: number | null; nickname?: string | null };

/**
 * Vérifications (voir « Onboarding » dans le doc de cadrage) :
 * - l'email est obligatoire et vérifié par un code (6 à 10 chiffres) reçu par email avant toute connexion ;
 * - le téléphone est facultatif et NON vérifié : la vérification SMS est payante (fournisseur tiers),
 *   donc abandonnée. Il reste privé et ne sert pas à se connecter.
 * Côté Supabase : Auth > Providers > Email > « Confirm email » activé, et le modèle d'email
 * « Confirm signup » doit contenir {{ .Token }}.
 *
 * Connexion par email OU pseudo : l'Edge Function « sign-in » (supabase/functions/sign-in) retrouve
 * l'email côté serveur et ouvre la session. L'email n'est jamais renvoyé à l'app.
 */
type AuthState = {
  /** undefined = chargement, null = déconnecté */
  session: Session | null | undefined;
  /** undefined = pas encore chargé */
  profile: Profile | null | undefined;
  /** Garage : tous les véhicules de l'utilisateur, le favori en premier. undefined = pas encore chargé */
  vehicles: Vehicle[] | undefined;
  /** Véhicule favori (is_primary), affiché sur le profil et choisi par défaut avant un drive */
  primaryVehicle: Vehicle | null | undefined;
  isDemo: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  /** Renvoie true si un code de vérification a été envoyé par email */
  signUp: (input: { username: string; email: string; password: string; phone?: string }) => Promise<boolean>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendEmailCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  /** Onboarding : crée le véhicule favori, ou le remplace si l'étape est refaite. */
  saveVehicle: (v: VehicleInput) => Promise<void>;
  addVehicle: (v: VehicleInput, makePrimary?: boolean) => Promise<Vehicle>;
  updateVehicle: (id: string, v: VehicleInput) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  setPrimaryVehicle: (id: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEMO_SESSION = { user: { id: 'demo-user' } } as unknown as Session;
const isCode = (c: string) => /^\d{6,10}$/.test(c.trim());
const byPrimaryThenDate = (a: Vehicle, b: Vehicle) =>
  Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at);

type Loaded = { userId: string; profile: Profile | null; vehicles: Vehicle[] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Profil + garage, rattachés à l'utilisateur pour lequel ils ont été lus (voir plus bas).
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [demoSignup, setDemoSignup] = useState<{ username: string; phone: string | null } | null>(null);

  // --- Session ---------------------------------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      return;
    }
    // Une session n'est acceptée que si l'email a été confirmé par le code reçu.
    // Garde-fou côté app : « Confirm email » doit aussi être activé dans Supabase.
    const accept = (s: Session | null) => {
      if (s && !s.user.email_confirmed_at) {
        supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        return;
      }
      setSession(s);
    };
    supabase.auth.getSession().then(({ data }) => accept(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => accept(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Profil + garage ---------------------------------------------------------
  // À la connexion, la session arrive avant le profil. Tant que le profil de CET utilisateur
  // n'est pas lu, il vaut undefined (l'écran de démarrage reste affiché) : un ancien « null »
  // ne doit jamais être pris pour « onboarding pas fait ».
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    if (loaded?.userId === userId) return; // simple rafraîchissement du jeton : rien à recharger
    let cancelled = false;
    loadAccount(userId)
      .then((r) => !cancelled && setLoaded({ userId, ...r }))
      .catch(() => {
        // Profil illisible après plusieurs essais : on déconnecte plutôt que d'envoyer vers l'onboarding.
        if (!cancelled) supabase.auth.signOut({ scope: 'local' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loaded?.userId]);

  const current = loaded && loaded.userId === userId ? loaded : null;
  const profile = session === null ? null : current ? current.profile : undefined;
  const vehicles = session === null ? [] : current ? current.vehicles : undefined;
  const primaryVehicle = vehicles === undefined ? undefined : vehicles.find((v) => v.is_primary) ?? null;

  const patchLoaded = useCallback((fn: (l: Loaded) => Loaded) => setLoaded((l) => (l ? fn(l) : l)), []);
  const setVehicles = useCallback(
    (fn: (v: Vehicle[]) => Vehicle[]) => patchLoaded((l) => ({ ...l, vehicles: fn(l.vehicles).sort(byPrimaryThenDate) })),
    [patchLoaded],
  );

  // --- Connexion / inscription ------------------------------------------------
  const signIn = useCallback<AuthState['signIn']>(async (identifier, password) => {
    const id = identifier.trim();
    if (!id || !password) throw new Error('Saisis ton email (ou ton pseudo) et ton mot de passe.');
    if (!isSupabaseConfigured) {
      // Démo : un « ancien » compte, onboarding déjà fait.
      const p = demoProfile(id.split('@')[0] || 'driver');
      setLoaded({
        userId: 'demo-user',
        profile: { ...p, first_name: 'Demo', birth_date: '1995-05-01', country_code: 'FR', home_city: 'Metz', onboarded_at: p.created_at },
        vehicles: [demoVehicle({ make: 'Audi', model: 'A3 e-tron', year: 2017 }, true)],
      });
      setSession(DEMO_SESSION);
      return;
    }
    const { data, error } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>('sign-in', {
      body: { identifier: id, password },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (!data?.access_token) throw new Error('Connexion impossible pour le moment.');
    const { error: e } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (e) throw e;
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
    if (error) {
      if (/duplicate key|profiles_username_key|database error saving new user/i.test(error.message)) {
        throw new Error('Ce pseudo est déjà pris.');
      }
      throw error;
    }
    if (data.session) {
      // « Confirm email » désactivé dans Supabase : le compte serait ouvert sans vérification.
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('La vérification par email est désactivée côté serveur. Inscription impossible pour le moment.');
    }
    return true; // un code a été envoyé par email
  }, []);

  const verifyEmail = useCallback<AuthState['verifyEmail']>(async (email, code) => {
    if (!isCode(code)) throw new Error('Saisis le code complet reçu par email.');
    if (!isSupabaseConfigured) {
      setLoaded({
        userId: 'demo-user',
        profile: { ...demoProfile(demoSignup?.username ?? 'driver'), phone: demoSignup?.phone ?? null },
        vehicles: [],
      });
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
    setLoaded(null);
  }, []);

  // --- Profil -------------------------------------------------------------------
  const updateProfile = useCallback<AuthState['updateProfile']>(
    async (patch) => {
      if (!userId) return;
      if (!isSupabaseConfigured) {
        patchLoaded((l) => ({ ...l, profile: l.profile ? { ...l.profile, ...patch } : l.profile }));
        return;
      }
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
      if (error) {
        if (error.message.includes('birth_date_locked')) throw new Error('La date de naissance ne peut plus être modifiée. Contacte le support.');
        if (error.message.includes('profiles_bio_check')) throw new Error('La bio fait 280 caractères maximum.');
        throw error;
      }
      patchLoaded((l) => ({ ...l, profile: data as Profile }));
    },
    [userId, patchLoaded],
  );

  // --- Garage ---------------------------------------------------------------------
  const addVehicle = useCallback<AuthState['addVehicle']>(
    async (v, makePrimary = false) => {
      if (!userId) throw new Error('Not signed in');
      const first = (current?.vehicles.length ?? 0) === 0;
      const primary = makePrimary || first;
      if (!isSupabaseConfigured) {
        const created = demoVehicle(v, primary);
        setVehicles((list) => [...list.map((x) => (primary ? { ...x, is_primary: false } : x)), created]);
        return created;
      }
      const { data, error } = await supabase
        .from('vehicles')
        .insert({ owner_id: userId, make: v.make, model: v.model, year: v.year, model_id: v.modelId ?? null, nickname: v.nickname ?? null, is_primary: false })
        .select()
        .single();
      if (error) throw garageError(error);
      let created = data as Vehicle;
      if (primary) {
        const { error: e } = await supabase.rpc('set_primary_vehicle', { p_vehicle_id: created.id });
        if (e) throw e;
        created = { ...created, is_primary: true };
      }
      setVehicles((list) => [...list.map((x) => (primary ? { ...x, is_primary: false } : x)), created]);
      return created;
    },
    [userId, current?.vehicles.length, setVehicles],
  );

  const updateVehicle = useCallback<AuthState['updateVehicle']>(
    async (id, v) => {
      const patch = { make: v.make, model: v.model, year: v.year, model_id: v.modelId ?? null, nickname: v.nickname ?? null };
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('vehicles').update(patch).eq('id', id);
        if (error) throw garageError(error);
      }
      setVehicles((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [setVehicles],
  );

  const removeVehicle = useCallback<AuthState['removeVehicle']>(
    async (id) => {
      if (isSupabaseConfigured) {
        // La base désigne un nouveau favori si besoin (trigger) ; les drives gardent leurs stats.
        const { error } = await supabase.from('vehicles').delete().eq('id', id);
        if (error) throw error;
        if (userId) {
          const { data } = await supabase.from('vehicles').select('*').eq('owner_id', userId);
          if (data) return setVehicles(() => data as Vehicle[]);
        }
      }
      setVehicles((list) => {
        const rest = list.filter((x) => x.id !== id);
        if (rest.length && !rest.some((x) => x.is_primary)) rest[0] = { ...rest[0], is_primary: true };
        return rest;
      });
    },
    [userId, setVehicles],
  );

  const setPrimaryVehicle = useCallback<AuthState['setPrimaryVehicle']>(
    async (id) => {
      if (isSupabaseConfigured) {
        const { error } = await supabase.rpc('set_primary_vehicle', { p_vehicle_id: id });
        if (error) throw error;
      }
      setVehicles((list) => list.map((x) => ({ ...x, is_primary: x.id === id })));
    },
    [setVehicles],
  );

  const saveVehicle = useCallback<AuthState['saveVehicle']>(
    async (v) => {
      // Onboarding repris : on corrige le favori existant au lieu d'en créer un deuxième.
      if (primaryVehicle) return updateVehicle(primaryVehicle.id, v);
      await addVehicle(v, true);
    },
    [primaryVehicle, updateVehicle, addVehicle],
  );

  const value = useMemo<AuthState>(
    () => ({
      session, profile, vehicles, primaryVehicle, isDemo: !isSupabaseConfigured,
      signIn, signUp, verifyEmail, resendEmailCode, signOut, updateProfile,
      saveVehicle, addVehicle, updateVehicle, removeVehicle, setPrimaryVehicle,
    }),
    [session, profile, vehicles, primaryVehicle, signIn, signUp, verifyEmail, resendEmailCode, signOut, updateProfile,
      saveVehicle, addVehicle, updateVehicle, removeVehicle, setPrimaryVehicle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Profil + garage. Une erreur réseau n'est pas « pas de profil » : on réessaie avant de conclure. */
async function loadAccount(uid: string): Promise<{ profile: Profile | null; vehicles: Vehicle[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [p, v] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('vehicles').select('*').eq('owner_id', uid),
    ]);
    if (!p.error && !v.error) {
      return { profile: (p.data as Profile) ?? null, vehicles: ((v.data ?? []) as Vehicle[]).sort(byPrimaryThenDate) };
    }
    lastError = p.error ?? v.error;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw lastError;
}

/** Message lisible renvoyé par l'Edge Function sign-in ({ error: "..." }). */
async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // corps illisible : message générique ci-dessous
    }
  }
  return 'Connexion impossible. Vérifie ta connexion internet.';
}

function garageError(error: { message: string }) {
  if (error.message.includes('garage_full')) return new Error('Ton garage est plein (20 véhicules maximum).');
  return error;
}

function demoProfile(username: string): Profile {
  return {
    id: 'demo-user', username, display_name: username, first_name: null, last_name: null,
    birth_date: null, phone: null, country_code: null, region: null, home_city: null,
    avatar_url: null, bio: null, onboarded_at: null, created_at: new Date().toISOString(),
  };
}

function demoVehicle(v: VehicleInput, primary: boolean): Vehicle {
  return {
    id: `demo-vehicle-${Date.now()}`, owner_id: 'demo-user', model_id: null, make: v.make, model: v.model, year: v.year,
    nickname: v.nickname ?? null, photo_url: null, is_primary: primary, created_at: new Date().toISOString(),
  };
}
