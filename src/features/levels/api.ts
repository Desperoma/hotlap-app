import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Builds de test : les drives simulés comptent pour tout le monde (comme dans les classements). */
const WITH_TEST = __DEV__ || process.env.EXPO_PUBLIC_TEST_TOOLS === '1';

/** XP d'un conducteur, recalculée par la base à partir de ses drives (driver_xp, migration 0028). */
export type DriverXp = {
  xp: number; distanceM: number; driveCount: number; tracksVisited: number; sessions: number;
  personalBests: number; categories: number; achievements: number;
  breakdown: { distance: number; tracks: number; sessions: number; personalBests: number; categories: number; achievements: number };
};

export async function driverXp(userId: string): Promise<DriverXp | null> {
  if (!isSupabaseConfigured) return null;
  // Builds de test : les drives simulés des autres comptent aussi (migration 0033 ; repli sur 0028).
  let { data, error } = await supabase.rpc('driver_xp', { p_user: userId, p_include_sim: WITH_TEST });
  if (error) ({ data, error } = await supabase.rpc('driver_xp', { p_user: userId }));
  if (error) return null; // migration 0028 pas encore passée : pas de carte de niveau
  const r = ((data ?? []) as {
    xp: number; distance_m: number; drive_count: number; tracks_visited: number; sessions: number;
    personal_bests: number; categories: number; achievements: number;
    distance_xp: number; tracks_xp: number; sessions_xp: number; pb_xp: number; categories_xp: number; achievements_xp?: number;
  }[])[0];
  if (!r) return null;
  return {
    xp: Number(r.xp), distanceM: Number(r.distance_m), driveCount: r.drive_count, tracksVisited: r.tracks_visited,
    sessions: r.sessions, personalBests: r.personal_bests, categories: r.categories, achievements: r.achievements,
    breakdown: {
      distance: Number(r.distance_xp), tracks: r.tracks_xp, sessions: r.sessions_xp, personalBests: r.pb_xp, categories: r.categories_xp,
      achievements: Number(r.achievements_xp ?? 0),
    },
  };
}

// --- Niveaux de plusieurs conducteurs (badges de rang), migration 0032 ----------------------

const cache = new Map<string, { xp: number; at: number }>();
const TTL = 60_000;

export async function driverLevels(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const now = Date.now();
  const missing = [...new Set(userIds)].filter((id) => {
    const c = cache.get(id);
    if (c && now - c.at < TTL) { out.set(id, c.xp); return false; }
    return true;
  });
  if (!missing.length || !isSupabaseConfigured) return out;
  const { data, error } = await supabase.rpc('driver_levels', { p_users: missing.slice(0, 100), p_include_sim: WITH_TEST });
  if (error) return out; // migration 0032 absente : pas de badge
  for (const r of (data ?? []) as { user_id: string; xp: number }[]) {
    cache.set(r.user_id, { xp: Number(r.xp), at: now });
    out.set(r.user_id, Number(r.xp));
  }
  return out;
}
