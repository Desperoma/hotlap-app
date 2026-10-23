// Test hors ligne de la transformation Wikidata -> catalogue : npm run catalog:test
import assert from 'node:assert/strict';

import { buildModels, catalogKey, powerKwOf, stripMake, weightKgOf } from './lib/catalog';

const b = (qid: string, label: string, extra: { alts?: string; from?: string; to?: string } = {}) => ({
  model: { value: `http://www.wikidata.org/entity/${qid}` },
  modelLabel: { value: label },
  ...(extra.alts ? { alts: { value: extra.alts } } : {}),
  ...(extra.from ? { from: { value: extra.from } } : {}),
  ...(extra.to ? { to: { value: extra.to } } : {}),
});

assert.equal(catalogKey('Mégane R.S.'), 'meganers');
assert.equal(stripMake('Peugeot 208', 'Peugeot'), '208');
assert.equal(stripMake('Peugeot', 'Peugeot'), 'Peugeot');

const { models, merged, skipped } = buildModels([
  b('Q1', 'Renault Mégane R.S.', { from: '2004', alts: 'Megane RS|Renault Sport Mégane' }),
  b('Q2', 'Renault Megane RS', { to: '2023' }),             // doublon de Q1 (même clé)
  b('Q3', 'Renault Clio', { from: '1990', to: '1980' }),    // fin avant début -> ignorée
  b('Q4', 'Q4'),                                            // pas de libellé
  b('Q5', 'Renault 5', { from: '1890' }),
], 'Renault');
assert.equal(merged, 1);
assert.equal(skipped, 1);
const megane = models.find((m) => m.key === 'meganers')!;
assert.equal(megane.qid, 'Q1');
assert.equal(megane.yearFrom, 2004);
assert.equal(megane.yearTo, 2023);                           // complété par le doublon
assert.ok(megane.aliases.includes('Renault Mégane R.S.'));
assert.ok(megane.aliases.includes('Sport Mégane') || megane.aliases.includes('Renault Sport Mégane'));
assert.ok(!megane.aliases.some((a) => catalogKey(a) === 'meganers'));
assert.equal(models.find((m) => m.name === 'Clio')!.yearTo, null);
assert.equal(models.find((m) => m.name === '5')!.yearFrom, 1890);
// Puissance (W normalisés -> kW) et masse (kg), valeurs absurdes écartées.
assert.equal(powerKwOf({ value: '221000' }), 221);
assert.equal(powerKwOf({ value: '12' }), null);
assert.equal(weightKgOf({ value: '1395.4' }), 1395);
assert.equal(weightKgOf({ value: '12' }), null);
assert.equal(megane.powerKw, null);
console.log('catalog: tous les tests passent');
