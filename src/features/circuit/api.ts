import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { geoToRings, type Lap, type LL } from './laps';

import { t } from '@/i18n/core';
/** Catégories de circuits (filtres et couleurs de la carte), migration 0026. */
export type CircuitCategory = 'racing' | 'dirt' | 'offroad' | 'drag' | 'karting' | 'drift';
export const CATEGORIES: { key: CircuitCategory; label: string; color: string; icon: string }[] = [
  { key: 'racing', get label() { return t('Racing circuit'); }, color: '#1E8BFF', icon: 'go-kart-track' },
  { key: 'dirt', get label() { return t('Dirt / Rally'); }, color: '#F04444', icon: 'road-variant' },
  { key: 'offroad', get label() { return t('Off-road'); }, color: '#22C55E', icon: 'terrain' },
  { key: 'drag', get label() { return t('Drag strip'); }, color: '#A855F7', icon: 'road' },
  { key: 'karting', get label() { return t('Karting'); }, color: '#F5B814', icon: 'go-kart' },
  { key: 'drift', get label() { return t('Drift'); }, color: '#EC4899', icon: 'car-traction-control' },
];
export const categoryOf = (k: string | null | undefined) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[0];

export type CircuitDetail = {
  id: string; name: string; city: string | null; countryCode: string | null; kind: string; category: CircuitCategory;
  lapLengthM: number | null; website: string | null;
  path: LL[][]; area: LL[][]; startLine: [LL, LL] | null; pathSource: 'osm' | 'drive' | 'manual' | null;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
};

export async function getCircuit(id: string): Promise<CircuitDetail | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('circuit_detail', { p_id: id });
  if (error) throw error;
  const r = ((data ?? []) as {
    id: string; name: string; city: string | null; country_code: string | null; kind: string; category: CircuitCategory;
    lap_length_m: number | null; website: string | null; path: unknown; area: unknown; start_line: unknown;
    path_source: 'osm' | 'drive' | 'manual' | null; min_lat: number | null; min_lng: number | null; max_lat: number | null; max_lng: number | null;
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
  if (m.includes('circuit_start_outside')) return new Error(t('Le drive n’a pas démarré sur le circuit : les tours ne sont pas chronométrés.'));
  if (m.includes('circuit_mode_required')) return new Error(t('Ce drive n’a pas été lancé depuis un circuit.'));
  return new Error(m);
}

/** Comptes dev (migration 0029) : remplace le tracé d'un circuit (null : l'efface, il sera réappris). */
export async function devSetCircuitPath(id: string, points: LL[] | null) {
  const { error } = await supabase.rpc('dev_set_circuit_path', {
    p_circuit: id, p_points: points ? points.map((p) => [Number(p.longitude.toFixed(7)), Number(p.latitude.toFixed(7))]) : null,
  });
  if (error) throw new Error(error.message.includes('dev_only') ? t('Réservé aux comptes développeurs.') : error.message);
}

/** Comptes dev (migration 0032) : catégorie d'un circuit. */
export async function devSetCircuitCategory(id: string, category: CircuitCategory) {
  const { error } = await supabase.rpc('dev_set_circuit_category', { p_circuit: id, p_category: category });
  if (error) throw new Error(error.message);
}

/** Comptes dev (migration 0032) : nouveau circuit au point touché, emprise de 400 m. Renvoie son id. */
export async function devCreateCircuit(name: string, category: CircuitCategory, at: LL): Promise<string> {
  const { data, error } = await supabase.rpc('dev_create_circuit', { p_name: name, p_category: category, p_lat: at.latitude, p_lng: at.longitude });
  if (error) throw new Error(error.message.includes('dev_only') ? t('Réservé aux comptes développeurs.') : error.message);
  return data as string;
}
