import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { formatLap, type Lap } from '@/features/circuit/laps';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Tours d'un drive sur circuit, meilleur tour en vert, écart au meilleur pour les autres. */
export function LapList({ laps, circuitId, circuitName, note }: {
  laps: Lap[]; circuitId?: string | null; circuitName?: string | null; note?: string;
}) {
  const best = laps.reduce<Lap | null>((b, l) => (!b || l.timeMs < b.timeMs ? l : b), null);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('LAPS')}{laps.length ? ` · ${laps.length}` : ''}</Text>
        {circuitId ? (
          <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/leaderboard', params: { circuit: circuitId, circuitName: circuitName ?? '' } })}>
            <Text style={styles.link}>{t('Leaderboard')}</Text>
          </Pressable>
        ) : null}
      </View>
      {laps.length === 0 ? (
        <Text style={styles.muted}>{t('Aucun tour complet : passe deux fois la ligne de départ (15 s et 200 m minimum par tour).')}</Text>
      ) : laps.map((l) => {
        const isBest = best?.lapNo === l.lapNo;
        return (
          <View key={l.lapNo} style={styles.row}>
            <Text style={styles.no}>{t('Lap')}{' '}{l.lapNo}</Text>
            <Text style={[styles.time, isBest && { color: colors.accent }]}>{formatLap(l.timeMs)}</Text>
            <Text style={styles.delta}>{isBest ? t('BEST') : best ? `+${((l.timeMs - best.timeMs) / 1000).toFixed(3)}` : ''}</Text>
          </View>
        );
      })}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.overline, color: colors.accent },
  link: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  no: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
  time: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
  delta: { width: 70, textAlign: 'right', color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  note: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11 },
});
