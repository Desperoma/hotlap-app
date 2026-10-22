import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import type { DriveLogItem } from '@/features/profile/api';
import { formatDuration, formatKm } from '@/features/recording/geo';
import { colors, fonts, spacing, type } from '@/theme';

/** Ligne compacte d'historique (profil, profil public). */
export function DriveLogRow({ drive }: { drive: DriveLogItem }) {
  const date = new Date(drive.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <Card onPress={() => router.push(`/drive/${drive.id}`)} style={styles.row}>
      <Ionicons name={drive.circuitId ? 'flag' : 'git-network-outline'} size={22} color={colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>{drive.title}</Text>
        <Text style={styles.meta}>
          {date} · {formatKm(drive.distanceM)} km · {formatDuration(drive.durationS)}
          {drive.visibility === 'private' ? ' · Only me' : drive.visibility === 'friends' ? ' · Friends' : ''}
        </Text>
      </View>
      <Text style={styles.score}>{drive.score ?? '–'}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  score: { ...type.stat, color: colors.text, fontSize: 16 },
});
