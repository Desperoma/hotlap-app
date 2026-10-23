import { FEED } from '@/data/mock';
import { geojsonToPath } from '@/features/drives/api';
import type { DriveFeedItem, PublicProfile, ScoreBreakdown, Visibility } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Ligne renvoyée par les fonctions de fil (type drive_card, migration 0002). */
export type DriveCardRow = {
  id: string; owner_id: string; vehicle_id: string | null; route_id: string | null; circuit_id: string | null;
  title: string; description: string | null; started_at: string; ended_at: string;
  distance_m: number; duration_s: number; avg_speed_kmh: number | null; max_lateral_g: number | null;
  score: number | null; score_breakdown: ScoreBreakdown | null; score_version: number | null;
  lap_time_ms: number | null; visibility: Visibility; like_count: number; comment_count: number; created_at: string;
};

export type Author = Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export type Comment = { id: string; body: string; createdAt: string; author: Author | null; isMine: boolean };

/** Complète les lignes de fil : auteur, véhicule, « j'aime » de l'utilisateur. */
export async function hydrate(rows: DriveCardRow[], me: string): Promise<DriveFeedItem[]> {
  if (rows.length === 0) return [];
  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => !!v))];
  const [authors, vehicles, likes, paths] = await Promise.all([
    supabase.from('public_profiles').select('id, username, display_name, avatar_url').in('id', ownerIds),
    vehicleIds.length
      ? supabase.from('vehicles').select('id, make, model, year').in('id', vehicleIds)
      : Promise.resolve({ data: [] as { id: string; make: string; model: string; year: number | null }[], error: null }),
    supabase.from('likes').select('drive_id').eq('user_id', me).in('drive_id', rows.map((r) => r.id)),
    supabase.rpc('drive_path_previews', { p_drive_ids: rows.map((r) => r.id) }),
  ]);
  for (const r of [authors, vehicles, likes]) if (r.error) throw r.error;
  // Sans aperçu (erreur réseau, fonction absente), le fil s'affiche quand même, sans carte.
  const pathById = new Map(((paths.data ?? []) as { drive_id: string; path: unknown }[]).map((p) => [p.drive_id, geojsonToPath(p.path)]));
  const authorById = new Map((authors.data ?? []).map((a) => [a.id, a]));
  const vehicleById = new Map((vehicles.data ?? []).map((v) => [v.id, v]));
  const liked = new Set((likes.data ?? []).map((l) => l.drive_id));

  return rows.map((r) => {
    const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
    return {
      ...r,
      max_speed_kmh: null,
      author: authorById.get(r.owner_id) ?? { id: r.owner_id, username: 'driver', display_name: null, avatar_url: null },
      vehicle: v ? { make: v.make, model: v.model, year: v.year } : null,
      liked_by_me: liked.has(r.id),
      path_preview: pathById.get(r.id) ?? [],
    };
  });
}

export async function feedFollowing(me: string, before?: string) {
  if (!isSupabaseConfigured) return FEED;
  const { data, error } = await supabase.rpc('feed_following', { p_limit: 20, p_before: before ?? new Date().toISOString() });
  if (error) throw error;
  return hydrate((data ?? []) as DriveCardRow[], me);
}

export async function feedWorld(me: string, before?: string) {
  if (!isSupabaseConfigured) return FEED;
  const { data, error } = await supabase.rpc('feed_world', { p_limit: 20, p_before: before ?? new Date().toISOString() });
  if (error) throw error;
  return hydrate((data ?? []) as DriveCardRow[], me);
}

/** Fil Crews : drives visibles des membres de mes crews. */
export async function feedCrews(me: string, before?: string) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('feed_crews', { p_limit: 20, p_before: before ?? new Date().toISOString() });
  if (error) throw error;
  return hydrate((data ?? []) as DriveCardRow[], me);
}

