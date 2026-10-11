import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void };

/** Bascule « Log in / Register », « My Routes / Explore », « My Garage / Drive Log ». */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.item, active && styles.active]}>
            <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row', backgroundColor: colors.input, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 4,
  },
  item: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  active: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  label: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 14 },
  labelActive: { color: colors.text },
});
