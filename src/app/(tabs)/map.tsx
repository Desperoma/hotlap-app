import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveDrive } from '@/features/drives/api';
import { checkRecording, refusalMessage, type RecordingContext } from '@/features/recording/authorization';
import { formatDuration, formatKm } from '@/features/recording/geo';
import { useRecorder } from '@/features/recording/useRecorder';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

/** Live Drive Map : carte, démarrage, stats live, arrêt et sauvegarde du drive. */
export default function MapScreen() {
  const { session, profile, primaryVehicle } = useAuth();
  const { status, points, stats, recorder } = useRecorder();
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [traffic, setTraffic] = useState(false);
  const [gps, setGps] = useState<'searching' | 'ok' | 'denied'>('searching');
  const [where, setWhere] = useState<RecordingContext | null>(null);
  const [checking, setChecking] = useState(false);

  // Permission « pendant l'utilisation » à l'ouverture de la carte (pas avant, cf. maquette).
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status: s }) => setGps(s === 'granted' ? 'ok' : 'denied'));
  }, []);

  // Suit le dernier point pendant l'enregistrement.
  const last = points[points.length - 1];
  useEffect(() => {
    if (last && status === 'recording') {
      mapRef.current?.animateCamera({ center: { latitude: last.lat, longitude: last.lng } }, { duration: 500 });
    }
  }, [last, status]);

  const recenter = async () => {
    const pos = await Location.getLastKnownPositionAsync();
    if (pos) {
      mapRef.current?.animateCamera({ center: pos.coords, zoom: 15 }, { duration: 400 });
    }
  };

  const start = async () => {
    const perm = await recorder.requestPermissions();
    if (perm === 'denied') return Alert.alert('Localisation refusée', 'Active la localisation dans les réglages.');

    // Âge + pays + lieu (route ouverte ou circuit) : vérifié à chaque départ.
    setChecking(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const ctx = await checkRecording(pos.coords, profile);
      setWhere(ctx);
      if (!ctx.allowed) return Alert.alert('Enregistrement indisponible ici', refusalMessage(ctx));
    } catch (e) {
      return Alert.alert('Vérification impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }

    if (perm === 'foreground') {
      Alert.alert('Arrière-plan', 'Sans « Toujours », le tracé s’arrête quand l’écran se verrouille.');
    }
    await recorder.start();
  };

  const stop = async () => {
    const endedAt = Date.now();
    const finished = await recorder.stop();
    if (!finished.startedAt || !session) return;
    try {
      const { stats: s, score } = await saveDrive({
        ownerId: session.user.id,
        vehicleId: primaryVehicle?.id ?? null,
        circuitId: where?.circuitId ?? null,
        title: defaultTitle(finished.startedAt),
        visibility: 'private',
        startedAt: finished.startedAt,
        endedAt,
        points: finished.points,
      });
      Alert.alert('Drive enregistré', `${formatKm(s.distanceM)} km en ${formatDuration(s.durationS)} · score ${score}`);
    } catch (e) {
      Alert.alert('Échec de la sauvegarde', e instanceof Error ? e.message : String(e));
    }
  };

  const recording = status !== 'idle';

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
        mapType={mapType}
        showsTraffic={traffic}
        showsUserLocation={gps === 'ok'}
        showsMyLocationButton={false}
        onUserLocationChange={() => gps !== 'ok' && setGps('ok')}
      >
        {points.length > 1 && (
          <Polyline
            coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={colors.accent}
            strokeWidth={5}
          />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.brand}>
          <View style={styles.brandIcon}><Ionicons name="navigate" size={18} color={colors.accentText} /></View>
          <View>
            <Text style={styles.brandName}>HOTLAP</Text>
            <Text style={styles.brandTag}>THE ROAD IS YOURS</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.toggle}>
            <MapToggle label="DARK" icon="map-outline" active={mapType === 'standard'} onPress={() => setMapType('standard')} />
            <MapToggle label="SATELLITE" icon="globe-outline" active={mapType === 'satellite'} onPress={() => setMapType('satellite')} />
          </View>
          <MapToggle label="TRAFFIC" icon="car-outline" active={traffic} onPress={() => setTraffic((t) => !t)} />
        </View>

        <View style={styles.gpsRow}>
          <View style={styles.gpsPill}>
            <Ionicons name="locate" size={12} color={gps === 'ok' ? colors.accent : colors.textMuted} />
            <Text style={styles.gpsText}>{gps === 'ok' ? 'GPS READY' : gps === 'denied' ? 'GPS OFF' : 'GPS SEARCHING'}</Text>
          </View>
          <Pressable style={styles.recenter} onPress={recenter}>
            <Ionicons name="locate-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={styles.panel}>
        {recording && stats ? (
          <>
            <Text style={styles.overline}>
              {status === 'paused' ? 'PAUSED' : 'RECORDING'}
              {where ? ` · ${where.context === 'circuit' ? `CIRCUIT${where.circuitName ? ` ${where.circuitName.toUpperCase()}` : ''}` : 'OPEN ROAD'}${where.countryCode ? ` · ${where.countryCode}` : ''}` : ''}
            </Text>
            <View style={styles.statsRow}>
              <Stat label="DISTANCE" value={`${formatKm(stats.distanceM)} km`} />
              <Stat label="TIME" value={formatDuration(stats.durationS)} />
              <Stat label="AVG" value={`${Math.round(stats.avgSpeedKmh)} km/h`} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                title={status === 'paused' ? 'Resume' : 'Pause'}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => (status === 'paused' ? recorder.resume() : recorder.pause())}
              />
              <Button title="Finish" icon="flag" style={{ flex: 1 }} onPress={stop} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.overline}>YOUR NEXT DRIVE</Text>
            <Text style={styles.panelTitle}>Find your line.</Text>
            <Text style={styles.panelText}>
              Start a drive to draw your route live. HotLap ignores weak GPS fixes for a cleaner track.
            </Text>
            <Button title="START DRIVE" icon="radio-button-on" trailingIcon="arrow-forward" onPress={start}
              disabled={gps === 'denied'} loading={checking} />
            <Text style={styles.footnote}>Precise GPS · Live route · Private by default</Text>
          </>
        )}
      </View>
    </View>
  );
}

function MapToggle({ label, icon, active, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleItem, active && styles.toggleActive]}>
      <Ionicons name={icon} size={13} color={active ? colors.accent : colors.textMuted} />
      <Text style={[styles.toggleText, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function defaultTitle(ts: number) {
  const h = new Date(ts).getHours();
  const moment = h < 6 ? 'Night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  return `${moment} Drive`;
}

const glass = { backgroundColor: 'rgba(22,25,22,0.92)', borderWidth: 1, borderColor: colors.border };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.lg, gap: spacing.md },
  brand: { ...glass, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  brandIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brandName: { ...type.h2, color: colors.text, fontSize: 15 },
  brandTag: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'space-between' },
  toggle: { ...glass, flexDirection: 'row', borderRadius: radius.sm, padding: 3 },
  toggleItem: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 0 },
  toggleActive: { backgroundColor: colors.accentSoft },
  toggleText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10 },
  gpsRow: { alignItems: 'flex-end', gap: spacing.sm },
  gpsPill: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  gpsText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 10 },
  recenter: { ...glass, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  panel: { ...glass, position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 24, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  overline: { ...type.overline, color: colors.accent, fontSize: 10 },
  panelTitle: { ...type.h1, color: colors.text, fontSize: 22 },
  panelText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  footnote: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, textAlign: 'center' },
  statsRow: { flexDirection: 'row' },
  statValue: { ...type.stat, color: colors.text, fontSize: 18 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
});
