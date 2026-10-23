import type { ImageSourcePropType } from 'react-native';

import { CAR_IMAGE_FILES, DEFAULT_CAR_IMAGE } from '@/data/carImages';

import { matchCarImage } from './carImageMatch';

/** Image d'un véhicule (modèle reconnu, sinon le modèle par défaut). */
export function carImageFor(
  v: { make: string; model: string; color?: string | null } | null | undefined,
): { source: ImageSourcePropType; isDefault: boolean } {
  const m = matchCarImage(v);
  return m ? { source: CAR_IMAGE_FILES[m.id], isDefault: false } : { source: DEFAULT_CAR_IMAGE, isDefault: true };
}
