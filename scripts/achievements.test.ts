import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACHIEVEMENTS, formatMetric, progressOf, TIERS } from '../src/features/achievements/catalog';

// Le catalogue de l'app et celui de la base (migration 0034) ont les mêmes clés.
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0034_trends_achievements.sql'), 'utf8');
const block = sql.slice(sql.indexOf('insert into public.achievements'), sql.indexOf('on conflict (key) do update'));
const rows = [...block.matchAll(/\('([a-z0-9_]+)',\s*(\d),\s*\d+,\s*(\d+),/g)].map((m) => ({ key: m[1], tier: Number(m[2]), xp: Number(m[3]) }));
assert.ok(rows.length >= 25, 'catalogue SQL lu');
assert.deepEqual(rows.map((r) => r.key).sort(), Object.keys(ACHIEVEMENTS).sort());
for (const r of rows) assert.ok(TIERS[r.tier], `tier ${r.tier}`);

// XP raisonnable : croissante avec la difficulté (max d'un tier <= min du tier +2).
const byTier = (t: number) => rows.filter((r) => r.tier === t).map((r) => r.xp);
for (let t = 1; t <= 3; t++) assert.ok(Math.max(...byTier(t)) <= Math.min(...byTier(t + 2)), `xp tier ${t}`);

// Jauges
assert.equal(progressOf({ value: 267, target: 300, lowerIsBetter: false }), 0.89);
assert.equal(progressOf({ value: null, target: 300, lowerIsBetter: false }), 0);
assert.equal(progressOf({ value: 450, target: 300, lowerIsBetter: false }), 1);
assert.equal(progressOf({ value: 8, target: 6, lowerIsBetter: true }), 0.75);
assert.equal(progressOf({ value: 5.2, target: 6, lowerIsBetter: true }), 1);
assert.equal(formatMetric('circuit_top_speed', 267.4), '267 km/h');
assert.equal(formatMetric('best_0_100_s', 8.43), '8.4 s');
assert.equal(formatMetric('drives', 3), '3');

console.log('achievements: OK');
