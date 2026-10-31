import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/features/auth/AuthProvider';
import { TrackIcon } from '@/components/TrackIcon';
import { CATEGORIES, categoryOf, getCircuit } from '@/features/circuit/api';
import type { LatLng } from '@/features/drives/api';
import {
  fetchCircuitsNear, fetchDrivePath, fetchMapDrives, fetchPublicDrives,
  type BBox, type MapCircuit, type MapDrive, type MapSource,
} from '@/features/drives/map';
import { formatKm } from '@/features/recording/geo';
import { useRecorder } from '@/features/recording/useRecorder';
import { MAPS_AVAILABLE } from '@/lib/maps';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { darkMapStyle } from '@/theme/mapStyle';

import {  t, locale  } from '@/i18n';
/**
 * Onglet Map : carte libre, avec un repère par drive (les miens, mon crew, mes amis, et les
 * drives publics de la zone affichée, chargés au fil des déplacements) et les circuits.
 * Barre de recherche en haut : lieux et circuits (écran /search?mode=map).
 * Toucher un repère met le tracé du drive en surbrillance et ouvre sa carte en bas.
 * Plusieurs drives au même endroit (ex. départs de chez soi) = un seul repère avec un compteur ;
 * on passe de l'un à l'autre en faisant glisser la carte du bas.
 * L'enregistrement d'un drive se fait depuis l'onglet « + » (Live drive).
 */
const SOURCE: Record<MapSource, { label: string; color: string }> = {
  me: { get label() { return t('Me'); }, color: colors.accent },
  crew: { get label() { return t('Crew'); }, color: colors.routePurple },
  friend: { get label() { return t('Friends'); }, color: colors.routeBlue },
  public: { get label() { return t('Public'); }, color: colors.routeAmber },
};
type Filter = 'all' | MapSource;
/** Circuits chargés autour du centre de l'écran : au moins 100 km, au plus 2 000 km de rayon. */
const TRACKS_MIN_RADIUS_M = 100_000;
const TRACKS_MAX_RADIUS_M = 2_000_000;
/** Rayon couvert par l'écran (demi-diagonale), en mètres. */
const regionRadiusM = (r: Region) => {
  const h = (r.latitudeDelta * 111_000) / 2;
  const w = (r.longitudeDelta * 111_000 * Math.cos((r.latitude * Math.PI) / 180)) / 2;
  return Math.hypot(h, w);
};
const FILTERS: Filter[] = ['all', 'me', 'crew', 'friend', 'public'];

/** Repère : drives regroupés dans une même case (taille selon le zoom). */
type Pin = { key: string; coordinate: LatLng; drives: MapDrive[] };

