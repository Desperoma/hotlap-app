import { DRIVE_COLUMNS } from '@/features/drives/api';
import type { ScoreBreakdown, Visibility } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ProfileCounters = {
  /** Drives visibles par moi */
  drives: number;
  followers: number;
  following: number;
  bestScore: number | null;
  /** Relation avec moi */
  iFollow: boolean;
  followsMe: boolean;
  /** Demande d'abonnement envoyée, en attente */
  requested: boolean;
};

export type DriveLogItem = {
  id: string;
  title: string;
  startedAt: string;
  distanceM: number;
  durationS: number;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  lapTimeMs: number | null;
  circuitId: string | null;
  visibility: Visibility;
};

/** Compteurs d'un profil et relation avec moi (fonction profile_stats : les listes restent privées). */
export async function getCounters(userId: string): Promise<ProfileCounters> {
  const empty = { drives: 0, followers: 0, following: 0, bestScore: null, iFollow: false, followsMe: false, requested: false };
  if (!isSupabaseConfigured) return empty;
  const { data, error } = await supabase.rpc('profile_stats', { p_user: userId });
  if (error) throw error;
  const r = (data as {
    drives: number; followers: number; following: number; best_score: number | null;
    i_follow: boolean; follows_me: boolean; requested: boolean;
  }[] | null)?.[0];
  if (!r) return empty;
  return {
    drives: r.drives, followers: r.followers, following: r.following, bestScore: r.best_score,
    iFollow: r.i_follow, followsMe: r.follows_me, requested: r.requested,
  };
}

/** Drives d'un utilisateur visibles par moi, du plus récent au plus ancien. */
export async function listDrives(userId: string, limit = 30): Promise<DriveLogItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('drives')
    .select(DRIVE_COLUMNS)
    .eq('owner_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as Row[]).map((d) => ({
    id: d.id,
    title: d.title,
    startedAt: d.started_at,
    distanceM: d.distance_m,
    durationS: d.duration_s,
    score: d.score,
    scoreBreakdown: d.score_breakdown,
    lapTimeMs: d.lap_time_ms,
    circuitId: d.circuit_id,
    visibility: d.visibility,
  }));
}

type Row = {
  id: string; title: string; started_at: string; distance_m: number; duration_s: number;
  score: number | null; score_breakdown: ScoreBreakdown | null; lap_time_ms: number | null;
  circuit_id: string | null; visibility: Visibility;
};
