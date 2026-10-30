/**
 * Classe d'un véhicule : HPI (HotLap Performance Index) sur 999, comme Forza.
 *   HPI = 999 × (0,60 P + 0,40 A)
 *   P : rapport poids/puissance, en ch par tonne, sur une échelle logarithmique de 30 ch/t (0) à 800 ch/t (1)
 *   A : accélération, 0-100 km/h, de 15 s (0) à 2,5 s (1), logarithmique aussi
 * Le 0-100 est le meilleur mesuré en mode Sprint avec ce véhicule, sinon une estimation tirée du
 * rapport poids/puissance. Repères : Fiat Panda ≈ 180 (D), Golf GTI ≈ 510 (B), 911 GT3 ≈ 780 (A),
 * Ferrari 296 ≈ 900 (S2), Bugatti Chiron ≈ 990 (X).
 * Même calcul en SQL (hpi_of, migration 0029) pour les classements : modifier les deux ensemble.
 * Fichier sans dépendance Expo, testé par npm run levels:test.
 */

export type ClassKey = 'D' | 'C' | 'B' | 'A' | 'S1' | 'S2' | 'X';
export const CLASSES: { key: ClassKey; min: number; max: number; color: string }[] = [
  { key: 'D', min: 0, max: 299, color: '#B8BCC4' },
  { key: 'C', min: 300, max: 499, color: '#22F06A' },
  { key: 'B', min: 500, max: 649, color: '#1E7BFF' },
  { key: 'A', min: 650, max: 799, color: '#9B30F5' },
  { key: 'S1', min: 800, max: 899, color: '#FF8A00' },
  { key: 'S2', min: 900, max: 949, color: '#F0283C' },
  { key: 'X', min: 950, max: 999, color: '#D4FF1E' },
];
export const classOf = (hpi: number) => CLASSES.find((c) => hpi <= c.max) ?? CLASSES[CLASSES.length - 1];

const KW_TO_HP = 1.341;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0-100 km/h estimé (s) d'après le rapport poids/puissance (ch/t), borné à 2,3 s (motricité). */
export const estimate0to100 = (hpPerTonne: number) => Math.max(2.3, 12 * Math.pow(82 / hpPerTonne, 0.86));

export type Hpi = { hpi: number; cls: (typeof CLASSES)[number]; hpPerTonne: number; zeroTo100S: number; measured: boolean };

export function hpiFor(v: { powerKw?: number | null; weightKg?: number | null; best0to100Ms?: number | null }): Hpi | null {
  if (!v.powerKw || !v.weightKg || v.powerKw <= 0 || v.weightKg <= 0) return null;
  const hpt = (v.powerKw * KW_TO_HP) / (v.weightKg / 1000);
  const measured = v.best0to100Ms != null && v.best0to100Ms > 0;
  const t = measured ? v.best0to100Ms! / 1000 : estimate0to100(hpt);
  const P = clamp01(Math.log(hpt / 30) / Math.log(800 / 30));
  const A = clamp01(Math.log(15 / t) / Math.log(15 / 2.5));
  const hpi = Math.round(999 * (0.6 * P + 0.4 * A));
  return { hpi, cls: classOf(hpi), hpPerTonne: hpt, zeroTo100S: t, measured };
}
