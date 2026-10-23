/**
 * Import des circuits : OpenStreetMap (tracés, emprises ; ODbL) + Wikidata (noms, longueurs ; CC0).
 *
 *   npm run circuits:import -- --dry-run          télécharge, compte, écrit scripts/out/circuits.json
 *   npm run circuits:import                       import complet (pays retenus)
 *   npm run circuits:import -- --countries=FR,BE  seulement ces pays
 *
 * Besoin, dans .env.local : EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
 * La clé service_role contourne la RLS : elle ne doit JAMAIS être dans l'app ni commitée.
 * Lancer `npm run geo:import` avant : la ville de chaque circuit vient des villes GeoNames.
 * Relançable : clés osm_ref et wikidata_id ; les circuits saisis à la main ne sont pas touchés.
 * Les téléchargements sont mis en cache dans scripts/out/cache/ : une relance (ou l'import réel
 * après un --dry-run) ne retélécharge que les pays manquants. --refresh vide ce cache.
 * Un pays qui échoue sur tous les serveurs Overpass est sauté ; la liste est affichée à la fin.
 * Attribution à afficher dans l'app : « © les contributeurs d'OpenStreetMap ».
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { buildOsmCircuits, centersOf, mergeWikidata, type CircuitRow, type OsmElement, type WdCircuit } from './lib/circuits';

// Serveur public principal puis miroirs : on passe au suivant quand l'un est saturé.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CACHE = 'scripts/out/cache';
const WIKIDATA = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'HotLapCircuitImport/0.1 (contact: equipe HotLap)';

// Pays retenus (cadrage, 22/10) : Europe + CA, US, AU, JP, QA, AE, SA.
const EUROPE = ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FO', 'FR', 'GB', 'GG', 'GI',
  'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
  'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA', 'XK'];
const DEFAULT = [...EUROPE, 'CA', 'US', 'AU', 'JP', 'QA', 'AE', 'SA'];

const args = Object.fromEntries(
  process.argv.slice(2).map((a: string) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const DRY = args['dry-run'] === 'true';
const REFRESH = args.refresh === 'true';
const COUNTRIES = args.countries ? String(args.countries).toUpperCase().split(',') : DEFAULT;

loadEnv('.env.local');

async function overpass(country: string): Promise<OsmElement[]> {
  const query = `[out:json][timeout:600];
area["ISO3166-1"="${country}"][admin_level=2]->.a;
(
  nwr["leisure"~"^(track|sports_centre|stadium)$"]["sport"~"(^|;)(motor|karting)(;|$)"](area.a);
  way["highway"="raceway"](area.a);
);
out tags geom;`;
  let emptyFrom: string | null = null;
  for (let attempt = 0; attempt < OVERPASS.length * 2; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    const host = new URL(url).host;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(660_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
        // Overpass répond parfois 200 avec une erreur dans « remark » (délai dépassé) : on réessaie.
        if (json.elements && !/error|timed out/i.test(json.remark ?? '')) {
          if (json.elements.length) return json.elements;
          // Un miroir surchargé ou incomplet peut répondre vide : on ne croit un pays vide
          // que si un deuxième serveur le confirme.
          if (emptyFrom && emptyFrom !== host) return [];
          emptyFrom = host;
          console.warn(`  ${host} : 0 élément, vérification sur un autre serveur (${country})`);
          continue;
        }
        console.warn(`  ${host} : réponse incomplète (${country})`);
      } else {
        console.warn(`  ${host} : HTTP ${res.status} (${country})`);
        if (res.status !== 429 && res.status < 500 && res.status !== 406) throw new Error(`Overpass ${country} : HTTP ${res.status}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Overpass ')) throw e;
      console.warn(`  ${host} : ${e instanceof Error ? e.message : e} (${country})`);
    }
    await sleep(attempt < OVERPASS.length ? 5_000 : 30_000);
  }
  throw new Error(`Overpass ${country} : tous les serveurs ont échoué`);
}

/** Lit le cache, sinon télécharge et met en cache. */
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const file = `${CACHE}/${key}.json`;
  if (existsSync(file)) {
    const data = JSON.parse(readFileSync(file, 'utf8')) as T;
    // Ancienne version du script : un résultat vide a pu être mis en cache à tort.
    if (!(Array.isArray(data) && data.length === 0)) return data;
  }
  const data = await load();
  // Un résultat vide n'est pas mis en cache : il est revérifié à la relance suivante.
  if (Array.isArray(data) && data.length === 0) return data;
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  return data;
}

