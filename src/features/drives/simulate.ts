import type { TrackPoint } from '@/features/recording/geo';

import type { PendingDrive } from './pending';

import { t } from '@/i18n/core';
/**
 * Drives simulés pour tester l'app sans rouler (émulateur, bureau, démo).
 * Visibles seulement si TEST_TOOLS : versions de développement (__DEV__) et builds EAS « preview »
 * (EXPO_PUBLIC_TEST_TOOLS=1 dans eas.json). Jamais dans les builds « beta » et « production ».
 *
 * Chaque drive est différent : un style de route (col, côte, campagne, forêt, ville), une longueur,
 * une orientation et un tirage aléatoire (graine) qui varient. La vitesse suit la route : freinage
 * avant les virages, accélération en sortie, arrêts en ville. 1 point GPS par seconde, avec bruit.
 * Les vitesses restent dans les limites légales françaises (90 km/h hors agglomération, 50 en ville).
 */
export const TEST_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_TEST_TOOLS === '1';

export type SimStyle = 'mountain' | 'coast' | 'country' | 'forest' | 'city';

export const SIM_STYLES: { value: SimStyle; label: string }[] = [
  { value: 'mountain', get label() { return t('Mountain pass'); } },
  { value: 'coast', get label() { return t('Coastal road'); } },
  { value: 'country', get label() { return t('Country road'); } },
  { value: 'forest', get label() { return t('Forest twisties'); } },
  { value: 'city', get label() { return t('City loop'); } },
];

/** Tronçon : longueur (m), virage total (°, + = gauche), dénivelé (m), arrêt à la fin (s). */
type Seg = { len: number; turn: number; climb: number; stopS?: number };

type StyleSpec = {
  vmaxKmh: number;
  /** Longueur totale visée (m) */
  length: [number, number];
  next: (r: Rng, i: number) => Seg[];
};

const STYLES: Record<SimStyle, StyleSpec> = {
  // Lacets en montée puis descente, épingles serrées
  mountain: {
    vmaxKmh: 70,
    length: [8_000, 18_000],
    next: (r, i) => {
      const up = i < 14 ? 1 : -1;
      return [
        { len: r.range(150, 550), turn: r.range(-15, 15), climb: up * r.range(12, 35) },
        { len: r.range(35, 60), turn: r.sign() * r.range(140, 175), climb: up * r.range(2, 6) },
      ];
    },
  },
  // Grandes courbes enchaînées, léger relief
  coast: {
    vmaxKmh: 90,
    length: [10_000, 25_000],
    next: (r) => [
      { len: r.range(150, 600), turn: r.range(-10, 10), climb: r.range(-8, 8) },
      { len: r.range(120, 300), turn: r.sign() * r.range(25, 75), climb: r.range(-6, 6) },
    ],
  },
  // Longues lignes droites, quelques virages, parfois un rond-point
  country: {
    vmaxKmh: 90,
    length: [12_000, 30_000],
    next: (r) => {
      const segs: Seg[] = [
        { len: r.range(500, 1600), turn: r.range(-6, 6), climb: r.range(-10, 10) },
        { len: r.range(80, 200), turn: r.sign() * r.range(20, 90), climb: r.range(-3, 3) },
      ];
      if (r.chance(0.2)) segs.push({ len: 40, turn: r.pick([90, -90, 0, 180]) + 360, climb: 0 }); // rond-point
      return segs;
    },
  },
  // S serrés, courtes lignes droites, relief marqué
  forest: {
    vmaxKmh: 80,
    length: [7_000, 16_000],
    next: (r) => [
      { len: r.range(60, 220), turn: r.range(-8, 8), climb: r.range(-15, 15) },
      { len: r.range(50, 110), turn: r.sign() * r.range(50, 120), climb: r.range(-5, 5) },
      { len: r.range(40, 100), turn: r.sign() * r.range(40, 100), climb: r.range(-5, 5) },
    ],
  },
  // Quadrillage, angles droits, feux rouges
  city: {
    vmaxKmh: 50,
    length: [4_000, 9_000],
    next: (r) => [
      { len: r.range(120, 450), turn: 0, climb: r.range(-2, 2), stopS: r.chance(0.35) ? r.range(10, 45) : undefined },
      { len: 15, turn: r.sign() * 90, climb: 0 },
    ],
  },
};

const A_LAT = 3.2; // accélération latérale confortable (m/s²)
const ACCEL = 2.2; // m/s²
const BRAKE = 3.5; // m/s²
const STEP = 2; // pas de calcul (m)

