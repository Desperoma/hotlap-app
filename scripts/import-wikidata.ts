/**
 * Import du catalogue marques / modèles depuis Wikidata (licence CC0) vers Supabase.
 *
 *   npm run catalog:import -- --dry-run            aperçu dans scripts/out/, sans toucher à la base
 *   npm run catalog:import -- --makes=Q6746,Q27564  seulement ces marques
 *   npm run catalog:import                          import complet
 *
 * Besoin, dans .env.local : EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
 * La clé service_role contourne la RLS : elle ne doit JAMAIS être dans l'app ni commitée.
 *
 * Fonctionnement :
 *   1. liste les marques ayant au moins --min-models modèles d'automobile (Q3231690) ;
 *   2. pour chaque marque, récupère ses modèles, années et noms alternatifs (une requête par marque,
 *      pour rester sous le délai du service de requêtes) ;
 *   3. dédoublonne (nom normalisé, alias) puis insère ou complète la base, sans écraser les saisies
 *      validées ; les entrées existantes sans identifiant Wikidata sont rattachées à leur QID.
 * Relançable sans risque : l'import est idempotent (clé = QID Wikidata, puis nom normalisé).
 *
 * Propriétés lues (à vérifier au premier import, l'usage varie d'un modèle à l'autre) :
 *   marque P1716, sinon constructeur P176 ; début P2031 / P571 / P580 ; fin P2032 / P582 / P730.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildModels, catalogKey, type WdModelBinding } from './lib/catalog';

const ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikidata demande un User-Agent identifiable avec un contact.
const USER_AGENT = 'HotLapCatalogImport/0.1 (contact: equipe HotLap)';

const args = Object.fromEntries(
  process.argv.slice(2).map((a: string) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const DRY = args['dry-run'] === 'true';
const MIN_MODELS = Number(args['min-models'] ?? 3);
const ONLY = args.makes ? String(args.makes).split(',') : null;

loadEnv('.env.local');

async function sparql<T>(query: string): Promise<T[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return ((await res.json()) as { results: { bindings: T[] } }).results.bindings;
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || attempt * 5000;
      console.warn(`  Wikidata ${res.status}, nouvel essai dans ${wait / 1000} s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error('Wikidata indisponible après 4 essais');
}

const MAKES_QUERY = `
SELECT ?make ?makeLabel (COUNT(DISTINCT ?model) AS ?n) WHERE {
  ?model wdt:P31 wd:Q3231690 ; (wdt:P1716|wdt:P176) ?make .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
GROUP BY ?make ?makeLabel
HAVING (COUNT(DISTINCT ?model) >= ${MIN_MODELS})`;

const modelsQuery = (makeQid: string) => `
SELECT ?model ?modelLabel
       (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
       (MIN(YEAR(?s)) AS ?from) (MAX(YEAR(?e)) AS ?to) (MIN(?pw) AS ?power) (MIN(?kg) AS ?mass)
WHERE {
  ?model wdt:P31 wd:Q3231690 ; (wdt:P1716|wdt:P176) wd:${makeQid} .
  OPTIONAL { ?model (wdt:P2031|wdt:P571|wdt:P580) ?s }
  OPTIONAL { ?model (wdt:P2032|wdt:P582|wdt:P730) ?e }
  OPTIONAL { ?model skos:altLabel ?alt . FILTER(LANG(?alt) IN ("fr", "en")) }
  OPTIONAL { ?model p:P2109/psn:P2109/wikibase:quantityAmount ?pw }
  OPTIONAL { ?model p:P2067/psn:P2067/wikibase:quantityAmount ?kg }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?model rdfs:label ?modelLabel . }
}
GROUP BY ?model ?modelLabel`;

type MakeBinding = { make: { value: string }; makeLabel: { value: string }; n: { value: string } };

async function main() {
  console.log(`Import Wikidata ${DRY ? '(aperçu, sans écriture)' : ''}`);
  let makes = (await sparql<MakeBinding>(MAKES_QUERY))
    .map((b) => ({ qid: b.make.value.split('/').pop()!, name: b.makeLabel.value.trim(), count: Number(b.n.value) }))
    .filter((m) => !/^Q\d+$/.test(m.name));
  if (ONLY) makes = makes.filter((m) => ONLY.includes(m.qid));
  // Deux QID peuvent porter le même nom (marque et groupe) : on garde celui qui a le plus de modèles.
  const byKey = new Map<string, (typeof makes)[number]>();
  for (const m of makes) {
    const k = catalogKey(m.name);
    if (!byKey.has(k) || byKey.get(k)!.count < m.count) byKey.set(k, m);
  }
  makes = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  console.log(`${makes.length} marques retenues (au moins ${MIN_MODELS} modèles)`);

  const db = DRY ? null : supabaseAdmin();
  const preview: unknown[] = [];
  const totals = { models: 0, merged: 0, skipped: 0, inserted: 0, linked: 0, aliases: 0 };

  for (const make of makes) {
    await sleep(1000); // une requête par seconde, par politesse envers le service public
    const bindings = await sparql<WdModelBinding>(modelsQuery(make.qid));
    const { models, merged, skipped } = buildModels(bindings, make.name);
    totals.models += models.length; totals.merged += merged; totals.skipped += skipped;
    console.log(`  ${make.name.padEnd(28)} ${String(models.length).padStart(4)} modèles  (${merged} doublons fusionnés, ${skipped} sans nom)`);
    if (DRY) { preview.push({ make, models }); continue; }
    const r = await upsertMake(db!, make, models);
    totals.inserted += r.inserted; totals.linked += r.linked; totals.aliases += r.aliases;
  }

  if (DRY) {
    const dir = join('scripts', 'out');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'catalog-preview.json'), JSON.stringify(preview, null, 2));
    console.log(`Aperçu écrit dans ${join(dir, 'catalog-preview.json')}`);
  }
  console.log('Total :', totals);
}

type Db = ReturnType<typeof supabaseAdmin>;

async function upsertMake(db: Db, make: { qid: string; name: string }, models: ReturnType<typeof buildModels>['models']) {
  const res = { inserted: 0, linked: 0, aliases: 0 };

  // Marque : par QID, sinon par nom normalisé (ex. saisie du seed ou d'un utilisateur), sinon création.
  let makeId: number | undefined;
  const { data: makeByQid } = await db.from('vehicle_makes').select('id').eq('wikidata_qid', make.qid).maybeSingle();
  makeId = makeByQid?.id;
  if (!makeId) {
    const { data: byName } = await db.from('vehicle_makes').select('id, wikidata_qid')
      .eq('name_key', catalogKey(make.name)).is('merged_into', null).maybeSingle();
    if (byName && !byName.wikidata_qid) {
      await db.from('vehicle_makes').update({ wikidata_qid: make.qid, is_verified: true }).eq('id', byName.id);
      makeId = byName.id;
    } else if (!byName) {
      const { data, error } = await db.from('vehicle_makes')
        .insert({ name: make.name, wikidata_qid: make.qid, source: 'wikidata', is_verified: true }).select('id').single();
      if (error) throw error;
      makeId = data.id;
    } else makeId = byName.id;
  }

  const { data: existing } = await db.from('vehicle_models')
    .select('id, name_key, wikidata_qid').eq('make_id', makeId!).is('merged_into', null);
  const byKey = new Map((existing ?? []).map((m) => [m.name_key as string, m]));
  const byQid = new Map((existing ?? []).filter((m) => m.wikidata_qid).map((m) => [m.wikidata_qid as string, m]));

  for (const m of models) {
    let id = byQid.get(m.qid)?.id ?? byKey.get(m.key)?.id;
    if (id) {
      // Rattache le QID et complète les années sans écraser ce qui existe.
      const patch: Record<string, unknown> = { wikidata_qid: m.qid };
      if (m.yearFrom) patch.year_from = m.yearFrom;
      if (m.yearTo) patch.year_to = m.yearTo;
      const { error } = await db.from('vehicle_models').update(patch).eq('id', id).is('wikidata_qid', null);
      if (!error) res.linked++;
      // Puissance et poids théoriques : complétés sans écraser une valeur existante.
      if (m.powerKw) await db.from('vehicle_models').update({ power_kw: m.powerKw }).eq('id', id).is('power_kw', null);
      if (m.weightKg) await db.from('vehicle_models').update({ weight_kg: m.weightKg }).eq('id', id).is('weight_kg', null);
    } else {
      const { data, error } = await db.from('vehicle_models').insert({
        make_id: makeId, name: m.name, wikidata_qid: m.qid, year_from: m.yearFrom, year_to: m.yearTo,
        power_kw: m.powerKw, weight_kg: m.weightKg,
        source: 'wikidata', is_verified: true,
      }).select('id').single();
      if (error) { console.warn(`    ${m.name} ignoré : ${error.message}`); continue; }
      id = data.id;
      res.inserted++;
    }
    if (m.aliases.length) {
      const { error } = await db.from('vehicle_model_aliases')
        .upsert(m.aliases.map((alias) => ({ model_id: id, alias })), { onConflict: 'model_id,alias_key', ignoreDuplicates: true });
      if (!error) res.aliases += m.aliases.length;
    }
  }
  return res;
}

function supabaseAdmin() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local (ou --dry-run)');
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
