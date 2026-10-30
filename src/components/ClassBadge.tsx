import { StyleSheet, Text, View } from 'react-native';

import { CLASSES, type ClassKey } from '@/features/garage/hpi';
import { fonts } from '@/theme';

/**
 * Badge de classe d'un véhicule (D, C, B, A, S1, S2, X) : parallélogramme de couleur, lettre noire
 * en italique, comme la planche des classes. Avec `hpi`, le score sur 999 suit le badge.
 */
export function ClassBadge({ cls, hpi, size = 'md' }: { cls: ClassKey; hpi?: number; size?: 'sm' | 'md' | 'lg' }) {
  const c = CLASSES.find((x) => x.key === cls) ?? CLASSES[0];
  const h = size === 'sm' ? 18 : size === 'md' ? 24 : 34;
  const w = h * (cls.length > 1 ? 1.75 : 1.35);
  return (
    <View style={styles.row} accessibilityLabel={`Class ${cls}${hpi != null ? `, ${hpi} HPI` : ''}`}>
      <View style={[styles.tile, { width: w, height: h, borderRadius: h * 0.22, backgroundColor: c.color }]}>
        <Text style={[styles.letter, { fontSize: h * 0.62, lineHeight: h * 0.8 }]}>{cls}</Text>
      </View>
      {hpi != null && <Text style={[styles.hpi, { color: c.color, fontSize: h * 0.6 }]}>{hpi}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tile: { alignItems: 'center', justifyContent: 'center', transform: [{ skewX: '-14deg' }] },
  letter: { color: '#0A0A0A', fontFamily: fonts.bold, transform: [{ skewX: '6deg' }] },
  hpi: { fontFamily: fonts.bold },
});
