import assert from 'node:assert/strict';

import { buildOsmCircuits, categoryOf, centersOf, lineLengthM, mergeWikidata, type OsmElement, type Pt } from './lib/circuits';

// Carré d'environ 1,1 km de côté autour de (50.44, 5.97)
const sq = (lat: number, lon: number, d: number): Pt[] => [
  { lat: lat - d, lon: lon - d }, { lat: lat - d, lon: lon + d }, { lat: lat + d, lon: lon + d },
  { lat: lat + d, lon: lon - d }, { lat: lat - d, lon: lon - d },
];

const elements: OsmElement[] = [
  { type: 'way', id: 1, tags: { leisure: 'track', sport: 'motor', name: 'Circuit de Spa-Francorchamps' }, geometry: sq(50.44, 5.97, 0.01) },
  { type: 'way', id: 2, tags: { highway: 'raceway', name: 'Main loop' }, geometry: sq(50.44, 5.97, 0.005) },
  { type: 'way', id: 3, tags: { highway: 'raceway' }, geometry: [{ lat: 50.44, lon: 5.97 }, { lat: 50.441, lon: 5.97 }] }, // pit lane
  { type: 'way', id: 4, tags: { highway: 'raceway', name: 'Karting des Fagnes' }, geometry: sq(50.30, 5.80, 0.002) }, // hors site
  { type: 'way', id: 5, tags: { leisure: 'track', sport: 'running', name: 'Stade' }, geometry: sq(50.0, 5.0, 0.001) }, // pas moteur
  { type: 'relation', id: 6, tags: { leisure: 'sports_centre', sport: 'karting', name: 'Kart Arena', wikidata: 'Q99' },
    members: [{ type: 'way', role: 'outer', geometry: sq(50.5, 5.5, 0.002) }] },
];

const osm = buildOsmCircuits(elements, 'BE');
assert.equal(osm.length, 3);
const spa = osm.find((c) => c.osm_ref === 'way/1')!;
assert.equal(spa.kind, 'track');
assert.ok(spa.path?.startsWith('SRID=4326;LINESTRING('));
assert.ok(Math.abs(spa.lap_length_m! - lineLengthM(sq(50.44, 5.97, 0.005))) < 1);
assert.equal(osm.find((c) => c.osm_ref === 'way/4')!.kind, 'karting');
assert.equal(osm.find((c) => c.osm_ref === 'relation/6')!.kind, 'karting');

const merged = mergeWikidata(osm, [
  { qid: 'Q1', name: 'Spa-Francorchamps', lat: 50.441, lon: 5.971, country: 'BE', lengthM: 7004, website: 'https://spa' },
  { qid: 'Q99', name: 'Kart Arena', lat: 50.5, lon: 5.5, country: 'BE', lengthM: null, website: null },
  { qid: 'Q2', name: 'Circuit Zolder', lat: 51.0, lon: 5.25, country: 'BE', lengthM: 4011, website: null },
], centersOf(osm));
assert.equal(merged.length, 4);
assert.equal(merged.find((c) => c.osm_ref === 'way/1')!.wikidata_id, 'Q1');
assert.equal(merged.find((c) => c.osm_ref === 'way/1')!.website, 'https://spa');
assert.equal(merged.find((c) => c.wikidata_id === 'Q2')!.source, 'wikidata');
assert.equal(merged.filter((c) => c.wikidata_id === 'Q99').length, 1);

// Deux sites OSM avec la même étiquette wikidata : les deux restent, un seul garde l'identifiant.
const dup = buildOsmCircuits([
  { type: 'way', id: 10, tags: { leisure: 'track', sport: 'motor', name: 'A', wikidata: 'Q5' }, geometry: sq(48, 2, 0.01) },
  { type: 'way', id: 11, tags: { leisure: 'track', sport: 'motor', name: 'A bis', wikidata: 'Q5' }, geometry: sq(48.1, 2, 0.01) },
], 'FR');
const dm = mergeWikidata(dup, [], centersOf(dup));
assert.equal(dm.length, 2);
assert.equal(dm.filter((c) => c.wikidata_id === 'Q5').length, 1);

// Catégories (filtres de la carte)
assert.equal(categoryOf({ sport: 'motor', name: 'Circuit de Spa-Francorchamps' }), 'racing');
assert.equal(categoryOf({ sport: 'karting', name: 'Kart Arena' }), 'karting');
assert.equal(categoryOf({ sport: 'motor', name: 'Santa Pod Dragway' }), 'drag');
assert.equal(categoryOf({ sport: 'motor', name: 'Ebisu Drift Park' }), 'drift');
assert.equal(categoryOf({ sport: 'motor', name: 'Lohéac' }, 'gravel'), 'dirt');
assert.equal(categoryOf({ sport: 'motor;4wd', name: 'Terrain 4x4' }), 'offroad');
assert.equal(osm.find((c) => c.osm_ref === 'way/4')!.category, 'karting');
assert.equal(spa.path_source, 'osm');

console.log('circuits: ok');
