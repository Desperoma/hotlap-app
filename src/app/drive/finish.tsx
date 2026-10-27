import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DriveMap } from '@/components/DriveMap';
import { DriveShowcase, ShowcaseButton } from '@/components/DriveShowcase';
import { PhotoStrip } from '@/components/PhotoStrip';
import { ScoreCard } from '@/components/ScoreCard';
import { LapList } from '@/components/LapList';
import { SprintResults } from '@/components/SprintResults';
import { VehicleSelect } from '@/components/VehicleSelect';
import { Button, Screen, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveDrive } from '@/features/drives/api';
import { SIM_STYLES } from '@/features/drives/simulate';
import { driveMode, showcaseStats, vehicleHeading } from '@/features/drives/showcase';
import { MAX_PHOTOS, pickPhotos, uploadDrivePhotos } from '@/features/drives/media';
import { clearPendingDrive, getPendingDrive, type PendingDrive } from '@/features/drives/pending';
import { computeStats } from '@/features/recording/geo';
import { computeScore } from '@/features/scoring/score';
import { recordDriveSprints } from '@/features/sprint/api';
import { getCircuit, recordDriveLaps } from '@/features/circuit/api';
import { detectLaps, startLineFromHeading, startLineOnPath, type Lap } from '@/features/circuit/laps';
import { detectSprints } from '@/features/sprint/sprint';
import { VISIBILITY_HINT, VISIBILITY_OPTIONS } from '@/features/drives/visibility';
import type { Visibility } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Fin de drive : résumé, titre, description, visibilité, puis sauvegarde.
 * Le drive reste dans pending.ts tant qu'il n'est pas sauvegardé ou abandonné.
 */
