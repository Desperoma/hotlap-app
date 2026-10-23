import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TrackPoint } from '@/features/recording/geo';
import { detectSprints, formatSprint, SPRINTS, sprintLive } from '@/features/sprint/sprint';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Mode Sprint pendant l'enregistrement : aucune action à faire. S'arrêter complètement arme le
 * chrono, qui part tout seul au démarrage ; chaque objectif atteint s'affiche. Gros caractères,
 * lisibles d'un coup d'œil.
 */
export function SprintPanel({ points }: { points: TrackPoint[] }) {
  const [now, setNow] = useState(Date.now());
  const live = sprintLive(points, now);
  useEffect(() => {
    if (live.phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [live.phase]);
  const results = useMemo(() => new Map(detectSprints(points).map((r) => [r.kind, r])), [points]);
  const speed = Math.round(((points.at(-1)?.speed ?? 0) || 0) * 3.6);

  const banner =
    live.phase === 'ready' ? { icon: 'flag' as const, text: 'READY · LAUNCH WHEN YOU WANT', color: colors.accent }
    : live.phase === 'running' ? { icon: 'timer' as const, text: formatSprint(live.elapsedMs), color: colors.text }
    : live.phase === 'done' ? { icon: 'checkmark-circle' as const, text: 'RUN DONE · STOP TO GO AGAIN', color: colors.accent }
    : { icon: 'hand-left' as const, text: 'STOP COMPLETELY TO ARM', color: '#F59E0B' };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.top}>
        <View>
          <Text style={styles.speed}>{speed}</Text>
          <Text style={styles.unit}>KM/H</Text>
        </View>
        <View style={[styles.banner, { borderColor: banner.color }]}>
          <Ionicons name={banner.icon} size={18} color={banner.color} />
          <Text style={[styles.bannerText, { color: banner.color }, live.phase === 'running' && styles.timer]} numberOfLines={1}>
            {banner.text}
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        {SPRINTS.map((s) => {
          const r = results.get(s.kind);
          return (
            <View key={s.kind} style={[styles.cell, r && styles.cellDone]}>
              <Text style={styles.cellLabel}>{s.label}</Text>
              <Text style={[styles.cellValue, r && { color: colors.accent }]}>{r ? formatSprint(r.timeMs) : '—'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  speed: { ...type.stat, color: colors.text, fontSize: 44, lineHeight: 48 },
  unit: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  banner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  bannerText: { flex: 1, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.5 },
  timer: { fontSize: 26, letterSpacing: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  cellDone: { borderWidth: 1, borderColor: colors.accent },
  cellLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  cellValue: { color: colors.text, fontFamily: fonts.semibold, fontSize: 16 },
});