export async function feedNearby(me: string, lat: number, lng: number, radiusM = 50_000) {
  if (!isSupabaseConfigured) return FEED;
  const { data, error } = await supabase.rpc('drives_nearby', { p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_limit: 20 });
  if (error) throw error;
  return hydrate((data ?? []) as DriveCardRow[], me);
}

// --- Likes -----------------------------------------------------------------

export async function setLike(driveId: string, me: string, like: boolean) {
  if (!isSupabaseConfigured) return;
  const q = like
    ? supabase.from('likes').upsert({ drive_id: driveId, user_id: me }, { onConflict: 'drive_id,user_id', ignoreDuplicates: true })
    : supabase.from('likes').delete().eq('drive_id', driveId).eq('user_id', me);
  const { error } = await q;
  if (error) throw error;
}

export async function isLiked(driveId: string, me: string) {
  if (!isSupabaseConfigured) return false;
  const { count } = await supabase.from('likes').select('drive_id', { count: 'exact', head: true })
    .eq('drive_id', driveId).eq('user_id', me);
  return (count ?? 0) > 0;
}

// --- Commentaires ------------------------------------------------------------

export async function listComments(driveId: string, me: string): Promise<Comment[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('comments').select('id, body, created_at, user_id')
    .eq('drive_id', driveId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((c) => c.user_id))];
  const { data: authors } = ids.length
    ? await supabase.from('public_profiles').select('id, username, display_name, avatar_url').in('id', ids)
    : { data: [] as Author[] };
  const byId = new Map((authors ?? []).map((a) => [a.id, a]));
  return (data ?? []).map((c) => ({
    id: c.id, body: c.body, createdAt: c.created_at, author: byId.get(c.user_id) ?? null, isMine: c.user_id === me,
  }));
}

export async function addComment(driveId: string, me: string, body: string) {
  const text = body.trim();
  if (!text) return;
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('comments').insert({ drive_id: driveId, user_id: me, body: text.slice(0, 1000) });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

// --- Abonnements et profils publics ----------------------------------------------

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url, bio, country_code, home_city, created_at, follow_policy')
    .eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** S'abonner : direct si le compte est ouvert, sinon une demande à accepter. */
export async function follow(userId: string): Promise<'following' | 'requested'> {
  if (!isSupabaseConfigured) return 'following';
  const { data, error } = await supabase.rpc('follow_user', { p_target: userId });
  if (error) throw error;
  return data as 'following' | 'requested';
}

/** Se désabonner, ou annuler une demande en attente. */
export async function unfollow(me: string, userId: string) {
  if (!isSupabaseConfigured || me === userId) return;
  const [a, b] = await Promise.all([
    supabase.from('follows').delete().eq('follower_id', me).eq('following_id', userId),
    supabase.from('follow_requests').delete().eq('requester_id', me).eq('target_id', userId),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

/** Retirer quelqu'un de mes followers. */
export async function removeFollower(me: string, userId: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', me);
  if (error) throw error;
}

export type PersonRow = {
  id: string; username: string; displayName: string | null; avatarUrl: string | null;
  iFollow: boolean; followsMe: boolean;
};

/** Mes followers, mes abonnements, ou les demandes reçues. */
export async function listPeople(kind: 'followers' | 'following' | 'requests'): Promise<PersonRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('my_people', { p_kind: kind });
  if (error) throw error;
  return ((data ?? []) as {
    id: string; username: string; display_name: string | null; avatar_url: string | null; i_follow: boolean; follows_me: boolean;
  }[]).map((r) => ({
    id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url,
    iFollow: r.i_follow, followsMe: r.follows_me,
  }));
}

export async function answerFollowRequest(requesterId: string, accept: boolean) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('answer_follow_request', { p_requester: requesterId, p_accept: accept });
  if (error) throw error;
}

export function displayName(a: Pick<Author, 'display_name' | 'username'> | null | undefined) {
  return a?.display_name ?? a?.username ?? 'Driver';
}

export function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
