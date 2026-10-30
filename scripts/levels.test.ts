import assert from 'node:assert/strict';

import { hpiFor } from '../src/features/garage/hpi';
import { levelFromXp, rankFor, xpForLevel } from '../src/features/levels/levels';

// Niveaux : bornes exactes et réciprocité
assert.equal(levelFromXp(0).level, 1);
assert.equal(levelFromXp(699).level, 1);
assert.equal(levelFromXp(700).level, 2);
for (let l = 1; l < 300; l++) {
  assert.equal(levelFromXp(xpForLevel(l)).level, l);
  assert.equal(levelFromXp(xpForLevel(l + 1) - 1).level, l);
}
assert.equal(levelFromXp(3234).level, 4);
assert.equal(rankFor(10).key, 'rookie');
assert.equal(rankFor(11).key, 'amateur');
assert.equal(rankFor(150).key, 'champion');
assert.equal(rankFor(400).key, 'legend');

// HPI : repères du barème
const kw = (hp: number) => hp / 1.341;
const cls = (hp: number, kg: number, ms?: number) => hpiFor({ powerKw: kw(hp), weightKg: kg, best0to100Ms: ms })!.cls.key;
assert.equal(cls(70, 950), 'D'); // Panda
assert.equal(cls(245, 1430, 6300), 'B'); // Golf GTI
assert.equal(cls(510, 1435, 3400), 'A'); // 911 GT3
assert.equal(cls(830, 1470, 2900), 'S2'); // 296 GTB
assert.equal(cls(1500, 1995, 2400), 'X'); // Chiron
assert.equal(hpiFor({ powerKw: null, weightKg: 1200 }), null);
console.log('levels: ok');
