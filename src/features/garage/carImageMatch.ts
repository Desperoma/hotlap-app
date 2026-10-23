import { CAR_IMAGE_INDEX, type CarImageEntry } from '@/data/carImageIndex';

/** Mots normalisés : minuscules, sans accents, « GT-R » -> ['gt', 'r']. */
const words = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const MAKE_ALIASES: Record<string, string[]> = {
  mercedes: ['mercedes', 'mercedesbenz', 'mercedesamg', 'amg'],
  landrover: ['landrover', 'rangerover'],
  volkswagen: ['volkswagen', 'vw'],
  chevrolet: ['chevrolet', 'chevy'],
  mini: ['mini', 'bmwmini'],
};
const makeKey = (s: string) => words(s).join('');
const sameMake = (imageMake: string, userMake: string) => {
  const k = makeKey(imageMake);
  return (MAKE_ALIASES[k] ?? [k]).includes(makeKey(userMake));
};

/**
 * Longueur du nom de modèle reconnu au début du modèle saisi, ou 0.
 * « RS 3 » reconnaît « RS3 » (3) et « RS » (2) ; « M40i » ne reconnaît pas « M4 ».
 */
function modelMatch(imageModel: string, userModel: string, userMake: string) {
  const target = words(imageModel).join('');
  // « Range Rover Sport » saisi en marque Range Rover + modèle Sport
  for (const ws of [words(userModel), [...words(userMake), ...words(userModel)]]) {
    let acc = '';
    for (const w of ws) {
      acc += w;
      if (acc === target) return target.length;
      if (acc.length >= target.length) break;
    }
  }
  return 0;
}

/**
 * Visuel d'un véhicule : le modèle le plus précis reconnu, dans sa couleur si on l'a,
 * sinon l'image de secours de la marque. null = modèle par défaut.
 */
export function matchCarImage(
  v: { make: string; model: string; color?: string | null } | null | undefined,
): CarImageEntry | null {
  if (!v) return null;
  let best: CarImageEntry[] = [];
  let bestLen = 0;
  for (const img of CAR_IMAGE_INDEX) {
    if (!sameMake(img.make, v.make)) continue;
    const len = img.models.length === 0 ? 0.5 : Math.max(0, ...img.models.map((m) => modelMatch(m, v.model, v.make)));
    if (len === 0) continue;
    if (len > bestLen) { best = [img]; bestLen = len; }
    else if (len === bestLen) best.push(img);
  }
  if (best.length === 0) return null;
  return best.find((b) => b.color === v.color) ?? best[0];
}
