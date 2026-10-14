import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { OptionsSheet } from '@/components/OptionsSheet';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Vehicle } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

/** Garage : tous les véhicules de l'utilisateur. Le favori est celui proposé par défaut avant un drive. */
export default function GarageScreen() {
  const { vehicles, setPrimaryVehicle, removeVehicle } = useAuth();
  const [menu, setMenu] = useState<Vehicle | null>(null);

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

      {vehicles?.map((v) => (
        <Card key={v.id} style={[styles.car, v.is_primary && styles.favorite]} onPress={() => setMenu(v)}>
          <View style={{ flex: 1, gap: 2 }}>
            {v.is_primary && (
              <View style={styles.badge}>
                <Ionicons name="star" size={11} color={colors.accent} />
                <Text style={styles.badgeText}>FAVORITE</Text>
              </View>
            )}
            {v.nickname ? <Text style={styles.muted}>{v.nickname}</Text> : null}
            <Text style={styles.make}>{v.make.toUpperCase()}{v.year ? ` · ${v.year}` : ''}</Text>
            <Text style={styles.model}>{v.model}</Text>
          </View>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Card>
      ))}

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
  car: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  favorite: { borderColor: colors.accent },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  badgeText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  make: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1 },
  model: { ...type.h1, color: colors.text, fontSize: 22 },
});
