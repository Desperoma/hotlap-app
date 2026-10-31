import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, type } from '@/theme';

import { t } from '@/i18n';
type Props = {
  label: string;
  placeholder: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
};

/** Champ déroulant + feuille de sélection (« Select Model » dans la maquette). */
export function Picker({ label, placeholder, value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, disabled && { opacity: 0.5 }]}
      >
        <Text style={[styles.value, !value && { color: colors.textFaint }]}>{value ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('Select')}{' '}{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o}
            renderItem={({ item }) => (
              <Pressable
                style={styles.option}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, item === value && { color: colors.accent }]}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  field: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14,
  },
  value: { color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '60%', backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { ...type.h2, color: colors.text },
  option: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.text, fontFamily: fonts.regular, fontSize: 16 },
});
