import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { VehicleForm } from '@/features/garage/VehicleForm';
import { PlaceFields, type PlaceValue } from '@/features/places/PlaceFields';
import { HomeZoneFields } from '@/features/privacy/HomeZoneFields';
import { applyHomeZone, homeZoneInputError, type HomeZoneInput } from '@/features/privacy/homeZone';
import { recorder } from '@/features/recording/recorder';
import { colors, fonts, spacing, type } from '@/theme';

import { birthDateError, isoToDisplay, maskBirthDate, parseBirthDate } from './validation';

type StepProps = { onNext: () => void };

/** Petit wrapper qui gère l'état « en cours » et les erreurs d'enregistrement. */
function useSubmit(fn: () => Promise<void>, onNext: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await fn();
      onNext();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// --- 40 % : identité ---------------------------------------------------------
export function IdentityStep({ onNext }: StepProps) {
  const { profile, updateProfile } = useAuth();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [birth, setBirth] = useState(isoToDisplay(profile?.birth_date ?? null));
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit(
    () => updateProfile({ first_name: first.trim(), last_name: last.trim(), birth_date: parseBirthDate(birth) }),
    onNext,
  );
  const submit = () => {
    if (!first.trim() || !last.trim()) return setError('Prénom et nom sont obligatoires.');
    const e = birthDateError(birth);
    if (e) return setError(e);
    setError(null);
    run();
  };
  return (
    <>
      <StepTitle title="About you" subtitle="Ton nom n'est visible que par toi. Les autres voient ton username." />
      <TextField label="First name" icon="person-outline" placeholder="Prénom" autoCapitalize="words"
        value={first} onChangeText={setFirst} />
      <TextField label="Last name" icon="person-outline" placeholder="Nom" autoCapitalize="words"
        value={last} onChangeText={setLast} />
      <TextField label="Date of birth" icon="calendar-outline" placeholder="JJ/MM/AAAA" keyboardType="number-pad"
        value={birth} onChangeText={(t) => setBirth(maskBirthDate(t))} maxLength={10} editable={!profile?.birth_date} />
      <Text style={styles.hint}>
        Elle détermine où tu peux enregistrer un drive (âge minimum selon le pays, sur route ou sur circuit).
        Elle ne pourra plus être modifiée ensuite.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Continue" onPress={submit} loading={busy} />
    </>
  );
}

// --- 60 % : localisation + zone privée autour du domicile ----------------------
export function LocationStep({ onNext }: StepProps) {
  const { profile, updateProfile } = useAuth();
  const [place, setPlace] = useState<PlaceValue>({
    countryCode: profile?.country_code ?? null, region: profile?.region ?? '', city: profile?.home_city ?? '',
  });
  // Option activée par défaut.
  const [zone, setZone] = useState<HomeZoneInput>({ enabled: true, address: '', here: null });
  const { busy, run } = useSubmit(async () => {
    await updateProfile({ country_code: place.countryCode, region: place.region.trim() || null, home_city: place.city.trim() });
    await applyHomeZone(zone, false);
  }, onNext);
  const submit = () => {
    if (!place.countryCode || !place.city.trim()) return Alert.alert('Presque', 'Le pays et la ville sont obligatoires.');
    const e = homeZoneInputError(zone, false);
    if (e) return Alert.alert('Presque', e);
    run();
  };
  return (
    <>
      <StepTitle title="Your area" subtitle="Sert à te proposer les drives et les routes autour de toi." />
      <PlaceFields value={place} onChange={setPlace} />
      <HomeZoneFields value={zone} onChange={setZone} />
      <Button title="Continue" onPress={submit} loading={busy} />
    </>
  );
}

// --- 80 % : véhicule favori (catalogue Wikidata ou saisie manuelle dédoublonnée) ---
export function VehicleStep({ onNext }: StepProps) {
  const { primaryVehicle, saveVehicle } = useAuth();
  return (
    <>
      <StepTitle title="Your Ride" subtitle="Ton véhicule favori. Tu pourras en ajouter d'autres dans ton garage." />
      <VehicleForm
        initial={primaryVehicle}
        submitLabel="Continue"
        onSubmit={async (v) => {
          await saveVehicle(v);
          onNext();
        }}
      />
    </>
  );
}

// --- 100 % : GPS -------------------------------------------------------------
export function GpsStep({ onFinish }: { onFinish: () => Promise<void> }) {
  const [status, setStatus] = useState<'unknown' | 'always' | 'foreground' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);
  const ask = async () => setStatus(await recorder.requestPermissions());
  const finish = async () => {
    setBusy(true);
    try {
      await onFinish();
    } finally {
      setBusy(false);
    }
  };
  const msg = {
    unknown: null,
    always: 'GPS activé, y compris écran verrouillé.',
    foreground: 'GPS activé seulement app ouverte : choisis « Toujours » dans les réglages pour enregistrer écran verrouillé.',
    denied: 'GPS refusé. Tu pourras l’activer au premier drive.',
  }[status];

  return (
    <>
      <StepTitle title="Turn on GPS" subtitle="HotLap enregistre ton tracé, même écran verrouillé, pour que tu n'aies jamais à toucher ton téléphone en roulant." />
      <Card style={{ gap: spacing.md }}>
        {[
          ['locate-outline', 'Position précise pendant les drives uniquement'],
          ['lock-closed-outline', 'Continue écran verrouillé, avec un indicateur visible'],
          ['eye-off-outline', 'Drives privés par défaut'],
        ].map(([icon, text]) => (
          <View key={text} style={styles.row}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.accent} />
            <Text style={styles.rowText}>{text}</Text>
          </View>
        ))}
      </Card>
      {msg && <Text style={[styles.hint, status === 'always' && { color: colors.accent }]}>{msg}</Text>}
      {status === 'unknown' ? (
        <>
          <Button title="Enable GPS" icon="navigate" onPress={ask} />
          <Button title="Later" variant="ghost" onPress={finish} />
        </>
      ) : (
        <Button title="Finish Setup" icon="flag" onPress={finish} loading={busy} />
      )}
    </>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.h1, color: colors.text, fontSize: 28 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, flex: 1 },
});
