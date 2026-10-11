import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '@/theme';

type Props = { label: string; active?: boolean; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void };

/** Filtres du fil (Following / Local Discover / Clubs) et badge véhicule. */
export function Chip({ label, active, icon, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.active]}>
      {icon && <Ionicons name={icon} size={12} color={active ? colors.accentText : colors.accent} />}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
  labelActive: { color: colors.accentText },
});
