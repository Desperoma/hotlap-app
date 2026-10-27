/**
 * Drive simulé sur un circuit (outils de test) : la voiture suit le tracé du circuit, freine avant
 * les virages et accélère en sortie, à 1 point par seconde, départ arrêté. Sert à la simulation en
 * temps réel (écran Live drive) et aux tests du chrono au tour.
 */
import type { TrackPoint } from '@/features/recording/geo';

import type { LL } from './laps';

const KY = 110_540;
const kx = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

type Opts = { laps?: number; start?: LL; t0?: number; seed?: number; vmaxMs?: number };

/** Points d'un drive de `laps` tours, en partant du point du tracé le plus proche de `start`. */
export function simulateCircuitPoints(path: LL[], opts: Opts = {}): TrackPoint[] {
  const laps = opts.laps ?? 3, t0 = opts.t0 ?? Date.now(), vmax = opts.vmaxMs ?? 38;
  const rand = rng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  if (path.length < 3) return [];
  const lat0 = path[0].latitude, k = kx(lat0);
  // Tracé en mètres, fermé.
  let xy = path.map((p) => ({ x: (p.longitude - path[0].longitude) * k, y: (p.latitude - lat0) * KY }));
  const closed = Math.hypot(xy[0].x - xy.at(-1)!.x, xy[0].y - xy.at(-1)!.y) < 30;
  if (!closed) xy = [...xy, ...xy.slice(0, -1).reverse()]; // tracé ouvert : aller-retour
  else xy = [...xy.slice(0, -1), xy[0]];

  // Départ : sommet le plus proche du point de départ demandé, puis on tourne le tableau.
  if (opts.start) {
    const sx = (opts.start.longitude - path[0].longitude) * k, sy = (opts.start.latitude - lat0) * KY;
    let bi = 0, bd = Infinity;
    xy.slice(0, -1).forEach((p, i) => { const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; bi = i; } });
    const ring = xy.slice(0, -1);
    xy = [...ring.slice(bi), ...ring.slice(0, bi), ring[bi]];
  }

  // Abscisse curviligne et vitesse max permise par le rayon de courbure (10 m/s² latéral).
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  const L = cum.at(-1)!;
  const cap = xy.map((_, i) => {
    const a = xy[(i - 1 + xy.length - 1) % (xy.length - 1)], b = xy[i], c = xy[(i + 1) % (xy.length - 1)];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const seg = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2;
    const r = dh > 1e-4 ? seg / dh : Infinity;
    return Math.min(vmax, Math.sqrt(10 * r));
  });
  // Freinage anticipé (8 m/s²) : passe arrière sur deux tours pour boucler.
  const n = cap.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 2; i >= 0; i--) {
      const d = cum[i + 1] - cum[i];
      cap[i] = Math.min(cap[i], Math.sqrt(cap[(i + 1) % (n - 1)] ** 2 + 2 * 8 * d));
    }
  }
  const capAt = (s: number) => {
    const m = ((s % L) + L) % L;
    let i = 1; while (i < cum.length - 1 && cum[i] < m) i++;
    return cap[i - 1];
  };
  const posAt = (s: number) => {
    const m = ((s % L) + L) % L;
    let i = 1; while (i < cum.length - 1 && cum[i] < m) i++;
    const t = (m - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return { x: xy[i - 1].x + t * (xy[i].x - xy[i - 1].x), y: xy[i - 1].y + t * (xy[i].y - xy[i - 1].y) };
  };

  // Intégration à 1 Hz : 3 s arrêté, `laps` tours, puis freinage jusqu'à l'arrêt.
  const pts: TrackPoint[] = [];
  let s = 0, v = 0, i = 0;
  const total = laps * L + 40;
  while (true) {
    if (i >= 3) {
      const stopping = s >= laps * L + 20;
      const target = stopping ? 0 : capAt(s + v) * (0.94 + rand() * 0.05);
      const nv = target > v ? Math.min(target, v + 4 * (1 - v / (vmax * 1.3))) : Math.max(target, v - 8);
      s += (v + Math.max(0, nv)) / 2; v = Math.max(0, nv);
      if (stopping && v === 0) break;
    }
    const p = posAt(s);
    const jitter = () => (rand() - 0.5) * 2; // ±1 m : précision GPS
    pts.push({
      ts: t0 + i * 1000,
      lat: lat0 + (p.y + jitter()) / KY,
      lng: path[0].longitude + (p.x + jitter()) / k,
      altitude: 120, speed: v, accuracy: 4,
    });
    i++;
    if (i > 3 + (total / 3) || i > 4 * 3600) break; // garde-fou
  }
  return pts;
}

/**
 * Lecture en temps réel d'un drive simulé : émet un point par seconde (ou plus vite avec `speedup`)
 * via `onPoint`, comme le ferait le GPS. Renvoie la fonction d'arrêt.
 */
export function playSimulation(points: TrackPoint[], onPoint: (p: TrackPoint) => void, onEnd: () => void, speedup = 1) {
  if (points.length === 0) { onEnd(); return () => {}; }
  const start = Date.now(), t0 = points[0].ts;
  let i = 0;
  const id = setInterval(() => {
    const elapsed = (Date.now() - start) * speedup;
    while (i < points.length && points[i].ts - t0 <= elapsed) {
      // Horodatage réel : le chrono en direct se base sur l'heure du téléphone.
      onPoint({ ...points[i], ts: start + (points[i].ts - t0) / speedup });
      i++;
    }
    if (i >= points.length) { clearInterval(id); onEnd(); }
  }, 250);
  return () => clearInterval(id);
}
