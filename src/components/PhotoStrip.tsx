import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme';

import { t } from '@/i18n';
/** Bandeau de photos ; avec onAdd / onRemove, sert aussi à composer les photos d'un drive. */
export function PhotoStrip({ uris, onAdd, onRemove, size = 96 }: {
  uris: string[];
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  size?: number;
}) {
  if (uris.length === 0 && !onAdd) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {uris.map((uri, i) => (
        <View key={uri} style={{ width: size, height: size }}>
          <Image source={{ uri }} style={[styles.photo, { width: size, height: size }]} accessibilityIgnoresInvertColors />
          {onRemove && (
            <Pressable style={styles.remove} onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={t('Remove photo')}>
              <Ionicons name="close" size={14} color={colors.text} />
            </Pressable>
          )}
        </View>
      ))}
      {onAdd && (
        <Pressable style={[styles.add, { width: size, height: size }]} onPress={onAdd} accessibilityLabel={t('Add photos')}>
          <Ionicons name="camera-outline" size={22} color={colors.accent} />
          <Text style={styles.addText}>{t('Add photos')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photo: { borderRadius: radius.md, backgroundColor: colors.card },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(14,16,14,0.8)', alignItems: 'center', justifyContent: 'center',
  },
  add: {
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
});
