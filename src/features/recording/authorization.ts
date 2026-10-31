import * as Location from 'expo-location';

import { ageOn } from '@/features/onboarding/validation';
import type { Profile } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { t } from '@/i18n/core';
/**
 * Peut-on enregistrer un drive ICI ? (voir « Autorisation d'enregistrer » dans le doc de cadrage)
 *
 * 1. Position actuelle -> pays où se trouve le téléphone (géocodage inverse du système, gratuit).
 *    À défaut (hors ligne), le pays déclaré à l'onboarding.
 * 2. La base dit si la position est dans l'emprise d'un circuit référencé (contexte circuit / road)
 *    et applique l'âge minimum du pays pour ce contexte (table country_rules, fonction recording_context).
 */
export type RecordingContext = {
  allowed: boolean;
  context: 'road' | 'circuit';
  countryCode: string | null;
  circuitId: string | null;
  circuitName: string | null;
  minAge: number;
  userAge: number | null;
  ruleVerified: boolean;
  reason: 'ok' | 'under_min_age' | 'birth_date_missing';
};

export async function checkRecording(
  coords: { latitude: number; longitude: number },
  profile: Profile | null | undefined,
): Promise<RecordingContext> {
  let countryCode: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync(coords);
    countryCode = place?.isoCountryCode ?? null;
  } catch {
    // hors ligne ou géocodeur indisponible : la base retombera sur le pays du profil
  }

  if (!isSupabaseConfigured) return demoCheck(countryCode ?? profile?.country_code ?? null, profile);

  const { data, error } = await supabase
    .rpc('recording_context', { p_lat: coords.latitude, p_lng: coords.longitude, p_country_code: countryCode })
    .single();
  if (error || !data) throw error ?? new Error(t('Vérification impossible'));
  const r = data as {
    allowed: boolean; context: 'road' | 'circuit'; country_code: string | null; circuit_id: string | null; circuit_name: string | null;
    min_age: number; user_age: number | null; rule_verified: boolean; reason: RecordingContext['reason'];
  };
  return {
    allowed: r.allowed, context: r.context, countryCode: r.country_code, circuitId: r.circuit_id, circuitName: r.circuit_name,
    minAge: r.min_age, userAge: r.user_age, ruleVerified: r.rule_verified, reason: r.reason,
  };
}

/** Message affiché quand l'enregistrement est refusé. */
export function refusalMessage(c: RecordingContext) {
  if (c.reason === 'birth_date_missing') return t('Ajoute ta date de naissance dans ton profil pour enregistrer un drive.');
  const where = c.context === 'circuit' ? t('sur circuit{0}', c.circuitName ? ` (${c.circuitName})` : '') : t('sur route ouverte');
  return c.countryCode
    ? t('L’enregistrement {0} est réservé aux {1} ans et plus dans ce pays ({2}).', where, c.minAge, c.countryCode)
    : t('L’enregistrement {0} est réservé aux {1} ans et plus.', where, c.minAge);
}

// Mode démo : règle par défaut de la base (18 ans route et circuit), pas de circuits connus.
function demoCheck(countryCode: string | null, profile: Profile | null | undefined): RecordingContext {
  const minAge = 18;
  const userAge = profile?.birth_date ? ageOn(profile.birth_date) : null;
  return {
    allowed: userAge != null && userAge >= minAge,
    context: 'road', countryCode, circuitId: null, circuitName: null, minAge, userAge, ruleVerified: false,
    reason: userAge == null ? 'birth_date_missing' : userAge >= minAge ? 'ok' : 'under_min_age',
  };
}
