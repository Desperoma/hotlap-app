import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '@/theme';

export type DropdownOption<T extends string> = { key: T; label: string; hint?: string; left?: ReactNode };

/**
 * Menu déroulant : un champ compact (libellé + valeur), qui ouvre la liste des choix en bas
 * d'écran. Remplace une rangée de boutons quand l'espace manque.
 */
export function Dropdown<T extends string>({ label, value, options, onChange, style }: {
  label: string; value: T; options: DropdownOption<T>[]; onChange: (v: T) => void; style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);
  return (
    <>
      <DropdownField label={label} value={current?.label ?? '—'} left={current?.left} onPress={() => setOpen(true)} style={style} />
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <Pressable key={o.key} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.cardPressed }]}
            onPress={() => { setOpen(false); onChange(o.key); }} accessibilityState={{ selected: o.key === value }}>
            {o.left}
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, o.key === value && { color: colors.accent }]}>{o.label}</Text>
              {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
            </View>
            {o.key === value && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/** Champ d'un menu déroulant (aussi utilisé par le choix du circuit). */
export function DropdownField({ label, value, left, onPress, style }: {
  label: string; value: string; left?: ReactNode; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.field, pressed && { backgroundColor: colors.cardPressed }, style]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.fieldLabel} numberOfLines={1}>{label.toUpperCase()}</Text>
        <View style={styles.fieldRow}>
          {left}
          <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
        </View>
      </View>
      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/** Feuille en bas d'écran avec un titre. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, minHeight: 50,
  },
  fieldLabel: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldValue: { flexShrink: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 8, marginBottom: 12 },
  title: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1, marginBottom: spacing.sm, textTransform: 'uppercase' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: 4, borderRadius: 10 },
  optionText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
