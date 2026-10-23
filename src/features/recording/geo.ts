export type TrackPoint = {
  ts: number; // ms epoch
  lat: number;
  lng: number;
  altitude: number | null;
  speed: number | null; // m/s, fourni par le GPS
  accuracy: number | null; // m
};

const R = 6_371_000; // rayon terrestre en mètres
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distance en mètres entre deux points (formule de haversine). */
export function haversine(a: Pick<TrackPoint, 'lat' | 'lng'>, b: Pick<TrackPoint, 'lat' | 'lng'>) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Seuils du filtre « HotLap ignores weak GPS fixes » de la maquette. */
export const GPS_FILTER = {
  maxAccuracyM: 25, // on jette les fixes moins précis
  maxSpeedMs: 100, // 360 km/h : au-delà c'est un saut GPS, pas la voiture
  minMoveM: 2, // évite d'accumuler du bruit à l'arrêt
};

/** Renvoie vrai si le point doit être gardé, sachant le dernier point retenu. */
export function acceptPoint(prev: TrackPoint | undefined, next: TrackPoint) {
  if (next.accuracy != null && next.accuracy > GPS_FILTER.maxAccuracyM) return false;
  if (!prev) return true;
  const d = haversine(prev, next);
  const dt = (next.ts - prev.ts) / 1000;
  if (dt <= 0) return false;
  if (d / dt > GPS_FILTER.maxSpeedMs) return false;
  return d >= GPS_FILTER.minMoveM;
}

/**
 * Vitesse du point : celle du GPS, sinon (iOS renvoie -1 quand il ne la connaît pas) la vitesse
 * moyenne depuis le point précédent retenu.
 */
export function speedOf(prev: TrackPoint | undefined, p: TrackPoint): number | null {
  if (p.speed != null && p.speed >= 0 && p.speed <= GPS_FILTER.maxSpeedMs) return p.speed;
  if (!prev) return null;
  const dt = (p.ts - prev.ts) / 1000;
  return dt > 0 ? Math.min(haversine(prev, p) / dt, GPS_FILTER.maxSpeedMs) : null;
}

export type DriveStats = { distanceM: number; durationS: number; avgSpeedKmh: number; maxSpeedKmh: number };

export function computeStats(points: TrackPoint[], startedAt: number, now = Date.now()): DriveStats {
  let distanceM = 0;
  let maxSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    distanceM += haversine(points[i - 1], points[i]);
    const v = points[i].speed ?? 0;
    if (v <= GPS_FILTER.maxSpeedMs) maxSpeed = Math.max(maxSpeed, v);
  }
  const durationS = Math.max(0, Math.round((now - startedAt) / 1000));
  return {
    distanceM,
    durationS,
    avgSpeedKmh: durationS > 0 ? (distanceM / durationS) * 3.6 : 0,
    maxSpeedKmh: maxSpeed * 3.6,
  };
}

export function formatDuration(totalS: number) {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const formatKm = (m: number) => (m / 1000).toFixed(m < 10_000 ? 2 : 1);
