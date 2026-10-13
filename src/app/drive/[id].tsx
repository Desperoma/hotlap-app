import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DriveMap } from '@/components/DriveMap';
import { PhotoStrip } from '@/components/PhotoStrip';
import { ScoreCard } from '@/components/ScoreCard';
import { Button, Card, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteDrive, getDrive, updateDrive, type DriveDetail } from '@/features/drives/api';
import { listDrivePhotos } from '@/features/drives/media';
import { formatDuration, formatKm } from '@/features/recording/geo';
import type { Visibility } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'followers', label: 'Crew' },
  { value: 'public', label: 'Everyone' },
];

/** Détail d'un drive : tracé, stats, score détaillé ; visibilité et suppression pour le propriétaire. */
export default function DriveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [drive, setDrive] = useState<DriveDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getDrive(id, session?.user.id)
      .then(setDrive)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    listDrivePhotos(id).then(setPhotos).catch(() => setPhotos([]));
  }, [id, session?.user.id]);

  useEffect(load, [load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>Couldn’t load this drive.</Text>
        <Button title="Retry" variant="secondary" onPress={load} />
      </Screen>
    );
  }
  if (drive === undefined) {
    return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  }
  if (drive === null) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>This drive doesn’t exist or isn’t shared with you.</Text>
        <Button title="Back" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  const changeVisibility = async (v: Visibility) => {
    const previous = drive.visibility;
    setDrive({ ...drive, visibility: v });
    try {
      await updateDrive(drive.id, { visibility: v });
    } catch (e) {
      setDrive({ ...drive, visibility: previous });
      Alert.alert('Update failed', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Delete this drive?', 'It will be removed for everyone. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDrive(drive.id);
            back();
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const author = drive.isMine ? 'You' : drive.author?.display_name ?? drive.author?.username ?? 'Driver';
  const vehicle = drive.vehicle ? `${drive.vehicle.make} ${drive.vehicle.model}` : null;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>

      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>
          {formatDate(drive.startedAt)}{drive.circuitName ? ` · ${drive.circuitName.toUpperCase()}` : ' · OPEN ROAD'}
        </Text>
        <Text style={styles.title}>{drive.title}</Text>
        <Text style={styles.muted}>{[author, vehicle].filter(Boolean).join(' · ')}</Text>
      </View>

      <DriveMap
        path={drive.path}
        emptyLabel={drive.isMine ? 'No route recorded' : 'Route hidden (too short to share)'}
      />

      <PhotoStrip uris={photos} size={140} />

      <Card style={styles.stats}>
        <Stat label="DISTANCE" value={`${formatKm(drive.distanceM)} km`} />
        <Stat label="TIME" value={formatDuration(drive.durationS)} />
        {drive.lapTimeMs != null ? (
          <Stat label="BEST LAP" value={formatLap(drive.lapTimeMs)} />
        ) : (
          <Stat label="MAX LAT G" value={drive.maxLateralG != null ? drive.maxLateralG.toFixed(2) : '–'} />
        )}
      </Card>

      <ScoreCard score={drive.score} breakdown={drive.scoreBreakdown} />

      {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}

      {drive.isMine && (
        <View style={{ gap: spacing.md }}>
          {/* Vitesses : visibles uniquement du propriétaire, jamais publiées. */}
          <Card style={styles.stats}>
            <Stat label="AVG SPEED · PRIVATE" value={drive.avgSpeedKmh != null ? `${Math.round(drive.avgSpeedKmh)} km/h` : '–'} />
          </Card>
          <Text style={styles.label}>Who can see it</Text>
          <SegmentedControl options={VISIBILITY} value={drive.visibility} onChange={changeVisibility} />
          <Button title="Delete drive" variant="ghost" icon="trash-outline" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

function formatLap(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  backBtn: { alignSelf: 'flex-start', padding: 4 },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'left' },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  stats: { flexDirection: 'row' },
  statValue: { ...type.stat, color: colors.text, fontSize: 18 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
  desc: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
});