export function simulatedDrive(
  start: { lat: number; lng: number },
  vehicleId: string | null = null,
  opts: { style?: SimStyle; seed?: number; now?: number } = {},
): PendingDrive & { simulated: true; simStyle: SimStyle } {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const r = rng(seed);
  const style = opts.style ?? r.pick(SIM_STYLES.map((s) => s.value));
  const spec = STYLES[style];
  const limit = spec.vmaxKmh / 3.6;
  const vmax = limit * r.range(0.9, 0.97); // un conducteur roule un peu sous la limite
  const target = r.range(spec.length[0], spec.length[1]);

  // 1. Tronçons jusqu'à la longueur visée
  const segs: Seg[] = [];
  let total = 0;
  for (let i = 0; total < target; i++) {
    for (const s of spec.next(r, i)) {
      segs.push(s);
      total += s.len;
    }
  }

  // 2. Échantillons tous les STEP m : cap, altitude, vitesse max permise par la courbure
  type Sample = { x: number; y: number; z: number; vCap: number; stopS: number };
  const samples: Sample[] = [];
  let x = 0, y = 0, z = r.range(100, 900), heading = r.range(0, 2 * Math.PI);
  for (const s of segs) {
    const n = Math.max(1, Math.round(s.len / STEP));
    const dTurn = ((s.turn / n) * Math.PI) / 180;
    const radius = Math.abs(dTurn) > 1e-6 ? STEP / Math.abs(dTurn) : Infinity;
    const vCap = Math.min(vmax, Math.sqrt(A_LAT * radius));
    for (let k = 0; k < n; k++) {
      heading += dTurn;
      x += Math.cos(heading) * STEP;
      y += Math.sin(heading) * STEP;
      z += s.climb / n;
      samples.push({ x, y, z, vCap, stopS: k === n - 1 ? s.stopS ?? 0 : 0 });
    }
  }
  samples[samples.length - 1].vCap = 0; // arrivée à l'arrêt

  // 3. Profil de vitesse : freinage anticipé (passe arrière) puis accélération limitée (passe avant)
  const v = samples.map((s) => (s.stopS > 0 ? 0 : s.vCap));
  for (let i = v.length - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * BRAKE * STEP));
  let prev = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] = Math.min(v[i], Math.sqrt(prev ** 2 + 2 * ACCEL * STEP));
    prev = v[i];
  }

  // 4. Points GPS toutes les secondes
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((start.lat * Math.PI) / 180);
  const points: TrackPoint[] = [];
  const now = opts.now ?? Date.now();
  let t = 0;
  let nextEmit = 0;
  const emit = (s: Sample, speed: number) => {
    const acc = r.range(3, 9);
    points.push({
      ts: t,
      lat: start.lat + (s.y + r.gauss() * acc * 0.4) / mPerDegLat,
      lng: start.lng + (s.x + r.gauss() * acc * 0.4) / mPerDegLng,
      altitude: s.z + r.gauss() * 3,
      speed: Math.min(limit, Math.max(0, speed + r.gauss() * 0.3)),
      accuracy: acc,
    });
  };
  emit(samples[0], 0);
  for (let i = 1; i < samples.length; i++) {
    const avg = Math.max((v[i - 1] + v[i]) / 2, 0.8); // évite la division par 0 au démarrage
    t += (STEP / avg) * 1000;
    while (t >= nextEmit + 1000) {
      nextEmit += 1000;
      emit(samples[i], v[i]);
    }
    if (samples[i].stopS > 0) {
      // Feu rouge : on reste sur place
      for (let s = 0; s < samples[i].stopS; s++) {
        t += 1000;
        nextEmit += 1000;
        emit(samples[i], 0);
      }
    }
  }

  const durationMs = Math.round(t);
  const endedAt = now;
  const startedAt = endedAt - durationMs;
  for (const p of points) p.ts += startedAt;
  return { startedAt, endedAt, points, circuitId: null, circuitName: null, vehicleId, simulated: true, simStyle: style };
}

// --- Aléatoire reproductible -------------------------------------------------

type Rng = {
  next: () => number;
  range: (a: number, b: number) => number;
  sign: () => 1 | -1;
  chance: (p: number) => boolean;
  pick: <T>(arr: T[]) => T;
  gauss: () => number;
};

function rng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let q = Math.imul(s ^ (s >>> 15), 1 | s);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss: () => {
      const u = Math.max(next(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
  };
}

/**
 * Run Sprint simulé (outils de test) : arrêt de 5 s, accélération réaliste qui décroît avec la
 * vitesse (≈ 0-100 en 5 à 7 s), jusqu'à 2,2 km, puis freinage. Ligne droite, 1 point par seconde.
 * La base l'accepte hors circuit parce qu'il est marqué simulé, et l'exclut des classements des autres.
 */
export function simulatedSprint(start: { lat: number; lng: number }, vehicleId: string | null = null, now = Date.now()): PendingDrive {
  const r = rng(Math.floor(Math.random() * 2 ** 31));
  const a0 = r.range(5.2, 6.6); // m/s² au départ
  const heading = r.range(0, 2 * Math.PI);
  const points: PendingDrive['points'] = [];
  const startedAt = now - 120_000;
  let d = 0, v = 0, braking = false;
  for (let i = 0; i < 110; i++) {
    if (i >= 5) {
      if (d > 2200) braking = true;
      const a = braking ? -7 : a0 * Math.max(0.15, 1 - v / 85);
      const nv = Math.max(0, v + a);
      d += (v + nv) / 2; v = nv;
      if (braking && v === 0 && i > 10) break;
    }
    const dLat = (d * Math.cos(heading)) / 111_195;
    const dLng = (d * Math.sin(heading)) / (111_195 * Math.cos((start.lat * Math.PI) / 180));
    points.push({ ts: startedAt + i * 1000, lat: start.lat + dLat, lng: start.lng + dLng, altitude: 200, speed: v, accuracy: 4 });
  }
  return {
    startedAt, endedAt: points.at(-1)!.ts, points, circuitId: null, circuitName: null, vehicleId,
    simulated: true, simStyle: 'sprint', mode: 'sprint',
  };
}
