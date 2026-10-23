import assert from 'node:assert/strict';

import { buildSamples, downsample, nearestIndex, speedBucket, speedScaleMax, speedSegments, summarize, type RawPoint } from '../src/features/drives/telemetry';

// 61 points, 1 par seconde, vers le nord : 0 → 30 m/s puis freinage ; altitude qui monte de 0 à 60 m.
const raw: RawPoint[] = [];
let lat = 48.0;
for (let i = 0; i <= 60; i++) {
  const v = i <= 30 ? i : 60 - i; // m/s
  lat += v / 111_195; // ≈ v mètres vers le nord
  raw.push({ ts: 1_000_000 + i * 1000, lat, lng: 2.0, altitude: i, speed: i % 10 === 5 ? -1 : v }); // vitesse GPS parfois inconnue
}

const s = buildSamples(raw);
assert.equal(s.length, 61);
assert.equal(s[0].t, 0);
assert.ok(Math.abs(s.at(-1)!.d - 900) < 15, `distance ${s.at(-1)!.d}`);
const sum = summarize(s);
assert.ok(sum.maxSpeedKmh > 100 && sum.maxSpeedKmh <= 108.5, `vmax ${sum.maxSpeedKmh}`);
assert.ok(sum.climbM > 50 && sum.climbM <= 60, `climb ${sum.climbM}`);
assert.ok(sum.maxAccelG > 0.08 && sum.maxAccelG < 0.12, `accel ${sum.maxAccelG}`);
assert.ok(sum.maxBrakeG > 0.08 && sum.maxBrakeG < 0.12, `brake ${sum.maxBrakeG}`);
// Vitesse GPS inconnue (-1) : remplacée par distance / temps, pas par 0.
assert.ok(s[15].speedKmh > 45, `speed at 15 ${s[15].speedKmh}`);

const ds = downsample(s, 10);
assert.equal(ds.length, 10);
assert.equal(ds[0], s[0]);
assert.equal(ds.at(-1), s.at(-1));

assert.equal(nearestIndex(s, { latitude: s[42].lat, longitude: 2.0 }), 42);

// Échelle fixe : 0-300 km/h, élargie par paliers de 50 au-delà.
assert.equal(speedScaleMax(sum.maxSpeedKmh), 300);
assert.equal(speedScaleMax(312), 350);
assert.equal(speedBucket(50, 300), 0);
assert.equal(speedBucket(100, 300), 1);
assert.equal(speedBucket(299, 300), 4);
assert.equal(speedBucket(400, 300), 4);
const segs = speedSegments(s, speedScaleMax(sum.maxSpeedKmh));
assert.ok(segs.length >= 3); // 0-108 km/h sur 0-300 : bleu, vert, puis retour
// Tronçons jointifs : chaque tronçon commence là où finit le précédent.
for (let i = 1; i < segs.length; i++) assert.deepEqual(segs[i].coords[0], segs[i - 1].coords.at(-1));

assert.deepEqual(buildSamples([]), []);
console.log('telemetry: ok');
