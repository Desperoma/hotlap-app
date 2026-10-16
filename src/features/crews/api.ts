import type { PublicProfile } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Crews : groupes de conducteurs (migration 0007). Ouverts (on rejoint directement) ou sur demande
 * (un admin valide). Toutes les écritures passent par des fonctions SQL qui vérifient les rôles.
 */
export type CrewJoinPolicy = 'open' | 'approval';
export type CrewRole = 'owner' | 'admin' | 'member';
export type CrewMemberStatus = 'active' | 'pending';

export type Crew = {
  id: string;
  name: string;
  description: string | null;
  home_city: string | null;
  country_code: string | null;
  join_policy: CrewJoinPolicy;
  owner_id: string;
  member_count: number;
  created_at: string;
};

export type CrewMember = {
  userId: string;
  role: CrewRole;
  status: CrewMemberStatus;
  joinedAt: string;
  profile: Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

/** Un crew vu par l'utilisateur connecté : son rôle et son statut (null = pas membre). */
export type MyCrew = Crew & { myRole: CrewRole | null; myStatus: CrewMemberStatus | null };

export type CrewInput = {
  name: string;
  description: string;
  joinPolicy: CrewJoinPolicy;
  homeCity?: string;
  countryCode?: string | null;
};

const CREW_COLUMNS = 'id, name, description, home_city, country_code, join_policy, owner_id, member_count, created_at';

const demoCrews = new Map<string, MyCrew>();

/** Crews dont je suis membre (ou où j'ai demandé à entrer). */
export async function listMyCrews(me: string): Promise<MyCrew[]> {
  if (!isSupabaseConfigured) return [...demoCrews.values()];
  const { data, error } = await supabase
    .from('crew_members')
    .select(`role, status, crews (${CREW_COLUMNS})`)
    .eq('user_id', me)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as { role: CrewRole; status: CrewMemberStatus; crews: Crew | null }[])
    .filter((r) => r.crews)
    .map((r) => ({ ...(r.crews as Crew), myRole: r.role, myStatus: r.status }));
}

/** Crews actifs d'un autre conducteur (profil public). */
export async function listUserCrews(userId: string): Promise<Crew[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('crew_members')
    .select(`crews (${CREW_COLUMNS})`)
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw error;
  return ((data ?? []) as unknown as { crews: Crew | null }[]).map((r) => r.crews).filter((c): c is Crew => !!c);
}

