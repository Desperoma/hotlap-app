import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Picker } from '@/components/Picker';
import { Button, Card, Chip, TextField } from '@/components/ui';
import { COUNTRIES } from '@/config';
import { YEARS } from '@/data/vehicles';
import { fetchMakes, fetchModels, proposeVehicle, suggestModels, type CatalogItem } from '@/features/catalog/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { recorder } from '@/features/recording/recorder';
import { colors, fonts, spacing, type } from '@/theme';

import { birthDateError, isoToDisplay, maskBirthDate, parseBirthDate } from './validation';

type StepProps = { onNext: () => void };
const MANUAL = 'Autre (saisie manuelle)';

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

// --- 60 % : localisation -----------------------------------------------------
export function LocationStep({ onNext }: StepProps) {
  const { profile, updateProfile } = useAuth();
  const initial = COUNTRIES.find((c) => c.code === profile?.country_code) ?? null;
  const [country, setCountry] = useState(initial);
  const [region, setRegion] = useState(profile?.region ?? '');
  const [city, setCity] = useState(profile?.home_city ?? '');
  const { busy, run } = useSubmit(
    () => updateProfile({ country_code: country?.code ?? null, region: region.trim() || null, home_city: city.trim() }),
    onNext,
  );
  const submit = () => {
    if (!country || !city.trim()) return Alert.alert('Presque', 'Le pays et la ville sont obligatoires.');
    run();
  };
  return (
    <>
      <StepTitle title="Your area" subtitle="Sert à te proposer les drives et les routes autour de toi." />
      <Picker label="Country" placeholder="Select Country" value={country?.name ?? null}
        options={COUNTRIES.map((c) => c.name)}
        onChange={(name) => setCountry(COUNTRIES.find((c) => c.name === name) ?? null)} />
      <TextField label={country?.regionLabel ?? 'Region'} icon="map-outline" placeholder="ex. Moselle"
        autoCapitalize="words" value={region} onChangeText={setRegion} />
      <TextField label="Home city" icon="home-outline" placeholder="ex. Metz" autoCapitalize="words"
        value={city} onChangeText={setCity} />
      <Button title="Continue" onPress={submit} loading={busy} />
    </>
  );
}

// --- 80 % : véhicule (catalogue Wikidata ou saisie manuelle dédoublonnée) ---
export function VehicleStep({ onNext }: StepProps) {
  const { primaryVehicle, saveVehicle } = useAuth();
  const [makes, setMakes] = useState<CatalogItem[]>([]);
  const [models, setModels] = useState<CatalogItem[]>([]);
  const [make, setMake] = useState<CatalogItem | null>(null);
  const [model, setModel] = useState<CatalogItem | null>(null);
  const [manualMake, setManualMake] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [typedMake, setTypedMake] = useState(primaryVehicle?.make ?? '');
  const [typedModel, setTypedModel] = useState(primaryVehicle?.model ?? '');
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [year, setYear] = useState<string | null>(primaryVehicle?.year ? String(primaryVehicle.year) : null);

  useEffect(() => {
    fetchMakes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    if (!make || manualMake) return setModels([]);
    fetchModels(make).then(setModels).catch(() => setModels([]));
  }, [make, manualMake]);

  // « Tu voulais dire… ? » pendant la saisie manuelle du modèle.
  useEffect(() => {
    if (!manualModel || manualMake) return setSuggestions([]);
    const t = setTimeout(() => suggestModels(make, typedModel).then(setSuggestions).catch(() => setSuggestions([])), 300);
    return () => clearTimeout(t);
  }, [typedModel, manualModel, manualMake, make]);

  const makeName = manualMake ? typedMake.trim() : make?.name ?? '';
  const modelName = manualMake || manualModel ? typedModel.trim() : model?.name ?? '';

  const { busy, run } = useSubmit(async () => {
    const manual = manualMake || manualModel;
    const { modelId } = manual ? await proposeVehicle(makeName, modelName) : { modelId: model?.id ?? null };
    await saveVehicle({ make: makeName, model: modelName, year: year ? Number(year) : null, modelId });
  }, onNext);

  const submit = () => {
    if (!makeName || !modelName) return Alert.alert('Presque', 'Choisis ou saisis la marque et le modèle.');
    run();
  };

  const pickSuggestion = (s: CatalogItem) => {
    setModel(s);
    setManualModel(false);
    setSuggestions([]);
  };

  return (
    <>
      <StepTitle title="Your Ride" subtitle="Select your vehicle setup." />
      {manualMake ? (
        <TextField label="Brand" icon="car-sport-outline" placeholder="ex. Lancia" autoCapitalize="words"
          value={typedMake} onChangeText={setTypedMake} />
      ) : (
        <Picker label="Brand" placeholder="Select Brand" value={make?.name ?? null}
          options={[...makes.map((m) => m.name), MANUAL]}
          onChange={(name) => {
            setModel(null);
            setManualModel(false);
            if (name === MANUAL) { setManualMake(true); setMake(null); }
            else setMake(makes.find((m) => m.name === name) ?? null);
          }} />
      )}
      {manualMake || manualModel ? (
        <TextField label="Model" icon="car-outline" placeholder="ex. Delta HF Integrale"
          value={typedModel} onChangeText={setTypedModel} />
      ) : (
        <Picker label="Model" placeholder="Select Model" value={model?.name ?? null}
          options={[...models.map((m) => m.name), MANUAL]} disabled={!make}
          onChange={(name) => {
            if (name === MANUAL) { setManualModel(true); setModel(null); setTypedModel(''); }
            else setModel(models.find((m) => m.name === name) ?? null);
          }} />
      )}
      {suggestions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.hint}>Tu voulais dire :</Text>
          <View style={styles.chips}>
            {suggestions.map((s) => <Chip key={`${s.id}-${s.name}`} label={`${make?.name} ${s.name}`} onPress={() => pickSuggestion(s)} />)}
          </View>
        </View>
      )}
      {(manualMake || manualModel) && (
        <Text style={styles.hint}>Si ta voiture n'existe pas encore, elle sera ajoutée au catalogue après vérification par l'équipe.</Text>
      )}
      <Picker label="Year" placeholder="Select Year (e.g. 2016)" value={year} options={YEARS.map(String)} onChange={setYear} />
      <Button title="Continue" onPress={submit} loading={busy} />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowText: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, flex: 1 },
});
