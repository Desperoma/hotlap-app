/**
 * Construction des circuits à partir d'OpenStreetMap (Overpass, `out tags geom`) et de Wikidata.
 * Fonctions pures, testées par scripts/circuits.test.ts.
 */

export type Pt = { lat: number; lon: number };
export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: Pt[]; // way
  members?: { type: string; role: string; geometry?: Pt[] }[]; // relation
  lat?: number; lon?: number; // node
  center?: Pt;
};
export type WdCircuit = { qid: string; name: string; lat: number; lon: number; country: string | null; lengthM: number | null; website: string | null };

export type CircuitRow = {
  name: string;
  kind: 'track' | 'karting';
  country_code: string | null;
  location: string;       // EWKT point
  area: string | null;    // EWKT polygon
  path: string | null;    // EWKT linestring (piste la plus longue)
  lap_length_m: number | null;
  website: string | null;
  osm_ref: string | null;
  wikidata_id: string | null;
  source: 'osm' | 'wikidata' | 'osm+wikidata';
};

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distM(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const lineLengthM = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + distM(pts[i - 1], p) : 0), 0);

const closed = (pts: Pt[] | undefined) =>
  !!pts && pts.length >= 4 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lon === pts[pts.length - 1].lon;

/** Aire approximative (m²), pour choisir l'anneau extérieur le plus grand. */
function ringAreaM2(pts: Pt[]): number {
  const lat0 = rad(pts[0].lat);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const x1 = rad(pts[i - 1].lon) * Math.cos(lat0) * R, y1 = rad(pts[i - 1].lat) * R;
    const x2 = rad(pts[i].lon) * Math.cos(lat0) * R, y2 = rad(pts[i].lat) * R;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

const centroid = (pts: Pt[]): Pt => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
});

const fmt = (p: Pt) => `${p.lon.toFixed(7)} ${p.lat.toFixed(7)}`;
export const ewktPoint = (p: Pt) => `SRID=4326;POINT(${fmt(p)})`;
export const ewktLine = (pts: Pt[]) => `SRID=4326;LINESTRING(${pts.map(fmt).join(',')})`;
export const ewktPolygon = (ring: Pt[]) => `SRID=4326;POLYGON((${ring.map(fmt).join(',')}))`;

/** Anneau extérieur d'un site : la voie fermée, ou le plus grand anneau « outer » d'une relation. */
function outerRing(e: OsmElement): Pt[] | null {
  if (e.type === 'way') return closed(e.geometry) ? e.geometry! : null;
  if (e.type === 'relation') {
    const rings = (e.members ?? []).filter((m) => m.role === 'outer' && closed(m.geometry)).map((m) => m.geometry!);
    return rings.sort((a, b) => ringAreaM2(b) - ringAreaM2(a))[0] ?? null;
  }
  return null;
}

const isKart = (t: Record<string, string>) => /karting/.test(t.sport ?? '') || /kart/i.test(t.name ?? '');
const isSite = (t: Record<string, string>) =>
  /^(track|sports_centre|stadium)$/.test(t.leisure ?? '') && /(^|;)(motor|karting)(;|$)/.test(t.sport ?? '');
const nameOf = (t: Record<string, string>) => t['name:en'] || t.name || t['official_name'] || null;

/**
 * Sites OSM : un élément leisure=track/sports_centre (sport=motor|karting) nommé, avec les pistes
 * highway=raceway qu'il contient (la plus longue = tracé). Les pistes fermées nommées hors de tout
 * site (≥ 400 m) deviennent un circuit à elles seules.
 */