export default function MapScreen() {
  const { session, profile } = useAuth();
  const { status, stats } = useRecorder();
  const mapRef = useRef<MapView>(null);
  const { width } = useWindowDimensions();

  const [drives, setDrives] = useState<MapDrive[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [satellite, setSatellite] = useState(false);
  const [gps, setGps] = useState(false);
  // Drives sélectionnés (copie) : le regroupement change avec le zoom, la sélection doit survivre.
  const [selected, setSelected] = useState<{ drives: MapDrive[]; index: number } | null>(null);
  const [paths, setPaths] = useState<Record<string, LatLng[][] | 'loading' | 'none'>>({});
  const fitted = useRef(false);
  // Couche publique et circuits : rechargés pour la zone affichée.
  const [publicDrives, setPublicDrives] = useState<MapDrive[]>([]);
  const [circuits, setCircuits] = useState<MapCircuit[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [searched, setSearched] = useState<{ coordinate: LatLng; label: string } | null>(null);
  const areaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaSeq = useRef(0);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; zoom?: string; label?: string; t?: string }>();

  // Retour de la recherche : on se place sur le lieu choisi.
  useEffect(() => {
    const lat = Number(params.lat), lng = Number(params.lng);
    if (!params.t || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    fitted.current = true;
    setSelected(null);
    setCircuitId(null);
    setSearched({ coordinate: { latitude: lat, longitude: lng }, label: params.label ?? '' });
    setTimeout(() => mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: Number(params.zoom) || 12 }, { duration: 600 }), 250);
  }, [params.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Circuits : masqués par défaut (« No tracks »). Chargés autour du centre de l'écran (100 km
  // minimum, 2 000 km maximum), les 200 plus proches : au-delà, les repères font ramer la carte.
  const [tracks, setTracks] = useState(false);
  const tracksRef = useRef(false);
  tracksRef.current = tracks;
  const lastRegion = useRef<Region | null>(null);
  const loadArea = useCallback((r: Region) => {
    // Zone affichée, élargie de moitié pour ne pas recharger au moindre glissement.
    const b: BBox = {
      minLat: r.latitude - r.latitudeDelta, maxLat: r.latitude + r.latitudeDelta,
      minLng: r.longitude - r.longitudeDelta, maxLng: r.longitude + r.longitudeDelta,
    };
    const id = ++areaSeq.current;
    fetchPublicDrives(b).then((d) => { if (id === areaSeq.current) setPublicDrives(d); }).catch(() => {});
    if (tracksRef.current) {
      const radius = Math.min(TRACKS_MAX_RADIUS_M, Math.max(TRACKS_MIN_RADIUS_M, regionRadiusM(r)));
      fetchCircuitsNear({ latitude: r.latitude, longitude: r.longitude }, radius)
        .then((c) => { if (id === areaSeq.current) setCircuits(c); }).catch(() => {});
    } else {
      setCircuits([]);
    }
  }, []);
  // Activer les circuits recharge la zone affichée tout de suite.
  useEffect(() => { if (lastRegion.current) loadArea(lastRegion.current); }, [tracks, loadArea]);

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    lastRegion.current = r;
    if (areaTimer.current) clearTimeout(areaTimer.current);
    areaTimer.current = setTimeout(() => loadArea(r), 450);
  };
  useEffect(() => () => { if (areaTimer.current) clearTimeout(areaTimer.current); }, []);

  // Arrivée sur la carte : vue très large, puis zoom continu jusqu'à ma position GPS.
  // Sans position (GPS refusé, introuvable), on cadre sur les drives (plus bas).
  const [located, setLocated] = useState<'pending' | 'ok' | 'failed'>('pending');
  useEffect(() => {
    let live = true;
    (async () => {
      const { status: s } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (!live) return;
      setGps(s === 'granted');
      if (s !== 'granted' || fitted.current) return setLocated('failed');
      const pos = (await Location.getLastKnownPositionAsync().catch(() => null))
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      if (!live) return;
      if (!pos || fitted.current) return setLocated('failed');
      fitted.current = true;
      setLocated('ok');
      const center = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      mapRef.current?.setCamera({ center, zoom: 2, altitude: 20_000_000, heading: 0, pitch: 0 });
      setTimeout(() => mapRef.current?.animateCamera({ center, zoom: 16, altitude: 700 }, { duration: 2200 }), 350);
    })();
    return () => { live = false; };
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
    setPublicDrives([]);
    fitted.current = false;
    load();
  }, [userId, load]);

  // Mes drives et ceux de mes proches gardent leur couleur ; les publics complètent.
  const allDrives = useMemo(() => {
    const own = drives ?? [];
    const known = new Set(own.map((d) => d.id));
    return [...own, ...publicDrives.filter((d) => !known.has(d.id))];
  }, [drives, publicDrives]);

  const counts = useMemo(() => {
    const c = { all: 0, me: 0, crew: 0, friend: 0, public: 0 };
    for (const d of allDrives) {
      c.all++;
      c[d.source]++;
    }
    return c;
  }, [allDrives]);

  const latDelta = region?.latitudeDelta ?? 0.1;
  // Case de regroupement : environ 1/14 de la hauteur affichée (150 m au minimum).
  const cell = Math.max(0.0014, latDelta / 14);
  const cellKey = Math.round(Math.log2(cell / 0.0014) * 2); // évite de regrouper à chaque petit zoom
  const pins = useMemo(
    () => groupPins(allDrives.filter((d) => filter === 'all' || d.source === filter), 0.0014 * 2 ** (cellKey / 2)),
    [allDrives, filter, cellKey],
  );
  const [cats, setCats] = useState<Set<string>>(new Set());
  const shownCircuits = useMemo(() => (cats.size === 0 ? circuits : circuits.filter((c) => cats.has(c.category))), [circuits, cats]);
  const selectedCircuit = circuitId ? circuits.find((c) => c.id === circuitId) ?? null : null;
  // Circuit touché : son tracé et son emprise sur la carte, caméra cadrée dessus.
  const [circuitShape, setCircuitShape] = useState<{ id: string; path: LatLng[][]; area: LatLng[][] } | null>(null);
  useEffect(() => {
    if (!circuitId) return setCircuitShape(null);
    let live = true;
    getCircuit(circuitId).then((c) => {
      if (!live || !c) return;
      setCircuitShape({ id: c.id, path: c.path, area: c.area });
      const pts = [...c.path.flat(), ...c.area.flat()];
      if (pts.length > 1) mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 200, right: 50, bottom: 300, left: 50 }, animated: true });
    }).catch(() => {});
    return () => { live = false; };
  }, [circuitId]);
  const selectedIds = useMemo(() => new Set(selected?.drives.map((d) => d.id) ?? []), [selected]);
  const selectedPin = selected ? { drives: selected.drives } : null;
  const selectedDrive = selected ? selected.drives[Math.min(selected.index, selected.drives.length - 1)] : null;
  const selectedPath = selectedDrive ? paths[selectedDrive.id] : undefined;

  // Premier affichage sans position GPS : cadre sur les repères.
  useEffect(() => {
    if (fitted.current || !drives || located !== 'failed') return;
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
  }, [drives, located]);

  // Repères : Android ne redessine une vue personnalisée que pendant tracksViewChanges.
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(t);
  }, [pins, selected, circuits, circuitId]);

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
    setCircuitId(null);
  };

  const cardWidth = width - spacing.lg * 2;
  const onCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!selected) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.sm));
    if (index !== selected.index) setSelected({ ...selected, index });
  };

  // Gros groupe vu de loin : on zoome dessus plutôt que d'ouvrir des dizaines de cartes.
  // Des drives partis du même endroit ne se sépareront jamais : on ouvre directement leurs cartes.
  const onPinPress = (pin: Pin, isSelected: boolean) => {
    setCircuitId(null);
    if (isSelected) return setSelected(null);
    const coords = pin.drives.map((d) => d.coordinate);
    if (pin.drives.length > 3 && latDelta > 0.08 && spreadDeg(coords) > 0.003) {
      mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 200, right: 80, bottom: 200, left: 80 }, animated: true });
      return;
    }
    setSelected({ drives: pin.drives, index: 0 });
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
          onLongPress={profile?.is_dev ? (e) => router.push({ pathname: '/circuit/details', params: { lat: String(e.nativeEvent.coordinate.latitude), lng: String(e.nativeEvent.coordinate.longitude) } }) : undefined}
          onRegionChangeComplete={onRegionChangeComplete}
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
            const isSelected = pin.drives.some((d) => selectedIds.has(d.id));
            return (
              <Marker
                key={pin.key}
                coordinate={pin.coordinate}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={tracking}
                zIndex={isSelected ? 10 : 5}
                onPress={() => onPinPress(pin, isSelected)}
              >
                <DrivePin pin={pin} selected={isSelected} dimmed={!!selected && !isSelected} />
              </Marker>
            );
          })}

          {circuitShape && circuitShape.id === circuitId && (
            <>
              {circuitShape.area.map((ring, i) => (
                <Polygon key={`ca${i}`} coordinates={ring} strokeColor="rgba(198,244,50,0.4)" fillColor="rgba(198,244,50,0.08)" strokeWidth={1} />
              ))}
              {circuitShape.path.map((seg, i) => (
                <Polyline key={`cp${i}`} coordinates={seg} strokeColor="#FFFFFF" strokeWidth={4} lineCap="round" lineJoin="round" zIndex={3} />
              ))}
            </>
          )}
          {tracks && (filter === 'all' || filter === 'public') && shownCircuits.map((c) => {
            const cat = categoryOf(c.category);
            return (
              <Marker key={`c-${c.id}`} coordinate={c.coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking}
                zIndex={c.id === circuitId ? 9 : 4}
                onPress={() => { setSelected(null); setCircuitId(c.id === circuitId ? null : c.id); }}>
                <View style={[styles.trackPin, c.id === circuitId && styles.trackPinSelected]}>
                  <TrackIcon category={cat.key} size={c.id === circuitId ? 34 : 28} />
                </View>
              </Marker>
            );
          })}

          {searched && (
            <Marker coordinate={searched.coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracking} zIndex={3}
              onPress={() => setSearched(null)}>
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="location" size={34} color={colors.text} />
              </View>
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={styles.noMap}>
          <Text style={styles.muted}>{t('Map unavailable in this version.')}</Text>
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <Pressable style={styles.searchBar} onPress={() => router.push({ pathname: '/search', params: { mode: 'map' } })}
          accessibilityRole="search" accessibilityLabel={t('Search a place or a circuit')}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchText} numberOfLines={1}>{searched?.label || t('Search a place or a circuit')}</Text>
          {searched && (
            <Pressable onPress={() => setSearched(null)} hitSlop={10} accessibilityLabel={t('Clear search')}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingRight: spacing.lg }}>
        <View style={styles.filterBar}>
          {FILTERS.map((f) => {
            const active = filter === f;
            const color = f === 'all' ? colors.text : SOURCE[f].color;
            return (
              <Pressable key={f} onPress={() => { setFilter(f); setSelected(null); }}
                style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
                {f !== 'all' && <View style={[styles.dot, { backgroundColor: color }]} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f === 'all' ? t('All') : SOURCE[f].label}</Text>
                {drives && <Text style={[styles.chipCount, active && styles.chipTextActive]}>{counts[f]}</Text>}
              </Pressable>
            );
          })}
        </View>
        </ScrollView>
        {(filter === 'all' || filter === 'public') && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingRight: spacing.lg }}>
            <View style={styles.filterBar}>
              <Pressable onPress={() => { setTracks(false); setCats(new Set()); setCircuitId(null); }} style={[styles.chip, !tracks && styles.chipActive]}
                accessibilityState={{ selected: !tracks }}>
                <Ionicons name="eye-off-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.chipText, !tracks && styles.chipTextActive]}>{t('No tracks')}</Text>
              </Pressable>
              <Pressable onPress={() => { setTracks(true); setCats(new Set()); }} style={[styles.chip, tracks && cats.size === 0 && styles.chipActive]}
                accessibilityState={{ selected: tracks && cats.size === 0 }}>
                <Ionicons name="flag" size={12} color={colors.textMuted} />
                <Text style={[styles.chipText, tracks && cats.size === 0 && styles.chipTextActive]}>{t('All tracks')}</Text>
              </Pressable>
              {CATEGORIES.map((c) => {
                const active = tracks && cats.has(c.key);
                return (
                  <Pressable key={c.key} accessibilityState={{ selected: active }}
                    onPress={() => {
                      setTracks(true);
                      setCats((s) => { const n = new Set(tracks ? s : []); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; });
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <TrackIcon category={c.key} size={16} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {profile?.is_dev && tracks && <Text style={styles.devHint}>{t('DEV · long press the map to add a track')}</Text>}

        <View style={styles.sideButtons} pointerEvents="box-none">
          {!drives && !error && <View style={styles.roundBtn}><ActivityIndicator size="small" color={colors.accent} /></View>}
          {error && (
            <Pressable style={styles.roundBtn} onPress={load} accessibilityLabel={t('Retry')}>
              <Ionicons name="refresh" size={18} color={colors.danger} />
            </Pressable>
          )}
          <Pressable style={styles.roundBtn} onPress={() => setSatellite((s) => !s)} accessibilityLabel={t('Map style')}>
            <Ionicons name={satellite ? 'map-outline' : 'earth'} size={18} color={colors.text} />
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={() => recenter()} accessibilityLabel={t('My position')}>
            <Ionicons name="locate" size={18} color={colors.accent} />
          </Pressable>
        </View>

        {recording && (
          <Pressable style={styles.livePill} onPress={() => router.push('/drive/live')}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {status === 'paused' ? t('PAUSED') : t('RECORDING')}{stats ? t(' · {0} km', formatKm(stats.distanceM)) : ''}
            </Text>
            <Text style={[styles.liveText, { color: colors.accent }]}>{t('Back to drive')}</Text>
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

      {selectedCircuit && !selectedPin && (
        <View style={[styles.cards, { paddingHorizontal: spacing.lg }]}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <TrackIcon category={categoryOf(selectedCircuit.category).key} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{selectedCircuit.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {[selectedCircuit.city, selectedCircuit.countryCode].filter(Boolean).join(' · ') || t('Circuit')}
                </Text>
              </View>
              <Pressable onPress={() => setCircuitId(null)} hitSlop={10} accessibilityLabel={t('Close')}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.statsRow}>
              <Stat value={selectedCircuit.lapLengthM ? formatKm(selectedCircuit.lapLengthM) : '—'} unit={selectedCircuit.lapLengthM ? 'km' : undefined} label={t('LAP')} />
              <Stat value={categoryOf(selectedCircuit.category).label} label={t('TYPE')} />
              <Stat value={selectedCircuit.hasPath ? t('Mapped') : selectedCircuit.hasArea ? t('To learn') : '—'} label={t('TRACK')} />
            </View>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardHint, { flex: 1 }]} numberOfLines={2}>{t('© OpenStreetMap contributors, Wikidata')}</Text>
              <Pressable style={[styles.openBtn, styles.ghostBtn]} onPress={() => router.push({ pathname: '/leaderboard', params: { circuit: selectedCircuit.id, circuitName: selectedCircuit.name } })}
                accessibilityLabel={t('Leaderboard')}>
                <Ionicons name="podium-outline" size={14} color={colors.text} />
              </Pressable>
              <Pressable style={styles.openBtn} onPress={() => router.push(`/circuit/${selectedCircuit.id}`)}>
                <Text style={styles.openText}>{selectedCircuit.hasPath || selectedCircuit.hasArea ? t('Drive') : t('Open')}</Text>
                <Ionicons name="flag" size={14} color={colors.accentText} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {drives && allDrives.length === 0 && !selected && !selectedCircuit && (
        <View style={styles.hint} pointerEvents="none">
          <Ionicons name="map-outline" size={16} color={colors.textMuted} />
          <Text style={styles.hintText}>{t('Your drives, your friends’ and public drives around will show up here.')}</Text>
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
      <View style={[styles.pinHead, { width: size, height: size, borderRadius: size * 0.26, backgroundColor: color },
        first.source === 'me' && styles.pinMine, selected && styles.pinSelected]}>
        {first.source === 'me' ? (
          <TrackIcon category="drive" size={size - 4} style={{ borderRadius: size * 0.22 }} />
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
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('Close')}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>{drive.title}</Text>

      <View style={styles.statsRow}>
        <Stat value={formatKm(drive.distanceM)} unit="km" label={t('DISTANCE')} />
        <Stat value={formatDur(drive.durationS)} label={t('TIME')} />
        <Stat value={drive.score != null ? String(drive.score) : '—'} unit={drive.score != null ? 'pts' : undefined} label={t('SCORE')} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.cardHint}>
          {pathState === 'loading' ? t('Loading route…') : pathState === 'none' ? t('Route hidden (private zone)') : position ? t('{0} · swipe for more', position) : ' '}
        </Text>
        <Pressable style={styles.openBtn} onPress={() => router.push(`/drive/${drive.id}`)}>
          <Text style={styles.openText}>{t('Open drive')}</Text>
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

/** Regroupe les drives proches (case de `cell` degrés de latitude), dans l'ordre reçu. */
function groupPins(drives: MapDrive[], cell = 0.0014): Pin[] {
  const byCell = new Map<string, Pin>();
  for (const d of drives) {
    const key = `${(d.coordinate.latitude / cell).toFixed(0)}:${(d.coordinate.longitude / (cell * 1.4)).toFixed(0)}`;
    const pin = byCell.get(key);
    if (pin) pin.drives.push(d);
    else byCell.set(key, { key, coordinate: d.coordinate, drives: [d] });
  }
  return [...byCell.values()];
}

/** Plus grand écart (en degrés) entre des points. */
function spreadDeg(coords: LatLng[]) {
  const lats = coords.map((c) => c.latitude), lngs = coords.map((c) => c.longitude);
  return Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
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
  if (h < 1) return t('Just now');
  if (h < 24) return t('{0} h ago', h);
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? t('Yesterday') : t('{0} days ago', d);
  return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

const glass = { backgroundColor: 'rgba(22,25,22,0.92)', borderWidth: 1, borderColor: colors.border };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  noMap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },

  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  searchBar: {
    ...glass, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46,
    borderRadius: radius.pill, paddingHorizontal: spacing.md,
  },
  searchText: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
  ghostBtn: { backgroundColor: colors.card, paddingHorizontal: 10 },
  circuitPin: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  filterBar: { ...glass, flexDirection: 'row', alignSelf: 'flex-start', borderRadius: radius.pill, padding: 4, gap: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  chipActive: { backgroundColor: colors.accentSoft },
  zoomHint: { ...glass, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  devHint: { color: '#F59E0B', fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.5 },
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
  pinMine: { borderWidth: 2, overflow: 'hidden' },
  trackPin: {
    borderRadius: 9, borderWidth: 2, borderColor: colors.bg,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  trackPinSelected: { borderColor: colors.text },
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
