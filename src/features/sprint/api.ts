import type { ClassKey } from '@/features/garage/hpi';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { detectSprints, type SprintKind, type SprintPoint } from './sprint';

/** Sprints et classements (migration 0024). */
export type DriveSprint = { kind: SprintKind; timeMs: number; exitSpeedKmh: number | null };

// Mode démo : les sprints sont calculés sur le téléphone et gardés en mémoire.
const demo = new Map<string, DriveSprint[]>();

/** Après la sauvegarde d'un drive Sprint : la base calcule et enregistre les temps. */
export async function recordDriveSprints(driveId: string, points: SprintPoint[]): Promise<DriveSprint[]> {
  if (!isSupabaseConfigured) {
    const r = detectSprints(points).map((s) => ({ kind: s.kind, timeMs: s.timeMs, exitSpeedKmh: s.exitSpeedKmh }));
    demo.set(driveId, r);
    return r;
  }
  const { data, error } = await supabase.rpc('record_drive_sprints', { p_drive: driveId });
  if (error) throw sprintError(error);
  return ((data ?? []) as { kind: SprintKind; time_ms: number; exit_speed_kmh: number | null }[])
    .map((r) => ({ kind: r.kind, timeMs: r.time_ms, exitSpeedKmh: r.exit_speed_kmh }));
}

export async function listDriveSprints(driveId: string): Promise<DriveSprint[]> {
  if (!isSupabaseConfigured) return demo.get(driveId) ?? [];
  const { data, error } = await supabase.from('sprint_results').select('kind, time_ms, exit_speed_kmh').eq('drive_id', driveId);
  if (error) return [];
  const order: SprintKind[] = ['0_100', '0_200', '500m', '1000m', '2000m'];
  return ((data ?? []) as { kind: SprintKind; time_ms: number; exit_speed_kmh: number | null }[])
    .map((r) => ({ kind: r.kind, timeMs: r.time_ms, exitSpeedKmh: r.exit_speed_kmh }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export type LeaderScope = 'world' | 'country' | 'friends' | 'crews' | 'model';
export type LeaderRow = {
  rank: number; userId: string; username: string; displayName: string | null; avatarUrl: string | null;
  car: string | null; make: string | null; model: string | null; timeMs: number; exitSpeedKmh: number | null; driveId: string; achievedAt: string;
  isMe: boolean; isSimulated: boolean;
  /** Classe du véhicule (HPI, migration 0029) */
  hpi: number | null; cls: ClassKey | null;
  /** Classement Score : points et distance du drive */
  score?: number; distanceM?: number;
};
type Row = {
  rank: number; user_id: string; username: string; display_name: string | null; avatar_url: string | null;
  make: string | null; model: string | null; time_ms: number; exit_speed_kmh?: number | null; drive_id: string;
  achieved_at: string; is_me: boolean; is_simulated?: boolean; hpi?: number | null; cls?: ClassKey | null;
};
const toRow = (r: Row): LeaderRow => ({
  rank: r.rank, userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url,
  car: r.make ? `${r.make} ${r.model ?? ''}`.trim() : null, make: r.make, model: r.model, timeMs: r.time_ms, exitSpeedKmh: r.exit_speed_kmh ?? null,
  driveId: r.drive_id, achievedAt: r.achieved_at, isMe: r.is_me, isSimulated: !!r.is_simulated,
  hpi: r.hpi ?? null, cls: r.cls ?? null,
});

/**
 * Builds de test (Expo Go via update:go, HotLap Test) : les drives simulés des autres apparaissent
 * aussi, marqués TEST (migration 0030). L'app publiée ne montre que les vrais drives.
 */
export const INCLUDE_TEST_DRIVES = __DEV__ || process.env.EXPO_PUBLIC_TEST_TOOLS === '1';

/** Appel d'un classement ; si la base n'a pas encore la migration 0030, sans les drives de test. */
async function board(fn: string, args: Record<string, unknown>) {
  if (INCLUDE_TEST_DRIVES) {
    const r = await supabase.rpc(fn, { ...args, p_include_sim: true });
    if (!r.error || !/p_include_sim|function|PGRST202/i.test(`${r.error.code} ${r.error.message}`)) return r;
  }
  return supabase.rpc(fn, args);
}

export type LeaderFilter = { scope: LeaderScope; country?: string | null; vehicleId?: string | null; cls?: ClassKey | null };

export async function leaderboardSprint(kind: SprintKind, f: LeaderFilter): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await board('leaderboard_sprint', {
    p_kind: kind, p_scope: f.scope, p_country: f.country ?? null, p_vehicle: f.vehicleId ?? null, p_limit: 50, ...(f.cls ? { p_class: f.cls } : {}),
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toRow);
}

export async function leaderboardLaps(circuitId: string, f: LeaderFilter): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await board('leaderboard_laps', {
    p_circuit: circuitId, p_scope: f.scope, p_country: f.country ?? null, p_vehicle: f.vehicleId ?? null, p_limit: 50, ...(f.cls ? { p_class: f.cls } : {}),
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toRow);
}

/** Meilleur score sur route ouverte, toutes voitures confondues (migration 0025). */
export async function leaderboardScore(f: LeaderFilter): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await board('leaderboard_score', { p_scope: f.scope, p_country: f.country ?? null, p_limit: 50, ...(f.cls ? { p_class: f.cls } : {}) });
  if (error) throw error;
  return ((data ?? []) as (Omit<Row, 'time_ms'> & { score: number; distance_m: number })[])
    .map((r) => ({ ...toRow({ ...r, time_ms: 0 }), score: r.score, distanceM: r.distance_m }));
}

export type LapCircuit = { id: string; name: string; city: string | null; countryCode: string | null; laps: number };
export async function circuitsWithLaps(): Promise<LapCircuit[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('circuits_with_laps', { p_limit: 50 });
  if (error) return [];
  return ((data ?? []) as { id: string; name: string; city: string | null; country_code: string | null; laps: number }[])
    .map((c) => ({ id: c.id, name: c.name, city: c.city, countryCode: c.country_code, laps: c.laps }));
}

function sprintError(error: { message: string }) {
  const m = error.message;
  if (m.includes('sprint_place_not_allowed')) return new Error('Le chrono Sprint n’est accepté que sur circuit ou sur une route chronométrée validée.');
  if (m.includes('sprint_mode_required')) return new Error('Ce drive n’a pas été enregistré en mode Sprint.');
  return new Error(m);
}
