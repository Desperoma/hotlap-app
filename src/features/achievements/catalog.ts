import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { t } from '@/i18n/core';

/**
 * Textes et icônes des succès. L'XP, la métrique et le seuil viennent de la base
 * (table achievements, migration 0034) : les clés doivent correspondre (scripts/achievements.test.ts).
 */
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;
type Def = { icon: Icon; title: () => string; desc: () => string };

export const ACHIEVEMENTS: Record<string, Def> = {
  first_drive: { icon: 'flag-variant', title: () => t('First drive'), desc: () => t('Save your first drive.') },
  first_comment: { icon: 'comment-outline', title: () => t('Say something'), desc: () => t('Write your first comment.') },
  car_specs: { icon: 'car-wrench', title: () => t('Know your car'), desc: () => t('Fill in the power and weight of a car in your garage.') },
  follow_5: { icon: 'account-multiple-plus', title: () => t('In the paddock'), desc: () => t('Follow 5 drivers.') },
  distance_50: { icon: 'road-variant', title: () => t('Warm-up'), desc: () => t('Drive 50 km in total.') },
  crew_join: { icon: 'account-group', title: () => t('Squad up'), desc: () => t('Join a crew.') },
  drives_10: { icon: 'counter', title: () => t('Regular'), desc: () => t('Save 10 drives.') },
  first_session: { icon: 'flag-checkered', title: () => t('Track day'), desc: () => t('Complete a verified track session.') },
  likes_10: { icon: 'heart-outline', title: () => t('Crowd pleaser'), desc: () => t('Receive 10 likes on your drives.') },
  distance_250: { icon: 'map-marker-distance', title: () => t('Road tripper'), desc: () => t('Drive 250 km in total.') },
  sprint_0_100_10: { icon: 'speedometer-slow', title: () => t('Off the line'), desc: () => t('0-100 km/h in under 10 s in Sprint mode.') },
  drives_50: { icon: 'calendar-check', title: () => t('Committed'), desc: () => t('Save 50 drives.') },
  distance_1000: { icon: 'earth', title: () => t('Thousand club'), desc: () => t('Drive 1,000 km in total.') },
  circuit_speed_200: { icon: 'speedometer-medium', title: () => t('Double ton'), desc: () => t('Reach 200 km/h during a track drive.') },
  tracks_5: { icon: 'map-marker-multiple', title: () => t('Track hopper'), desc: () => t('Complete sessions on 5 different tracks.') },
  laps_100: { icon: 'rotate-right', title: () => t('Lap counter'), desc: () => t('Complete 100 timed laps.') },
  likes_100: { icon: 'heart-multiple', title: () => t('Fan favourite'), desc: () => t('Receive 100 likes on your drives.') },
  sprint_0_100_6: { icon: 'speedometer', title: () => t('Quick launch'), desc: () => t('0-100 km/h in under 6 s in Sprint mode.') },
  categories_all: { icon: 'shape', title: () => t('All-rounder'), desc: () => t('Drive a session in all 6 track categories.') },
  distance_10000: { icon: 'routes', title: () => t('Long hauler'), desc: () => t('Drive 10,000 km in total.') },
  tracks_25: { icon: 'map-legend', title: () => t('Circuit collector'), desc: () => t('Complete sessions on 25 different tracks.') },
  circuit_speed_300: { icon: 'rocket-launch-outline', title: () => t('Triple ton'), desc: () => t('Reach 300 km/h during a track drive.') },
  sprint_0_100_4: { icon: 'lightning-bolt', title: () => t('Catapult'), desc: () => t('0-100 km/h in under 4 s in Sprint mode.') },
  drives_365: { icon: 'calendar-star', title: () => t('Every day'), desc: () => t('Save 365 drives.') },
  distance_100000: { icon: 'earth-arrow-right', title: () => t('Around the world, twice'), desc: () => t('Drive 100,000 km in total.') },
  tracks_100: { icon: 'trophy-variant', title: () => t('Globetrotter'), desc: () => t('Complete sessions on 100 different tracks.') },
  circuit_speed_400: { icon: 'rocket', title: () => t('Hypercar'), desc: () => t('Reach 400 km/h during a track drive.') },
  sprint_0_100_25: { icon: 'flash', title: () => t('Warp speed'), desc: () => t('0-100 km/h in under 2.5 s in Sprint mode.') },
  sprint_0_200_7: { icon: 'flash-alert', title: () => t('Beyond physics'), desc: () => t('0-200 km/h in under 7 s in Sprint mode.') },
};

export const TIERS: Record<number, { label: () => string; color: string }> = {
  1: { label: () => t('Easy'), color: '#9CA3AF' },
  2: { label: () => t('Medium'), color: '#22C55E' },
  3: { label: () => t('Hard'), color: '#2F8CFF' },
  4: { label: () => t('Expert'), color: '#A63CF2' },
  5: { label: () => t('Legendary'), color: '#F5C542' },
};

/** Unité affichée sous la jauge, selon la métrique. */
export function formatMetric(metric: string, v: number): string {
  if (metric === 'distance_km') return `${Math.floor(v).toLocaleString()} km`;
  if (metric === 'circuit_top_speed') return `${Math.round(v)} km/h`;
  if (metric.startsWith('best_')) return `${v.toFixed(1)} s`;
  return `${Math.floor(v)}`;
}

/** Remplissage de la jauge, de 0 à 1. Pour un temps (plus bas = mieux) : seuil / meilleur temps. */
export function progressOf(a: { value: number | null; target: number; lowerIsBetter: boolean }): number {
  if (a.value == null || a.value <= 0) return 0;
  return Math.max(0, Math.min(1, a.lowerIsBetter ? a.target / a.value : a.value / a.target));
}
