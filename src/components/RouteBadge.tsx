import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/theme';

/** Vignette carrée colorée des cartes de route (en attendant un vrai aperçu du tracé). */
export function RouteBadge({ color, size = 56 }: { color: string; size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size, borderColor: color, backgroundColor: `${color}1A` }]}>
      <Ionicons name="git-network-outline" size={size * 0.4} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
