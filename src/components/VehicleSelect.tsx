import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { vehicleLabel } from '@/features/garage/VehicleForm';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
/**
 * Choix du véhicule d'un drive parmi le garage (avant le départ, au récap, sur le détail).
 * compact : une pastille qui tient dans le panneau de la carte.
 */
export function VehicleSelect({ value, onChange, label = 'Vehicle', compact = false, disabled = false, hideTrigger = false, open: openProp, onOpenChange }: {
  value: string | null;
  onChange: (vehicleId: string | null) => void;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  /** Feuille seule, ouverte par un autre bouton (ex. « + » de la vitrine) */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { vehicles } = useAuth();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const insets = useSafeAreaInsets();
  const selected = vehicles?.find((v) => v.id === value) ?? null;
  const text = selected ? vehicleLabel(selected) : vehicles?.length ? t('No vehicle') : t('Add a vehicle');

  const openSheet = () => {
    if (!vehicles?.length) return router.push('/garage/edit');
    setOpen(true);
  };

  return (
    <View style={hideTrigger ? undefined : { gap: 8 }}>
      {!compact && !hideTrigger && <Text style={styles.label}>{label}</Text>}
      {!hideTrigger && (
      <Pressable
        onPress={openSheet}
        disabled={disabled}
        style={({ pressed }) => [compact ? styles.pill : styles.field, (pressed || disabled) && { opacity: 0.7 }]}
        accessibilityLabel={t('{0}: {1}. Change', label, text)}
      >
        <Ionicons name="car-sport" size={compact ? 14 : 18} color={colors.accent} />
        <Text style={[compact ? styles.pillText : styles.value]} numberOfLines={1}>{text}</Text>
        {!disabled && <Ionicons name="chevron-down" size={compact ? 14 : 18} color={colors.textMuted} />}
      </Pressable>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('Close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('Which car?')}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView>
            {vehicles?.map((v) => (
              <Pressable
                key={v.id}
                style={styles.option}
                onPress={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, v.id === value && { color: colors.accent }]}>{vehicleLabel(v)}</Text>
                  <Text style={styles.optionMeta}>{[v.year, v.is_primary ? 'Favorite' : null].filter(Boolean).join(' · ')}</Text>
                </View>
                {v.id === value && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </Pressable>
            ))}
            <Pressable
              style={styles.option}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <Text style={[styles.optionText, value === null && { color: colors.accent }]}>{t('No vehicle')}</Text>
            </Pressable>
            <Pressable
              style={styles.option}
              onPress={() => {
                setOpen(false);
                router.push('/garage/edit');
              }}
            >
              <Text style={[styles.optionText, { color: colors.textMuted }]}>{t('+ Add a vehicle to my garage')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  field: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
  },
  value: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  pillText: { flexShrink: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '60%', backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { ...type.h2, color: colors.text },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionText: { color: colors.text, fontFamily: fonts.regular, fontSize: 16 },
  optionMeta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
});
