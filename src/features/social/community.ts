import { FEED } from '@/data/mock';
import type { DriveFeedItem } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { feedCrews, feedFollowing, feedNearby, feedWorld, hydrate, type DriveCardRow } from './api';

/** Page Community (migration 0027) : source, catégorie, tri. */
export type FeedSource = 'world' | 'following' | 'crews';
export type FeedCategory = 'all' | 'performance' | 'road_trip' | 'laps' | '0_100' | '0_200' | '500m' | '1000m' | '2000m';
export type FeedSort = 'latest' | 'top' | 'nearby';

export const FEED_CATEGORIES: { key: FeedCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'performance', label: 'Performance' },
  { key: 'road_trip', label: 'Road trips' },
  { key: '0_100', label: '0-100 km/h' },
  { key: '0_200', label: '0-200 km/h' },
  { key: '500m', label: '500 m' },
  { key: '1000m', label: '1 000 m' },
  { key: '2000m', label: '2 000 m' },
  { key: 'laps', label: 'Laps' },
];

/** Temps mis en avant d'un post performance : rang mondial actuel et écart au précédent record de l'auteur. */
export type PostBadge = { kind: string; timeMs: number; exitKmh: number | null; rank: number | null; prevMs: number | null };

export type CommunityPost = DriveFeedItem & {
  mode: string; isSimulated: boolean; elevationGainM: number | null; badge: PostBadge | null;
  /** URLs signées (1 h) des 3 premières photos */
  photos: string[];
};

type Row = DriveCardRow & {
  mode: string; is_simulated: boolean; elevation_gain_m: number | null;
  badge_kind: string | null; badge_time_ms: number | null; badge_exit_kmh: number | null; badge_rank: number | null; badge_prev_ms: number | null;
};

export const PAGE = 20;

/**
 * Une page du fil. Tant que la migration 0027 n'est pas passée, retombe sur les anciens fils
 * (sans catégories ni Top) pour que l'app reste utilisable.
 */
export async function communityFeed(
  me: string, q: { source: FeedSource; category: FeedCategory; sort: FeedSort; lat?: number; lng?: number }, offset = 0,
): Promise<CommunityPost[]> {
  if (!isSupabaseConfigured) return offset ? [] : FEED.map((d) => toPost(d));
  const { data, error } = await supabase.rpc('community_feed', {
    p_source: q.source, p_category: q.category, p_sort: q.sort,
    p_lat: q.lat ?? null, p_lng: q.lng ?? null, p_limit: PAGE, p_offset: offset,
  });
  if (error) {
    if (!isMissingFunction(error)) throw error;
    return legacy(me, q, offset);
  }
  const rows = (data ?? []) as Row[];
  const [items, photos] = await Promise.all([hydrate(rows, me), firstPhotos(rows.map((r) => r.id))]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((d) => {
    const r = byId.get(d.id)!;
    return {
      ...d, mode: r.mode, isSimulated: r.is_simulated, elevationGainM: r.elevation_gain_m,
      badge: r.badge_kind && r.badge_time_ms != null
        ? { kind: r.badge_kind, timeMs: r.badge_time_ms, exitKmh: r.badge_exit_kmh, rank: r.badge_rank, prevMs: r.badge_prev_ms }
        : null,
      photos: photos.get(d.id) ?? [],
    };
  });
}

async function legacy(me: string, q: { source: FeedSource; sort: FeedSort; lat?: number; lng?: number }, offset: number) {
  // Les anciens fils paginent par date : on ne sait pas reprendre à un décalage, une seule page.
  if (offset) return [];
  const list = q.sort === 'nearby'
    ? (q.lat != null && q.lng != null ? await feedNearby(me, q.lat, q.lng) : [])
    : q.source === 'following' ? await feedFollowing(me) : q.source === 'crews' ? await feedCrews(me) : await feedWorld(me);
  return list.map((d) => toPost(d));
}

const toPost = (d: DriveFeedItem): CommunityPost => ({
  ...d, mode: d.lap_time_ms != null ? 'circuit' : 'free', isSimulated: false, elevationGainM: null,
  badge: d.lap_time_ms != null ? { kind: 'lap', timeMs: d.lap_time_ms, exitKmh: null, rank: null, prevMs: null } : null,
  photos: [],
});

const isMissingFunction = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /community_feed|function .* does not exist/i.test(e.message ?? '');

/** 3 photos max par post, signées en un seul appel. Les drives non visibles sont filtrés par RLS. */
async function firstPhotos(driveIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (driveIds.length === 0) return out;
  const { data, error } = await supabase.from('drive_media').select('drive_id, storage_path, position')
    .in('drive_id', driveIds).eq('type', 'photo').order('position');
  if (error || !data?.length) return out;
  const keep = new Map<string, string[]>();
  for (const m of data as { drive_id: string; storage_path: string }[]) {
    const l = keep.get(m.drive_id) ?? [];
    if (l.length < 3) { l.push(m.storage_path); keep.set(m.drive_id, l); }
  }
  const paths = [...keep.values()].flat();
  const signed = await supabase.storage.from('drive-media').createSignedUrls(paths, 3600);
  if (signed.error) return out;
  const urlByPath = new Map(signed.data.map((s) => [s.path, s.signedUrl]));
  for (const [id, l] of keep) out.set(id, l.map((p) => urlByPath.get(p)).filter((u): u is string => !!u));
  return out;
}

export type Trending = {
  key: 'sprint_0_100' | 'sprint_500m' | 'route_week'; driveId: string; userId: string; name: string; avatarUrl: string | null;
  car: string | null; timeMs: number | null; distanceM: number | null; likes: number; thisWeek: boolean;
};

export async function communityTrending(): Promise<Trending[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('community_trending');
  if (error) return [];
  return ((data ?? []) as {
    key: Trending['key']; drive_id: string; user_id: string; username: string; display_name: string | null; avatar_url: string | null;
    make: string | null; model: string | null; time_ms: number | null; distance_m: number | null; like_count: number; this_week: boolean;
  }[]).map((r) => ({
    key: r.key, driveId: r.drive_id, userId: r.user_id, name: r.display_name ?? r.username, avatarUrl: r.avatar_url,
    car: r.make ? `${r.make} ${r.model ?? ''}`.trim() : null, timeMs: r.time_ms, distanceM: r.distance_m,
    likes: r.like_count, thisWeek: r.this_week,
  }));
}
