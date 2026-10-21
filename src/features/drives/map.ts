import { geojsonToPath, type LatLng } from './api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Données de l'onglet Map : un repère par drive (les miens, mon crew, mes amis) et,
 * au toucher, le tracé du drive. Règles de visibilité côté base (migration 0011) :
 * les tracés des autres sont privés de 1,6 km au départ et à l'arrivée.
 */
export type MapSource = 'me' | 'crew' | 'friend';

export type MapDrive = {
  id: string;
  ownerId: string;
  source: MapSource;
  title: string;
  startedAt: string;
  distanceM: number;
  durationS: number;
  score: number | null;
  coordinate: LatLng;
  author: { username: string; displayName: string | null; avatarUrl: string | null };
  vehicle: string | null;
};

type Row = {
  drive_id: string; owner_id: string; source: MapSource; title: string; started_at: string;
  distance_m: number; duration_s: number; score: number | null; lat: number; lng: number;
  username: string; display_name: string | null; avatar_url: string | null; vehicle: string | null;
};

export async function fetchMapDrives(limit = 200): Promise<MapDrive[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('map_drives', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.drive_id,
    ownerId: r.owner_id,
    source: r.source,
    title: r.title,
    startedAt: r.started_at,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    score: r.score,
    coordinate: { latitude: r.lat, longitude: r.lng },
    author: { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    vehicle: r.vehicle,
  }));
}

/** Tracé simplifié d'un drive visible (vide s'il n'est plus visible). */
export async function fetchDrivePath(driveId: string): Promise<LatLng[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('drive_path_previews', { p_drive_ids: [driveId] });
  if (error) throw error;
  const row = ((data ?? []) as { drive_id: string; path: unknown }[])[0];
  return row ? geojsonToPath(row.path) : [];
}
