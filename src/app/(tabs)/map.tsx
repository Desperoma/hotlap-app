import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/features/auth/AuthProvider';
import type { LatLng } from '@/features/drives/api';
import { fetchDrivePath, fetchMapDrives, type MapDrive, type MapSource } from '@/features/drives/map';
import { formatKm } from '@/features/recording/geo';
import { useRecorder } from '@/features/recording/useRecorder';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

/**
 * Onglet Map : carte libre, avec un repère par drive (les miens, mon crew, mes amis).
 * Toucher un repère met le tracé du drive en surbrillance et ouvre sa carte en bas.
 * Plusieurs drives au même endroit (ex. départs de chez soi) = un seul repère avec un compteur ;
 * on passe de l'un à l'autre en faisant glisser la carte du bas.
 * L'enregistrement d'un drive se fait depuis l'onglet « + » (Live drive).
 */
const SOURCE: Record<MapSource, { label: string; color: string }> = {
  me: { label: 'Me', color: colors.accent },
  crew: { label: 'Crew', color: colors.routePurple },
  friend: { label: 'Friends', color: colors.routeBlue },
};
type Filter = 'all' | MapSource;
const FILTERS: Filter[] = ['all', 'me', 'crew', 'friend'];

/** Repère : drives regroupés dans une case d'environ 150 m. */
type Pin = { key: string; coordinate: LatLng; drives: MapDrive[] };

