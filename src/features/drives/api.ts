import { FEED } from '@/data/mock';
import type { TrackPoint } from '@/features/recording/geo';
import { computeStats } from '@/features/recording/geo';
import { computeScore, SCORE_VERSION } from '@/features/scoring/score';
import { removeDrivePhotos } from './media';
import type { PublicProfile, ScoreBreakdown, Vehicle, Visibility } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Colonnes de drives lisibles par l'app (migration 0002). max_speed_kmh, path et
 * start_point ne sont PAS lisibles directement : ne jamais faire select('*') sur drives.
 */
export const DRIVE_COLUMNS =
  'id, owner_id, vehicle_id, route_id, circuit_id, title, description, started_at, ended_at, ' +
  'distance_m, duration_s, avg_speed_kmh, max_lateral_g, score, score_breakdown, score_version, ' +
  'lap_time_ms, visibility, like_count, comment_count, created_at, is_simulated';

export type LatLng = { latitude: number; longitude: number };

export type DriveDetail = {
  id: string;
  ownerId: string;
  isMine: boolean;
  title: string;
  description: string | null;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationS: number;
  /** Visible du propriétaire uniquement */
  avgSpeedKmh: number | null;
  /** Visible du propriétaire uniquement, jamais affichée publiquement */
  maxSpeedKmh: number | null;
  maxLateralG: number | null;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  lapTimeMs: number | null;
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  author: Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
  vehicleId: string | null;
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year'> | null;
  circuitName: string | null;
  /** Drive simulé (outils de test), repérable pour être supprimé avant l'ouverture au public */
  isSimulated: boolean;
  /**
   * Tracé affichable, en un ou plusieurs morceaux : complet pour le propriétaire ; pour les autres,
   * sans la zone privée autour du domicile (un drive qui la traverse est coupé en deux).
   */
  path: LatLng[][];
};

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
  /** Drive simulé (outils de test) : drives.is_simulated */
  simulated?: boolean;
};

// Mode démo : les drives sauvegardés restent en mémoire pour pouvoir les rouvrir.
const demoDrives = new Map<string, DriveDetail>();

/**
 * Enregistre un drive terminé : une ligne dans drives (avec le tracé en WKT pour PostGIS)
 * puis les points bruts dans drive_points. Si l'envoi des points échoue, le drive est
 * supprimé pour ne pas laisser de drive sans points : l'utilisateur peut réessayer.
 */
export async function saveDrive(input: SaveDriveInput) {
  const stats = computeStats(input.points, input.startedAt, input.endedAt);
  // Pas de chrono ici : le drive n'est rattaché ni à un circuit chronométré ni à une Route chronométrée (phase V1).
  const { score, breakdown } = computeScore(input.points);

  if (!isSupabaseConfigured) {
    const id = `demo-${Date.now()}`;
    demoDrives.set(id, {
      id, ownerId: input.ownerId, isMine: true, title: input.title, description: input.description ?? null,
      startedAt: new Date(input.startedAt).toISOString(), endedAt: new Date(input.endedAt).toISOString(),
      distanceM: Math.round(stats.distanceM), durationS: stats.durationS, avgSpeedKmh: stats.avgSpeedKmh,
      maxSpeedKmh: stats.maxSpeedKmh, maxLateralG: null, score, scoreBreakdown: breakdown, lapTimeMs: null,
      visibility: input.visibility, likeCount: 0, commentCount: 0, author: null, vehicleId: input.vehicleId, vehicle: null, circuitName: null,
      isSimulated: !!input.simulated,
      path: [input.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))],
    });
    return { id, stats, score };
  }

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
      is_simulated: !!input.simulated,
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

  try {
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
  } catch (e) {
    await supabase.from('drives').delete().eq('id', data.id);
    throw e;
  }
  return { id: data.id as string, stats, score };
}

