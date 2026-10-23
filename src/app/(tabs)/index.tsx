import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DriveCard } from '@/components/DriveCard';
import { DriveLogRow } from '@/components/DriveLogRow';
import { GForceCard } from '@/components/GForceCard';
import { Button, Card, Chip, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchMapCircuits, type MapCircuit } from '@/features/drives/map';
import { listDrives, type DriveLogItem } from '@/features/profile/api';
import { formatKm } from '@/features/recording/geo';
import { feedNearby } from '@/features/social/api';
import type { DriveFeedItem } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

type Tab = 'explore' | 'mine';

/**
 * Discover : accueil, G-force live, accès rapide à l'enregistrement.
 * Onglets : Explore (routes connues autour de moi, en premier), puis My routes (mes drives récents).
 */
export default function DiscoverScreen() {
  const { session, primaryVehicle } = useAuth();
  const me = session?.user.id;
  const [tab, setTab] = useState<Tab>('explore');
  const [mine, setMine] = useState<DriveLogItem[] | null>(null);
  const [near, setNear] = useState<{ drives: DriveFeedItem[]; circuits: MapCircuit[] } | 'no-location' | null>(null);

  // Explore : drives publics à moins de 50 km et circuits de la région (position approximative).
  useFocusEffect(useCallback(() => {
    if (tab !== 'explore' || !me) return;
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') { if (alive) setNear('no-location'); return; }
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const { latitude: lat, longitude: lng } = pos.coords;
      const [drives, circuits] = await Promise.all([
        feedNearby(me, lat, lng).catch(() => [] as DriveFeedItem[]),
        fetchMapCircuits({ minLat: lat - 1, maxLat: lat + 1, minLng: lng - 1.5, maxLng: lng + 1.5 }).catch(() => [] as MapCircuit[]),
      ]);
      if (alive) setNear({ drives: drives.slice(0, 10), circuits: circuits.slice(0, 5) });
    })().catch(() => alive && setNear({ drives: [], circuits: [] }));
    return () => { alive = false; };
  }, [tab, me]));

  const askLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') setNear(null);
  };
  const showOnMap = (lat: number, lng: number, label: string) =>
    router.navigate({ pathname: '/map', params: { lat: String(lat), lng: String(lng), zoom: '14', label, t: String(Date.now()) } });

  useFocusEffect(useCallback(() => {
    if (tab !== 'mine' || !me) return;
    let alive = true;
    listDrives(me, 10)
      .then((d) => alive && setMine(d))
      .catch(() => alive && setMine([]));
    return () => { alive = false; };
  }, [tab, me]));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Drive. Explore. Connect.</Text>
        {primaryVehicle && <Chip icon="car-sport" label={`${primaryVehicle.make} ${primaryVehicle.model}`} />}
      </View>

      <GForceCard />

      <Button title="Record a Drive" icon="add-circle" trailingIcon="chevron-forward"
        onPress={() => router.push('/record')} style={{ justifyContent: 'center' }} />

      <SegmentedControl value={tab} onChange={setTab}
        options={[{ value: 'explore', label: 'Explore' }, { value: 'mine', label: 'My Routes' }]} />

      {tab === 'explore' ? (
        near === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : near === 'no-location' ? (
          <Card style={{ gap: spacing.md }}>
            <Text style={styles.cardTitle}>Drives near you</Text>
            <Text style={styles.empty}>Active la localisation pour voir les drives publics et les circuits autour de toi.</Text>
            <Button title="Enable location" icon="locate" onPress={askLocation} />
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {near.circuits.length > 0 && (
              <Card style={{ gap: spacing.sm }}>
                <Text style={styles.cardTitle}>Circuits nearby</Text>
                {near.circuits.map((c) => (
                  <Pressable key={c.id} style={styles.circuit} onPress={() => showOnMap(c.coordinate.latitude, c.coordinate.longitude, c.name)}>
                    <Ionicons name="flag" size={16} color={colors.accent} />
                    <Text style={styles.circuitName} numberOfLines={1}>{c.name}</Text>
                    {c.lapLengthM ? <Text style={styles.empty}>{formatKm(c.lapLengthM)} km</Text> : null}
                  </Pressable>
                ))}
              </Card>
            )}
            <Text style={styles.cardTitle}>Public drives within 50 km</Text>
            {near.drives.length === 0 ? (
              <Card style={{ gap: spacing.md }}>
                <Text style={styles.empty}>No public drives around you yet. Record one and share it publicly!</Text>
                <Button title="Open the map" icon="map-outline" variant="secondary" onPress={() => router.navigate('/map')} />
              </Card>
            ) : (
              near.drives.map((d) => <DriveCard key={d.id} drive={d} />)
            )}
          </View>
        )
      ) : mine === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : mine.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <Text style={styles.cardTitle}>No drives yet. Take the wheel!</Text>
          <Button title="Record your first drive" trailingIcon="arrow-forward" onPress={() => router.push('/record')} />
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          {mine.map((d) => <DriveLogRow key={d.id} drive={d} />)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.h1, color: colors.text, fontSize: 30 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
  cardTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  circuit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  circuitName: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 14 },
  empty: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
