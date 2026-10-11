import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props = { children: ReactNode; scroll?: boolean; style?: ViewStyle; padded?: boolean };

/** Conteneur de base de chaque écran : fond sombre, safe area, scroll optionnel. */
export function Screen({ children, scroll = false, style, padded = true }: Props) {
  const inner = [padded && styles.padded, style];
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, styles.scrollContent]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
  scrollContent: { paddingBottom: 120 }, // laisse la place à la tab bar flottante
});
