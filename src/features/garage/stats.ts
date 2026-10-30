import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Par véhicule de l'utilisateur connecté (fonction my_vehicle_stats, migration 0022). */
export type VehicleStats = {
  driveCount: number; distanceM: number; maxSpeedKmh: number | null;
  /** Meilleur 0-100 km/h mesuré (drives réels), pour la classe HPI (migration 0028) */
  best0to100Ms?: number | null;
};

export const myVehicleStats = () => statsFrom(() => supabase.rpc('my_vehicle_stats'));

/**
 * Garage d'un autre conducteur (user_vehicle_stats, migration 0023) : sur les drives que je peux
 * voir, et seulement si son garage m'est visible.
 */
export const userVehicleStats = (userId: string) => statsFrom(() => supabase.rpc('user_vehicle_stats', { p_user: userId }));

async function statsFrom(query: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<Map<string, VehicleStats>> {
  const out = new Map<string, VehicleStats>();
  if (!isSupabaseConfigured) return out;
  const { data, error } = await query();
  if (error) throw error;
  for (const r of (data ?? []) as { vehicle_id: string; drive_count: number; distance_m: number; max_speed_kmh: number | null }[]) {
    out.set(r.vehicle_id, { driveCount: r.drive_count, distanceM: Number(r.distance_m), maxSpeedKmh: r.max_speed_kmh });
  }
  // Sans la migration 0028, la classe se calcule avec un 0-100 estimé.
  if (out.size) {
    const best = await supabase.rpc('vehicle_best_0_100', { p_vehicles: [...out.keys()] });
    for (const b of (best.data ?? []) as { vehicle_id: string; time_ms: number }[]) {
      const s = out.get(b.vehicle_id);
      if (s) s.best0to100Ms = b.time_ms;
    }
  }
  return out;
}
