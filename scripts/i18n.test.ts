import assert from 'node:assert/strict';

import { getLang, isLang, locale, setLangNow, t } from '../src/i18n/core';
import de from '../src/i18n/locales/de.json';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';
import fr from '../src/i18n/locales/fr.json';

// Anglais par défaut ; une clé sans entrée s'affiche telle quelle.
assert.equal(getLang(), 'en');
assert.equal(t('Settings'), 'Settings');
assert.equal(t('Annuler'), 'Cancel');
assert.equal(t('Pas une clé connue'), 'Pas une clé connue');
assert.equal(t('Level {0}', 12), 'Level 12');

setLangNow('fr');
assert.equal(t('Settings'), 'Paramètres');
assert.equal(t('Annuler'), 'Annuler');
assert.equal(t('Level {0}', 12), 'Niveau 12');
assert.equal(locale(), 'fr-FR');

setLangNow('de');
assert.equal(t('{0}, level {1}', 'Rookie', 3), 'Rookie, Level 3');
setLangNow('es');
assert.equal(t('Give {0} to {1}?', 'A', 'B'), '¿Dar A a B?');
setLangNow('en');

assert.ok(isLang('de') && !isLang('it') && !isLang(null));

// Chaque traduction garde exactement les mêmes {n} que sa clé.
const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
for (const [name, dict] of Object.entries({ en, fr, es, de }) as [string, Record<string, string>][]) {
  for (const [k, v] of Object.entries(dict)) {
    assert.equal(ph(v), ph(k), `${name}: placeholders de « ${k} »`);
    assert.ok(v.trim().length > 0, `${name}: traduction vide pour « ${k} »`);
  }
}
// fr, es et de couvrent les mêmes clés.
assert.deepEqual(Object.keys(es).sort(), Object.keys(fr).sort());
assert.deepEqual(Object.keys(de).sort(), Object.keys(fr).sort());

console.log('i18n: OK');
