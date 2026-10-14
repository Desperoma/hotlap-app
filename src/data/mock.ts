import type { DriveFeedItem } from '@/lib/database.types';

/**
 * Données factices reprises de la maquette, utilisées tant que Supabase n'est pas branché.
 * Chaque écran les remplace par une requête quand la phase correspondante démarre.
 */
export type RouteSummary = {
  id: string;
  name: string;
  place: string;
  distanceKm: number;
  /** Meilleur score sur cette Route (pas de chrono sur route ouverte au lancement). */
  bestScore: number;
  color: string;
};

export const MY_ROUTES: RouteSummary[] = [
  { id: 'r1', name: 'Coastal Escape', place: 'Big Sur, CA', distanceKm: 3.2, bestScore: 612, color: '#3B82F6' },
  { id: 'r2', name: 'Mountain Pass Rally', place: 'Alps, CH', distanceKm: 8.5, bestScore: 845, color: '#8B5CF6' },
];

const base = { vehicle_id: null, route_id: null, circuit_id: null, lap_time_ms: null } as const;

/** Petit tracé sinueux autour d'un point, pour la carte des posts en mode démo. */
const squiggle = (lat: number, lng: number) =>
  Array.from({ length: 40 }, (_, i) => ({ latitude: lat + i * 0.0012, longitude: lng + Math.sin(i / 3) * 0.004 }));

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const FEED: DriveFeedItem[] = [
  {
    ...base, id: 'd1', owner_id: 'u1',
    score: 612, score_breakdown: { distance: 380, sinuosity: 182, elevation: 50 },
    title: 'Rotterdam Harbor Sprint',
    description: 'Empty roads, perfect weather. The e-tron handled the corners beautifully tonight.',
    started_at: ago(3), ended_at: ago(2), created_at: ago(2),
    distance_m: 45_200, duration_s: 42 * 60, avg_speed_kmh: 64, max_speed_kmh: null, max_lateral_g: 0.6,
    visibility: 'public', like_count: 24, comment_count: 3,
    author: { id: 'u1', username: 'nabil', display_name: 'Nabil Chebbane', avatar_url: null },
    vehicle: { make: 'Audi', model: 'A3 e-tron', year: 2017 },
    liked_by_me: true,
    path_preview: squiggle(51.9, 4.4),
  },
  {
    ...base, id: 'd2', owner_id: 'u2',
    score: 845, score_breakdown: { distance: 520, sinuosity: 245, elevation: 80 },
    title: 'Ardennes Morning Loop',
    description: 'Sunrise run through the forest roads before the traffic.',
    started_at: ago(6), ended_at: ago(5), created_at: ago(5),
    distance_m: 112_000, duration_s: 96 * 60, avg_speed_kmh: 70, max_speed_kmh: null, max_lateral_g: 0.8,
    visibility: 'public', like_count: 57, comment_count: 9,
    author: { id: 'u2', username: 'mitchell', display_name: 'Mitchell Van der Berg', avatar_url: null },
    vehicle: { make: 'Porsche', model: '911 GT3', year: 2022 },
    liked_by_me: false,
    path_preview: squiggle(50.2, 5.6),
  },
];
