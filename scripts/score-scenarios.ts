// Compare la formule de score sur des tracés simulés (bruit GPS inclus).
// Lancer : npm run score:check — à relancer après chaque changement de pondération.
import { computeScore } from '../src/features/scoring/score';
type P = { ts: number; lat: number; lng: number; altitude: number | null; speed: number | null; accuracy: number | null };
// Tortue en mètres -> lat/lng. seg = [longueur m, virage total ° (+gauche), montée m]
function track(segs: [number, number, number][], spacing: number, noise = 1.5): P[] {
  let x = 0, y = 0, h = 0, z = 300, t = 0; const pts: P[] = [];
  const push = () => { const nx = (Math.random()-0.5)*2*noise, ny = (Math.random()-0.5)*2*noise;
    pts.push({ ts: t++ * 1000, lat: 45 + (y+ny) / 111320, lng: 6 + (x+nx) / (111320 * Math.cos(45*Math.PI/180)), altitude: z + (Math.random()-0.5)*4, speed: null, accuracy: 5 }); };
  push();
  for (const [len, turn, climb] of segs) {
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) { h += (turn / n) * Math.PI / 180; x += Math.cos(h) * len / n; y += Math.sin(h) * len / n; z += climb / n;
      if ((i * len / n) % spacing < len / n) push(); }
  }
  return pts;
}
const rep = <T,>(k: number, f: (i: number) => T[]) => Array.from({ length: k }, (_, i) => f(i)).flat();
const cases: Record<string, P[]> = {
  'Route plate droite 20 km': track([[20000, 0, 0]], 25),
  'Autoroute plate 30 km, courbes larges': track(rep(10, (i) => [[2500, 0, 0], [500, i % 2 ? 20 : -20, 0]] as [number, number, number][]), 30),
  'Col 15 km, 30 épingles, +900 m': track(rep(30, (i) => [[400, 0, 25], [50, i % 2 ? 170 : -170, 5]] as [number, number, number][]), 12),
  'Route sinueuse 20 km, virages R=80 m': track(rep(80, (i) => [[150, 0, 0], [100, i % 2 ? 70 : -70, 0]] as [number, number, number][]), 18),
  'Ville 8 km, 50 carrefours à 90°': track(rep(50, (i) => [[150, 0, 0], [12, i % 2 ? 90 : -90, 0]] as [number, number, number][]), 8),
  'Parking, 2 km de cercles R=15 m': track(rep(21, () => [[94, 360, 0]] as [number, number, number][]), 5),
};
console.log('cas'.padEnd(40), 'km'.padStart(5), 'pente%'.padStart(7), 'virages'.padStart(8), 'Σa/l'.padStart(7), '°/km'.padStart(6), '| proposition (dist/dén/vir)'.padEnd(34), '| formule équipe');
for (const [name, pts] of Object.entries(cases)) {
  const r = computeScore(pts);
  const b = r.breakdown;
  console.log(name.padEnd(40), (r.metrics.distanceM/1000).toFixed(1).padStart(5), r.metrics.meanAbsGradePct.toFixed(1).padStart(7),
    String(r.metrics.turns.length).padStart(8), r.metrics.turnsCurvatureSum.toFixed(0).padStart(7), r.metrics.turnsDegPerKm.toFixed(0).padStart(6), `| ${String(r.score).padStart(4)} (${b.distance}/${b.elevation}/${b.sinuosity})`.padEnd(34), `| ${Math.round(r.teamFormula).toLocaleString('fr-FR')}`);
}