async function wikidata(countries: string[]): Promise<WdCircuit[]> {
  const values = countries.map((c) => `"${c}"`).join(' ');
  const query = `SELECT ?item ?itemLabel ?coord ?iso ?length ?site WHERE {
  VALUES ?iso { ${values} }
  ?country wdt:P297 ?iso .
  ?item wdt:P31/wdt:P279* wd:Q2338524 ; wdt:P17 ?country ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P2043 ?length . }
  OPTIONAL { ?item wdt:P856 ?site . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,ja". }
}`;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      res = await fetch(WIKIDATA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) break;
      console.warn(`  Wikidata : HTTP ${res.status} (${countries.join(',')})`);
      // Trop de requêtes : le service dit combien de temps attendre.
      const retryAfter = Number(res.headers.get('retry-after'));
      if (res.status === 429 && retryAfter > 0) { await sleep(Math.min(retryAfter, 120) * 1000); continue; }
    } catch (e) {
      console.warn(`  Wikidata : ${e instanceof Error ? e.message : e} (${countries.join(',')})`);
      res = null;
    }
    await sleep(attempt * 10_000);
  }
  if (!res?.ok) throw new Error(`Wikidata (${countries.join(',')}) : échec`);
  type B = { item: { value: string }; itemLabel: { value: string }; coord: { value: string }; iso: { value: string }; length?: { value: string }; site?: { value: string } };
  const rows = ((await res.json()) as { results: { bindings: B[] } }).results.bindings;
  const byQid = new Map<string, WdCircuit>();
  for (const b of rows) {
    const qid = b.item.value.split('/').pop()!;
    const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord.value);
    if (!m || /^Q\d+$/.test(b.itemLabel.value) || byQid.has(qid)) continue; // sans libellé : ignoré
    const len = b.length ? Number(b.length.value) : null;
    byQid.set(qid, {
      qid, name: b.itemLabel.value, lon: Number(m[1]), lat: Number(m[2]), country: b.iso.value,
      // P2043 est parfois en km : une piste de moins de 50 « m » est une valeur en km.
      lengthM: len == null || !Number.isFinite(len) ? null : Math.round(len < 50 ? len * 1000 : len),
      website: b.site?.value ?? null,
    });
  }
  return [...byQid.values()];
}

