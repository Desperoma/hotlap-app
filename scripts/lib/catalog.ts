/**
 * Transformation Wikidata -> lignes du catalogue, sans accès réseau (testable).
 * Même normalisation que la fonction SQL public.catalog_key.
 */
export const catalogKey = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export type WdModelBinding = {
  model: { value: string };
  modelLabel?: { value: string };
  alts?: { value: string };
  from?: { value: string };
  to?: { value: string };
  /** Puissance normalisée en watts (P2109) et masse en kg (P2067), la plus petite version connue */
  power?: { value: string };
  mass?: { value: string };
};

export type CatalogModel = {
  qid: string;
  name: string;
  key: string;
  yearFrom: number | null;
  yearTo: number | null;
  aliases: string[];
  powerKw: number | null;
  weightKg: number | null;
};

const qidOf = (uri: string) => uri.split('/').pop()!;
/** Watts -> kW, gardé seulement dans une plage plausible pour une voiture. */
export const powerKwOf = (v?: { value: string }) => {
  const w = v ? Number(v.value) : NaN;
  const kw = w / 1000;
  return Number.isFinite(kw) && kw >= 5 && kw <= 2500 ? Math.round(kw * 10) / 10 : null;
};
export const weightKgOf = (v?: { value: string }) => {
  const kg = v ? Number(v.value) : NaN;
  return Number.isFinite(kg) && kg >= 300 && kg <= 8000 ? Math.round(kg) : null;
};
const isQid = (s: string) => /^Q\d+$/.test(s);
const thisYear = new Date().getFullYear();
const year = (v?: { value: string }) => {
  const n = v ? parseInt(v.value, 10) : NaN;
  return Number.isFinite(n) && n >= 1885 && n <= thisYear + 2 ? n : null;
};

/** Retire le nom de la marque en tête : « Peugeot 208 » -> « 208 ». */
export function stripMake(label: string, makeName: string) {
  const l = label.trim();
  if (l.toLowerCase().startsWith(makeName.toLowerCase())) {
    const rest = l.slice(makeName.length);
    // n'enlève la marque que si elle est suivie d'un espace ou d'un tiret (« Peugeot 208 », pas « Peugeotte »)
    if (/^[\s-]+\S/.test(rest)) return rest.replace(/^[\s-]+/, '');
  }
  return l;
}

/**
 * Construit les modèles d'une marque et fusionne les doublons (même clé normalisée) :
 * on garde l'entrée la plus complète, les autres noms deviennent des alias.
 */
export function buildModels(bindings: WdModelBinding[], makeName: string) {
  const byKey = new Map<string, CatalogModel>();
  let skipped = 0;
  let merged = 0;

  for (const b of bindings) {
    const rawLabel = b.modelLabel?.value?.trim() ?? '';
    if (!rawLabel || isQid(rawLabel)) { skipped++; continue; } // pas de libellé fr/en
    const name = stripMake(rawLabel, makeName);
    const key = catalogKey(name);
    if (!key) { skipped++; continue; }

    const aliases = new Set<string>();
    if (rawLabel !== name) aliases.add(rawLabel);
    for (const a of (b.alts?.value ?? '').split('|').map((s) => s.trim()).filter(Boolean)) {
      const short = stripMake(a, makeName);
      if (catalogKey(short) !== key) aliases.add(short);
    }
    let yearFrom = year(b.from);
    let yearTo = year(b.to);
    if (yearFrom && yearTo && yearTo < yearFrom) yearTo = null;

    const entry: CatalogModel = {
      qid: qidOf(b.model.value), name, key, yearFrom, yearTo, aliases: [...aliases],
      powerKw: powerKwOf(b.power), weightKg: weightKgOf(b.mass),
    };
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, entry); continue; }

    merged++;
    const score = (m: CatalogModel) => (m.yearFrom ? 2 : 0) + (m.yearTo ? 1 : 0) + m.aliases.length / 100;
    const [keep, drop] = score(entry) > score(existing) ? [entry, existing] : [existing, entry];
    keep.aliases = [...new Set([...keep.aliases, ...drop.aliases, drop.name])].filter((a) => catalogKey(a) !== keep.key);
    keep.yearFrom = keep.yearFrom ?? drop.yearFrom;
    keep.yearTo = keep.yearTo ?? drop.yearTo;
    keep.powerKw = keep.powerKw ?? drop.powerKw;
    keep.weightKg = keep.weightKg ?? drop.weightKg;
    byKey.set(key, keep);
  }
  return { models: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)), skipped, merged };
}
