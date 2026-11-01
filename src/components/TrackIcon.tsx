import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

import type { CircuitCategory } from '@/features/circuit/api';

/** Logos des catégories de circuit (planche HOTLAP Track Categories), et logo d'un drive. */
const ICONS: Record<CircuitCategory | 'drive', ImageSourcePropType> = {
  racing: require('../../assets/tracks/racing.png'),
  dirt: require('../../assets/tracks/dirt.png'),
  offroad: require('../../assets/tracks/offroad.png'),
  drag: require('../../assets/tracks/drag.png'),
  karting: require('../../assets/tracks/karting.png'),
  drift: require('../../assets/tracks/drift.png'),
  drive: require('../../assets/tracks/drive.png'),
};

export function TrackIcon({ category, size = 28, style }: {
  category: CircuitCategory | 'drive' | string | null | undefined; size?: number; style?: StyleProp<ImageStyle>;
}) {
  const src = ICONS[(category && category in ICONS ? category : 'racing') as CircuitCategory];
  return <Image source={src} style={[{ width: size, height: size }, style]} fadeDuration={0} />;
}

/**
 * Petites icônes (30 pt, @2x/@3x) pour les repères de la carte : passées en `image` au Marker,
 * elles sont dessinées par la carte native, sans vue React à photographier (bien plus fluide).
 */
export const TRACK_PINS: Record<CircuitCategory, number> = {
  racing: require('../../assets/tracks/pin/racing.png'),
  dirt: require('../../assets/tracks/pin/dirt.png'),
  offroad: require('../../assets/tracks/pin/offroad.png'),
  drag: require('../../assets/tracks/pin/drag.png'),
  karting: require('../../assets/tracks/pin/karting.png'),
  drift: require('../../assets/tracks/pin/drift.png'),
};

