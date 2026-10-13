import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import type { ScoreBreakdown } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

const ROWS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: 'distance', label: 'Distance' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'sinuosity', label: 'Turns' },
  { key: 'timing', label: 'Lap time' },
];

/** Score du drive et sa décomposition par critère. */
export function ScoreCard({ score, breakdown }: { score: number | null; breakdown: ScoreBreakdown | null }) {
  const rows = ROWS.filter((r) => breakdown?.[r.key] != null);
  const max = Math.max(1, ...rows.map((r) => breakdown?.[r.key] ?? 0));
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.head}>
        <Text style={styles.overline}>SCORE</Text>
        <Text style={styles.score}>{score ?? '–'}</Text>
      </View>
      {rows.map((r) => {
        const v = breakdown?.[r.key] ?? 0;
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.label}>{r.label}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${(v / max) * 100}%` }]} /></View>
            <Text style={styles.value}>{v}</Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  overline: { ...type.overline, color: colors.textMuted },
  score: { ...type.stat, color: colors.accent, fontSize: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { width: 76, color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.text },
  value: { width: 44, textAlign: 'right', color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
});
