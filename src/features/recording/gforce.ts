/** Projection de l'accéléromètre sur les axes de la voiture (fonctions pures, testées par scripts/gforce.test.ts). */

export type V = { x: number; y: number; z: number };
const G = 9.80665;

const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V) => Math.hypot(a.x, a.y, a.z);
const unit = (a: V) => { const n = norm(a); return n > 1e-6 ? scale(a, 1 / n) : null; };

/**
 * Axes de la voiture vus par le téléphone, à partir de la gravité : « haut » = opposé de la gravité,
 * « avant » = l'axe du téléphone le plus horizontal parmi l'arrière (−z, téléphone debout sur un
 * support, écran vers le conducteur) et le haut de l'écran (y, téléphone posé à plat).
 */
export function carAxes(up: V): { forward: V; right: V } | null {
  const u = unit(up);
  if (!u) return null;
  const horizontal = (v: V) => sub(v, scale(u, dot(v, u)));
  const back = horizontal({ x: 0, y: 0, z: -1 });
  const top = horizontal({ x: 0, y: 1, z: 0 });
  const forward = unit(norm(back) >= norm(top) ? back : top);
  if (!forward) return null;
  return { forward, right: cross(forward, u) };
}

/** Accélération (gravité retirée, m/s²) projetée sur les axes de la voiture, en G. */
export function toCarG(acc: V, axes: { forward: V; right: V }) {
  return { lateral: dot(acc, axes.right) / G, longitudinal: dot(acc, axes.forward) / G };
}

export const lerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
