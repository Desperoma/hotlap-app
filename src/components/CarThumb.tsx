import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { carImageFor } from '@/features/garage/carImage';
import { colors, radius } from '@/theme';

/** Vignette d'un véhicule : l'image du modèle (selon la couleur), sinon la voiture par défaut. */
export function CarThumb({ vehicle, size = 56, style }: {
  vehicle: { make: string; model: string; color?: string | null };
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { source } = carImageFor(vehicle);
  return (
    <View style={[styles.box, { width: size, height: size }, style]}>
      <Image source={source} resizeMode="contain" style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors accessibilityLabel={`${vehicle.make} ${vehicle.model}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
