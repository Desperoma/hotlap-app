import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useGForce } from '@/features/recording/useGForce';
import { colors, fonts, type } from '@/theme';

export function GForceCard() {
  const g = useGForce();
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>LIVE G-FORCE</Text>
        <View style={styles.live}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      <View style={styles.row}>
        <Metric label="LATERAL" value={g.lateral} />
        <Metric label="ACCEL / BRAKE" value={g.longitudinal} />
      </View>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value.toFixed(2)} G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { ...type.h2, color: colors.text, fontSize: 14 },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, backgroundColor: colors.accentSoft,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10 },
  row: { flexDirection: 'row' },
  metricLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.5 },
  metricValue: { ...type.stat, color: colors.text },
});
