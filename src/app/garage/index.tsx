import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GarageCarCard } from '@/components/GarageCarCard';
import { OptionsSheet } from '@/components/OptionsSheet';
import { Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { myVehicleStats, type VehicleStats } from '@/features/garage/stats';
import type { Vehicle } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

/** Garage : tous les véhicules de l'utilisateur. Le favori est celui proposé par défaut avant un drive. */
export default function GarageScreen() {
  const { vehicles, setPrimaryVehicle, removeVehicle } = useAuth();
  const [menu, setMenu] = useState<Vehicle | null>(null);
  const [stats, setStats] = useState<Map<string, VehicleStats>>(new Map());
  useFocusEffect(useCallback(() => { myVehicleStats().then(setStats).catch(() => {}); }, []));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const run = (fn: () => Promise<void>, failTitle: string) =>
    fn().catch((e) => Alert.alert(failTitle, e instanceof Error ? e.message : String(e)));

  const confirmRemove = (v: Vehicle) =>
    setTimeout(() =>
      Alert.alert(`Remove ${v.make} ${v.model}?`, 'Your drives with this car are kept, without the car attached.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => run(() => removeVehicle(v.id), 'Remove failed') },
      ]), 400);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>MY GARAGE</Text>
        <Text style={styles.title}>{vehicles?.length ?? 0} {vehicles?.length === 1 ? 'machine' : 'machines'}</Text>
        <Text style={styles.muted}>Your favorite is picked by default before a drive. You can change the car on each drive.</Text>
      </View>

      {vehicles?.map((v, i) => (
        <GarageCarCard key={v.id} car={v} stats={stats.get(v.id)} flip={i % 2 === 1} index={i} onPress={() => setMenu(v)} />
      ))}
      {vehicles && vehicles.length > 0 && (
        <Text style={styles.muted}>Top speed and drive totals are only shown to you. Touch a car to edit it.</Text>
      )}

      <Button title="Add a vehicle" icon="add" onPress={() => router.push('/garage/edit')} />

      <OptionsSheet
        visible={!!menu}
        title={menu ? `${menu.make} ${menu.model}` : undefined}
        onClose={() => setMenu(null)}
        options={menu ? [
          ...(menu.is_primary ? [] : [{ label: 'Set as favorite', onPress: () => run(() => setPrimaryVehicle(menu.id), 'Update failed') }]),
          { label: 'Edit details', onPress: () => router.push({ pathname: '/garage/edit', params: { id: menu.id } }) },
          { label: 'Remove from garage', destructive: true, onPress: () => confirmRemove(menu) },
        ] : []}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