export function buildOsmCircuits(elements: OsmElement[], country: string | null): CircuitRow[] {
  const raceways = elements.filter((e) => e.type === 'way' && e.tags?.highway === 'raceway' && (e.geometry?.length ?? 0) >= 2);
  const used = new Set<number>();
  const out: CircuitRow[] = [];

  for (const e of elements) {
    const t = e.tags ?? {};
    if (!isSite(t)) continue;
    const name = nameOf(t);
    const ring = outerRing(e);
    if (!name || !ring) continue;
    const inside = raceways.filter((r) => pointInRing(r.geometry![Math.floor(r.geometry!.length / 2)], ring));
    inside.forEach((r) => used.add(r.id));
    const main = inside.sort((a, b) => lineLengthM(b.geometry!) - lineLengthM(a.geometry!))[0];
    const len = main ? Math.round(lineLengthM(main.geometry!)) : null;
    out.push({
      name,
      kind: isKart(t) ? 'karting' : 'track',
      country_code: country,
      location: ewktPoint(centroid(ring.slice(0, -1))),
      area: ewktPolygon(ring),
      path: main ? ewktLine(main.geometry!) : null,
      lap_length_m: main && closed(main.geometry) ? len : null,
      website: t.website || t['contact:website'] || null,
      osm_ref: `${e.type}/${e.id}`,
      wikidata_id: t.wikidata || null,
      source: 'osm',
    });
  }

  for (const r of raceways) {
    const t = r.tags ?? {};
    const name = nameOf(t);
    if (used.has(r.id) || !name || !closed(r.geometry) || lineLengthM(r.geometry!) < 400) continue;
    out.push({
      name,
      kind: isKart(t) ? 'karting' : 'track',
      country_code: country,
      location: ewktPoint(centroid(r.geometry!.slice(0, -1))),
      area: ewktPolygon(r.geometry!),
      path: ewktLine(r.geometry!),
      lap_length_m: Math.round(lineLengthM(r.geometry!)),
      website: t.website || null,
      osm_ref: `way/${r.id}`,
      wikidata_id: t.wikidata || null,
      source: 'osm',
    });
  }
  return out;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Fusion avec Wikidata : rattachement par étiquette wikidata d'OSM, sinon par proximité (< 2 km)
 * et nom proche. Les entrées Wikidata non rattachées deviennent des circuits « point seul ».
 */
export function mergeWikidata(osm: CircuitRow[], wd: WdCircuit[], osmCenters: Map<string, Pt>): CircuitRow[] {
  const byQid = new Map(osm.filter((c) => c.wikidata_id).map((c) => [c.wikidata_id!, c]));
  const rows = [...osm];
  for (const w of wd) {
    let hit = byQid.get(w.qid);
    if (!hit) {
      const p = { lat: w.lat, lon: w.lon };
      const wn = norm(w.name);
      hit = osm.find((c) => {
        const cp = osmCenters.get(c.osm_ref!);
        if (!cp || c.wikidata_id || distM(cp, p) > 2000) return false;
        const cn = norm(c.name);
        return cn.includes(wn) || wn.includes(cn) || distM(cp, p) < 600;
      });
    }
    if (hit) {
      hit.wikidata_id = w.qid;
      hit.source = 'osm+wikidata';
      hit.website ??= w.website;
      hit.lap_length_m ??= w.lengthM;
      hit.country_code ??= w.country;
      continue;
    }
    rows.push({
      name: w.name, kind: /kart/i.test(w.name) ? 'karting' : 'track', country_code: w.country,
      location: ewktPoint({ lat: w.lat, lon: w.lon }), area: null, path: null,
      lap_length_m: w.lengthM, website: w.website, osm_ref: null, wikidata_id: w.qid, source: 'wikidata',
    });
  }
  // Une même entrée Wikidata ne doit apparaître qu'une fois (clé unique en base) : les doublons
  // OSM (deux sites étiquetés avec le même élément) gardent leur circuit, sans l'identifiant.
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.wikidata_id) continue;
    if (seen.has(r.wikidata_id)) r.wikidata_id = null;
    else seen.add(r.wikidata_id);
  }
  return rows.filter((r) => r.osm_ref || r.wikidata_id);
}

/** Centre de chaque circuit OSM (pour la fusion). */
export function centersOf(rows: CircuitRow[]): Map<string, Pt> {
  const m = new Map<string, Pt>();
  for (const r of rows) {
    const g = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(r.location);
    if (r.osm_ref && g) m.set(r.osm_ref, { lon: Number(g[1]), lat: Number(g[2]) });
  }
  return m;
}
