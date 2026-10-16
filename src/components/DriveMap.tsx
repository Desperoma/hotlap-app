import { useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { LatLng } from '@/features/drives/api';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { colors, fonts, radius } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

/**
 * Carte figée d'un tracé (fin de drive, détail). La caméra se cale sur le tracé au chargement.
 * Pas de gestes : la carte sert d'aperçu, pas de navigation.
 * `path` : un tracé, ou plusieurs morceaux quand la zone privée d'un autre conducteur le coupe.
 */
export function DriveMap({ path: input, style, emptyLabel = 'No route to show', lite = false, children }: {
  path: LatLng[] | LatLng[][];
  style?: StyleProp<ViewStyle>;
  emptyLabel?: string;
  /**
   * Aperçu dans une liste (fil) : sur Android, image statique (liteMode, bien plus léger) ;
   * partout, la carte ne capte pas les touchers pour laisser le post s'ouvrir.
   */
  lite?: boolean;
  /** Contenu posé par-dessus la carte (ex. stats du post) */
  children?: ReactNode;
}) {
  const ref = useRef<MapView>(null);
  const segments = (isSegments(input) ? input : [input]).filter((s) => s.length >= 2);
  const path = segments.flat();
  const first = segments[0]?.[0];
  const last = segments.at(-1)?.at(-1);

  if (!first || !last || !MAPS_AVAILABLE) {
    return (
      <View style={[styles.box, styles.empty, style]}>
        <Text style={styles.emptyText}>{MAPS_AVAILABLE ? emptyLabel : 'Map unavailable in this version'}</Text>
        {children}
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
      <View style={StyleSheet.absoluteFill} pointerEvents={lite ? 'none' : 'auto'}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        // Cadrage immédiat sur le tracé (indispensable en liteMode, où fitToCoordinates n'agit pas).
        initialRegion={regionFor(path)}
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
        liteMode={lite && Platform.OS === 'android'}
        moveOnMarkerPress={false}
      >
        {segments.map((s, i) => (
          <Polyline key={i} coordinates={s} strokeColor={colors.accent} strokeWidth={4} />
        ))}
        <Marker coordinate={first} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.start} />
        </Marker>
        <Marker coordinate={last} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.end} />
        </Marker>
      </MapView>
      </View>
      {children}
    </View>
  );
}

function isSegments(p: LatLng[] | LatLng[][]): p is LatLng[][] {
  return Array.isArray(p[0]);
}

/** Région englobant le tracé, avec une marge de 25 %. */
function regionFor(path: LatLng[]) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of path) {
    minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude); maxLng = Math.max(maxLng, p.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.005),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.005),
  };
}

const styles = StyleSheet.create({
  box: { height: 240, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
  empty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  start: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.text },
  end: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
});
