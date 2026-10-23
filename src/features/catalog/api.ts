import { VEHICLE_CATALOG } from '@/data/vehicles';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Catalogue marques / modèles (Wikidata + saisie manuelle dédoublonnée).
 * En mode démo, le petit catalogue local de src/data/vehicles.ts le remplace.
 */
export type CatalogItem = { id: number | null; name: string; powerKw?: number | null; weightKg?: number | null };

/** Même normalisation que public.catalog_key côté base. */
export const catalogKey = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function fetchMakes(): Promise<CatalogItem[]> {
  if (!isSupabaseConfigured) return Object.keys(VEHICLE_CATALOG).sort().map((name) => ({ id: null, name }));
  const { data, error } = await supabase.from('vehicle_makes').select('id, name').order('name').limit(3000);
  if (error) throw error;
  return data as CatalogItem[];
}

export async function fetchModels(make: CatalogItem): Promise<CatalogItem[]> {
  if (!isSupabaseConfigured || make.id == null) {
    return (VEHICLE_CATALOG[make.name] ?? []).map((name) => ({ id: null, name }));
  }
  const { data, error } = await supabase.from('vehicle_models').select('id, name, power_kw, weight_kg').eq('make_id', make.id).order('name');
  if (error) throw error;
  return ((data ?? []) as { id: number; name: string; power_kw: number | null; weight_kg: number | null }[])
    .map((m) => ({ id: m.id, name: m.name, powerKw: m.power_kw, weightKg: m.weight_kg }));
}

/** Modèles proches de ce que l'utilisateur tape, pour éviter un doublon. */
export async function suggestModels(make: CatalogItem | null, query: string): Promise<CatalogItem[]> {
  if (!make || catalogKey(query).length < 2) return [];
  if (isSupabaseConfigured && make.id != null) {
    const { data } = await supabase.rpc('suggest_vehicle_models', { p_make_id: make.id, p_query: query, p_limit: 3 });
    return ((data ?? []) as { model_id: number; name: string }[]).map((r) => ({ id: r.model_id, name: r.name }));
  }
  const q = catalogKey(query);
  return (await fetchModels(make))
    .map((m) => ({ m, sim: similarity(catalogKey(m.name), q) }))
    .filter(({ m, sim }) => sim >= 0.3 || catalogKey(m.name).startsWith(q))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map(({ m }) => m);
}

/**
 * Saisie manuelle : la base renvoie l'entrée existante si le nom correspond après normalisation
 * (ou via un alias), sinon crée une entrée non vérifiée, visible par son seul auteur jusqu'à validation.
 */
export async function proposeVehicle(make: string, model: string): Promise<{ modelId: number | null }> {
  if (!isSupabaseConfigured) return { modelId: null };
  const { data, error } = await supabase.rpc('propose_vehicle', { p_make: make, p_model: model }).single();
  if (error) throw error;
  return { modelId: (data as { model_id: number }).model_id };
}

/** Similarité de Dice sur les bigrammes (comme pg_trgm, en plus simple). */
function similarity(a: string, b: string) {
  const grams = (s: string) => new Set(Array.from({ length: Math.max(s.length - 1, 1) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(a), B = grams(b);
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return (2 * inter) / (A.size + B.size || 1);
}
