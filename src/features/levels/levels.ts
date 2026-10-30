/**
 * Niveaux et rangs des conducteurs (document HOTLAP Driver Ranks v3).
 *
 * L'XP vient de la base (fonction driver_xp, migration 0028), qui fait foi : ce module ne fait
 * que la convertir en niveau et en rang. Fichier sans dépendance Expo, testé par npm run levels:test.
 */

/** XP pour passer du niveau n au niveau n+1 : 700 au niveau 1, +200 par niveau (5 300 au niveau 24). */
export const xpToNext = (level: number) => 500 + 200 * level;

/** XP totale pour atteindre le niveau n (niveau 1 = 0 XP). */
export const xpForLevel = (level: number) => {
  const n = Math.max(1, Math.floor(level)) - 1;
  return 500 * n + 100 * n * (n + 1);
};

export type RankKey =
  | 'rookie' | 'amateur' | 'driver' | 'skilled' | 'experienced' | 'pro'
  | 'elite' | 'veteran' | 'master' | 'grandmaster' | 'champion' | 'legend';

export type Rank = { key: RankKey; name: string; minLevel: number; maxLevel: number | null; tagline: string; color: string };

export const RANKS: Rank[] = [
  { key: 'rookie', name: 'Rookie', minLevel: 1, maxLevel: 10, tagline: 'Just getting started', color: '#E8804A' },
  { key: 'amateur', name: 'Amateur', minLevel: 11, maxLevel: 20, tagline: 'Building experience', color: '#D9864F' },
  { key: 'driver', name: 'Driver', minLevel: 21, maxLevel: 30, tagline: 'Active driver', color: '#C9CED6' },
  { key: 'skilled', name: 'Skilled', minLevel: 31, maxLevel: 40, tagline: 'Consistent performance', color: '#F5D33B' },
  { key: 'experienced', name: 'Experienced', minLevel: 41, maxLevel: 50, tagline: 'Well rounded driver', color: '#22C55E' },
  { key: 'pro', name: 'Pro', minLevel: 51, maxLevel: 60, tagline: 'High performance', color: '#2F8CFF' },
  { key: 'elite', name: 'Elite', minLevel: 61, maxLevel: 70, tagline: 'Top tier driver', color: '#A63CF2' },
  { key: 'veteran', name: 'Veteran', minLevel: 71, maxLevel: 80, tagline: 'Extensive experience', color: '#E33535' },
  { key: 'master', name: 'Master', minLevel: 81, maxLevel: 90, tagline: 'Exceptional skill', color: '#2CD5E8' },
  { key: 'grandmaster', name: 'Grandmaster', minLevel: 91, maxLevel: 100, tagline: 'Elite performance', color: '#F5C542' },
  { key: 'champion', name: 'Champion', minLevel: 101, maxLevel: 150, tagline: 'Proven excellence', color: '#F06A2C' },
  { key: 'legend', name: 'Legend', minLevel: 151, maxLevel: null, tagline: 'The highest rank in HOTLAP', color: '#C6F432' },
];

export const rankFor = (level: number) =>
  RANKS.find((r) => level >= r.minLevel && (r.maxLevel == null || level <= r.maxLevel)) ?? RANKS[0];

export type LevelInfo = {
  xp: number; level: number; rank: Rank;
  /** XP gagnée depuis le début du niveau, et XP du niveau entier */
  into: number; span: number; progress: number;
};

export function levelFromXp(xpRaw: number): LevelInfo {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  // Inverse de xpForLevel (n = niveau - 1) : 100 n² + 600 n - xp = 0, puis correction d'arrondi.
  let level = Math.floor((-600 + Math.sqrt(360000 + 400 * xp)) / 200) + 1;
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const into = xp - xpForLevel(level), span = xpToNext(level);
  return { xp, level, rank: rankFor(level), into, span, progress: Math.min(1, into / span) };
}

/** Barème affiché dans l'app (le même que driver_xp). */
export const XP_RULES: { label: string; xp: string; soon?: boolean }[] = [
  { label: 'Drive 1 km', xp: '+10 XP' },
  { label: 'First visit to a new track', xp: '+100 XP' },
  { label: 'First verified track session', xp: '+250 XP' },
  { label: 'Complete a verified session', xp: '+100 XP' },
  { label: 'Beat your personal lap record', xp: '+200 XP' },
  { label: 'First session in a new track category', xp: '+150 XP' },
  { label: 'Participate in an organised track event', xp: '+300 XP', soon: true },
  { label: 'Unlock an achievement', xp: '+100–500 XP', soon: true },
];
