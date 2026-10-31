import { geojsonToPath, type LatLng } from './api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Données de l'onglet Map : un repère par drive (les miens, mon crew, mes amis) et,
 * au toucher, le tracé du drive. Règles de visibilité côté base (migrations 0011, 0013, 0014) :
 * les tracés des autres sont privés de leur zone autour du domicile, et le repère est leur
 * premier point visible.
 */
export type MapSource = 'me' | 'crew' | 'friend' | 'public';

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
  return ((data ?? []) as Row[]).map(toMapDrive);
}

/** Zone affichée de la carte. */
export type BBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/** Drives publics dont le premier point visible est dans la zone (les mieux notés d'abord). */
export async function fetchPublicDrives(b: BBox, limit = 200): Promise<MapDrive[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('map_public_drives', {
    p_min_lat: b.minLat, p_min_lng: b.minLng, p_max_lat: b.maxLat, p_max_lng: b.maxLng, p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toMapDrive);
}

export type MapCircuit = {
  id: string; name: string; city: string | null; countryCode: string | null; kind: string;
  lapLengthM: number | null; coordinate: LatLng;
  /** Migration 0026 : catégorie, tracé et emprise connus */
  category: string; hasPath: boolean; hasArea: boolean;
};

type CircuitRow = {
  id: string; name: string; city: string | null; country_code: string | null; kind: string;
  lap_length_m: number | null; lat: number; lng: number; category?: string; has_path?: boolean; has_area?: boolean;
};
const toMapCircuit = (c: CircuitRow): MapCircuit => ({
  id: c.id, name: c.name, city: c.city, countryCode: c.country_code, kind: c.kind, lapLengthM: c.lap_length_m,
  coordinate: { latitude: c.lat, longitude: c.lng },
  category: c.category ?? (c.kind === 'karting' ? 'karting' : 'racing'), hasPath: !!c.has_path, hasArea: !!c.has_area,
});

/**
 * Circuits autour d'un point (centre de l'écran), les plus proches d'abord : rayon plafonné à
 * 2 000 km et 200 repères au plus (migration 0033). Repli sur l'ancienne recherche par zone.
 */
export async function fetchCircuitsNear(center: LatLng, radiusM: number): Promise<MapCircuit[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('map_circuits_near', {
    p_lat: center.latitude, p_lng: center.longitude, p_radius_m: Math.round(radiusM), p_limit: 200,
  });
  if (!error) return ((data ?? []) as CircuitRow[]).map(toMapCircuit);
  const dLat = radiusM / 111_000, dLng = dLat / Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  return fetchMapCircuits({
    minLat: center.latitude - dLat, maxLat: center.latitude + dLat, minLng: center.longitude - dLng, maxLng: center.longitude + dLng,
  });
}

export async function fetchMapCircuits(b: BBox): Promise<MapCircuit[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('map_circuits', {
    p_min_lat: b.minLat, p_min_lng: b.minLng, p_max_lat: b.maxLat, p_max_lng: b.maxLng, p_limit: 300,
  });
  if (error) throw error;
  return ((data ?? []) as {
    id: string; name: string; city: string | null; country_code: string | null; kind: string;
    lap_length_m: number | null; lat: number; lng: number; category?: string; has_path?: boolean; has_area?: boolean;
  }[]).map((c) => ({
    id: c.id, name: c.name, city: c.city, countryCode: c.country_code, kind: c.kind, lapLengthM: c.lap_length_m,
    coordinate: { latitude: c.lat, longitude: c.lng },
    category: c.category ?? (c.kind === 'karting' ? 'karting' : 'racing'), hasPath: !!c.has_path, hasArea: !!c.has_area,
  }));
}

function toMapDrive(r: Row): MapDrive {
  return {
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
  };
}

/** Tracé simplifié d'un drive visible, en morceaux si la zone privée le coupe (vide s'il n'est plus visible). */
export async function fetchDrivePath(driveId: string): Promise<LatLng[][]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('drive_path_previews', { p_drive_ids: [driveId] });
  if (error) throw error;
  const row = ((data ?? []) as { drive_id: string; path: unknown }[])[0];
  return row ? geojsonToPath(row.path) : [];
}
