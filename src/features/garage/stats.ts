import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Par véhicule de l'utilisateur connecté (fonction my_vehicle_stats, migration 0022). */
export type VehicleStats = { driveCount: number; distanceM: number; maxSpeedKmh: number | null };

export async function myVehicleStats(): Promise<Map<string, VehicleStats>> {
  const out = new Map<string, VehicleStats>();
  if (!isSupabaseConfigured) return out;
  const { data, error } = await supabase.rpc('my_vehicle_stats');
  if (error) throw error;
  for (const r of (data ?? []) as { vehicle_id: string; drive_count: number; distance_m: number; max_speed_kmh: number | null }[]) {
    out.set(r.vehicle_id, { driveCount: r.drive_count, distanceM: Number(r.distance_m), maxSpeedKmh: r.max_speed_kmh });
  }
  return out;
}
