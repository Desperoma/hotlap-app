import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CircuitMap } from '@/components/CircuitMap';
import { LapCard, LiveDashboard, Tile } from '@/components/live/LiveDashboard';
import { getCircuit, type CircuitDetail } from '@/features/circuit/api';
import { formatLap, liveDelta, liveLaps, startLineFromHeading, startLineOnPath } from '@/features/circuit/laps';
import { setPendingDrive } from '@/features/drives/pending';
import { useRecorder } from '@/features/recording/useRecorder';
import { usePrefs, type LiveView } from '@/features/settings/prefs';
import { colors, spacing } from '@/theme';

/**
 * Drive sur circuit en cours : plan fixe du circuit (pas de carte qui bouge), voiture et tracé roulé,
 * ligne de départ, tours en direct. Gros chiffres, aucune action à faire en roulant.
 */
export default function CircuitLiveScreen() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  const { status, points, recorder, circuitId, circuitName, simulated, startedAt } = useRecorder();
  const [circuit, setCircuit] = useState<CircuitDetail | null>(null);
  const [now, setNow] = useState(Date.now());
  const prefs = usePrefs();
  const [picked, setPicked] = useState<LiveView | null>(null);
  const view = picked ?? prefs.liveView;
  // Changer de vue pendant le drive ne touche pas à la vue par défaut (Settings > Interface).
  const setView = (v: LiveView) => setPicked(v);

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
  const delta = useMemo(() => liveDelta(points, line, now), [points, line, now]);
  const lastDelta = live.last && live.best ? live.last.timeMs - live.best.timeMs : null;

  return (
    <LiveDashboard
      overline={simulated ? 'CIRCUIT SESSION · SIMULATION' : 'CIRCUIT SESSION'}
      name={circuitName ?? 'Circuit'}
      elapsedMs={elapsed}
      view={view}
      onView={setView}
      paused={status === 'paused'}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onPause={() => (status === 'paused' ? recorder.resume() : recorder.pause())}
      onFinish={finish}
      map={(style) => circuit ? (
        <CircuitMap circuit={circuit} startLine={line} driven={driven} car={last ? { latitude: last.lat, longitude: last.lng } : null}
          satellite={prefs.mapType === 'satellite'} style={style} />
      ) : (
        <View style={[style, styles.loading]}><ActivityIndicator color={colors.accent} /></View>
      )}
    >
      <LapCard label={live.started ? `CURRENT LAP · ${live.laps.length + 1}` : 'CROSS THE LINE'}
        time={live.currentMs != null ? formatLap(live.currentMs) : '—:—.———'}
        deltaMs={delta?.deltaMs ?? null} progress={delta?.progress ?? null} />
      <View style={styles.tiles}>
        <Tile label="LAST LAP" value={live.last ? formatLap(live.last.timeMs) : '—'}
          sub={lastDelta ? `+${(lastDelta / 1000).toFixed(3)}` : live.last ? 'BEST' : undefined}
          subColor={lastDelta ? colors.danger : colors.accent} />
        <Tile label="BEST LAP" value={live.best ? formatLap(live.best.timeMs) : '—'} />
        <Tile label="LAPS" value={String(live.laps.length)} />
        <Tile label="SPEED" value={String(speed)} sub="KM/H" />
      </View>
    </LiveDashboard>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  tiles: { flexDirection: 'row', gap: spacing.sm },
});
