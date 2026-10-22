/**
 * Types des tables Supabase, écrits à la main pour démarrer.
 * À remplacer par les types générés dès que le projet Supabase existe :
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
/** private < friends (abonnement réciproque) < followers (ceux qui me suivent) < public */
export type Visibility = 'private' | 'friends' | 'followers' | 'public';
/** open : on s'abonne librement ; approval : chaque abonnement est une demande à accepter */
export type FollowPolicy = 'open' | 'approval';
/** Qui voit le garage et la ville */
export type DetailsVisibility = 'public' | 'followers' | 'private';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  /** ISO yyyy-mm-dd */
  birth_date: string | null;
  /** Facultatif, non vérifié, privé */
  phone: string | null;
  /** ISO 3166-1 alpha-2, ex. FR */
  country_code: string | null;
  /** Département, région, Land… */
  region: string | null;
  home_city: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** null tant que l'onboarding n'est pas terminé */
  onboarded_at: string | null;
  follow_policy: FollowPolicy;
  details_visibility: DetailsVisibility;
  created_at: string;
}

/** Ce que les autres utilisateurs voient (vue public_profiles). */
export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'country_code' | 'home_city' | 'created_at' | 'follow_policy'
>;

export interface Vehicle {
  id: string;
  owner_id: string;
  /** null si la voiture a été saisie à la main */
  model_id: number | null;
  make: string;
  model: string;
  year: number | null;
  nickname: string | null;
  photo_url: string | null;
  is_primary: boolean;
  created_at: string;
}

/** Tronçon de route ouverte réutilisable par plusieurs drives. */
export interface Route {
  id: string;
  name: string;
  country_code: string | null;
  region: string | null;
  distance_m: number;
  sinuosity: number | null;
  /** Chrono autorisé (ex. autobahn sans limitation). Faux par défaut. */
  timing_enabled: boolean;
  is_verified: boolean;
}

/** Circuit réel ou route fermée. */
export interface Circuit {
  id: string;
  name: string;
  country_code: string | null;
  city: string | null;
  kind: 'track' | 'closed_road';
  lap_length_m: number | null;
}

export interface ScoreBreakdown {
  distance: number;
  sinuosity: number;
  elevation: number;
  /** uniquement circuit ou route à chrono autorisé */
  timing?: number;
}

export interface Drive {
  id: string;
  owner_id: string;
  vehicle_id: string | null;
  route_id: string | null;
  circuit_id: string | null;
  title: string;
  description: string | null;
  started_at: string;
  ended_at: string;
  distance_m: number;
  duration_s: number;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  max_lateral_g: number | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  score_version?: number | null;
  lap_time_ms: number | null;
  /** GeoJSON LineString renvoyé par la vue drives_geojson */
  path_geojson?: { type: 'LineString'; coordinates: [number, number][] } | null;
  visibility: Visibility;
  like_count: number;
  comment_count: number;
  created_at: string;
}

export interface DriveFeedItem extends Drive {
  author: Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year'> | null;
  liked_by_me: boolean;
  /** Aperçu du tracé (simplifié, sans les zones de confidentialité pour les autres). Vide si masqué. */
  /** Un tracé, ou plusieurs morceaux quand la zone privée du domicile le coupe */
  path_preview: { latitude: number; longitude: number }[] | { latitude: number; longitude: number }[][];
}
