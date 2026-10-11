import type { TrackPoint } from '@/features/recording/geo';
import { computeStats } from '@/features/recording/geo';
import { computeScore, SCORE_VERSION } from '@/features/scoring/score';
import type { Visibility } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type SaveDriveInput = {
  ownerId: string;
  vehicleId: string | null;
  /** Circuit sur lequel le drive a démarré (contexte renvoyé par recording_context) */
  circuitId?: string | null;
  title: string;
  description?: string;
  visibility: Visibility;
  startedAt: number;
  endedAt: number;
  points: TrackPoint[];
};

/**
 * Enregistre un drive terminé : une ligne dans drives (avec le tracé en WKT pour PostGIS)
 * puis les points bruts dans drive_points.
 */
export async function saveDrive(input: SaveDriveInput) {
  const stats = computeStats(input.points, input.startedAt, input.endedAt);
  // Pas de chrono ici : le drive n'est rattaché ni à un circuit ni à une Route chronométrée (phase V1).
  const { score, breakdown } = computeScore(input.points);
  if (!isSupabaseConfigured) return { id: `demo-${Date.now()}`, stats, score };

  const line = input.points.map((p) => `${p.lng} ${p.lat}`).join(',');
  const first = input.points[0];

  const { data, error } = await supabase
    .from('drives')
    .insert({
      owner_id: input.ownerId,
      vehicle_id: input.vehicleId,
      circuit_id: input.circuitId ?? null,
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility,
      started_at: new Date(input.startedAt).toISOString(),
      ended_at: new Date(input.endedAt).toISOString(),
      distance_m: Math.round(stats.distanceM),
      duration_s: stats.durationS,
      avg_speed_kmh: stats.avgSpeedKmh,
      max_speed_kmh: stats.maxSpeedKmh,
      score,
      score_breakdown: breakdown,
      score_version: SCORE_VERSION,
      path: input.points.length >= 2 ? `SRID=4326;LINESTRING(${line})` : null,
      start_point: first ? `SRID=4326;POINT(${first.lng} ${first.lat})` : null,
    })
    .select('id')
    .single();
  if (error) throw error;

  // Points bruts par paquets de 500 pour rester sous les limites de payload.
  for (let i = 0; i < input.points.length; i += 500) {
    const chunk = input.points.slice(i, i + 500).map((p) => ({
      drive_id: data.id,
      ts: new Date(p.ts).toISOString(),
      lat: p.lat,
      lng: p.lng,
      altitude: p.altitude,
      speed: p.speed,
      accuracy: p.accuracy,
    }));
    const { error: e } = await supabase.from('drive_points').insert(chunk);
    if (e) throw e;
  }
  return { id: data.id as string, stats, score };
}
