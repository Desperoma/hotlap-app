import { DRIVE_COLUMNS } from '@/features/drives/api';
import type { ScoreBreakdown, Visibility } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ProfileCounters = { drives: number; crew: number; following: number; bestScore: number | null };

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

/** Compteurs du profil : drives, crew (abonnés), following (abonnements), meilleur score. */
export async function getCounters(userId: string): Promise<ProfileCounters> {
  if (!isSupabaseConfigured) return { drives: 0, crew: 0, following: 0, bestScore: null };
  const [drives, crew, following, best] = await Promise.all([
    supabase.from('drives').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
    supabase.from('drives').select('score').eq('owner_id', userId).not('score', 'is', null)
      .order('score', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [drives, crew, following, best]) if (r.error) throw r.error;
  return {
    drives: drives.count ?? 0,
    crew: crew.count ?? 0,
    following: following.count ?? 0,
    bestScore: (best.data as { score: number } | null)?.score ?? null,
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
