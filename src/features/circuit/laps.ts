/**
 * Tours sur circuit : ligne de départ et passages de ligne.
 *
 * Même calcul que les fonctions SQL public.circuit_start_line / perpendicular_line / lap_crossings
 * / record_drive_laps (migration 0026), qui font foi : l'app s'en sert pour l'affichage en direct
 * et la simulation, la base recalcule à la sauvegarde. Modifier les deux ensemble
 * (npm run laps:test).
 */

export type LL = { latitude: number; longitude: number };
export type LapPoint = { ts: number; lat: number; lng: number };
export type Lap = { lapNo: number; timeMs: number; startedAt: number };

const KY = 110_540;
const kx = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
export const HALF_LINE_M = 25;
const MIN_GAP_S = 10;
const MIN_LAP_MS = 15_000;
const MIN_LAP_M = 200;

/** Segment de 2 × half m centré sur p, perpendiculaire à la direction (dLat, dLng). */
export function perpendicularLine(p: LL, dLat: number, dLng: number, half = HALF_LINE_M): [LL, LL] | null {
  const k = kx(p.latitude);
  const ex = dLng * k, ey = dLat * KY;
  const n = Math.hypot(ex, ey);
  if (n < 1e-9) return null;
  const ox = (-ey / n) * half, oy = (ex / n) * half;
  return [
    { latitude: p.latitude - oy / KY, longitude: p.longitude - ox / k },
    { latitude: p.latitude + oy / KY, longitude: p.longitude + ox / k },
  ];
}

/** Longueur cumulée (degrés « plans » comme PostGIS en 4326) d'une polyligne. */
function cumulative(path: LL[]) {
  const c = [0];
  for (let i = 1; i < path.length; i++) {
    c.push(c[i - 1] + Math.hypot(path[i].latitude - path[i - 1].latitude, path[i].longitude - path[i - 1].longitude));
  }
  return c;
}

function interpolate(path: LL[], cum: number[], f: number): LL {
  const target = f * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (target - cum[i - 1]) / seg));
  return {
    latitude: path[i - 1].latitude + t * (path[i].latitude - path[i - 1].latitude),
    longitude: path[i - 1].longitude + t * (path[i].longitude - path[i - 1].longitude),
  };
}

/** Fraction (0-1) du point du tracé le plus proche de p (comme st_linelocatepoint, en degrés). */
function locate(path: LL[], cum: number[], p: LL): number {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.longitude - a.longitude, dy = b.latitude - a.latitude;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / len2)) : 0;
    const qx = a.longitude + t * dx, qy = a.latitude + t * dy;
    const d = (p.longitude - qx) ** 2 + (p.latitude - qy) ** 2;
    if (d < bestD) { bestD = d; best = cum[i - 1] + t * Math.sqrt(len2); }
  }
  return cum[cum.length - 1] ? best / cum[cum.length - 1] : 0;
}

/** Ligne de départ là où le drive démarre : perpendiculaire au tracé au point le plus proche. */
export function startLineOnPath(path: LL[], start: LL, half = HALF_LINE_M): [LL, LL] | null {
  if (path.length < 2) return null;
  const cum = cumulative(path);
  const f = locate(path, cum, start);
  const p = interpolate(path, cum, f);
  const a = interpolate(path, cum, Math.max(f - 0.002, 0));
  const b = interpolate(path, cum, Math.min(f + 0.002, 1));
  return perpendicularLine(p, b.latitude - a.latitude, b.longitude - a.longitude, half);
}

/** Circuit sans tracé : ligne au point de départ, perpendiculaire aux 30 premiers mètres du drive. */
export function startLineFromHeading(points: LapPoint[], half = HALF_LINE_M): [LL, LL] | null {
  const p0 = points[0];
  if (!p0) return null;
  const p1 = points.find((p) => Math.hypot((p.lat - p0.lat) * KY, (p.lng - p0.lng) * kx(p0.lat)) >= 30);
  if (!p1) return null;
  return perpendicularLine({ latitude: p0.lat, longitude: p0.lng }, p1.lat - p0.lat, p1.lng - p0.lng, half);
}

