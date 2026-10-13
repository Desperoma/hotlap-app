import { useRef } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { LatLng } from '@/features/drives/api';
import { colors, fonts, radius } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

/**
 * Carte figée d'un tracé (fin de drive, détail). La caméra se cale sur le tracé au chargement.
 * Pas de gestes : la carte sert d'aperçu, pas de navigation.
 */
export function DriveMap({ path, style, emptyLabel = 'No route to show' }: {
  path: LatLng[];
  style?: ViewStyle;
  emptyLabel?: string;
}) {
  const ref = useRef<MapView>(null);

  if (path.length < 2) {
    return (
      <View style={[styles.box, styles.empty, style]}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const fit = () =>
    ref.current?.fitToCoordinates(path, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: false,
    });

  return (
    <View style={[styles.box, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
        // Relief : « terrain » n'existe que sur Google Maps (Android).
        mapType={Platform.OS === 'android' ? 'terrain' : 'standard'}
        onMapReady={fit}
        onLayout={fit}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        <Polyline coordinates={path} strokeColor={colors.accent} strokeWidth={4} />
        <Marker coordinate={path[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.start} />
        </Marker>
        <Marker coordinate={path[path.length - 1]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.end} />
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 240, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
  empty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  start: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.text },
  end: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
});
