// Edge Function « sign-in » : connexion par email OU par pseudo.
//
// Remplace l'ancienne fonction SQL email_for_username (supprimée en 0006), qui renvoyait l'email
// de n'importe quel pseudo. Ici, l'email est retrouvé côté serveur avec la clé service et n'est
// jamais renvoyé : l'app reçoit seulement les jetons de session si le mot de passe est bon.
//
// Garde-fous :
// - même message d'erreur que le pseudo existe ou non (pas d'énumération des comptes) ;
// - 8 échecs par identifiant et 40 par adresse IP sur 15 minutes, table login_attempts ;
// - email non confirmé : refusé (le code reçu à l'inscription doit être saisi d'abord).
//
// Déployée sans vérification JWT (verify_jwt = false) : l'utilisateur n'est pas encore connecté
// et l'app utilise une clé « publishable » qui n'est pas un JWT.
import { createClient } from 'npm:@supabase/supabase-js@2';

const WINDOW_MIN = 15;
const MAX_PER_ID = 8;
const MAX_PER_IP = 40;
const INVALID = 'Email, pseudo ou mot de passe incorrect.';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let identifier = '';
  let password = '';
  try {
    const body = await req.json();
    identifier = String(body?.identifier ?? '').trim().slice(0, 254);
    password = String(body?.password ?? '').slice(0, 200);
  } catch {
    return json(400, { error: 'Requête invalide.' });
  }
  if (!identifier || !password) return json(400, { error: 'Saisis ton email (ou ton pseudo) et ton mot de passe.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const idKey = `id:${identifier.toLowerCase()}`;
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipKey = `ip:${ip}`;
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

  // Limitation des essais
  const [byId, byIp] = await Promise.all([
    admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('key', idKey).gte('created_at', since),
    admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('key', ipKey).gte('created_at', since),
  ]);
  if ((byId.count ?? 0) >= MAX_PER_ID || (byIp.count ?? 0) >= MAX_PER_IP) {
    return json(429, { error: `Trop d'essais. Réessaie dans ${WINDOW_MIN} minutes.` });
  }

  const fail = async () => {
    await admin.from('login_attempts').insert([{ key: idKey }, { key: ipKey }]);
    // Ménage occasionnel des vieilles lignes.
    if (Math.random() < 0.05) {
      await admin.from('login_attempts').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
    }
    return json(401, { error: INVALID });
  };

  // Email direct, ou email retrouvé depuis le pseudo
  let email = identifier;
  if (!identifier.includes('@')) {
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(identifier)) return fail();
    const { data: profile } = await admin.from('profiles').select('id').ilike('username', identifier.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (!profile) return fail();
    const { data: user, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !user?.user?.email) return fail();
    email = user.user.email;
  }

  // Connexion avec la clé publique, comme le ferait l'app
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error?.message?.toLowerCase().includes('not confirmed')) {
      return json(403, { error: 'Email non vérifié : utilise le code reçu par email.' });
    }
    return fail();
  }
  if (!data.user?.email_confirmed_at) {
    return json(403, { error: 'Email non vérifié : utilise le code reçu par email.' });
  }

  await admin.from('login_attempts').delete().eq('key', idKey);
  return json(200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});
