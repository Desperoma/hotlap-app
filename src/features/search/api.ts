import * as Location from 'expo-location';

import { hydrate, type DriveCardRow } from '@/features/social/api';
import type { DriveFeedItem } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type UserHit = { id: string; username: string; display_name: string | null; avatar_url: string | null; i_follow: boolean };
export type CircuitHit = {
  id: string; name: string; city: string | null; country_code: string | null; kind: string;
  lap_length_m: number | null; lat: number; lng: number;
};
export type PlaceHit = { key: string; label: string; detail: string | null; lat: number; lng: number };

const ready = (q: string) => isSupabaseConfigured && q.trim().length >= 2;

export async function searchDrives(q: string, me: string): Promise<DriveFeedItem[]> {
  if (!ready(q)) return [];
  const { data, error } = await supabase.rpc('search_drives', { p_query: q.trim(), p_limit: 20 });
  if (error) throw error;
  return hydrate((data ?? []) as DriveCardRow[], me);
}

export async function searchUsers(q: string): Promise<UserHit[]> {
  if (!ready(q)) return [];
  const { data, error } = await supabase.rpc('search_users', { p_query: q.trim(), p_limit: 20 });
  if (error) throw error;
  return (data ?? []) as UserHit[];
}

export async function searchCircuits(q: string): Promise<CircuitHit[]> {
  if (!ready(q)) return [];
  const { data, error } = await supabase.rpc('search_circuits', { p_query: q.trim(), p_limit: 10 });
  if (error) throw error;
  return (data ?? []) as CircuitHit[];
}

/**
 * Lieux (ville, adresse, route) via le géocodage du téléphone : rien n'est envoyé à HotLap.
 * Le libellé vient du géocodage inverse du premier résultat.
 */
export async function searchPlaces(q: string): Promise<PlaceHit[]> {
  if (q.trim().length < 3) return [];
  const results = await Location.geocodeAsync(q.trim()).catch(() => []);
  const hits = await Promise.all(results.slice(0, 3).map(async (r, i) => {
    const rev = i === 0 ? (await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude }).catch(() => []))[0] : undefined;
    const label = rev ? [rev.name, rev.city].filter((x, j, a) => x && a.indexOf(x) === j).join(', ') || q.trim() : q.trim();
    const detail = rev ? [rev.region, rev.country].filter(Boolean).join(', ') || null : `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}`;
    return { key: `${r.latitude},${r.longitude}`, label, detail, lat: r.latitude, lng: r.longitude };
  }));
  return hits.filter((h, i, a) => a.findIndex((x) => x.key === h.key) === i);
}
