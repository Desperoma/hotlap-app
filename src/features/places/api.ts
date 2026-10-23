import { COUNTRIES } from '@/config';
import { supabase } from '@/lib/supabase';

import { placeSearchKey } from './normalize';

export type GeoCountry = { code: string; name: string };
export type GeoAdmin1 = { code: string; name: string };
export type GeoCity = {
  id: number; name: string; country_code: string; admin1_code: string | null; admin1_name: string | null;
  population: number; lat: number; lng: number;
};

let countriesCache: GeoCountry[] | null = null;
const admin1Cache = new Map<string, GeoAdmin1[]>();

/** Pays du référentiel GeoNames, complétés par la liste historique (saisie libre de la région et de la ville). */
export async function listCountries(): Promise<GeoCountry[]> {
  if (countriesCache) return countriesCache;
  const { data } = await supabase.from('geo_countries').select('code, name').order('name');
  const geo = (data ?? []) as GeoCountry[];
  const known = new Set(geo.map((c) => c.code));
  const merged = [...geo, ...COUNTRIES.filter((c) => !known.has(c.code)).map((c) => ({ code: c.code, name: c.name }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  if (geo.length) countriesCache = merged; // table vide (import pas encore fait) : on réessaiera
  return merged;
}

export async function listAdmin1(country: string): Promise<GeoAdmin1[]> {
  const hit = admin1Cache.get(country);
  if (hit) return hit;
  const { data, error } = await supabase.from('geo_admin1').select('code, name').eq('country_code', country).order('name');
  if (error) return [];
  const rows = (data ?? []) as GeoAdmin1[];
  if (rows.length) admin1Cache.set(country, rows);
  return rows;
}

/** Villes qui commencent par `query` (2 lettres minimum), les plus peuplées d'abord. */
export async function searchCities(query: string, opts: { country?: string | null; admin1?: string | null; limit?: number } = {}): Promise<GeoCity[]> {
  const q = placeSearchKey(query);
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('geo_search_cities', {
    p_query: q, p_country: opts.country ?? null, p_admin1: opts.admin1 ?? null, p_limit: opts.limit ?? 8,
  });
  if (error) return [];
  return (data ?? []) as GeoCity[];
}

/** Nom de la subdivision selon le pays (niveau admin1 de GeoNames). */
export function regionLabel(country: string | null | undefined): string {
  switch (country) {
    case 'US': case 'AU': case 'DE': case 'AT': return 'State';
    case 'CA': case 'NL': case 'BE': return 'Province';
    case 'CH': return 'Canton';
    case 'JP': return 'Prefecture';
    case 'AE': return 'Emirate';
    case 'GB': return 'Nation';
    default: return 'Region';
  }
}
