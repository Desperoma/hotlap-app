import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { simulateCircuitPoints } from '../src/features/circuit/simulate';
import { detectLaps, lapCrossings, liveDelta, startLineFromHeading, startLineOnPath, type LL } from '../src/features/circuit/laps';

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

// Écart en direct : à la fin d'un tour, l'écart vaut (ce tour − meilleur tour) ; au départ, ~0.
{
  const cross = lapCrossings(pts, line);
  const best = Math.min(...laps.map((l) => l.timeMs));
  const third = laps[2];
  const before = pts.filter((p) => p.ts <= third.startedAt + third.timeMs - 1);
  const d = liveDelta(before, line, third.startedAt + third.timeMs - 1)!;
  assert.ok(d, 'écart disponible au 3e tour');
  assert.ok(Math.abs(d.deltaMs - (third.timeMs - best)) < 2500, `écart fin de tour ${d.deltaMs} vs ${third.timeMs - best}`);
  assert.ok(d.progress > 0.9, `progression ${d.progress}`);
  const early = liveDelta(pts.filter((p) => p.ts <= cross[2] + 1000), line, cross[2] + 1000)!;
  assert.ok(Math.abs(early.deltaMs) < 2500 && early.progress < 0.2, `début de tour ${early.deltaMs} ${early.progress}`);
  assert.equal(liveDelta(pts.slice(0, 30), line), null);
}

if (process.argv.includes('--sql')) {
  writeFileSync(process.argv[process.argv.indexOf('--sql') + 1], JSON.stringify({ oval, points: pts, laps }));
}
console.log('laps: ok');