export default function MapScreen() {
  const { session } = useAuth();
  const { status, stats } = useRecorder();
  const mapRef = useRef<MapView>(null);
  const { width } = useWindowDimensions();

  const [drives, setDrives] = useState<MapDrive[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [satellite, setSatellite] = useState(false);
  const [gps, setGps] = useState(false);
  const [selected, setSelected] = useState<{ pinKey: string; index: number } | null>(null);
  const [paths, setPaths] = useState<Record<string, LatLng[][] | 'loading' | 'none'>>({});
  const fitted = useRef(false);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status: s }) => setGps(s === 'granted'));
  }, []);

  // Rafraîchit à chaque retour sur l'onglet (nouveau drive, nouvel ami…).
  const load = useCallback(() => {
    fetchMapDrives()
      .then((d) => {
        setDrives(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useFocusEffect(load);
  const userId = session?.user.id;
  const firstUser = useRef(userId);
  useEffect(() => {
    // Changement de compte : on repart de zéro.
    if (userId === firstUser.current) return;
    firstUser.current = userId;
    setDrives(null);
    setSelected(null);
    setPaths({});
    fitted.current = false;
    load();
  }, [userId, load]);

  const counts = useMemo(() => {
    const c = { all: 0, me: 0, crew: 0, friend: 0 };
    for (const d of drives ?? []) {
      c.all++;
      c[d.source]++;
    }
    return c;
  }, [drives]);

  const pins = useMemo(() => groupPins((drives ?? []).filter((d) => filter === 'all' || d.source === filter)), [drives, filter]);
  const selectedPin = selected ? pins.find((p) => p.key === selected.pinKey) ?? null : null;
  const selectedDrive = selectedPin ? selectedPin.drives[Math.min(selected!.index, selectedPin.drives.length - 1)] : null;
  const selectedPath = selectedDrive ? paths[selectedDrive.id] : undefined;

  // Le repère sélectionné disparaît (filtre, rafraîchissement) : on ferme la carte du bas.
  useEffect(() => {
    if (selected && !selectedPin) setSelected(null);
  }, [selected, selectedPin]);

  // Premier affichage : cadre sur les repères, sinon sur ma position.
  useEffect(() => {
    if (fitted.current || !drives) return;
    fitted.current = true;
    const coords = pins.map((p) => p.coordinate);
    if (coords.length > 1) {
      setTimeout(() => mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 160, right: 60, bottom: 120, left: 60 }, animated: true }), 300);
    } else if (coords.length === 1) {
      mapRef.current?.animateCamera({ center: coords[0], zoom: 12 }, { duration: 400 });
    } else {
      recenter(11);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drives]);

  // Repères : Android ne redessine une vue personnalisée que pendant tracksViewChanges.
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(t);
  }, [pins, selected?.pinKey]);

  // Tracé du drive affiché : chargé une fois, puis la caméra se cale dessus (au-dessus de la carte du bas).
  useEffect(() => {
    if (!selectedDrive) return;
    const id = selectedDrive.id;
    const cached = paths[id];
    if (Array.isArray(cached)) return fitPath(cached.flat());
    if (cached) return;
    setPaths((p) => ({ ...p, [id]: 'loading' }));
    fetchDrivePath(id)
      .then((path) => {
        const ok = path.some((s) => s.length > 1);
        setPaths((p) => ({ ...p, [id]: ok ? path : 'none' }));
        if (ok) fitPath(path.flat());
      })
      .catch(() => setPaths((p) => ({ ...p, [id]: 'none' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrive?.id]);

  const fitPath = (path: LatLng[]) =>
    mapRef.current?.fitToCoordinates(path, { edgePadding: { top: 170, right: 50, bottom: 260, left: 50 }, animated: true });

  async function recenter(zoom = 13) {
    const pos = await Location.getLastKnownPositionAsync().catch(() => null);
    if (pos) mapRef.current?.animateCamera({ center: pos.coords, zoom }, { duration: 400 });
  }

  const onMapPress = (e: MapPressEvent) => {
    // Sur iOS, toucher un repère déclenche aussi le toucher de la carte.
    if (e.nativeEvent.action === 'marker-press') return;
    setSelected(null);
  };

  const cardWidth = width - spacing.lg * 2;
  const onCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!selected) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.sm));
    if (index !== selected.index) setSelected({ ...selected, index });
  };

  const recording = status !== 'idle';
  const highlight = selectedDrive ? SOURCE[selectedDrive.source].color : colors.accent;

  return (
    <View style={styles.root}>
      {MAPS_AVAILABLE ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          customMapStyle={darkMapStyle}
          userInterfaceStyle="dark"
          mapType={satellite ? 'hybrid' : 'standard'}
          showsUserLocation={gps}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onPress={onMapPress}
        >
          {Array.isArray(selectedPath) && (
            <>
              {/* Surbrillance : halo large et transparent, puis trait net ; un morceau par partie visible */}
              {selectedPath.map((seg, i) => (
                <Fragment key={i}>
                  <Polyline coordinates={seg} strokeColor={`${highlight}33`} strokeWidth={14} lineCap="round" lineJoin="round" zIndex={1} />
                  <Polyline coordinates={seg} strokeColor={`${highlight}80`} strokeWidth={8} lineCap="round" lineJoin="round" zIndex={2} />
                  <Polyline coordinates={seg} strokeColor={highlight} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={3} />
                </Fragment>
              ))}
              <Marker coordinate={selectedPath[0][0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={4}>
                <View style={styles.startDot} />
              </Marker>
              <Marker coordinate={selectedPath.at(-1)!.at(-1)!} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={4}>
                <View style={[styles.endDot, { backgroundColor: highlight }]}>
                  <Ionicons name="flag" size={9} color={colors.accentText} />
                </View>
              </Marker>
            </>
          )}

          {pins.map((pin) => {
            const isSelected = pin.key === selected?.pinKey;
            return (
              <Marker
                key={pin.key}
                coordinate={pin.coordinate}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={tracking}
                zIndex={isSelected ? 10 : 5}
                onPress={() => setSelected(isSelected ? null : { pinKey: pin.key, index: 0 })}
              >
                <DrivePin pin={pin} selected={isSelected} dimmed={!!selected && !isSelected} />
              </Marker>
            );
          })}
        </MapView>
      ) : (
        <View style={styles.noMap}>
          <Text style={styles.muted}>Map unavailable in this version.</Text>
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.filterBar}>
          {FILTERS.map((f) => {
            const active = filter === f;
            const color = f === 'all' ? colors.text : SOURCE[f].color;
            return (
              <Pressable key={f} onPress={() => { setFilter(f); setSelected(null); }}
                style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
                {f !== 'all' && <View style={[styles.dot, { backgroundColor: color }]} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f === 'all' ? 'All' : SOURCE[f].label}</Text>
                {drives && <Text style={[styles.chipCount, active && styles.chipTextActive]}>{counts[f]}</Text>}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sideButtons} pointerEvents="box-none">
          {!drives && !error && <View style={styles.roundBtn}><ActivityIndicator size="small" color={colors.accent} /></View>}
          {error && (
            <Pressable style={styles.roundBtn} onPress={load} accessibilityLabel="Retry">
              <Ionicons name="refresh" size={18} color={colors.danger} />
            </Pressable>
          )}
          <Pressable style={styles.roundBtn} onPress={() => setSatellite((s) => !s)} accessibilityLabel="Map style">
            <Ionicons name={satellite ? 'map-outline' : 'earth'} size={18} color={colors.text} />
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={() => recenter()} accessibilityLabel="My position">
            <Ionicons name="locate" size={18} color={colors.accent} />
          </Pressable>
        </View>

        {recording && (
          <Pressable style={styles.livePill} onPress={() => router.push('/drive/live')}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {status === 'paused' ? 'PAUSED' : 'RECORDING'}{stats ? ` · ${formatKm(stats.distanceM)} km` : ''}
            </Text>
            <Text style={[styles.liveText, { color: colors.accent }]}>Back to drive</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        )}
      </SafeAreaView>

      {selectedPin && (
        <View style={styles.cards}>
          <FlatList
            data={selectedPin.drives}
            keyExtractor={(d) => d.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + spacing.sm}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
            onMomentumScrollEnd={onCardScroll}
            renderItem={({ item, index }) => (
              <DriveMapCard
                drive={item}
                width={cardWidth}
                position={selectedPin.drives.length > 1 ? `${index + 1}/${selectedPin.drives.length}` : null}
                pathState={paths[item.id]}
                onClose={() => setSelected(null)}
              />
            )}
          />
        </View>
      )}

      {drives && drives.length === 0 && !selected && (
        <View style={styles.hint} pointerEvents="none">
          <Ionicons name="map-outline" size={16} color={colors.textMuted} />
          <Text style={styles.hintText}>Your drives, your crew’s and your friends’ will show up here.</Text>
        </View>
      )}
    </View>
  );
}

function DrivePin({ pin, selected, dimmed }: { pin: Pin; selected: boolean; dimmed: boolean }) {
  const first = pin.drives[0];
  const color = SOURCE[first.source].color;
  const size = selected ? 42 : 34;
  const name = first.author.displayName || first.author.username;
  return (
    <View style={[styles.pin, { opacity: dimmed ? 0.45 : 1 }]}>
      <View style={[styles.pinHead, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, selected && styles.pinSelected]}>
        {first.source === 'me' ? (
          <Ionicons name="car-sport" size={selected ? 20 : 16} color={colors.accentText} />
        ) : (
          <Text style={[styles.pinInitials, { fontSize: selected ? 14 : 12 }]}>{initialsOf(name)}</Text>
        )}
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
      {pin.drives.length > 1 && (
        <View style={styles.pinCount}>
          <Text style={styles.pinCountText}>{pin.drives.length}</Text>
        </View>
      )}
    </View>
  );
}

function DriveMapCard({ drive, width, position, pathState, onClose }: {
  drive: MapDrive;
  width: number;
  position: string | null;
  pathState: LatLng[][] | 'loading' | 'none' | undefined;
  onClose: () => void;
}) {
  const src = SOURCE[drive.source];
  const name = drive.source === 'me' ? 'You' : drive.author.displayName || drive.author.username;
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.cardHeader}>
        <Avatar url={drive.author.avatarUrl} name={drive.author.displayName || drive.author.username} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {timeAgo(drive.startedAt)}{drive.vehicle ? ` · ${drive.vehicle}` : ''}
          </Text>
        </View>
        <View style={[styles.tag, { borderColor: src.color }]}>
          <Text style={[styles.tagText, { color: src.color }]}>{src.label.toUpperCase()}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>{drive.title}</Text>

      <View style={styles.statsRow}>
        <Stat value={formatKm(drive.distanceM)} unit="km" label="DISTANCE" />
        <Stat value={formatDur(drive.durationS)} label="TIME" />
        <Stat value={drive.score != null ? String(drive.score) : '—'} unit={drive.score != null ? 'pts' : undefined} label="SCORE" />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.cardHint}>
          {pathState === 'loading' ? 'Loading route…' : pathState === 'none' ? 'Route hidden (private zone)' : position ? `${position} · swipe for more` : ' '}
        </Text>
        <Pressable style={styles.openBtn} onPress={() => router.push(`/drive/${drive.id}`)}>
          <Text style={styles.openText}>Open drive</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Regroupe les drives proches (case d'environ 150 m), le plus récent en premier. */
function groupPins(drives: MapDrive[]): Pin[] {
  const byCell = new Map<string, Pin>();
  for (const d of drives) {
    const key = `${(d.coordinate.latitude / 0.0014).toFixed(0)}:${(d.coordinate.longitude / 0.002).toFixed(0)}`;
    const pin = byCell.get(key);
    if (pin) pin.drives.push(d);
    else byCell.set(key, { key, coordinate: d.coordinate, drives: [d] });
  }
  return [...byCell.values()];
}

function initialsOf(name: string) {
  return name.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? 'Yesterday' : `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const glass = { backgroundColor: 'rgba(22,25,22,0.92)', borderWidth: 1, borderColor: colors.border };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  noMap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },

  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  filterBar: { ...glass, flexDirection: 'row', alignSelf: 'flex-start', borderRadius: radius.pill, padding: 4, gap: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  chipActive: { backgroundColor: colors.accentSoft },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextActive: { color: colors.text },
  chipCount: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 11 },
  sideButtons: { alignItems: 'flex-end', gap: spacing.sm },
  roundBtn: { ...glass, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  livePill: {
    ...glass, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderColor: colors.live,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  liveText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5 },

  pin: { alignItems: 'center', padding: 4 },
  pinHead: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  pinSelected: { borderColor: colors.text, borderWidth: 3 },
  pinInitials: { color: '#fff', fontFamily: fonts.semibold },
  pinTail: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  pinCount: {
    position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
  },
  pinCountText: { color: colors.bg, fontFamily: fonts.semibold, fontSize: 10 },
  startDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.text },
  endDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  cards: { position: 'absolute', left: 0, right: 0, bottom: spacing.lg },
  card: { ...glass, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  cardMeta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.8 },
  cardTitle: { ...type.h2, color: colors.text, fontSize: 18 },
  statsRow: { flexDirection: 'row' },
  statValue: { ...type.stat, color: colors.text, fontSize: 18 },
  statUnit: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardHint: { flex: 1, color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
  },
  openText: { color: colors.accentText, fontFamily: fonts.semibold, fontSize: 13 },

  hint: {
    ...glass, position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md,
  },
  hintText: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
