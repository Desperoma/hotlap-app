import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { geoToRings, type Lap, type LL } from './laps';

/** Catégories de circuits (filtres et couleurs de la carte), migration 0026. */
export type CircuitCategory = 'racing' | 'dirt' | 'offroad' | 'drag' | 'karting' | 'drift';
export const CATEGORIES: { key: CircuitCategory; label: string; color: string; icon: string }[] = [
  { key: 'racing', label: 'Racing circuit', color: '#1E8BFF', icon: 'go-kart-track' },
  { key: 'dirt', label: 'Dirt / Rally', color: '#F04444', icon: 'road-variant' },
  { key: 'offroad', label: 'Off-road', color: '#22C55E', icon: 'terrain' },
  { key: 'drag', label: 'Drag strip', color: '#A855F7', icon: 'road' },
  { key: 'karting', label: 'Karting', color: '#F5B814', icon: 'go-kart' },
  { key: 'drift', label: 'Drift', color: '#EC4899', icon: 'car-traction-control' },
];
export const categoryOf = (k: string | null | undefined) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[0];

export type CircuitDetail = {
  id: string; name: string; city: string | null; countryCode: string | null; kind: string; category: CircuitCategory;
  lapLengthM: number | null; website: string | null;
  path: LL[][]; area: LL[][]; startLine: [LL, LL] | null; pathSource: 'osm' | 'drive' | null;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
};

export async function getCircuit(id: string): Promise<CircuitDetail | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('circuit_detail', { p_id: id });
  if (error) throw error;
  const r = ((data ?? []) as {
    id: string; name: string; city: string | null; country_code: string | null; kind: string; category: CircuitCategory;
    lap_length_m: number | null; website: string | null; path: unknown; area: unknown; start_line: unknown;
    path_source: 'osm' | 'drive' | null; min_lat: number | null; min_lng: number | null; max_lat: number | null; max_lng: number | null;
  }[])[0];
  if (!r) return null;
  const line = geoToRings(r.start_line)[0];
  return {
    id: r.id, name: r.name, city: r.city, countryCode: r.country_code, kind: r.kind, category: r.category,
    lapLengthM: r.lap_length_m, website: r.website,
    path: geoToRings(r.path), area: geoToRings(r.area),
    startLine: line && line.length >= 2 ? [line[0], line[line.length - 1]] : null,
    pathSource: r.path_source,
    bounds: r.min_lat != null && r.min_lng != null && r.max_lat != null && r.max_lng != null
      ? { minLat: r.min_lat, minLng: r.min_lng, maxLat: r.max_lat, maxLng: r.max_lng } : null,
  };
}

/** Après la sauvegarde d'un drive sur circuit : la base calcule les tours (record_drive_laps). */
export async function recordDriveLaps(driveId: string): Promise<Lap[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('record_drive_laps', { p_drive: driveId });
  if (error) throw lapError(error);
  return ((data ?? []) as { lap_no: number; time_ms: number; started_at: string }[])
    .map((l) => ({ lapNo: l.lap_no, timeMs: l.time_ms, startedAt: Date.parse(l.started_at) }));
}

export async function listDriveLaps(driveId: string): Promise<Lap[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('drive_laps').select('lap_no, time_ms, started_at').eq('drive_id', driveId).order('lap_no');
  if (error) return [];
  return ((data ?? []) as { lap_no: number; time_ms: number; started_at: string }[])
    .map((l) => ({ lapNo: l.lap_no, timeMs: l.time_ms, startedAt: Date.parse(l.started_at) }));
}

function lapError(error: { message: string }) {
  const m = error.message;
  if (m.includes('circuit_start_outside')) return new Error('Le drive n’a pas démarré sur le circuit : les tours ne sont pas chronométrés.');
  if (m.includes('circuit_mode_required')) return new Error('Ce drive n’a pas été lancé depuis un circuit.');
  return new Error(m);
}
