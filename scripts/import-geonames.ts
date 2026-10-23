/**
 * Import des lieux GeoNames (licence CC BY 4.0) vers Supabase : pays, régions (admin1), villes.
 *
 *   npm run geo:import -- --dry-run                 télécharge et compte, sans toucher à la base
 *   npm run geo:import                              import complet (pays retenus, villes ≥ 500 hab.)
 *   npm run geo:import -- --countries=FR,BE         seulement ces pays
 *   npm run geo:import -- --dataset=cities1000      villes ≥ 1000 hab. (moins de lignes)
 *
 * Besoin, dans .env.local : EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
 * La clé service_role contourne la RLS : elle ne doit JAMAIS être dans l'app ni commitée.
 * Relançable : upsert sur les identifiants GeoNames.
 *
 * Pays retenus (cadrage, 22/10) : toute l'Europe (continent EU), Canada, États-Unis, Australie,
 * Japon, Qatar, Émirats arabes unis, Arabie saoudite.
 */
import { createClient } from '@supabase/supabase-js';
import { unzipSync, strFromU8 } from 'fflate';
import { existsSync, readFileSync } from 'node:fs';

import { placeSearchKey } from '../src/features/places/normalize';

const BASE = 'https://download.geonames.org/export/dump/';
const EXTRA = ['CA', 'US', 'AU', 'JP', 'QA', 'AE', 'SA'];

const args = Object.fromEntries(
  process.argv.slice(2).map((a: string) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const DRY = args['dry-run'] === 'true';
const DATASET = String(args.dataset ?? 'cities500');
const ONLY = args.countries ? new Set(String(args.countries).toUpperCase().split(',')) : null;

loadEnv('.env.local');

async function download(file: string): Promise<Uint8Array> {
  console.log(`Téléchargement ${file}…`);
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file} : HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
const tsv = (text: string) => text.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));

async function main() {
  // 1. Pays
  const countries = tsv(strFromU8(await download('countryInfo.txt')))
    .map((c) => ({ code: c[0], name: c[4], continent: c[8], geonames_id: Number(c[16]) || null }))
    .filter((c) => (ONLY ? ONLY.has(c.code) : c.continent === 'EU' || EXTRA.includes(c.code)));
  const keep = new Set(countries.map((c) => c.code));

  // 2. Régions
  const admin1 = tsv(strFromU8(await download('admin1CodesASCII.txt')))
    .map((a) => ({ code: a[0], country_code: a[0].split('.')[0], name: a[1], search_name: placeSearchKey(a[2] || a[1]), geonames_id: Number(a[3]) || null }))
    .filter((a) => keep.has(a.country_code));
  const admin1Codes = new Set(admin1.map((a) => a.code));

  // 3. Villes (lieux habités)
  const zip = unzipSync(await download(`${DATASET}.zip`));
  const text = strFromU8(zip[`${DATASET}.txt`]);
  const cities = tsv(text)
    .filter((c) => keep.has(c[8]) && c[6] === 'P')
    .map((c) => {
      const a1 = `${c[8]}.${c[10]}`;
      return {
        id: Number(c[0]),
        country_code: c[8],
        admin1_code: admin1Codes.has(a1) ? a1 : null,
        name: c[1],
        search_name: placeSearchKey(c[2] || c[1]),
        population: Number(c[14]) || 0,
        location: `SRID=4326;POINT(${Number(c[5])} ${Number(c[4])})`,
      };
    })
    .filter((c) => c.search_name);

  console.log(`${countries.length} pays, ${admin1.length} régions, ${cities.length} villes (${DATASET}).`);
  if (DRY) return;

  const db = client();
  await upsert(db, 'geo_countries', countries, 'code');
  await upsert(db, 'geo_admin1', admin1, 'code');
  await upsert(db, 'geo_cities', cities, 'id');
  console.log('Import terminé.');
}

async function upsert(db: ReturnType<typeof client>, table: string, rows: object[], key: string) {
  const SIZE = 1000;
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + SIZE), { onConflict: key });
    if (error) throw new Error(`${table} : ${error.message}`);
    process.stdout.write(`\r  ${table} ${Math.min(i + SIZE, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

function client() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local');
  return createClient(url, key, { auth: { persistSession: false } });
}

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
