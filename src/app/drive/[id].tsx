import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { FEED } from '@/data/mock';
import { formatDuration, formatKm } from '@/features/recording/geo';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Détail d'un drive. Écran absent de la maquette : version minimale à concevoir.
 * TODO phase 4 : charger le drive + tracé + médias + commentaires depuis Supabase.
 */
export default function DriveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const drive = FEED.find((d) => d.id === id);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Ionicons name="arrow-back" size={24} color={colors.text} onPress={() => router.back()} />
      {drive ? (
        <>
          <Text style={styles.title}>{drive.title}</Text>
          <Text style={styles.meta}>
            {drive.author.display_name} · {drive.vehicle?.make} {drive.vehicle?.model}
          </Text>
          <Card style={styles.map}><Text style={styles.meta}>Carte du tracé (à venir)</Text></Card>
          <Card style={styles.stats}>
            <Stat label="DISTANCE" value={`${formatKm(drive.distance_m)} km`} />
            <Stat label="TIME" value={formatDuration(drive.duration_s)} />
            <Stat label="MAX LAT G" value={drive.max_lateral_g?.toFixed(2) ?? '–'} />
          </Card>
          {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}
        </>
      ) : (
        <Text style={styles.meta}>Drive introuvable.</Text>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ ...type.stat, color: colors.text, fontSize: 18 }}>{value}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.h1, color: colors.text },
  meta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  map: { height: 220, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row' },
  desc: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
});
