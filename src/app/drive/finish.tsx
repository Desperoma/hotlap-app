import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DriveMap } from '@/components/DriveMap';
import { ScoreCard } from '@/components/ScoreCard';
import { Button, Card, Screen, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveDrive } from '@/features/drives/api';
import { clearPendingDrive, getPendingDrive, type PendingDrive } from '@/features/drives/pending';
import { computeStats, formatDuration, formatKm } from '@/features/recording/geo';
import { computeScore } from '@/features/scoring/score';
import type { Visibility } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'followers', label: 'Crew' },
  { value: 'public', label: 'Everyone' },
];

const VISIBILITY_HINT: Record<Visibility, string> = {
  private: 'Only you can see this drive.',
  followers: 'Your crew can see it. Start and finish are hidden.',
  public: 'Everyone can see it. Start and finish are hidden.',
};

/**
 * Fin de drive : résumé, titre, description, visibilité, puis sauvegarde.
 * Le drive reste dans pending.ts tant qu'il n'est pas sauvegardé ou abandonné.
 */
export default function FinishDriveScreen() {
  const { session, primaryVehicle } = useAuth();
  const [drive, setDrive] = useState<PendingDrive | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPendingDrive().then((d) => {
      setDrive(d);
      if (d) setTitle(defaultTitle(d.startedAt));
    });
  }, []);

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

  const tooShort = drive.points.length < 2;

  const save = async () => {
    if (!session) return;
    const t = title.trim();
    if (!t) return Alert.alert('Title missing', 'Give your drive a name.');
    setSaving(true);
    try {
      const { id } = await saveDrive({
        ownerId: session.user.id,
        vehicleId: primaryVehicle?.id ?? null,
        circuitId: drive.circuitId,
        title: t.slice(0, 80),
        description: description.trim() || undefined,
        visibility,
        startedAt: drive.startedAt,
        endedAt: drive.endedAt,
        points: drive.points,
      });
      await clearPendingDrive();
      router.replace(`/drive/${id}`);
    } catch (e) {
      // Le drive reste en attente sur le téléphone : on peut réessayer plus tard.
      Alert.alert('Save failed', `${e instanceof Error ? e.message : String(e)}\n\nYour drive is kept on this phone. Try again when you have network.`);
    } finally {
      setSaving(false);
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
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View>
        <Text style={styles.overline}>
          DRIVE COMPLETE{drive.circuitName ? ` · ${drive.circuitName.toUpperCase()}` : ''}
        </Text>
        <Text style={styles.title}>Nice drive.</Text>
      </View>

      <DriveMap path={summary.path} emptyLabel="Not enough GPS points for a route" />

      <Card style={styles.stats}>
        <Stat label="DISTANCE" value={`${formatKm(summary.stats.distanceM)} km`} />
        <Stat label="TIME" value={formatDuration(summary.stats.durationS)} />
        <Stat label="TURNS" value={String(summary.metrics.turns.length)} />
      </Card>

      <ScoreCard score={summary.score} breakdown={summary.breakdown} />

      <TextField label="Title" icon="flag-outline" value={title} onChangeText={setTitle} maxLength={80}
        autoCapitalize="sentences" />
      <TextField label="Description" icon="create-outline" value={description} onChangeText={setDescription}
        placeholder="Roads, weather, the car… (optional)" maxLength={2000} multiline autoCapitalize="sentences" />

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.label}>Who can see it</Text>
        <SegmentedControl options={VISIBILITY} value={visibility} onChange={setVisibility} />
        <Text style={styles.muted}>{VISIBILITY_HINT[visibility]}</Text>
      </View>

      <Button title={tooShort ? 'Too short to save' : 'Save drive'} icon="checkmark" onPress={save}
        loading={saving} disabled={tooShort || saving} />
      <Button title="Discard" variant="ghost" onPress={discard} disabled={saving} />
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

function defaultTitle(ts: number) {
  const h = new Date(ts).getHours();
  const moment = h < 6 ? 'Night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  return `${moment} Drive`;
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text, marginTop: 4 },
  stats: { flexDirection: 'row' },
  statValue: { ...type.stat, color: colors.text, fontSize: 18 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
});
