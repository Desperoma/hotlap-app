import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DriveMap } from '@/components/DriveMap';
import { DriveShowcase, ShowcaseButton } from '@/components/DriveShowcase';
import { DriveSocial } from '@/components/DriveSocial';
import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { PhotoStrip } from '@/components/PhotoStrip';
import { ScoreCard } from '@/components/ScoreCard';
import { VehicleSelect } from '@/components/VehicleSelect';
import { Button, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteDrive, getDrive, updateDrive, type DriveDetail } from '@/features/drives/api';
import { listDrivePhotos } from '@/features/drives/media';
import { driveMode, showcaseStats, vehicleHeading } from '@/features/drives/showcase';
import type { Visibility } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'followers', label: 'Followers' },
  { value: 'public', label: 'Everyone' },
];

/** Détail d'un drive : tracé, stats, score détaillé ; visibilité et suppression pour le propriétaire. */
export default function DriveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, vehicles } = useAuth();
  const [drive, setDrive] = useState<DriveDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [menu, setMenu] = useState<ModerationTarget | null>(null);
  const [carSheet, setCarSheet] = useState(false);

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

  const changeVehicle = async (vehicleId: string | null) => {
    const previous = drive;
    const v = vehicles?.find((x) => x.id === vehicleId);
    setDrive({ ...drive, vehicleId, vehicle: v ? { make: v.make, model: v.model, year: v.year } : null });
    try {
      await updateDrive(drive.id, { vehicle_id: vehicleId });
    } catch (e) {
      setDrive(previous);
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
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
      <View style={{ marginHorizontal: -spacing.lg }}>
        <DriveShowcase
          {...vehicleHeading(drive.vehicle, drive.isMine)}
          stats={showcaseStats({
            durationS: drive.durationS,
            distanceM: drive.distanceM,
            avgSpeedKmh: drive.isMine ? drive.avgSpeedKmh : null, // privée : propriétaire uniquement
            score: drive.score,
            maxLateralG: drive.maxLateralG,
            lapTimeMs: drive.lapTimeMs,
          })}
          mode={driveMode(drive.circuitName)}
          onPressPlus={drive.isMine ? () => setCarSheet(true) : undefined}
          topLeft={<ShowcaseButton icon="arrow-back" label="Back" onPress={back} />}
          topRight={drive.isMine ? undefined : (
            <ShowcaseButton icon="ellipsis-horizontal" label="More options"
              onPress={() => setMenu({ type: 'drive', id: drive.id, userId: drive.ownerId, userName: author })} />
          )}
        />
        {drive.isMine && (
          <VehicleSelect hideTrigger open={carSheet} onOpenChange={setCarSheet} value={drive.vehicleId} onChange={changeVehicle} />
        )}
      </View>
      <ModerationSheet target={menu} onClose={() => setMenu(null)} onBlocked={back} />

      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>
          {formatDate(drive.startedAt)}{drive.circuitName ? ` · ${drive.circuitName.toUpperCase()}` : ' · OPEN ROAD'}
        </Text>
        <Text style={styles.title}>{drive.title}</Text>
        <Text style={styles.muted}>
          <Text
            style={drive.isMine ? undefined : styles.link}
            onPress={drive.isMine ? undefined : () => router.push(`/user/${drive.ownerId}`)}
          >
            {author}
          </Text>
          {vehicle ? ` · ${vehicle}` : ''}
        </Text>
      </View>

      <DriveMap
        path={drive.path}
        emptyLabel={drive.isMine ? 'No route recorded' : 'Route hidden (too short to share)'}
      />

      <PhotoStrip uris={photos} size={140} />

      <ScoreCard score={drive.score} breakdown={drive.scoreBreakdown} />

      {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}

      {drive.visibility !== 'private' || !drive.isMine ? (
        <DriveSocial driveId={drive.id} likeCount={drive.likeCount} isOwner={drive.isMine} />
      ) : null}

      {drive.isMine && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.muted}>Avg. speed is only shown to you.</Text>
          <VehicleSelect label="Car" value={drive.vehicleId} onChange={changeVehicle} />
          <Text style={styles.label}>Who can see it</Text>
          <SegmentedControl options={drive.isSimulated ? VISIBILITY.filter((v) => v.value !== 'public') : VISIBILITY} value={drive.visibility} onChange={changeVisibility} />
          <Button title="Delete drive" variant="ghost" icon="trash-outline" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'left' },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  link: { color: colors.text, fontFamily: fonts.semibold },
  desc: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
});