/** Détail d'un drive visible par l'utilisateur connecté, ou null s'il n'existe pas / n'est pas visible. */
export async function getDrive(id: string, me: string | undefined): Promise<DriveDetail | null> {
  if (!isSupabaseConfigured) return demoDrives.get(id) ?? demoFromFeed(id);

  const { data: d, error } = await supabase.from('drives').select(DRIVE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!d) return null;
  const row = d as unknown as DriveRow;
  const isMine = row.owner_id === me;

  const [author, vehicle, circuit, path, priv] = await Promise.all([
    supabase.from('public_profiles').select('id, username, display_name, avatar_url').eq('id', row.owner_id).maybeSingle(),
    row.vehicle_id
      ? supabase.from('vehicles').select('make, model, year').eq('id', row.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.circuit_id
      ? supabase.from('circuits').select('name').eq('id', row.circuit_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc('drive_path_public', { p_drive_id: id }),
    isMine ? supabase.rpc('my_drive_private', { p_drive_id: id }) : Promise.resolve({ data: null }),
  ]);

  return {
    id: row.id,
    ownerId: row.owner_id,
    isMine,
    title: row.title,
    description: row.description,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    avgSpeedKmh: isMine ? row.avg_speed_kmh : null,
    maxSpeedKmh: isMine ? ((priv.data as { max_speed_kmh: number | null }[] | null)?.[0]?.max_speed_kmh ?? null) : null,
    maxLateralG: row.max_lateral_g,
    score: row.score,
    scoreBreakdown: row.score_breakdown,
    lapTimeMs: row.lap_time_ms,
    visibility: row.visibility,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    author: author.data ?? null,
    vehicleId: row.vehicle_id,
    vehicle: vehicle.data ?? null,
    circuitName: (circuit.data as { name: string } | null)?.name ?? null,
    isSimulated: !!row.is_simulated,
    path: geojsonToPath(path.data),
  };
}

export async function updateDrive(
  id: string,
  patch: { title?: string; description?: string | null; visibility?: Visibility; vehicle_id?: string | null },
) {
  if (!isSupabaseConfigured) {
    const d = demoDrives.get(id);
    if (d) demoDrives.set(id, { ...d, ...patch, vehicleId: patch.vehicle_id !== undefined ? patch.vehicle_id : d.vehicleId });
    return;
  }
  const { error } = await supabase.from('drives').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDrive(id: string) {
  if (!isSupabaseConfigured) {
    demoDrives.delete(id);
    return;
  }
  await removeDrivePhotos(id);
  const { error } = await supabase.from('drives').delete().eq('id', id);
  if (error) throw error;
}

// --- Utilitaires -------------------------------------------------------------

type DriveRow = {
  id: string; owner_id: string; vehicle_id: string | null; circuit_id: string | null;
  title: string; description: string | null; started_at: string; ended_at: string;
  distance_m: number; duration_s: number; avg_speed_kmh: number | null; max_lateral_g: number | null;
  score: number | null; score_breakdown: ScoreBreakdown | null; lap_time_ms: number | null;
  visibility: Visibility; like_count: number; comment_count: number; is_simulated?: boolean;
};

/** GeoJSON LineString ou MultiLineString (tracé coupé par la zone privée) -> morceaux de tracé. */
export function geojsonToPath(g: unknown): LatLng[][] {
  const geo = g as { type?: string; coordinates?: unknown } | null;
  const toLine = (c: unknown): LatLng[] =>
    Array.isArray(c) ? (c as [number, number][]).map(([lng, lat]) => ({ latitude: lat, longitude: lng })) : [];
  if (!geo || !Array.isArray(geo.coordinates)) return [];
  const lines = geo.type === 'MultiLineString' ? (geo.coordinates as unknown[]).map(toLine) : [toLine(geo.coordinates)];
  return lines.filter((l) => l.length >= 2);
}

function demoFromFeed(id: string): DriveDetail | null {
  const f = FEED.find((d) => d.id === id);
  if (!f) return null;
  return {
    id: f.id, ownerId: f.owner_id, isMine: false, title: f.title, description: f.description,
    startedAt: f.started_at, endedAt: f.ended_at, distanceM: f.distance_m, durationS: f.duration_s,
    avgSpeedKmh: null, maxSpeedKmh: null, maxLateralG: f.max_lateral_g, score: f.score,
    scoreBreakdown: f.score_breakdown, lapTimeMs: f.lap_time_ms, visibility: f.visibility,
    likeCount: f.like_count, commentCount: f.comment_count, author: f.author, vehicleId: f.vehicle_id, vehicle: f.vehicle,
    circuitName: null, path: [], isSimulated: false,
  };
}
