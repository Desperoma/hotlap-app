/**
 * Mode Sprint : temps en départ arrêté (0-100, 0-200 km/h, 500 m, 1 000 m, 2 000 m).
 *
 * Même algorithme que la fonction SQL public.sprint_times (migration 0024), qui fait foi : l'app
 * l'utilise pour l'affichage en direct et le récap, la base recalcule depuis drive_points.
 *
 * 1. Un run commence au dernier point arrêté (vitesse ≤ 2 km/h) suivi d'un point en mouvement.
 * 2. Il s'arrête quand la voiture s'arrête, ou ralentit de plus de 15 km/h sous la vitesse max du run.
 * 3. Chaque objectif est daté par interpolation linéaire entre deux points (GPS à 1 Hz : environ
 *    ±0,3 s de précision). On garde le meilleur temps de chaque objectif sur tout le drive.
 */

export type SprintKind = '0_100' | '0_200' | '500m' | '1000m' | '2000m';
export const SPRINTS: { kind: SprintKind; label: string; speedMs?: number; distM?: number; minMs: number }[] = [
  { kind: '0_100', label: '0-100 km/h', speedMs: 100 / 3.6, minMs: 1500 },
  { kind: '0_200', label: '0-200 km/h', speedMs: 200 / 3.6, minMs: 4000 },
  { kind: '500m', label: '500 m', distM: 500, minMs: 9000 },
  { kind: '1000m', label: '1 000 m', distM: 1000, minMs: 15000 },
  { kind: '2000m', label: '2 000 m', distM: 2000, minMs: 25000 },
];
export const sprintLabel = (k: string) => SPRINTS.find((s) => s.kind === k)?.label ?? k;

export const STOP_MS = 2 / 3.6;
export const BREAK_MS = 15 / 3.6;

export type SprintPoint = { ts: number; lat: number; lng: number; speed: number | null };
export type SprintResult = { kind: SprintKind; timeMs: number; exitSpeedKmh: number; startTs: number };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function dist(a: SprintPoint, b: SprintPoint) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Séries temps (s), vitesse (m/s, repli distance / temps) et distance cumulée (m). */
function series(points: SprintPoint[]) {
  const t: number[] = [], v: number[] = [], x: number[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const step = prev ? dist(prev, p) : 0;
    const dt = prev ? (p.ts - prev.ts) / 1000 : 0;
    t.push(p.ts / 1000);
    x.push((x[i - 1] ?? 0) + step);
    v.push(p.speed != null && p.speed >= 0 ? p.speed : dt > 0 ? step / dt : 0);
  });
  return { t, v, x };
}

export function detectSprints(points: SprintPoint[]): SprintResult[] {
  const { t, v, x } = series(points);
  const best = new Map<SprintKind, SprintResult>();
  let i = 0;
  while (i < t.length - 1) {
    if (!(v[i] <= STOP_MS && v[i + 1] > STOP_MS)) { i++; continue; }
    const s = i, t0 = t[s], x0 = x[s];
    let vmax = 0, j = s + 1;
    const done = new Set<SprintKind>();
    for (; j < t.length; j++) {
      if (v[j] <= STOP_MS || v[j] < vmax - BREAK_MS) break;
      vmax = Math.max(vmax, v[j]);
      const dt = t[j] - t[j - 1];
      for (const sp of SPRINTS) {
        if (done.has(sp.kind)) continue;
        let tc: number | null = null, exit = v[j];
        if (sp.speedMs != null && v[j - 1] < sp.speedMs && v[j] >= sp.speedMs) {
          tc = t[j - 1] + ((sp.speedMs - v[j - 1]) / (v[j] - v[j - 1])) * dt;
          exit = sp.speedMs;
        } else if (sp.distM != null && x[j - 1] - x0 < sp.distM && x[j] - x0 >= sp.distM) {
          const f = (sp.distM - (x[j - 1] - x0)) / (x[j] - x[j - 1]);
          tc = t[j - 1] + f * dt;
          exit = v[j - 1] + f * (v[j] - v[j - 1]);
        }
        if (tc == null) continue;
        done.add(sp.kind);
        const timeMs = Math.round((tc - t0) * 1000);
        if (timeMs < sp.minMs) continue; // physiquement improbable : saut GPS
        const prev = best.get(sp.kind);
        if (!prev || timeMs < prev.timeMs) {
          best.set(sp.kind, { kind: sp.kind, timeMs, exitSpeedKmh: Math.round(exit * 3.6 * 10) / 10, startTs: Math.round(t0 * 1000) });
        }
      }
    }
    i = Math.max(j, s + 1);
  }
  return SPRINTS.map((s) => best.get(s.kind)).filter((r): r is SprintResult => !!r);
}

/** État du mode sprint en direct (écran Live drive). */
export type SprintLive =
  | { phase: 'stop' }                          // rouler : il faut d'abord s'arrêter complètement
  | { phase: 'ready' }                         // arrêté : le chrono part au démarrage
  | { phase: 'running'; elapsedMs: number }
  | { phase: 'done' };
export function sprintLive(points: SprintPoint[], now = Date.now()): SprintLive {
  if (points.length === 0) return { phase: 'ready' };
  const { t, v } = series(points);
  const n = t.length - 1;
  if (v[n] <= STOP_MS) return { phase: 'ready' };
  // Remonte au départ du run en cours.
  let vmax = 0;
  for (let j = n; j >= 1; j--) {
    if (v[j - 1] <= STOP_MS) {
      for (let k = j; k <= n; k++) { if (v[k] < vmax - BREAK_MS) return { phase: 'done' }; vmax = Math.max(vmax, v[k]); }
      return { phase: 'running', elapsedMs: Math.max(0, now - t[j - 1] * 1000) };
    }
  }
  return { phase: 'stop' };
}

export function formatSprint(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(2)} s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}
