import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DriveLogRow } from '@/components/DriveLogRow';
import { GForceCard } from '@/components/GForceCard';
import { Button, Card, Chip, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { listDrives, type DriveLogItem } from '@/features/profile/api';
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
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.cardTitle}>Known roads near you</Text>
          <Text style={styles.empty}>
            Les routes connues autour de toi arrivent avec la recherche et la carte des drives publics.
          </Text>
        </Card>
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
  empty: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
