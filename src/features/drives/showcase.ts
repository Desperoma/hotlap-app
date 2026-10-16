import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * Données de la vitrine d'un drive (récap et détail) : cartes de stats et carte de mode.
 * Règles : la vitesse moyenne n'est montrée qu'au propriétaire ; la vitesse max jamais.
 */
export type ShowcaseIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type ShowcaseStat = { key: string; icon: ShowcaseIcon; label: string; value: string; unit?: string };

export type ShowcaseInput = {
  durationS: number;
  distanceM: number;
  /** null si le spectateur n'est pas le propriétaire */
  avgSpeedKmh: number | null;
  score: number | null;
  maxLateralG: number | null;
  lapTimeMs: number | null;
  /** Disponibles au récap (calculés sur le téléphone), pas encore stockés en base */
  turns?: number;
  elevationChangeM?: number;
};

export function showcaseStats(d: ShowcaseInput): ShowcaseStat[] {
  const stats: ShowcaseStat[] = [];
  if (d.lapTimeMs != null) stats.push({ key: 'lap', icon: 'flag-checkered', label: 'Best Lap', value: formatLap(d.lapTimeMs) });
  stats.push({ key: 'time', icon: 'timer-outline', label: 'Time', ...formatTime(d.durationS) });
  stats.push({ key: 'distance', icon: 'map-marker-distance', label: 'Distance', ...formatDistance(d.distanceM) });
  if (d.avgSpeedKmh != null) {
    stats.push({ key: 'avg', icon: 'speedometer-medium', label: 'Avg. Speed', value: d.avgSpeedKmh < 100 ? d.avgSpeedKmh.toFixed(1) : String(Math.round(d.avgSpeedKmh)), unit: 'km/h' });
  }
  if (d.score != null) stats.push({ key: 'score', icon: 'trophy-outline', label: 'Score', value: String(d.score), unit: 'pts' });
  if (d.turns != null) stats.push({ key: 'turns', icon: 'routes', label: 'Turns', value: String(d.turns) });
  if (d.elevationChangeM != null) stats.push({ key: 'elev', icon: 'image-filter-hdr', label: 'Elevation', value: String(Math.round(d.elevationChangeM)), unit: 'm' });
  if (d.maxLateralG != null) stats.push({ key: 'g', icon: 'axis-arrow', label: 'Lateral G', value: d.maxLateralG.toFixed(2), unit: 'G' });
  return stats;
}

/** Valeur masquée pendant l'animation d'entrée : « 12.40 » -> « --.-- ». */
export const placeholderOf = (value: string) => value.replace(/\d/g, '-');

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'h' };
  return { value: `${m}:${String(sec).padStart(2, '0')}`, unit: 'min' };
}

function formatDistance(m: number) {
  if (m < 1000) return { value: String(Math.round(m)), unit: 'm' };
  return { value: (m / 1000).toFixed(m < 10_000 ? 2 : 1), unit: 'km' };
}

function formatLap(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

/**
 * En-tête de la vitrine : marque, modèle, catégorie. La catégorie (« Sports Car », « Hot Hatch »…)
 * viendra du catalogue ; en attendant : surnom du véhicule, sinon son année.
 */
export function vehicleHeading(
  v: { make: string; model: string; year: number | null; nickname?: string | null } | null | undefined,
  canPick: boolean,
) {
  if (!v) return { make: 'Garage', model: 'No car', category: canPick ? 'Tap + to choose one' : null };
  return { make: v.make, model: v.model, category: v.nickname || (v.year ? String(v.year) : null) };
}

/** Carte du bas : circuit ou route ouverte (les modes Sprint / chrono viendront plus tard). */
export const driveMode = (circuitName: string | null | undefined) =>
  circuitName ? { title: 'Circuit', subtitle: circuitName } : { title: 'Open road', subtitle: 'Free drive' };
