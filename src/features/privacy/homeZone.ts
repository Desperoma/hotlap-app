import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { t } from '@/i18n/core';
/**
 * Zone privée autour du domicile (migration 0007).
 *
 * L'adresse est convertie en coordonnées SUR LE TÉLÉPHONE (géocodeur Apple / Google) ; seules
 * les coordonnées partent vers la base, qui n'en garde qu'un centre décalé au hasard (≤ 300 m)
 * et masque 1 300 m autour : le domicile est toujours à au moins 1 km du bord de la zone.
 * Ni l'adresse ni le point exact du domicile ne sont stockés.
 */
export const HOME_ZONE_MIN_M = 1000;

export type HomeZone = { enabled: boolean; lat: number; lng: number; radiusM: number };
export type Coords = { lat: number; lng: number };

/** Ce que l'utilisateur a saisi dans le formulaire. */
export type HomeZoneInput = { enabled: boolean; address: string; here: Coords | null };

let demoZone: HomeZone | null = null;

async function ensureForegroundPermission(reason: string) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error(reason);
}

/** Adresse -> coordonnées, sur le téléphone. */
export async function geocodeHome(address: string): Promise<Coords> {
  const q = address.trim();
  if (!q) throw new Error(t('Saisis ton adresse.'));
  // Android n'autorise le géocodage qu'avec la permission de localisation.
  if (Platform.OS === 'android') {
    await ensureForegroundPermission(t('Sur Android, retrouver une adresse demande l’accès à la localisation.'));
  }
  let results: Location.LocationGeocodedLocation[];
  try {
    results = await Location.geocodeAsync(q);
  } catch {
    throw new Error(t('Recherche d’adresse impossible pour l’instant. Réessaie dans un moment.'));
  }
  const r = results[0];
  if (!r) throw new Error(t('Adresse introuvable. Ajoute la ville ou le code postal.'));
  return { lat: r.latitude, lng: r.longitude };
}

/** Position actuelle, pour « Je suis chez moi ». */
export async function currentCoords(): Promise<Coords> {
  await ensureForegroundPermission('Autorise la localisation pour utiliser ta position actuelle.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

export async function fetchHomeZone(): Promise<HomeZone | null> {
  if (!isSupabaseConfigured) return demoZone;
  const { data, error } = await supabase.rpc('my_home_zone');
  if (error) throw error;
  const row = (data as { enabled: boolean; lat: number; lng: number; radius_m: number }[] | null)?.[0];
  return row ? { enabled: row.enabled, lat: row.lat, lng: row.lng, radiusM: row.radius_m } : null;
}

async function saveHomeZone(c: Coords) {
  if (!isSupabaseConfigured) {
    demoZone = { enabled: true, lat: c.lat, lng: c.lng, radiusM: 1300 };
    return;
  }
  const { error } = await supabase.rpc('set_home_zone', { p_lat: c.lat, p_lng: c.lng });
  if (error) throw error;
}

export async function setHomeZoneEnabled(enabled: boolean) {
  if (!isSupabaseConfigured) {
    if (demoZone) demoZone = { ...demoZone, enabled };
    return;
  }
  const { error } = await supabase.rpc('set_home_zone_enabled', { p_enabled: enabled });
  if (error) throw error;
}

export async function clearHomeZone() {
  if (!isSupabaseConfigured) {
    demoZone = null;
    return;
  }
  const { error } = await supabase.rpc('clear_home_zone');
  if (error) throw error;
}

/** Erreur à afficher avant d'envoyer, ou null si le formulaire est complet. */
export function homeZoneInputError(v: HomeZoneInput, hasZone: boolean): string | null {
  if (v.enabled && !v.here && !v.address.trim() && !hasZone) {
    return t('Indique ton adresse pour masquer tes drives autour de chez toi, ou désactive l’option.');
  }
  return null;
}

/**
 * Applique le formulaire. Nouvelle adresse ou position -> nouvelle zone (activée).
 * Option coupée -> la zone est gardée mais désactivée (réactivable sans ressaisir l'adresse) ;
 * à l'onboarding il n'y a encore rien à garder.
 */
export async function applyHomeZone(v: HomeZoneInput, hasZone: boolean) {
  if (!v.enabled) {
    if (hasZone) await setHomeZoneEnabled(false);
    return;
  }
  if (v.here || v.address.trim()) {
    await saveHomeZone(v.here ?? (await geocodeHome(v.address)));
    return;
  }
  if (hasZone) await setHomeZoneEnabled(true);
}
