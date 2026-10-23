import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import {
  downsample, nearestIndex, SPEED_COLORS, speedBucket, speedSegments, summarize, type Sample,
} from '@/features/drives/telemetry';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

type Metric = 'speed' | 'alt' | 'grade' | 'accel';
const METRICS: { key: Metric; label: string; unit: string; get: (s: Sample) => number | null; digits: number }[] = [
  { key: 'speed', label: 'Speed', unit: 'km/h', get: (s) => s.speedKmh, digits: 0 },
  { key: 'alt', label: 'Elevation', unit: 'm', get: (s) => s.altM, digits: 0 },
  { key: 'grade', label: 'Grade', unit: '%', get: (s) => s.gradePct, digits: 1 },
  { key: 'accel', label: 'Accel.', unit: 'G', get: (s) => s.accelG, digits: 2 },
];
const CHART_H = 130;
const COLUMNS = 120;

/**
 * Rapport détaillé d'un drive (propriétaire uniquement) : carte navigable avec le tracé coloré
 * selon la vitesse, graphique de la mesure choisie, et valeurs au point touché (sur le graphique
 * ou sur la carte).
 */
export function DriveTelemetry({ samples }: { samples: Sample[] }) {
  const mapRef = useRef<MapView>(null);
  const [metric, setMetric] = useState<Metric>('speed');
  const summary = useMemo(() => summarize(samples), [samples]);
  const chart = useMemo(() => downsample(samples, COLUMNS), [samples]);
  const segments = useMemo(() => speedSegments(downsample(samples, 800), summary.maxSpeedKmh), [samples, summary.maxSpeedKmh]);
  const [cursor, setCursor] = useState<number | null>(null);
  const hasAlt = summary.minAltM != null;

  const metrics = METRICS.filter((m) => hasAlt || (m.key !== 'alt' && m.key !== 'grade'));
  const m = metrics.find((x) => x.key === metric) ?? metrics[0];
  const at = cursor != null ? chart[cursor] : null;
  const vmaxIndex = useMemo(() => chart.reduce((b, s, i) => (s.speedKmh > chart[b].speedKmh ? i : b), 0), [chart]);

  if (samples.length < 2) return null;
  const coords = samples.map((s) => ({ latitude: s.lat, longitude: s.lng }));
  const fit = () => mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: false });

  return (
    <View style={styles.root}>
      <Text style={styles.overline}>TELEMETRY</Text>
      <View style={styles.tiles}>
        <Tile label="Top speed" value={summary.maxSpeedKmh.toFixed(0)} unit="km/h" accent />
        <Tile label="Avg. moving" value={summary.avgMovingKmh.toFixed(0)} unit="km/h" />
        {hasAlt ? <Tile label="Climb" value={summary.climbM.toFixed(0)} unit="m" /> : null}
        <Tile label="Max accel." value={summary.maxAccelG.toFixed(2)} unit="G" />
        <Tile label="Max braking" value={summary.maxBrakeG.toFixed(2)} unit="G" />
        {hasAlt ? <Tile label="Highest" value={summary.maxAltM!.toFixed(0)} unit="m" /> : null}
      </View>

      {MAPS_AVAILABLE ? (
        <View style={styles.map}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            customMapStyle={darkMapStyle}
            userInterfaceStyle="dark"
            onMapReady={fit}
            onLayout={fit}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            onPress={(e) => setCursor(nearestIndex(chart, e.nativeEvent.coordinate))}
          >
            {segments.map((s, i) => (
              <Polyline key={i} coordinates={s.coords} strokeColor={s.color} strokeWidth={5} lineCap="round" lineJoin="round" />
            ))}
            <Marker coordinate={coords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={styles.start} />
            </Marker>
            <Marker coordinate={coords.at(-1)!} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={styles.end}><Ionicons name="flag" size={9} color={colors.accentText} /></View>
            </Marker>
            <Marker coordinate={{ latitude: chart[vmaxIndex].lat, longitude: chart[vmaxIndex].lng }} anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false} onPress={() => setCursor(vmaxIndex)}>
              <View style={styles.vmax}><Text style={styles.vmaxText}>{summary.maxSpeedKmh.toFixed(0)}</Text></View>
            </Marker>
            {at && (
              <Marker coordinate={{ latitude: at.lat, longitude: at.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
                <View style={styles.cursorDot} />
              </Marker>
            )}
          </MapView>
          <View style={styles.legend} pointerEvents="none">
            <Text style={styles.legendText}>0</Text>
            {SPEED_COLORS.map((c) => <View key={c} style={[styles.legendSwatch, { backgroundColor: c }]} />)}
            <Text style={styles.legendText}>{summary.maxSpeedKmh.toFixed(0)} km/h</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.chips}>
        {metrics.map((x) => (
          <Pressable key={x.key} onPress={() => setMetric(x.key)} style={[styles.chip, x.key === m.key && styles.chipActive]}
            accessibilityState={{ selected: x.key === m.key }}>
            <Text style={[styles.chipText, x.key === m.key && styles.chipTextActive]}>{x.label}</Text>
          </Pressable>
        ))}
      </View>

      <Chart samples={chart} metric={m} maxSpeed={summary.maxSpeedKmh} cursor={cursor} onCursor={setCursor} />

      <View style={styles.readout}>
        {at ? (
          <>
            <Read label="Time" value={clock(at.t)} />
            <Read label="Dist." value={(at.d / 1000).toFixed(2)} unit="km" />
            <Read label="Speed" value={at.speedKmh.toFixed(0)} unit="km/h" />
            {at.altM != null ? <Read label="Elev." value={at.altM.toFixed(0)} unit="m" /> : null}
            {at.gradePct != null ? <Read label="Grade" value={at.gradePct.toFixed(1)} unit="%" /> : null}
            <Read label="Accel." value={at.accelG.toFixed(2)} unit="G" />
          </>
        ) : (
          <Text style={styles.hint}>Glisse sur le graphique ou touche le tracé pour voir chaque point.</Text>
        )}
      </View>
      <Text style={styles.hint}>Visible par toi seul.</Text>
    </View>
  );
}

const Chart = memo(function Chart({ samples, metric, maxSpeed, cursor, onCursor }: {
  samples: Sample[];
  metric: (typeof METRICS)[number];
  maxSpeed: number;
  cursor: number | null;
  onCursor: (i: number) => void;
}) {
  const [w, setW] = useState(0);
  const values = samples.map(metric.get);
  const nums = values.filter((v): v is number => v != null);
  let lo = Math.min(0, ...nums), hi = Math.max(0, ...nums);
  // Altitude : l'échelle part du point le plus bas, sinon le relief est écrasé.
  if (metric.key === 'alt' && nums.length) { lo = Math.min(...nums) - 5; hi = Math.max(...nums) + 5; }
  if (hi - lo < 1e-6) hi = lo + 1;
  const y = (v: number) => CHART_H - ((v - lo) / (hi - lo)) * CHART_H;
  const zero = metric.key === 'alt' ? CHART_H : y(0);
  const colW = w / Math.max(1, samples.length);

  const indexAt = (x: number) => Math.max(0, Math.min(samples.length - 1, Math.floor(x / Math.max(1, colW))));
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // le défilement de la page ne vole pas le geste
    onPanResponderGrant: (e) => onCursor(indexAt(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => onCursor(indexAt(e.nativeEvent.locationX)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [colW, samples.length, onCursor]);

  return (
    <View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{hi.toFixed(metric.digits)} {metric.unit}</Text>
        <Text style={styles.axisText}>{lo.toFixed(metric.digits)}</Text>
      </View>
      <View style={styles.chart} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && values.map((v, i) => {
          if (v == null) return null;
          const top = Math.min(y(v), zero), h = Math.max(1, Math.abs(zero - y(v)));
          const color = metric.key === 'speed' ? SPEED_COLORS[speedBucket(v, maxSpeed)]
            : metric.key === 'accel' ? (v >= 0 ? colors.accent : '#EF4444') : colors.accent;
          return <View key={i} style={{ position: 'absolute', left: i * colW, width: Math.max(1, colW - 0.5), top, height: h, backgroundColor: color, opacity: cursor == null || cursor === i ? 0.9 : 0.55 }} />;
        })}
        {metric.key !== 'alt' && lo < 0 && <View style={[styles.zero, { top: zero }]} />}
        {cursor != null && w > 0 && <View style={[styles.cursor, { left: cursor * colW + colW / 2 - 1 }]} />}
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>0:00</Text>
        <Text style={styles.axisText}>{clock(samples.at(-1)?.t ?? 0)}</Text>
      </View>
    </View>
  );
});

function Tile({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <View style={[styles.tile, accent && styles.tileAccent]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, accent && { color: colors.accent }]}>
        {value}<Text style={styles.tileUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function Read({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.read}>
      <Text style={styles.readLabel}>{label}</Text>
      <Text style={styles.readValue}>{value}{unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}</Text>
    </View>
  );
}

function clock(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  overline: { ...type.overline, color: colors.accent },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  tileAccent: { borderWidth: 1, borderColor: colors.accent },
  tileLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  tileValue: { color: colors.text, fontFamily: fonts.semibold, fontSize: 18 },
  tileUnit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  map: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
  start: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.bg },
  end: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  vmax: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  vmaxText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 11 },
  cursorDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.accent },
  legend: {
    position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(10,12,10,0.75)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  legendSwatch: { width: 14, height: 6, borderRadius: 3 },
  legendText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10, marginHorizontal: 2 },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextActive: { color: colors.accentText },
  axis: { flexDirection: 'column', marginBottom: 2 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10 },
  chart: { height: CHART_H, backgroundColor: colors.card, borderRadius: 10, overflow: 'hidden' },
  zero: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
  readout: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, minHeight: 44, alignItems: 'center' },
  read: { minWidth: 70, gap: 1 },
  readLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  readValue: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12 },
});
