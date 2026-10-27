import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { simulateCircuitPoints } from '../src/features/circuit/simulate';
import { detectLaps, startLineFromHeading, startLineOnPath, type LL } from '../src/features/circuit/laps';

// Ovale de 400 × 200 m autour de (48, 2), 240 points, fermé.
const ky = 110_540, kx = 111_320 * Math.cos((48 * Math.PI) / 180);
const oval: LL[] = Array.from({ length: 241 }, (_, i) => {
  const a = (i / 240) * 2 * Math.PI;
  return { latitude: 48 + (200 * Math.sin(a)) / ky, longitude: 2 + (400 * Math.cos(a)) / kx };
});

// 3 tours simulés depuis le point le plus à l'est, départ arrêté, à 1 point par seconde.
const pts = simulateCircuitPoints(oval, { laps: 3, start: oval[0], t0: 1_700_000_000_000, seed: 7 });
const line = startLineOnPath(oval, { latitude: pts[0].lat, longitude: pts[0].lng });
assert.ok(line, 'ligne de départ');
// Perpendiculaire au tracé : au point le plus à l'est, l'ovale va vers le nord, la ligne est est-ouest.
assert.ok(Math.abs(line![0].latitude - line![1].latitude) * ky < 3, 'ligne est-ouest (à 3 m près)');
assert.ok(Math.abs(Math.hypot((line![1].longitude - line![0].longitude) * kx, (line![1].latitude - line![0].latitude) * ky) - 50) < 0.5, 'ligne de 50 m');

const laps = detectLaps(pts, line);
assert.equal(laps.length, 3, `3 tours (${laps.length})`);
// Tour de l'ovale ≈ 1 937 m ; vitesses 15-38 m/s : entre 50 et 130 s par tour.
for (const l of laps) assert.ok(l.timeMs > 50_000 && l.timeMs < 130_000, `tour ${l.timeMs}`);

// Sans tracé : la direction des 30 premiers mètres donne la même ligne, à peu près.
const h = startLineFromHeading(pts);
assert.ok(h);
assert.equal(detectLaps(pts, h).length, 3);

// Demi-tour ou marche arrière sur la ligne : pas de tour.
assert.equal(detectLaps(pts.slice(0, 40), line).length, 0);

if (process.argv.includes('--sql')) {
  writeFileSync(process.argv[process.argv.indexOf('--sql') + 1], JSON.stringify({ oval, points: pts, laps }));
}
console.log('laps: ok');
