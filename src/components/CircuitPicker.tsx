import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DropdownField, Sheet } from '@/components/Dropdown';
import { searchCircuits, type CircuitHit } from '@/features/search/api';
import type { LapCircuit } from '@/features/sprint/api';
import { colors, fonts, radius, spacing } from '@/theme';

export type PickedCircuit = { id: string; name: string; city: string | null; countryCode: string | null };

/**
 * Choix du circuit du classement Laps : les circuits qui ont déjà des tours en premier, puis une
 * recherche parmi tous les circuits (nom ou ville).
 */
export function CircuitPicker({ value, withLaps, onChange }: {
  value: PickedCircuit | null; withLaps: LapCircuit[]; onChange: (c: PickedCircuit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CircuitHit[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    let live = true;
    const t = setTimeout(() => searchCircuits(q).then((h) => live && setHits(h)).catch(() => live && setHits([])), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const pick = (c: PickedCircuit) => { setOpen(false); setQ(''); onChange(c); };
  const where = (city: string | null, cc: string | null) => [city, cc].filter(Boolean).join(' · ');

  return (
    <>
      <DropdownField label="Circuit" value={value ? value.name : 'Choose a circuit'} onPress={() => setOpen(true)}
        left={<Ionicons name="flag" size={14} color={colors.accent} />} />
      <Sheet visible={open} title="Circuit" onClose={() => setOpen(false)}>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search a circuit or a city" placeholderTextColor={colors.textFaint}
            style={styles.input} autoCorrect={false} returnKeyType="search" />
        </View>
        {hits === null ? (
          <>
            <Text style={styles.section}>WITH LAP TIMES</Text>
            {withLaps.length === 0 && <Text style={styles.hint}>Aucun tour chronométré pour l’instant : cherche un circuit.</Text>}
            {withLaps.map((c) => (
              <Row key={c.id} name={c.name} sub={`${where(c.city, c.countryCode)}${c.laps ? `${c.city || c.countryCode ? ' · ' : ''}${c.laps} lap${c.laps > 1 ? 's' : ''}` : ''}`}
                selected={value?.id === c.id} onPress={() => pick(c)} />
            ))}
          </>
        ) : hits.length === 0 ? (
          <Text style={styles.hint}>Aucun circuit trouvé.</Text>
        ) : hits.map((h) => (
          <Row key={h.id} name={h.name} sub={where(h.city, h.country_code)} selected={value?.id === h.id}
            onPress={() => pick({ id: h.id, name: h.name, city: h.city, countryCode: h.country_code })} />
        ))}
        {q.trim().length >= 2 && hits === null && <ActivityIndicator color={colors.accent} />}
      </Sheet>
    </>
  );
}

function Row({ name, sub, selected, onPress }: { name: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardPressed }]} onPress={onPress}>
      <Ionicons name="flag-outline" size={16} color={selected ? colors.accent : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, selected && { color: colors.accent }]} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={styles.hint} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.input, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 44, marginBottom: spacing.md,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  section: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 10 },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