export default function FinishDriveScreen() {
  const { session, primaryVehicle, vehicles } = useAuth();
  const [drive, setDrive] = useState<PendingDrive | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null | undefined>(undefined);
  const [carSheet, setCarSheet] = useState(false);

  useEffect(() => {
    getPendingDrive().then((d) => {
      setDrive(d);
      if (d) setTitle(d.simulated ? `Test · ${d.simStyle === 'circuit' ? d.circuitName ?? 'Circuit' : simLabel(d.simStyle)}` : d.mode === 'circuit' && d.circuitName ? `${d.circuitName} · laps` : defaultTitle(d.startedAt));
      if (d && d.vehicleId !== undefined) setVehicleId(d.vehicleId);
    });
  }, []);

  // Drive sur circuit : tours recalculés sur le téléphone pour le récap (la base fait foi).
  const [recapLaps, setRecapLaps] = useState<Lap[]>([]);
  useEffect(() => {
    if (!drive || drive.mode !== 'circuit' || !drive.circuitId) return;
    getCircuit(drive.circuitId).then((c) => {
      const path = c?.path.flat() ?? [];
      const p0 = drive.points[0];
      if (!p0) return;
      const line = path.length > 1 ? startLineOnPath(path, { latitude: p0.lat, longitude: p0.lng }) : startLineFromHeading(drive.points);
      setRecapLaps(detectLaps(drive.points, line));
    }).catch(() => {});
  }, [drive]);

  const summary = useMemo(() => {
    if (!drive) return null;
    return {
      stats: computeStats(drive.points, drive.startedAt, drive.endedAt),
      ...computeScore(drive.points),
      path: drive.points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    };
  }, [drive]);

  if (drive === undefined) {
    return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  }
  if (!drive || !summary) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>No drive waiting to be saved.</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const sprints = drive.mode === 'sprint' ? detectSprints(drive.points) : [];
  const laps = drive.mode === 'circuit' ? recapLaps : [];
  const tooShort = drive.points.length < 2;
  // Véhicule choisi avant le départ, sinon le favori ; un véhicule retiré du garage entre-temps est ignoré.
  const picked = vehicleId === undefined ? primaryVehicle?.id ?? null : vehicleId;
  const chosenVehicle = picked && vehicles?.some((v) => v.id === picked) ? picked : null;

  const save = async () => {
    if (!session) return;
    const t = title.trim();
    if (!t) return Alert.alert('Title missing', 'Give your drive a name.');
    setSaving(true);
    try {
      const { id } = await saveDrive({
        ownerId: session.user.id,
        vehicleId: chosenVehicle,
        circuitId: drive.circuitId,
        title: t.slice(0, 80),
        description: description.trim() || undefined,
        visibility,
        startedAt: drive.startedAt,
        endedAt: drive.endedAt,
        points: drive.points,
        simulated: drive.simulated,
        mode: drive.mode ?? 'free',
      });
      await clearPendingDrive();
      if (drive.mode === 'circuit') {
        // Tours officiels : recalculés par la base depuis les points enregistrés.
        await recordDriveLaps(id).catch((e) =>
          Alert.alert('Laps not recorded', e instanceof Error ? e.message : String(e)));
      }
      if (drive.mode === 'sprint') {
        // Les temps officiels sont recalculés par la base depuis les points enregistrés.
        await recordDriveSprints(id, drive.points).catch((e) =>
          Alert.alert('Sprint times not recorded', e instanceof Error ? e.message : String(e)));
      }
      if (photos.length) {
        try {
          await uploadDrivePhotos(session.user.id, id, photos);
        } catch (e) {
          // Le drive est sauvegardé ; seules les photos ont échoué.
          Alert.alert('Photos not uploaded', e instanceof Error ? e.message : String(e));
        }
      }
      router.replace(`/drive/${id}`);
    } catch (e) {
      // Le drive reste en attente sur le téléphone : on peut réessayer plus tard.
      Alert.alert('Save failed', `${e instanceof Error ? e.message : String(e)}\n\nYour drive is kept on this phone. Try again when you have network.`);
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async () => {
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      Alert.alert('Photos unavailable', e instanceof Error ? e.message : String(e));
    }
  };

  const discard = () =>
    Alert.alert('Discard this drive?', 'The route and stats will be deleted from this phone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await clearPendingDrive();
          router.back();
        },
      },
    ]);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
      <View style={{ marginHorizontal: -spacing.lg }}>
        <DriveShowcase
          {...vehicleHeading(vehicles?.find((v) => v.id === chosenVehicle), true)}
          stats={showcaseStats({
            durationS: summary.stats.durationS,
            distanceM: summary.stats.distanceM,
            avgSpeedKmh: summary.stats.avgSpeedKmh, // récap : toujours le propriétaire
            maxSpeedKmh: summary.stats.maxSpeedKmh,
            score: summary.score,
            maxLateralG: null,
            lapTimeMs: null,
            turns: summary.metrics.turns.length,
            elevationChangeM: summary.metrics.elevationChangeM,
          })}
          mode={driveMode(drive.circuitName, drive.mode)}
          onPressPlus={() => setCarSheet(true)}
          topLeft={<ShowcaseButton icon="close" label="Discard drive" onPress={discard} />}
        />
        <VehicleSelect hideTrigger open={carSheet} onOpenChange={setCarSheet} value={chosenVehicle} onChange={setVehicleId} />
      </View>

      <Text style={styles.overline}>DRIVE COMPLETE · NICE DRIVE</Text>
      <DriveMap path={summary.path} emptyLabel="Not enough GPS points for a route" />

      {drive.mode === 'circuit' && (
        <LapList laps={laps} circuitId={drive.circuitId} circuitName={drive.circuitName}
          note="Tours calculés sur ce téléphone ; la base les recalcule à l’enregistrement." />
      )}
      {drive.mode === 'sprint' && (
        <SprintResults results={sprints} note="Temps calculés sur ce téléphone ; la base les recalcule à l’enregistrement (GPS 1 Hz, environ ±0,3 s)." />
      )}

      <ScoreCard score={summary.score} breakdown={summary.breakdown} />

      <VehicleSelect label="Car" value={chosenVehicle} onChange={setVehicleId} />

      <TextField label="Title" icon="flag-outline" value={title} onChangeText={setTitle} maxLength={80}
        autoCapitalize="sentences" />
      <TextField label="Description" icon="create-outline" value={description} onChangeText={setDescription}
        placeholder="Roads, weather, the car… (optional)" maxLength={2000} multiline autoCapitalize="sentences" />

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
        <PhotoStrip
          uris={photos}
          onAdd={photos.length < MAX_PHOTOS ? addPhotos : undefined}
          onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.label}>Who can see it</Text>
        <SegmentedControl options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
        <Text style={styles.muted}>{VISIBILITY_HINT[visibility]}</Text>
        {drive.simulated && <Text style={styles.muted}>Simulated drive: marked as a test drive.</Text>}
      </View>

      <Button title={tooShort ? 'Too short to save' : 'Save drive'} icon="checkmark" onPress={save}
        loading={saving} disabled={tooShort || saving} />
      <Button title="Discard" variant="ghost" onPress={discard} disabled={saving} />
    </Screen>
  );
}

function simLabel(style?: string) {
  return SIM_STYLES.find((s) => s.value === style)?.label ?? 'Simulated drive';
}

function defaultTitle(ts: number) {
  const h = new Date(ts).getHours();
  const moment = h < 6 ? 'Night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  return `${moment} Drive`;
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  overline: { ...type.overline, color: colors.accent },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
});
