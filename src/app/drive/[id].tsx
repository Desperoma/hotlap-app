import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DriveMap } from '@/components/DriveMap';
import { ClassBadge } from '@/components/ClassBadge';
import { RankBadge } from '@/components/RankBadge';
import { useLevels } from '@/features/levels/useLevels';
import { DriveShowcase, ShowcaseButton } from '@/components/DriveShowcase';
import { DriveSocial } from '@/components/DriveSocial';
import { DriveTelemetry } from '@/components/DriveTelemetry';
import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { PhotoStrip } from '@/components/PhotoStrip';
import { ScoreCard } from '@/components/ScoreCard';
import { LapList } from '@/components/LapList';
import { SprintResults } from '@/components/SprintResults';
import { VehicleSelect } from '@/components/VehicleSelect';
import { Button, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteDrive, getDrive, getDrivePoints, updateDrive, type DriveDetail } from '@/features/drives/api';
import { listDrivePhotos } from '@/features/drives/media';
import { driveMode, showcaseStats, vehicleHeading } from '@/features/drives/showcase';
import { buildSamples, type Sample } from '@/features/drives/telemetry';
import { listDriveSprints, type DriveSprint } from '@/features/sprint/api';
import { listDriveLaps } from '@/features/circuit/api';
import type { Lap } from '@/features/circuit/laps';
import { VISIBILITY_OPTIONS } from '@/features/drives/visibility';
import type { Visibility } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

import {  t, locale  } from '@/i18n';
/** Détail d'un drive : tracé, stats, score détaillé ; visibilité et suppression pour le propriétaire. */
export default function DriveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, vehicles, profile } = useAuth();
  const [drive, setDrive] = useState<DriveDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [menu, setMenu] = useState<ModerationTarget | null>(null);
  const [carSheet, setCarSheet] = useState(false);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [sprints, setSprints] = useState<DriveSprint[]>([]);
  const [laps, setLaps] = useState<Lap[]>([]);
  const levels = useLevels(drive ? [drive.ownerId] : []);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    getDrive(id, session?.user.id, !!profile?.is_dev)
      .then(setDrive)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    listDrivePhotos(id).then(setPhotos).catch(() => setPhotos([]));
    listDriveSprints(id).then(setSprints).catch(() => setSprints([]));
    listDriveLaps(id).then(setLaps).catch(() => setLaps([]));
  }, [id, session?.user.id, profile?.is_dev]);

  useEffect(load, [load]);

  // Télémétrie : points bruts, lisibles par le propriétaire (et les comptes dev).
  const mine = !!drive?.asAuthor;
  useEffect(() => {
    if (!id || !mine) return;
    getDrivePoints(id).then((p) => setSamples(buildSamples(p))).catch(() => setSamples([]));
  }, [id, mine]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>{t('Couldn’t load this drive.')}</Text>
        <Button title={t('Retry')} variant="secondary" onPress={load} />
      </Screen>
    );
  }
  if (drive === undefined) {
    return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  }
  if (drive === null) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>{t('This drive doesn’t exist or isn’t shared with you.')}</Text>
        <Button title={t('Back')} variant="secondary" onPress={back} />
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
      Alert.alert(t('Update failed'), e instanceof Error ? e.message : String(e));
    }
  };

  const changeVehicle = async (vehicleId: string | null) => {
    const previous = drive;
    const v = vehicles?.find((x) => x.id === vehicleId);
    setDrive({ ...drive, vehicleId, vehicle: v ? { make: v.make, model: v.model, year: v.year, color: v.color } : null });
    try {
      await updateDrive(drive.id, { vehicle_id: vehicleId });
    } catch (e) {
      setDrive(previous);
      Alert.alert(t('Update failed'), e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert(t('Delete this drive?'), t('It will be removed for everyone. This can’t be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDrive(drive.id);
            back();
          } catch (e) {
            Alert.alert(t('Delete failed'), e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const authorLevel = levels.get(drive.ownerId);
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
            avgSpeedKmh: drive.asAuthor ? drive.avgSpeedKmh : null, // privées : propriétaire uniquement
            maxSpeedKmh: drive.maxSpeedKmh, // visible par tous (0023)
            score: drive.score,
            maxLateralG: drive.maxLateralG,
            lapTimeMs: drive.lapTimeMs,
          })}
          mode={driveMode(drive.circuitName, drive.mode)}
          onPressPlus={drive.isMine ? () => setCarSheet(true) : undefined}
          topLeft={<ShowcaseButton icon="arrow-back" label={t('Back')} onPress={back} />}
          topRight={drive.isMine ? undefined : (
            <ShowcaseButton icon="ellipsis-horizontal" label={t('More options')}
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
          {formatDate(drive.startedAt)}{drive.circuitName ? ` · ${drive.circuitName.toUpperCase()}` : t(' · OPEN ROAD')}
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
        {(drive.vehicleClass || (drive.asAuthor && !drive.isMine) || authorLevel) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <RankBadge info={authorLevel} size="md" showName />
            {drive.vehicleClass && <ClassBadge cls={drive.vehicleClass.cls} hpi={drive.vehicleClass.hpi} />}
            {drive.asAuthor && !drive.isMine && <Text style={styles.devTag}>{t('DEV VIEW · AS AUTHOR')}</Text>}
          </View>
        )}
      </View>

      {drive.asAuthor && samples && samples.length >= 2 ? (
        <DriveTelemetry samples={samples} />
      ) : (
        <DriveMap
          path={drive.path}
          emptyLabel={drive.asAuthor ? (samples === null ? t('Loading route…') : t('No route recorded')) : t('Route hidden (inside the driver’s private zone)')}
        />
      )}

      <PhotoStrip uris={photos} size={140} />

      {(drive.mode === 'circuit' || laps.length > 0) && (
        <LapList laps={laps} circuitId={drive.circuitId} circuitName={drive.circuitName} />
      )}
      {(drive.mode === 'sprint' || sprints.length > 0) && (
        <SprintResults results={sprints}
          note={drive.isSimulated ? t('Drive simulé : visible par toi seul dans les classements.') : undefined} />
      )}

      <ScoreCard score={drive.score} breakdown={drive.scoreBreakdown} />

      {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}

      {drive.visibility !== 'private' || !drive.isMine ? (
        <DriveSocial driveId={drive.id} likeCount={drive.likeCount} isOwner={drive.isMine} />
      ) : null}

      {drive.isMine && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.muted}>{t('Top speed is public. Avg. speed and telemetry are only shown to you.')}</Text>
          <VehicleSelect label={t('Car')} value={drive.vehicleId} onChange={changeVehicle} />
          <Text style={styles.label}>{t('Who can see it')}</Text>
          <SegmentedControl options={VISIBILITY_OPTIONS} value={drive.visibility} onChange={changeVisibility} />
          <Button title={t('Delete drive')} variant="ghost" icon="trash-outline" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  devTag: { color: '#F59E0B', fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'left' },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  link: { color: colors.text, fontFamily: fonts.semibold },
  desc: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
});