/** Instants (ms) des passages de ligne dans le sens de la course, à 10 s d'écart au moins. */
export function lapCrossings(points: LapPoint[], line: [LL, LL]): number[] {
  const lat0 = (line[0].latitude + line[1].latitude) / 2, lng0 = (line[0].longitude + line[1].longitude) / 2;
  const k = kx(lat0);
  const X = (lng: number) => (lng - lng0) * k, Y = (lat: number) => (lat - lat0) * KY;
  const ax = X(line[0].longitude), ay = Y(line[0].latitude), ux = X(line[1].longitude) - ax, uy = Y(line[1].latitude) - ay;
  const out: number[] = [];
  let dir = 0, last: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const x1 = X(points[i - 1].lng), y1 = Y(points[i - 1].lat), x2 = X(points[i].lng), y2 = Y(points[i].lat);
    const d1 = ux * (y1 - ay) - uy * (x1 - ax), d2 = ux * (y2 - ay) - uy * (x2 - ax);
    if (d1 === d2 || ((d1 > 0) === (d2 > 0) && d1 !== 0 && d2 !== 0)) continue;
    const s = d1 / (d1 - d2);
    const u = ((x1 + s * (x2 - x1) - ax) * ux + (y1 + s * (y2 - y1) - ay) * uy) / (ux * ux + uy * uy);
    if (u < 0 || u > 1 || s < 0 || s > 1) continue;
    const sg = Math.sign(d2 - d1);
    if (dir === 0) dir = sg;
    if (sg !== dir) continue;
    const t = points[i - 1].ts / 1000 + s * ((points[i].ts - points[i - 1].ts) / 1000);
    if (last != null && t - last < MIN_GAP_S) continue;
    last = t;
    out.push(t * 1000);
  }
  return out;
}

const dist = (a: LapPoint, b: LapPoint) => Math.hypot((b.lat - a.lat) * KY, (b.lng - a.lng) * kx(a.lat));

/** Tours complets (15 s et 200 m minimum) entre deux passages de ligne. */
export function detectLaps(points: LapPoint[], line: [LL, LL] | null): Lap[] {
  if (!line) return [];
  const cross = lapCrossings(points, line);
  const laps: Lap[] = [];
  for (let i = 1; i < cross.length; i++) {
    const from = cross[i - 1], to = cross[i];
    let d = 0;
    let prev: LapPoint | null = null;
    for (const p of points) {
      if (p.ts < from || p.ts > to) continue;
      if (prev) d += dist(prev, p);
      prev = p;
    }
    const ms = Math.round(to - from);
    if (ms >= MIN_LAP_MS && d >= MIN_LAP_M) laps.push({ lapNo: laps.length + 1, timeMs: ms, startedAt: from });
  }
  return laps;
}

/** État en direct : tours faits, tour en cours (depuis le dernier passage). */
export function liveLaps(points: LapPoint[], line: [LL, LL] | null, now = Date.now()) {
  const laps = detectLaps(points, line);
  const cross = line ? lapCrossings(points, line) : [];
  const best = laps.reduce<Lap | null>((b, l) => (!b || l.timeMs < b.timeMs ? l : b), null);
  return {
    laps, best, last: laps.at(-1) ?? null,
    currentMs: cross.length ? Math.max(0, now - cross[cross.length - 1]) : null,
    started: cross.length > 0,
  };
}

export const formatLap = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;

/** GeoJSON (LineString / Polygon / Multi*) → listes de coordonnées pour react-native-maps. */
export function geoToRings(g: unknown): LL[][] {
  const geo = g as { type?: string; coordinates?: unknown } | null;
  if (!geo?.type || !geo.coordinates) return [];
  const toLL = (c: number[]) => ({ latitude: c[1], longitude: c[0] });
  switch (geo.type) {
    case 'LineString': return [(geo.coordinates as number[][]).map(toLL)];
    case 'MultiLineString': return (geo.coordinates as number[][][]).map((l) => l.map(toLL));
    case 'Polygon': return [(geo.coordinates as number[][][])[0].map(toLL)];
    case 'MultiPolygon': return (geo.coordinates as number[][][][]).map((p) => p[0].map(toLL));
    default: return [];
  }
}
