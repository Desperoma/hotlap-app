import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { formatSprint, SPRINTS, type SprintKind } from '@/features/sprint/sprint';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Temps Sprint d'un drive (récap ou détail), avec un lien vers le classement de chaque mesure. */
export function SprintResults({ results, note }: {
  results: { kind: SprintKind; timeMs: number; exitSpeedKmh: number | null }[];
  note?: string;
}) {
  const byKind = new Map(results.map((r) => [r.kind, r]));
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('SPRINT')}</Text>
        <Pressable onPress={() => router.push('/leaderboard')} hitSlop={8} style={styles.link} accessibilityRole="link">
          <Ionicons name="podium-outline" size={14} color={colors.accent} />
          <Text style={styles.linkText}>{t('Leaderboard')}</Text>
        </Pressable>
      </View>
      {SPRINTS.map((s) => {
        const r = byKind.get(s.kind);
        return (
          <Pressable key={s.kind} style={styles.row} disabled={!r}
            onPress={() => router.push({ pathname: '/leaderboard', params: { kind: s.kind } })}>
            <Text style={styles.label}>{s.label}</Text>
            <Text style={[styles.value, !r && styles.none]}>{r ? formatSprint(r.timeMs) : '—'}</Text>
            <Text style={styles.exit}>{r && s.distM && r.exitSpeedKmh != null ? `${Math.round(r.exitSpeedKmh)} km/h` : ''}</Text>
          </Pressable>
        );
      })}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.overline, color: colors.accent },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  label: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
  value: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18, minWidth: 80, textAlign: 'right' },
  none: { color: colors.textFaint },
  exit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, minWidth: 60, textAlign: 'right' },
  note: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11 },
});
