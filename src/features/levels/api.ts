import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** XP d'un conducteur, recalculée par la base à partir de ses drives (driver_xp, migration 0028). */
export type DriverXp = {
  xp: number; distanceM: number; driveCount: number; tracksVisited: number; sessions: number;
  personalBests: number; categories: number; achievements: number;
  breakdown: { distance: number; tracks: number; sessions: number; personalBests: number; categories: number };
};

export async function driverXp(userId: string): Promise<DriverXp | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('driver_xp', { p_user: userId });
  if (error) return null; // migration 0028 pas encore passée : pas de carte de niveau
  const r = ((data ?? []) as {
    xp: number; distance_m: number; drive_count: number; tracks_visited: number; sessions: number;
    personal_bests: number; categories: number; achievements: number;
    distance_xp: number; tracks_xp: number; sessions_xp: number; pb_xp: number; categories_xp: number;
  }[])[0];
  if (!r) return null;
  return {
    xp: Number(r.xp), distanceM: Number(r.distance_m), driveCount: r.drive_count, tracksVisited: r.tracks_visited,
    sessions: r.sessions, personalBests: r.personal_bests, categories: r.categories, achievements: r.achievements,
    breakdown: {
      distance: Number(r.distance_xp), tracks: r.tracks_xp, sessions: r.sessions_xp, personalBests: r.pb_xp, categories: r.categories_xp,
    },
  };
}
