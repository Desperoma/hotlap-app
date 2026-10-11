import { haversine, type TrackPoint } from '@/features/recording/geo';
import type { ScoreBreakdown } from '@/lib/database.types';

/**
 * Score d'un drive — voir « Score et chrono » dans le doc de cadrage.
 *
 * Formule de l'équipe (route ouverte), à rediscuter :
 *     S = distance(m) × |dénivelé moyen| + Σ (angle du virage / longueur du virage)
 *
 * Ce module calcule les trois ingrédients (distance, dénivelé, liste des virages) et deux scores :
 *   - teamFormula : la formule telle quelle, pour comparer ;
 *   - score       : une version normalisée et additive (proposition), utilisée par l'app.
 * Pourquoi une version normalisée : voir analyse dans le doc (unités incompatibles, route plate
 * à zéro, virages urbains et tours de parking qui gonflent la somme).
 *
 * Le calcul tourne sur le téléphone pour l'affichage immédiat ; il doit être refait côté serveur
 * (Edge Function) avant tout classement, pour qu'un score ne puisse pas être falsifié.
 */

/** À incrémenter à chaque changement de formule ou de pondération (colonne drives.score_version). */
export const SCORE_VERSION = 2;

export const TURNS = {
  /** Pas de rééchantillonnage du tracé (m) : en dessous, le cap est dominé par le bruit GPS */
  stepM: 10,
  /** Lissage du tracé avant mesure du cap : moyenne glissante sur ±N points (N × stepM mètres) */
  smoothHalfWindow: 2,
  /** Variation de cap minimale entre deux pas pour être « en virage » (°) */
  minStepDeg: 1.5,
  /** Angle minimal pour compter un virage (°) */
  minAngleDeg: 20,
  /** Rayon minimal (m) : en dessous, c'est un carrefour ou un rond-point, pas un virage de route */
  minRadiusM: 14,
  /** Plafond de courbure par virage (°/m), contre le bruit et les épingles mal captées */
  maxDegPerM: 6,
  /** Un virage repassé au même endroit (boucles, parking) ne compte qu'une fois : rayon de dédoublonnage (m) */
  dedupeM: 30,
} as const;

export const WEIGHTS = {
  distance: { max: 400, halfKm: 28 },       // rendement décroissant : 28 km = la moitié des points
  elevation: { max: 200, fullGradePct: 6 }, // pente moyenne absolue de 6 % = maximum
  turns: { max: 400, fullDegPerKm: 400 },   // Σ angles des virages retenus, par km : 400°/km = maximum
  timing: { max: 200 },                     // circuit ou Route chronométrée uniquement
} as const;

export type Turn = { angleDeg: number; lengthM: number; radiusM: number; lat: number; lng: number };

export type TrackMetrics = {
  distanceM: number;
  /** Dénivelé cumulé, montées + descentes (m) */
  elevationChangeM: number;
  /** Pente moyenne absolue (%) = dénivelé cumulé / distance */
  meanAbsGradePct: number;
  /** Virages retenus */
  turns: Turn[];
  /** Formule équipe : Σ angle/longueur des virages retenus (°/m) */
  turnsCurvatureSum: number;
  /** Proposition : Σ angles des virages retenus par km (°/km) */
  turnsDegPerKm: number;
};

/** Altitude GPS : moyenne glissante sur ±5 points puis seuil de 5 m (le GPS vertical bruite de 5 à 15 m). */
const ELEVATION_SMOOTH = 5;
const ELEVATION_NOISE_M = 5;

export function trackMetrics(points: TrackPoint[]): TrackMetrics {
  const empty = { distanceM: 0, elevationChangeM: 0, meanAbsGradePct: 0, turns: [], turnsCurvatureSum: 0, turnsDegPerKm: 0 };
  if (points.length < 2) return empty;

  let distanceM = 0;
  for (let i = 1; i < points.length; i++) distanceM += haversine(points[i - 1], points[i]);

  // Dénivelé cumulé avec hystérésis (le GPS vertical bruite de quelques mètres).
  const alts = points.map((p) => p.altitude).filter((a): a is number => a != null);
  const smoothAlt = movingAverage(alts, ELEVATION_SMOOTH);
  let change = 0;
  let ref: number | null = null;
  for (const a of smoothAlt) {
    if (ref == null) ref = a;
    else if (Math.abs(a - ref) > ELEVATION_NOISE_M) {
      change += Math.abs(a - ref);
      ref = a;
    }
  }

  const turns = detectTurns(smooth(resample(points, TURNS.stepM), TURNS.smoothHalfWindow));
  const turnsCurvatureSum = turns.reduce((s, t) => s + Math.min(t.angleDeg / t.lengthM, TURNS.maxDegPerM), 0);
  const km = distanceM / 1000;

  return {
    distanceM,
    elevationChangeM: change,
    meanAbsGradePct: distanceM > 0 ? (change / distanceM) * 100 : 0,
    turns,
    turnsCurvatureSum,
    turnsDegPerKm: km > 0 ? turns.reduce((s, t) => s + t.angleDeg, 0) / km : 0,
  };
}

