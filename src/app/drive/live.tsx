import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiveDashboard, SpeedCard, Tile } from '@/components/live/LiveDashboard';
import { SprintPanel } from '@/components/SprintPanel';
import { VehicleSelect } from '@/components/VehicleSelect';
import { Button, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { setPendingDrive } from '@/features/drives/pending';
import { OptionsSheet } from '@/components/OptionsSheet';
import { SIM_STYLES, simulatedDrive, simulatedSprint, TEST_TOOLS, type SimStyle } from '@/features/drives/simulate';
import { checkRecording, refusalMessage, type RecordingContext } from '@/features/recording/authorization';
import { formatDuration, formatKm } from '@/features/recording/geo';
import { useRecorder } from '@/features/recording/useRecorder';
import { usePrefs, type LiveView } from '@/features/settings/prefs';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

import { t } from '@/i18n';
/**
 * Live drive (ouvert par l'onglet « + ») : carte, démarrage, stats live, arrêt et sauvegarde du drive.
 * L'enregistrement continue si on quitte l'écran : l'onglet Map affiche alors un rappel pour revenir.
 */
export default function LiveDriveScreen() {
  const { profile, primaryVehicle, vehicles } = useAuth();
  const { status, points, stats, recorder, mode: activeMode, startedAt } = useRecorder();
  // Mode du prochain drive (avant le départ) ; pendant l'enregistrement, celui du recorder.
  const [nextMode, setNextMode] = useState<'free' | 'sprint'>('free');
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [traffic, setTraffic] = useState(false);
  const [gps, setGps] = useState<'searching' | 'ok' | 'denied'>('searching');
  const [where, setWhere] = useState<RecordingContext | null>(null);
  const [checking, setChecking] = useState(false);
  // Véhicule du prochain drive : le favori par défaut, modifiable avant le départ.
  const [vehicleId, setVehicleId] = useState<string | null | undefined>(undefined);
  const chosenVehicle = vehicleId === undefined ? primaryVehicle?.id ?? null : vehicleId;
  useEffect(() => {
    // Véhicule retiré du garage entre-temps : retour au favori.
    if (vehicleId && vehicles && !vehicles.some((v) => v.id === vehicleId)) setVehicleId(undefined);
  }, [vehicleId, vehicles]);

  // Drive sur circuit en cours : il a son propre écran (plan fixe du circuit, tours).
  useEffect(() => {
    if (status !== 'idle' && activeMode === 'circuit') router.replace('/circuit/live');
  }, [status, activeMode]);

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
    if (perm === 'denied') return Alert.alert(t('Localisation refusée'), t('Active la localisation dans les réglages.'));

    // Âge + pays + lieu (route ouverte ou circuit) : vérifié à chaque départ.
    setChecking(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const ctx = await checkRecording(pos.coords, profile);
      setWhere(ctx);
      if (!ctx.allowed) return Alert.alert(t('Enregistrement indisponible ici'), refusalMessage(ctx));
      // Chrono : circuit (ou route chronométrée validée par l'équipe) uniquement, comme lap_time_ms.
      if (nextMode === 'sprint' && ctx.context !== 'circuit') {
        return Alert.alert(t('Sprint indisponible ici'),
          t('Le mode Sprint n’est disponible que sur un circuit ou une route chronométrée validée. Lance un drive libre, ou rends-toi sur un circuit.'));
      }
    } catch (e) {
      return Alert.alert(t('Vérification impossible'), e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }

    if (perm === 'foreground') {
      Alert.alert(t('Arrière-plan'), t('Sans « Toujours », le tracé s’arrête quand l’écran se verrouille.'));
    }
    try {
      await recorder.start(nextMode);
    } catch {
      Alert.alert(
        t('Enregistrement impossible'),
        t('La localisation en arrière-plan n’est pas disponible ici (Expo Go). Utilise l’app de test HotLap compilée par EAS.'),
      );
    }
  };

  const [simMenu, setSimMenu] = useState(false);
  const simulate = async (style?: SimStyle | 'sprint') => {
    const pos = await Location.getLastKnownPositionAsync().catch(() => null);
    // À défaut de position : départ de la route du col de Turini.
    const origin = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : { lat: 43.991, lng: 7.336 };
    await setPendingDrive(style === 'sprint' ? simulatedSprint(origin, chosenVehicle) : simulatedDrive(origin, chosenVehicle, { style }));
    router.replace('/drive/finish');
  };

  const stop = async () => {
    const endedAt = Date.now();
    const finished = await recorder.stop();
    if (!finished.startedAt) return;
    // Le drive est d'abord gardé sur le téléphone, puis résumé et publié sur l'écran suivant.
    await setPendingDrive({
      startedAt: finished.startedAt,
      endedAt,
      points: finished.points,
      circuitId: where?.circuitId ?? null,
      circuitName: where?.circuitName ?? null,
      vehicleId: chosenVehicle,
      mode: finished.mode ?? 'free',
    });
    router.replace('/drive/finish');
  };

  const recording = status !== 'idle';
  const prefs = usePrefs();
  const [picked, setPicked] = useState<LiveView | null>(null);
  const view = picked ?? prefs.liveView;
  // Changer de vue pendant le drive ne touche pas à la vue par défaut (Settings > Interface).
  const setView = (v: LiveView) => setPicked(v);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [recording]);

  // En route : tableau de bord (carte, cercle de force G, ou les deux).
  if (recording && stats) {
    const speedKmh = Math.max(0, (last?.speed ?? 0) * 3.6);
    const maxKmh = points.reduce((m, p) => Math.max(m, (p.speed ?? 0) * 3.6), 0);
    const ctx = where ? (where.context === 'circuit' ? t('CIRCUIT{0}', where.countryCode ? ` · ${where.countryCode}` : '') : t('OPEN ROAD{0}', where.countryCode ? ` · ${where.countryCode}` : '')) : t('OPEN ROAD');
    return (
      <LiveDashboard
        overline={activeMode === 'sprint' ? t('SPRINT · {0}', ctx) : ctx}
        name={where?.circuitName ?? (activeMode === 'sprint' ? t('Sprint') : t('Free drive'))}
        elapsedMs={startedAt ? now - startedAt : stats.durationS * 1000}
        view={view} onView={setView}
        paused={status === 'paused'}
        onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        onPause={() => (status === 'paused' ? recorder.resume() : recorder.pause())}
        onFinish={stop}
        map={(style) => MAPS_AVAILABLE ? (
          <MapView
            ref={mapRef}
            style={style}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            customMapStyle={darkMapStyle}
            userInterfaceStyle="dark"
            mapType={prefs.mapType}
            showsUserLocation
            showsMyLocationButton={false}
            initialRegion={last ? { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
          >
            {points.length > 1 && (
              <Polyline coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.accent} strokeWidth={5} />
            )}
          </MapView>
        ) : (
          <View style={[style, styles.noMapSmall]}><Text style={styles.panelText}>{t('Map unavailable')}</Text></View>
        )}
      >
        {activeMode === 'sprint' ? <SprintPanel points={points} /> : <SpeedCard kmh={speedKmh} />}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Tile label={t('DISTANCE')} value={`${formatKm(stats.distanceM)} km`} />
          <Tile label={t('AVG')} value={`${Math.round(stats.avgSpeedKmh)}`} sub={t('KM/H')} />
          <Tile label={t('MAX')} value={`${Math.round(maxKmh)}`} sub={t('KM/H')} />
        </View>
      </LiveDashboard>
    );
  }

  return (
    <View style={styles.root}>
      {/* Sans clé Google Maps (Android), pas de carte : l'enregistrement fonctionne quand même. */}
      {MAPS_AVAILABLE ? (
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
      ) : (
        <View style={styles.noMap}>
          <Text style={styles.panelText}>{t('Map unavailable in this version. Recording still works.')}</Text>
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.brand}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} hitSlop={10}
            style={styles.back} accessibilityLabel={t('Back')}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.brandIcon}><Ionicons name="navigate" size={18} color={colors.accentText} /></View>
          <View>
            <Text style={styles.brandName}>{t('LIVE DRIVE')}</Text>
            <Text style={styles.brandTag}>{recording ? t('RECORDING CONTINUES IF YOU LEAVE') : t('THE ROAD IS YOURS')}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.toggle}>
            <MapToggle label={t('DARK')} icon="map-outline" active={mapType === 'standard'} onPress={() => setMapType('standard')} />
            <MapToggle label={t('SATELLITE')} icon="globe-outline" active={mapType === 'satellite'} onPress={() => setMapType('satellite')} />
          </View>
          <MapToggle label={t('TRAFFIC')} icon="car-outline" active={traffic} onPress={() => setTraffic((t) => !t)} />
        </View>

        <View style={styles.gpsRow}>
          <View style={styles.gpsPill}>
            <Ionicons name="locate" size={12} color={gps === 'ok' ? colors.accent : colors.textMuted} />
            <Text style={styles.gpsText}>{gps === 'ok' ? t('GPS READY') : gps === 'denied' ? t('GPS OFF') : t('GPS SEARCHING')}</Text>
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
              {status === 'paused' ? t('PAUSED') : activeMode === 'sprint' ? t('SPRINT') : t('RECORDING')}
              {where ? ` · ${where.context === 'circuit' ? `${t('CIRCUIT')}${where.circuitName ? ` ${where.circuitName.toUpperCase()}` : ''}` : t('OPEN ROAD')}${where.countryCode ? ` · ${where.countryCode}` : ''}` : ''}
            </Text>
            {activeMode === 'sprint' ? (
              <SprintPanel points={points} />
            ) : (
              <View style={styles.statsRow}>
                <Stat label={t('DISTANCE')} value={`${formatKm(stats.distanceM)} km`} />
                <Stat label={t('TIME')} value={formatDuration(stats.durationS)} />
                <Stat label={t('AVG')} value={`${Math.round(stats.avgSpeedKmh)} km/h`} />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                title={status === 'paused' ? t('Resume') : t('Pause')}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => (status === 'paused' ? recorder.resume() : recorder.pause())}
              />
              <Button title={t('Finish')} icon="flag" style={{ flex: 1 }} onPress={stop} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.overline}>{t('YOUR NEXT DRIVE')}</Text>
            <Text style={styles.panelTitle}>{t('Find your line.')}</Text>
            <Text style={styles.panelText}>{t('Start a drive to draw your route live. HotLap ignores weak GPS fixes for a cleaner track.')}</Text>
            <SegmentedControl value={nextMode} onChange={setNextMode}
              options={[{ value: 'free', label: t('Free drive') }, { value: 'sprint', label: t('Sprint') }]} />
            {nextMode === 'sprint' && (
              <Text style={styles.panelText}>{t('0-100, 0-200 km/h, 500 m, 1 000 m, 2 000 m en départ arrêté. Circuit ou route chronométrée validée uniquement. Arrête-toi : le chrono part seul au démarrage.')}</Text>
            )}
            <VehicleSelect compact label={t('Car for this drive')} value={chosenVehicle} onChange={setVehicleId} />
            <Button title={nextMode === 'sprint' ? t('START SPRINT') : t('START DRIVE')} icon={nextMode === 'sprint' ? 'flag' : 'radio-button-on'}
              trailingIcon="arrow-forward" onPress={start} disabled={gps === 'denied'} loading={checking} />
            <Text style={styles.footnote}>{t('Precise GPS · Live route · Private by default')}</Text>
            {/* Tests sans rouler : versions de développement et builds « preview » uniquement,
                jamais dans l'app publiée (voir TEST_TOOLS). */}
            {TEST_TOOLS && (
              <Button title={t('Simulate a drive (test)')} variant="ghost" icon="flask-outline" onPress={() => setSimMenu(true)} />
            )}
          </>
        )}
      </View>
      {TEST_TOOLS && (
        <OptionsSheet
          visible={simMenu}
          title={t('Simulated route (near you)')}
          onClose={() => setSimMenu(false)}
          options={[
            { label: t('Random'), onPress: () => simulate() },
            { label: t('Sprint run (0-100, 500 m…)'), onPress: () => simulate('sprint') },
            ...SIM_STYLES.map((s) => ({ label: s.label, onPress: () => simulate(s.value) })),
          ]}
        />
      )}
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

const glass = { backgroundColor: 'rgba(22,25,22,0.92)', borderWidth: 1, borderColor: colors.border };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  noMapSmall: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  noMap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.lg, gap: spacing.md },
  brand: { ...glass, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  back: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
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
