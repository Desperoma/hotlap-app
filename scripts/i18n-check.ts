/**
 * npm run i18n:check : liste les textes de l'app (clés t('…')) sans traduction en français,
 * espagnol ou allemand, et les traductions qui ne servent plus. Code de sortie 1 s'il en manque.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const keys = new Set<string>();
const re = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const f of walk(root)) {
  for (const m of readFileSync(f, 'utf8').matchAll(re)) keys.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n'));
}
let missing = 0;
for (const lang of ['en', 'fr', 'es', 'de']) {
  const dict = JSON.parse(readFileSync(join(root, 'i18n', 'locales', `${lang}.json`), 'utf8')) as Record<string, string>;
  const miss = [...keys].filter((k) => !(k in dict));
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  if (lang === 'en') {
    // L'anglais retombe sur la clé : seules les clés écrites en français y ont une entrée.
    console.log(`en: ${keys.size} clés, ${Object.keys(dict).length - unused.length} réécrites${unused.length ? `, ${unused.length} inutilisées` : ''}`);
    continue;
  }
  missing += miss.length;
  console.log(`${lang}: ${keys.size - miss.length}/${keys.size} traduits${unused.length ? `, ${unused.length} inutilisés` : ''}`);
  if (process.argv.includes('--list')) miss.forEach((k) => console.log(`  - ${k}`));
}
if (process.argv.includes('--keys')) console.log(JSON.stringify([...keys].sort(), null, 1));
process.exit(missing ? 1 : 0);
