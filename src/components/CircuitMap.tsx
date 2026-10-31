import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { CircuitDetail } from '@/features/circuit/api';
import type { LL } from '@/features/circuit/laps';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { colors, fonts, radius } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

import { t } from '@/i18n';
/**
 * Plan fixe d'un circuit, cadré sur son emprise comme une mini-carte de jeu vidéo : pas de
 * déplacement ni de zoom. Tracé du circuit, ligne de départ en rouge, et en option le tracé roulé
 * et la position de la voiture.
 */
export function CircuitMap({ circuit, startLine, driven, car, satellite = false, style }: {
  circuit: CircuitDetail;
  startLine?: [LL, LL] | null;
  driven?: LL[];
  car?: LL | null;
  satellite?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<MapView>(null);
  const frame = useMemo(() => {
    const pts = [...circuit.path.flat(), ...circuit.area.flat(), ...(startLine ?? [])];
    if (pts.length === 0 && circuit.bounds) {
      const b = circuit.bounds;
      return [{ latitude: b.minLat, longitude: b.minLng }, { latitude: b.maxLat, longitude: b.maxLng }];
    }
    return pts;
  }, [circuit, startLine]);

  if (!MAPS_AVAILABLE || frame.length === 0) {
    return (
      <View style={[styles.box, styles.empty, style]}>
        <Text style={styles.emptyText}>{MAPS_AVAILABLE ? t('No map data for this circuit') : t('Map unavailable in this version')}</Text>
      </View>
    );
  }

  const lats = frame.map((p) => p.latitude), lngs = frame.map((p) => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 1.3),
    longitudeDelta: Math.max(0.002, (Math.max(...lngs) - Math.min(...lngs)) * 1.3),
  };
  const fit = () => ref.current?.fitToCoordinates(frame, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: false });

  return (
    <View style={[styles.box, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
        mapType={satellite ? 'satellite' : 'standard'}
        onMapReady={fit}
        onLayout={fit}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        showsPointsOfInterests={false}
      >
        {circuit.area.map((ring, i) => (
          <Polygon key={`a${i}`} coordinates={ring} strokeColor="rgba(198,244,50,0.35)" fillColor="rgba(198,244,50,0.06)" strokeWidth={1} />
        ))}
        {circuit.path.map((seg, i) => (
          <Polyline key={`p${i}`} coordinates={seg} strokeColor="rgba(255,255,255,0.85)" strokeWidth={7} lineCap="round" lineJoin="round" zIndex={2} />
        ))}
        {circuit.path.map((seg, i) => (
          <Polyline key={`q${i}`} coordinates={seg} strokeColor="#2A2E2A" strokeWidth={4} lineCap="round" lineJoin="round" zIndex={3} />
        ))}
        {driven && driven.length > 1 && (
          <Polyline coordinates={driven} strokeColor={colors.accent} strokeWidth={3} lineCap="round" lineJoin="round" zIndex={4} />
        )}
        {startLine && (
          <Polyline coordinates={startLine} strokeColor="#FF3B30" strokeWidth={6} lineCap="butt" zIndex={5} />
        )}
        {car && (
          <Marker coordinate={car} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
            <View style={styles.car}><Ionicons name="car-sport" size={11} color={colors.accentText} /></View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  car: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
});