type TimingInput = { timeMs: number; referenceMs: number };

/**
 * @param timing UNIQUEMENT pour un circuit ou une Route avec timing_enabled (la base refuse ailleurs).
 */
export function computeScore(points: TrackPoint[], timing?: TimingInput) {
  const m = trackMetrics(points);
  const w = WEIGHTS;
  const km = m.distanceM / 1000;

  const breakdown: ScoreBreakdown = {
    distance: Math.round(w.distance.max * (1 - Math.pow(0.5, km / w.distance.halfKm))),
    elevation: Math.round(w.elevation.max * Math.min(1, m.meanAbsGradePct / w.elevation.fullGradePct) * Math.min(1, km / 5)),
    sinuosity: Math.round(w.turns.max * Math.min(1, m.turnsDegPerKm / w.turns.fullDegPerKm) * Math.min(1, km / 5)),
  };
  if (timing && timing.timeMs > 0 && timing.referenceMs > 0) {
    // Égaler la référence = la moitié des points ; 20 % plus rapide = le maximum.
    const ratio = timing.referenceMs / timing.timeMs;
    breakdown.timing = Math.round(w.timing.max * Math.max(0, Math.min(1, (ratio - 0.8) / 0.4)));
  }
  const score = breakdown.distance + breakdown.elevation + breakdown.sinuosity + (breakdown.timing ?? 0);

  // Formule de l'équipe telle quelle, avec « dénivelé moyen » lu comme dénivelé cumulé / nombre de km.
  const meanElevationM = km > 0 ? m.elevationChangeM / km : 0;
  const teamFormula = m.distanceM * Math.abs(meanElevationM) + m.turnsCurvatureSum;

  return { score, breakdown, metrics: m, teamFormula };
}

// --- Géométrie ---------------------------------------------------------------

/** Points espacés d'environ stepM le long du tracé (interpolés si le GPS est plus espacé). */
function resample(points: TrackPoint[], stepM: number) {
  const out: { lat: number; lng: number }[] = [{ lat: points[0].lat, lng: points[0].lng }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversine(a, b);
    if (d === 0) continue;
    let pos = stepM - carry;
    while (pos <= d) {
      const t = pos / d;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      pos += stepM;
    }
    carry = d - (pos - stepM);
  }
  return out;
}

function movingAverage(xs: number[], half: number) {
  return xs.map((_, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(xs.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += xs[j];
    return sum / (hi - lo + 1);
  });
}

function smooth(pts: { lat: number; lng: number }[], half: number) {
  const lats = movingAverage(pts.map((p) => p.lat), half);
  const lngs = movingAverage(pts.map((p) => p.lng), half);
  return pts.map((_, i) => ({ lat: lats[i], lng: lngs[i] }));
}

/** Regroupe les changements de cap de même sens en virages. */
function detectTurns(pts: { lat: number; lng: number }[]): Turn[] {
  const step = TURNS.stepM;
  const raw: Turn[] = [];
  let sign = 0;
  let angle = 0;
  let steps = 0;
  let mid: { lat: number; lng: number } | null = null;

  const close = () => {
    const a = Math.abs(angle);
    const lengthM = Math.max(steps, 1) * step;
    const radiusM = lengthM / ((a * Math.PI) / 180);
    if (a >= TURNS.minAngleDeg && radiusM >= TURNS.minRadiusM && mid) {
      raw.push({ angleDeg: a, lengthM, radiusM, lat: mid.lat, lng: mid.lng });
    }
    sign = 0; angle = 0; steps = 0; mid = null;
  };

  for (let i = 2; i < pts.length; i++) {
    const delta = signedDelta(bearing(pts[i - 2], pts[i - 1]), bearing(pts[i - 1], pts[i]));
    const s = Math.abs(delta) < TURNS.minStepDeg ? 0 : Math.sign(delta);
    if (s === 0 || (sign !== 0 && s !== sign)) close();
    if (s !== 0) {
      if (sign === 0) mid = pts[i - 1];
      sign = s;
      angle += delta;
      steps++;
      if (steps === 2) mid = pts[i - 1];
    }
  }
  close();

  // Un même virage repassé plusieurs fois (aller-retour, tours de parking) ne compte qu'une fois.
  const kept: Turn[] = [];
  for (const t of raw) {
    if (!kept.some((k) => haversine(k, t) < TURNS.dedupeM)) kept.push(t);
  }
  return kept;
}

function signedDelta(h1: number, h2: number) {
  return ((h2 - h1 + 540) % 360) - 180;
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
