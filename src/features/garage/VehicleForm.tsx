import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Picker } from '@/components/Picker';
import { Button, Chip, TextField } from '@/components/ui';
import { YEARS } from '@/data/vehicles';
import type { VehicleInput } from '@/features/auth/AuthProvider';
import { catalogKey, fetchMakes, fetchModels, proposeVehicle, suggestModels, type CatalogItem } from '@/features/catalog/api';
import type { Vehicle } from '@/lib/database.types';
import { colors, fonts, spacing } from '@/theme';

const MANUAL = 'Autre (saisie manuelle)';

/**
 * Marque, modèle, année (et surnom) d'un véhicule : catalogue Wikidata, ou saisie manuelle
 * dédoublonnée par propose_vehicle. Utilisé par l'onboarding (80 %) et par le garage.
 */
export function VehicleForm({ initial, submitLabel, onSubmit, showNickname = false }: {
  initial?: Pick<Vehicle, 'make' | 'model' | 'year' | 'nickname'> | null;
  submitLabel: string;
  onSubmit: (v: VehicleInput) => Promise<void>;
  showNickname?: boolean;
}) {
  const [makes, setMakes] = useState<CatalogItem[]>([]);
  const [models, setModels] = useState<CatalogItem[]>([]);
  const [make, setMake] = useState<CatalogItem | null>(null);
  const [model, setModel] = useState<CatalogItem | null>(null);
  const [manualMake, setManualMake] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [typedMake, setTypedMake] = useState(initial?.make ?? '');
  const [typedModel, setTypedModel] = useState(initial?.model ?? '');
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [year, setYear] = useState<string | null>(initial?.year ? String(initial.year) : null);
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [busy, setBusy] = useState(false);

  // Catalogue des marques ; en modification, on retrouve la marque du véhicule dans le catalogue.
  useEffect(() => {
    fetchMakes()
      .then((list) => {
        setMakes(list);
        if (initial?.make) {
          const found = list.find((m) => catalogKey(m.name) === catalogKey(initial.make));
          if (found) setMake(found);
          else setManualMake(true);
        }
      })
      .catch(() => setMakes([]));
    // Seulement au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!make || manualMake) return setModels([]);
    fetchModels(make)
      .then((list) => {
        setModels(list);
        if (initial?.model && catalogKey(make.name) === catalogKey(initial.make)) {
          const found = list.find((m) => catalogKey(m.name) === catalogKey(initial.model));
          if (found) setModel(found);
          else setManualModel(true);
        }
      })
      .catch(() => setModels([]));
    // initial ne change pas pendant la vie du formulaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make, manualMake]);

  // « Tu voulais dire… ? » pendant la saisie manuelle du modèle.
  useEffect(() => {
    if (!manualModel || manualMake) return setSuggestions([]);
    const t = setTimeout(() => suggestModels(make, typedModel).then(setSuggestions).catch(() => setSuggestions([])), 300);
    return () => clearTimeout(t);
  }, [typedModel, manualModel, manualMake, make]);

  const makeName = manualMake ? typedMake.trim() : make?.name ?? '';
  const modelName = manualMake || manualModel ? typedModel.trim() : model?.name ?? '';

  const submit = async () => {
    if (!makeName || !modelName) return Alert.alert('Presque', 'Choisis ou saisis la marque et le modèle.');
    setBusy(true);
    try {
      const manual = manualMake || manualModel;
      const { modelId } = manual ? await proposeVehicle(makeName, modelName) : { modelId: model?.id ?? null };
      await onSubmit({
        make: makeName, model: modelName, year: year ? Number(year) : null, modelId,
        nickname: nickname.trim() || null,
      });
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const pickSuggestion = (s: CatalogItem) => {
    setModel(s);
    setManualModel(false);
    setSuggestions([]);
  };

  return (
    <>
      {manualMake ? (
        <TextField label="Brand" icon="car-sport-outline" placeholder="ex. Lancia" autoCapitalize="words"
          value={typedMake} onChangeText={setTypedMake} maxLength={60} />
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
          value={typedModel} onChangeText={setTypedModel} maxLength={80} />
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
      {showNickname && (
        <TextField label="Nickname (optional)" icon="pricetag-outline" placeholder="ex. La Bleue" autoCapitalize="words"
          value={nickname} onChangeText={setNickname} maxLength={40} />
      )}
      <Button title={submitLabel} onPress={submit} loading={busy} />
    </>
  );
}

/** « Audi A3 » ou « La Bleue · Audi A3 » */
export function vehicleLabel(v: Pick<Vehicle, 'make' | 'model' | 'nickname'>) {
  return v.nickname ? `${v.nickname} · ${v.make} ${v.model}` : `${v.make} ${v.model}`;
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
