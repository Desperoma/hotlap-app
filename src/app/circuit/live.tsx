import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircuitMap } from '@/components/CircuitMap';
import { Button } from '@/components/ui';
import { getCircuit, type CircuitDetail } from '@/features/circuit/api';
import { formatLap, liveLaps, startLineFromHeading, startLineOnPath } from '@/features/circuit/laps';
import { setPendingDrive } from '@/features/drives/pending';
import { useRecorder } from '@/features/recording/useRecorder';
import { colors, fonts, radius, spacing, type } from '@/theme';

/**
 * Drive sur circuit en cours : plan fixe du circuit (pas de carte qui bouge), voiture et tracé roulé,
 * ligne de départ, tours en direct. Gros chiffres, aucune action à faire en roulant.
 */
export default function CircuitLiveScreen() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  const { status, points, recorder, circuitId, circuitName, simulated, startedAt } = useRecorder();
  const [circuit, setCircuit] = useState<CircuitDetail | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (circuitId) getCircuit(circuitId).then(setCircuit).catch(() => {});
  }, [circuitId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  // Plus de drive en cours (terminé ailleurs) : retour. Pas pendant « Finish », qui ouvre le récap.
  const finishing = useRef(false);
  useEffect(() => {
    if (status === 'idle' && !finishing.current) router.replace('/');
  }, [status]);

  const path = useMemo(() => circuit?.path.flat() ?? [], [circuit]);
  const first = points[0];
  // Ligne de départ là où le drive a démarré, posée une fois pour toutes : au premier point
  // (perpendiculaire au tracé), ou après 30 m roulés pour un circuit sans tracé.
  const [line, setLine] = useState<ReturnType<typeof startLineOnPath>>(null);
  useEffect(() => {
    if (line || !first || !circuit) return;
    const l = path.length > 1 ? startLineOnPath(path, { latitude: first.lat, longitude: first.lng }) : startLineFromHeading(points);
    if (l) setLine(l);
  }, [line, first, circuit, path, points]);
  const live = useMemo(() => liveLaps(points, line, now), [points, line, now]);
  const last = points[points.length - 1];
  const speed = Math.round(((last?.speed ?? 0) || 0) * 3.6);
  const driven = useMemo(() => points.map((p) => ({ latitude: p.lat, longitude: p.lng })), [points]);

  const finish = async () => {
    finishing.current = true;
    const endedAt = Date.now();
    const done = await recorder.stop();
    if (!done.startedAt) return;
    await setPendingDrive({
      startedAt: done.startedAt, endedAt, points: done.points,
      circuitId: done.circuitId ?? null, circuitName: done.circuitName ?? null,
      vehicleId: vehicle || null, mode: 'circuit', simulated: !!done.simulated, simStyle: done.simulated ? 'circuit' : undefined,
    });
    router.replace('/drive/finish');
  };

  const elapsed = startedAt ? Math.max(0, now - startedAt) : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>{status === 'paused' ? 'PAUSED' : simulated ? 'SIMULATION' : 'ON TRACK'}</Text>
          <Text style={styles.name} numberOfLines={1}>{circuitName ?? 'Circuit'}</Text>
        </View>
        <Text style={styles.total}>{formatLap(elapsed).replace(/\.\d+$/, '')}</Text>
      </View>

      {circuit ? (
        <CircuitMap circuit={circuit} startLine={line} driven={driven} car={last ? { latitude: last.lat, longitude: last.lng } : null}
          style={styles.map} />
      ) : (
        <View style={[styles.map, styles.loading]}><ActivityIndicator color={colors.accent} /></View>
      )}

      <View style={styles.panel}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{live.started ? `LAP ${live.laps.length + 1}` : 'CROSS THE LINE'}</Text>
            <Text style={styles.lapTime}>{live.currentMs != null ? formatLap(live.currentMs) : '—:—'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.speed}>{speed}</Text>
            <Text style={styles.label}>KM/H</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Stat label="LAST" value={live.last ? formatLap(live.last.timeMs) : '—'} />
          <Stat label="BEST" value={live.best ? formatLap(live.best.timeMs) : '—'} accent />
          <Stat label="LAPS" value={String(live.laps.length)} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title={status === 'paused' ? 'Resume' : 'Pause'} variant="secondary" style={{ flex: 1 }}
            onPress={() => (status === 'paused' ? recorder.resume() : recorder.pause())} />
          <Button title="Finish" icon="flag" style={{ flex: 1 }} onPress={finish} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.stat, accent && { color: colors.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  back: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  overline: { ...type.overline, color: colors.accent, fontSize: 10 },
  name: { ...type.h2, color: colors.text, fontSize: 16 },
  total: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 14 },
  map: { flex: 1, minHeight: 260, borderRadius: radius.lg },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  label: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  lapTime: { ...type.stat, color: colors.text, fontSize: 40, lineHeight: 46 },
  speed: { ...type.stat, color: colors.text, fontSize: 30 },
  stat: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
});