export async function searchCrews(query: string): Promise<Crew[]> {
  if (!isSupabaseConfigured) {
    const q = query.trim().toLowerCase();
    return [...demoCrews.values()].filter((c) => c.name.toLowerCase().includes(q));
  }
  const { data, error } = await supabase.rpc('search_crews', { p_query: query.trim(), p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as Crew[];
}

export async function getCrew(id: string, me: string): Promise<MyCrew | null> {
  if (!isSupabaseConfigured) return demoCrews.get(id) ?? null;
  const [crew, mine] = await Promise.all([
    supabase.from('crews').select(CREW_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('crew_members').select('role, status').eq('crew_id', id).eq('user_id', me).maybeSingle(),
  ]);
  if (crew.error) throw crew.error;
  if (!crew.data) return null;
  const m = mine.data as { role: CrewRole; status: CrewMemberStatus } | null;
  return { ...(crew.data as Crew), myRole: m?.role ?? null, myStatus: m?.status ?? null };
}

/** Membres actifs, et demandes en attente si je suis admin (la base filtre). */
export async function listMembers(crewId: string): Promise<CrewMember[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('crew_members')
    .select('user_id, role, status, joined_at')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; role: CrewRole; status: CrewMemberStatus; joined_at: string }[];
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from('public_profiles').select('id, username, display_name, avatar_url').in('id', ids)
    : { data: [] as CrewMember['profile'][] };
  const byId = new Map((profiles ?? []).map((p) => [p!.id, p]));
  const rank: Record<CrewRole, number> = { owner: 0, admin: 1, member: 2 };
  return rows
    .map((r) => ({ userId: r.user_id, role: r.role, status: r.status, joinedAt: r.joined_at, profile: byId.get(r.user_id) ?? null }))
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

export async function createCrew(me: string, input: CrewInput): Promise<string> {
  if (!isSupabaseConfigured) {
    const id = `demo-crew-${Date.now()}`;
    demoCrews.set(id, {
      id, name: input.name.trim(), description: input.description.trim() || null, home_city: input.homeCity?.trim() || null,
      country_code: input.countryCode ?? null, join_policy: input.joinPolicy, owner_id: me, member_count: 1,
      created_at: new Date().toISOString(), myRole: 'owner', myStatus: 'active',
    });
    return id;
  }
  const { data, error } = await supabase.rpc('create_crew', {
    p_name: input.name.trim(),
    p_description: input.description.trim() || null,
    p_join_policy: input.joinPolicy,
    p_home_city: input.homeCity?.trim() || null,
    p_country_code: input.countryCode ?? null,
  });
  if (error) throw crewError(error);
  return data as string;
}

export async function updateCrew(id: string, input: CrewInput) {
  if (!isSupabaseConfigured) {
    const c = demoCrews.get(id);
    if (c) demoCrews.set(id, { ...c, name: input.name.trim(), description: input.description.trim() || null, join_policy: input.joinPolicy, home_city: input.homeCity?.trim() || null });
    return;
  }
  const { error } = await supabase.rpc('update_crew', {
    p_crew_id: id,
    p_name: input.name.trim(),
    p_description: input.description.trim() || null,
    p_join_policy: input.joinPolicy,
    p_home_city: input.homeCity?.trim() || null,
    p_country_code: input.countryCode ?? null,
  });
  if (error) throw crewError(error);
}

const call = async (fn: string, args: Record<string, unknown>) => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw crewError(error);
  return data;
};

export const deleteCrew = (id: string) => (isSupabaseConfigured ? call('delete_crew', { p_crew_id: id }) : Promise.resolve(demoCrews.delete(id)));
export const joinCrew = async (id: string) => ((await call('join_crew', { p_crew_id: id })) ?? 'active') as CrewMemberStatus;
export const leaveCrew = (id: string) => call('leave_crew', { p_crew_id: id });
export const answerRequest = (crewId: string, userId: string, accept: boolean) =>
  call('answer_crew_request', { p_crew_id: crewId, p_user_id: userId, p_accept: accept });
export const removeMember = (crewId: string, userId: string) => call('remove_crew_member', { p_crew_id: crewId, p_user_id: userId });
export const setMemberRole = (crewId: string, userId: string, role: 'admin' | 'member') =>
  call('set_crew_role', { p_crew_id: crewId, p_user_id: userId, p_role: role });
export const transferCrew = (crewId: string, userId: string) => call('transfer_crew', { p_crew_id: crewId, p_user_id: userId });

/** Messages lisibles pour les erreurs levées par les fonctions SQL. */
function crewError(error: { message: string }) {
  const m = error.message;
  if (m.includes('crew_name_taken')) return new Error('Ce nom de crew est déjà pris.');
  if (m.includes('crew_limit_owner')) return new Error('Tu as déjà créé 5 crews, le maximum.');
  if (m.includes('crew_limit_member')) return new Error('Tu fais déjà partie de 20 crews, le maximum.');
  if (m.includes('crew_owner_cannot_leave')) return new Error('Transmets le crew à un membre, ou supprime-le, avant de partir.');
  if (m.includes('crew_forbidden')) return new Error('Tu n’as pas les droits pour faire ça dans ce crew.');
  if (m.includes('crew_not_found')) return new Error('Ce crew n’existe plus.');
  if (m.includes('crews_name_check') || m.includes('crews_description_check')) {
    return new Error('Nom : 3 à 40 caractères. Description : 280 caractères maximum.');
  }
  return error instanceof Error ? error : new Error(m);
}