async function main() {
  if (REFRESH) rmSync(CACHE, { recursive: true, force: true });
  const osm: CircuitRow[] = [];
  const failed: string[] = [];
  for (const c of COUNTRIES) {
    const fromCache = existsSync(`${CACHE}/osm-${c}.json`) && readFileSync(`${CACHE}/osm-${c}.json`, 'utf8').trim() !== '[]';
    let els: OsmElement[];
    try {
      els = await cached(`osm-${c}`, () => overpass(c));
    } catch (e) {
      console.warn(`${c} : sauté (${e instanceof Error ? e.message : e})`);
      failed.push(c);
      continue;
    }
    const rows = buildOsmCircuits(els, c);
    console.log(`${c} : ${els.length} éléments OSM → ${rows.length} circuits${fromCache ? ' (cache)' : ''}`);
    osm.push(...rows);
    if (!fromCache) await sleep(2_000); // politesse envers les serveurs Overpass publics
  }
  // Un même site peut apparaître dans deux pays (frontière) : une seule fois.
  const unique = [...new Map(osm.map((r) => [r.osm_ref!, r])).values()];
  // Par lots de pays : une seule requête sur tous les pays dépasse le délai du service.
  // Lot en échec (gros pays : DE, FR, GB, US…) : on réessaie pays par pays.
  const wd: WdCircuit[] = [];
  const wdFailed: string[] = [];
  for (let i = 0; i < COUNTRIES.length; i += 8) {
    const batch = COUNTRIES.slice(i, i + 8);
    const batchFile = `${CACHE}/wd-${batch.join('-')}.json`;
    const perCountryCached = batch.every((c) => existsSync(`${CACHE}/wd-${c}.json`));
    if (!existsSync(batchFile) && perCountryCached) {
      for (const c of batch) wd.push(...(await cached(`wd-${c}`, () => wikidata([c]))));
      continue;
    }
    try {
      wd.push(...(await cached(`wd-${batch.join('-')}`, () => wikidata(batch))));
    } catch {
      console.warn(`  Wikidata (${batch.join(',')}) : lot trop lourd, pays par pays`);
      for (const c of batch) {
        try {
          wd.push(...(await cached(`wd-${c}`, () => wikidata([c]))));
        } catch (e) {
          // Sans Wikidata, les circuits OSM du pays restent importés (sans noms/longueurs Wikidata).
          console.warn(`  ${e instanceof Error ? e.message : e}`);
          wdFailed.push(c);
        }
      }
    }
  }
  console.log(`Wikidata : ${wd.length} circuits`);
  const rows = mergeWikidata(unique, wd, centersOf(unique));
  console.log(`Total : ${rows.length} (${rows.filter((r) => r.source === 'wikidata').length} Wikidata seul)`);

  const retry = () => {
    if (failed.length) console.warn(`\nPays sautés (serveurs saturés) : ${failed.join(',')}\nRelancer plus tard : npm run circuits:import -- --countries=${failed.join(',')}`);
    if (wdFailed.length) console.warn(`Wikidata indisponible pour : ${wdFailed.join(',')} (circuits OSM importés quand même ; relancer plus tard, le reste vient du cache)`);
  };

  if (DRY) {
    mkdirSync('scripts/out', { recursive: true });
    writeFileSync('scripts/out/circuits.json', JSON.stringify(rows, null, 1));
    console.log('Aperçu : scripts/out/circuits.json');
    retry();
    return;
  }

  const db = client();
  // Une entrée Wikidata seule désormais rattachée à un site OSM : on la remplace.
  const matched = rows.filter((r) => r.osm_ref && r.wikidata_id).map((r) => r.wikidata_id!);
  for (let i = 0; i < matched.length; i += 200) {
    const { error } = await db.from('circuits').delete().eq('source', 'wikidata').in('wikidata_id', matched.slice(i, i + 200));
    if (error) throw new Error(`circuits (nettoyage) : ${error.message}`);
  }
  const now = new Date().toISOString();
  await upsert(db, rows.filter((r) => r.osm_ref).map((r) => ({ ...r, updated_at: now })), 'osm_ref');
  await upsert(db, rows.filter((r) => !r.osm_ref).map((r) => ({ ...r, updated_at: now })), 'wikidata_id');
  const { data, error } = await db.rpc('circuits_fill_places');
  if (error) console.warn(`Villes non renseignées : ${error.message}`);
  else console.log(`${data} circuits rattachés à une ville.`);
  console.log('Import terminé.');
  retry();
}

async function upsert(db: ReturnType<typeof client>, rows: object[], key: string) {
  const SIZE = 200;
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error } = await db.from('circuits').upsert(rows.slice(i, i + SIZE), { onConflict: key });
    if (error) throw new Error(`circuits : ${error.message}`);
    process.stdout.write(`\r  circuits (${key}) ${Math.min(i + SIZE, rows.length)}/${rows.length}`);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
