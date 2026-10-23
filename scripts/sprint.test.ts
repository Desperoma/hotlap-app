import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { detectSprints, sprintLive, type SprintPoint } from '../src/features/sprint/sprint';

/**
 * Run synthétique à 1 Hz vers le nord : 3 s arrêté, puis accélération constante de 5 m/s²
 * jusqu'à 60 m/s (216 km/h), palier, freinage. 0-100 théorique = 27,78 / 5 = 5,56 s ;
 * 0-200 = 11,11 s ; 500 m = √(2·500/5) = 14,14 s.
 */
export function syntheticRun(): SprintPoint[] {
  const pts: SprintPoint[] = [];
  let y = 0, v = 0;
  const t0 = 1_700_000_000_000;
  for (let i = 0; i <= 70; i++) {
    const t = i - 3; // le départ réel a lieu à t = 0 (i = 3)
    if (i > 3) {
      const a = v < 60 && t <= 40 ? 5 : t > 40 ? -8 : 0;
      const nv = Math.max(0, Math.min(60, v + a));
      y += (v + nv) / 2; v = nv;
    }
    pts.push({ ts: t0 + i * 1000, lat: 48 + y / 111_195, lng: 2, speed: i === 20 ? -1 : v });
  }
  return pts;
}

const pts = syntheticRun();
const r = Object.fromEntries(detectSprints(pts).map((x) => [x.kind, x]));
const close = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
close(r['0_100'].timeMs, 5556, 120, '0-100');
close(r['0_200'].timeMs, 11111, 150, '0-200');
close(r['500m'].timeMs, 14142, 250, '500 m');
assert.ok(r['1000m'] && r['2000m'], '1000 m et 2000 m atteints');
close(r['0_100'].exitSpeedKmh, 100, 0.01, 'sortie 0-100');

// Un départ lancé (jamais arrêté) ne compte pas.
assert.equal(detectSprints(pts.slice(5)).length, 0);
// Freinage au milieu : le run s'arrête, pas de 2000 m.
const braked = pts.map((p, i) => (i === 12 ? { ...p, speed: 5 } : p));
assert.ok(!detectSprints(braked).some((x) => x.kind === '2000m'));
// Direct : arrêté → prêt ; en accélération → chrono.
assert.equal(sprintLive(pts.slice(0, 3)).phase, 'ready');
const live = sprintLive(pts.slice(0, 8), pts[7].ts);
assert.equal(live.phase, 'running');
assert.equal(live.phase === "running" && live.elapsedMs, 4000); // départ au point 3, maintenant = point 7

// Même jeu de points pour le test SQL (sprint_times doit donner les mêmes temps).
if (process.argv.includes('--sql')) {
  writeFileSync(process.argv[process.argv.indexOf('--sql') + 1], JSON.stringify({ points: pts, expected: r }));
}
console.log('sprint: ok');
