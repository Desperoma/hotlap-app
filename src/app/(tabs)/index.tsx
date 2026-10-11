import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GForceCard } from '@/components/GForceCard';
import { RouteBadge } from '@/components/RouteBadge';
import { Button, Card, Chip, Screen, SegmentedControl } from '@/components/ui';
import { MY_ROUTES } from '@/data/mock';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, fonts, spacing, type } from '@/theme';

/** Discover : accueil, G-force live, accès rapide à l'enregistrement, mes routes / explorer. */
export default function DiscoverScreen() {
  const { primaryVehicle } = useAuth();
  const [tab, setTab] = useState<'mine' | 'explore'>('mine');

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
        options={[{ value: 'mine', label: 'My Routes' }, { value: 'explore', label: 'Explore' }]} />

      {tab === 'mine' ? (
        MY_ROUTES.map((r) => (
          <Card key={r.id} style={styles.route}>
            <RouteBadge color={r.color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.routeName}>{r.name}</Text>
              <Text style={styles.routeMeta}>{r.place}</Text>
              <Text style={styles.routeMeta}>★ Best score: {r.bestScore}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.km}>{r.distanceKm}</Text>
              <Text style={styles.routeMeta}>km</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        ))
      ) : (
        <Text style={styles.empty}>Explore arrive en V1 : routes populaires autour de toi.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.h1, color: colors.text, fontSize: 30 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14 },
  route: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  routeName: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  routeMeta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  km: { ...type.stat, color: colors.text, fontSize: 18 },
  empty: { color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center', marginTop: spacing.xl },
});
