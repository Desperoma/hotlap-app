/**
 * Télémétrie d'un drive (rapport du propriétaire) : à partir des points bruts (drive_points),
 * une série régulière d'échantillons avec vitesse, altitude, distance, temps, pente et accélération.
 * Fonctions pures, testées par scripts/telemetry.test.ts.
 */

export type RawPoint = { ts: number; lat: number; lng: number; altitude: number | null; speed: number | null };

export type Sample = {
  /** Secondes depuis le départ */
  t: number;
  /** Mètres depuis le départ */
  d: number;
  lat: number;
  lng: number;
  speedKmh: number;
  /** null si le GPS ne la donnait pas */
  altM: number | null;
  /** Pente en % (lissée), null sans altitude */
  gradePct: number | null;
  /** Accélération longitudinale en G (dérivée de la vitesse) */
  accelG: number;
};

export type TelemetrySummary = {
  maxSpeedKmh: number;
  avgMovingKmh: number;
  minAltM: number | null;
  maxAltM: number | null;
  climbM: number;
  maxAccelG: number;
  maxBrakeG: number;
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const MAX_MS = 100; // 360 km/h : au-delà, saut GPS
const G = 9.80665;

export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Moyenne glissante centrée (fenêtre impaire), en ignorant les null. */
function smooth(values: (number | null)[], win: number): (number | null)[] {
  const h = Math.floor(win / 2);
  return values.map((v, i) => {
    if (v == null) return null;
    let s = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(values.length - 1, i + h); j++) {
      const x = values[j];
      if (x != null) { s += x; n++; }
    }
    return n ? s / n : null;
  });
}

/**
 * Échantillons complets à partir des points bruts triés par temps. Vitesse : celle du GPS, sinon
 * distance / temps depuis le point précédent ; lissée sur 3 points pour retirer le bruit.
 */
export function buildSamples(raw: RawPoint[]): Sample[] {
  const pts = [...raw].sort((a, b) => a.ts - b.ts);
  if (pts.length === 0) return [];
  const t0 = pts[0].ts;
  let d = 0;
  const base = pts.map((p, i) => {
    const prev = pts[i - 1];
    const step = prev ? distM(prev, p) : 0;
    d += step;
    const dt = prev ? (p.ts - prev.ts) / 1000 : 0;
    let v = p.speed != null && p.speed >= 0 && p.speed <= MAX_MS ? p.speed : dt > 0 ? step / dt : 0;
    if (v > MAX_MS) v = MAX_MS;
    return { t: (p.ts - t0) / 1000, d, lat: p.lat, lng: p.lng, v, alt: p.altitude };
  });
  const v = smooth(base.map((b) => b.v), 3) as number[];
  const alt = smooth(base.map((b) => b.alt), 7);

  return base.map((b, i) => {
    // Pente et accélération sur ±3 points pour rester lisibles malgré la précision du GPS.
    const a = base[Math.max(0, i - 3)], c = base[Math.min(base.length - 1, i + 3)];
    const ia = Math.max(0, i - 3), ic = Math.min(base.length - 1, i + 3);
    const run = c.d - a.d;
    const rise = alt[ic] != null && alt[ia] != null ? alt[ic]! - alt[ia]! : null;
    const dt = c.t - a.t;
    return {
      t: b.t, d: b.d, lat: b.lat, lng: b.lng,
      speedKmh: v[i] * 3.6,
      altM: alt[i] == null ? null : Math.round(alt[i]! * 10) / 10,
      gradePct: rise != null && run > 20 ? Math.max(-30, Math.min(30, (rise / run) * 100)) : null,
      accelG: dt > 0 ? Math.max(-1.5, Math.min(1.5, (v[ic] - v[ia]) / dt / G)) : 0,
    };
  });
}

/** Garde au plus `max` échantillons répartis régulièrement (le premier et le dernier toujours). */
export function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max || max < 2) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

export function summarize(samples: Sample[]): TelemetrySummary {
  let maxSpeed = 0, moving = 0, movingDist = 0, climb = 0, maxAccel = 0, maxBrake = 0;
  let minAlt: number | null = null, maxAlt: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    maxSpeed = Math.max(maxSpeed, s.speedKmh);
    maxAccel = Math.max(maxAccel, s.accelG);
    maxBrake = Math.min(maxBrake, s.accelG);
    if (s.altM != null) {
      minAlt = minAlt == null ? s.altM : Math.min(minAlt, s.altM);
      maxAlt = maxAlt == null ? s.altM : Math.max(maxAlt, s.altM);
    }
    const p = samples[i - 1];
    if (p) {
      if (s.altM != null && p.altM != null && s.altM > p.altM) climb += s.altM - p.altM;
      if (s.speedKmh > 3) { moving += s.t - p.t; movingDist += s.d - p.d; }
    }
  }
  return {
    maxSpeedKmh: maxSpeed,
    avgMovingKmh: moving > 0 ? (movingDist / moving) * 3.6 : 0,
    minAltM: minAlt, maxAltM: maxAlt, climbM: climb,
    maxAccelG: maxAccel, maxBrakeG: -maxBrake,
  };
}

/** Indice de l'échantillon le plus proche d'un point de la carte. */
export function nearestIndex(samples: Sample[], p: { latitude: number; longitude: number }): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dLat = samples[i].lat - p.latitude, dLng = (samples[i].lng - p.longitude) * Math.cos(rad(p.latitude));
    const dd = dLat * dLat + dLng * dLng;
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

/** Couleur d'une vitesse relative à la vitesse max du drive : bleu (lent) → vert → jaune → rouge (rapide). */
export const SPEED_COLORS = ['#3B82F6', '#22C55E', '#C6F432', '#F59E0B', '#EF4444'] as const;
export function speedBucket(speedKmh: number, maxKmh: number): number {
  if (maxKmh <= 0) return 0;
  return Math.min(SPEED_COLORS.length - 1, Math.floor((speedKmh / maxKmh) * SPEED_COLORS.length));
}

/** Tronçons consécutifs de même couleur, pour dessiner le tracé coloré par la vitesse. */
export function speedSegments(samples: Sample[], maxKmh: number) {
  const segs: { color: string; coords: { latitude: number; longitude: number }[] }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const color = SPEED_COLORS[speedBucket(s.speedKmh, maxKmh)];
    const c = { latitude: s.lat, longitude: s.lng };
    const last = segs.at(-1);
    if (last && last.color === color) last.coords.push(c);
    else {
      // Le nouveau tronçon repart du dernier point du précédent : pas de trou dans le tracé.
      const prev = last?.coords.at(-1);
      segs.push({ color, coords: prev ? [prev, c] : [c] });
    }
  }
  return segs.filter((s) => s.coords.length >= 2);
}
