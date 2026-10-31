import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Picker } from '@/components/Picker';
import { Button, Chip, TextField } from '@/components/ui';
import { CAR_COLORS } from '@/data/carColors';
import { YEARS } from '@/data/vehicles';
import type { VehicleInput } from '@/features/auth/AuthProvider';
import { catalogKey, fetchMakes, fetchModels, proposeVehicle, suggestModels, type CatalogItem } from '@/features/catalog/api';
import type { Vehicle } from '@/lib/database.types';
import { colors, fonts, spacing } from '@/theme';

import { HP_PER_KW, kwToHp } from './units';

import { t } from '@/i18n';
const manualLabel = () => t('Autre (saisie manuelle)');
const parseNum = (s: string) => { const n = Number(s.replace(',', '.').replace(/\s/g, '')); return s.trim() && Number.isFinite(n) ? n : null; };

/**
 * Marque, modèle, année (et surnom) d'un véhicule : catalogue Wikidata, ou saisie manuelle
 * dédoublonnée par propose_vehicle. Utilisé par l'onboarding (80 %) et par le garage.
 */
export function VehicleForm({ initial, submitLabel, onSubmit, showNickname = false }: {
  initial?: Pick<Vehicle, 'make' | 'model' | 'year' | 'nickname' | 'color' | 'power_kw' | 'weight_kg'> | null;
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
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [busy, setBusy] = useState(false);
  const [power, setPower] = useState(initial?.power_kw ? String(kwToHp(initial.power_kw)) : '');
  const [weight, setWeight] = useState(initial?.weight_kg ? String(initial.weight_kg) : '');
  const [specsFromCatalog, setSpecsFromCatalog] = useState(false);

  // Modèle du catalogue choisi : puissance et poids théoriques, si le catalogue les connaît
  // et que le conducteur ne les a pas déjà saisis.
  useEffect(() => {
    if (!model) return;
    let filled = false;
    if (model.powerKw && !power.trim()) { setPower(String(kwToHp(model.powerKw))); filled = true; }
    if (model.weightKg && !weight.trim()) { setWeight(String(model.weightKg)); filled = true; }
    if (filled) setSpecsFromCatalog(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

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
    if (!makeName || !modelName) return Alert.alert(t('Presque'), t('Choisis ou saisis la marque et le modèle.'));
    const hp = parseNum(power), kg = parseNum(weight);
    if (hp != null && (hp < 1 || hp > 3000)) return Alert.alert(t('Presque'), t('Puissance entre 1 et 3 000 ch.'));
    if (kg != null && (kg < 200 || kg > 8000)) return Alert.alert(t('Presque'), t('Poids entre 200 et 8 000 kg.'));
    setBusy(true);
    try {
      const manual = manualMake || manualModel;
      const { modelId } = manual ? await proposeVehicle(makeName, modelName) : { modelId: model?.id ?? null };
      await onSubmit({
        make: makeName, model: modelName, year: year ? Number(year) : null, modelId,
        nickname: nickname.trim() || null, color,
        powerKw: hp != null ? Math.round((hp / HP_PER_KW) * 10) / 10 : null,
        weightKg: kg != null ? Math.round(kg) : null,
      });
    } catch (e) {
      Alert.alert(t('Oups'), e instanceof Error ? e.message : t('Enregistrement impossible'));
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
        <TextField label={t('Brand')} icon="car-sport-outline" placeholder={t('ex. Lancia')} autoCapitalize="words"
          value={typedMake} onChangeText={setTypedMake} maxLength={60} />
      ) : (
        <Picker label={t('Brand')} placeholder={t('Select Brand')} value={make?.name ?? null}
          options={[...makes.map((m) => m.name), manualLabel()]}
          onChange={(name) => {
            setModel(null);
            setManualModel(false);
            if (name === manualLabel()) { setManualMake(true); setMake(null); }
            else setMake(makes.find((m) => m.name === name) ?? null);
          }} />
      )}
      {manualMake || manualModel ? (
        <TextField label={t('Model')} icon="car-outline" placeholder={t('ex. Delta HF Integrale')}
          value={typedModel} onChangeText={setTypedModel} maxLength={80} />
      ) : (
        <Picker label={t('Model')} placeholder={t('Select Model')} value={model?.name ?? null}
          options={[...models.map((m) => m.name), manualLabel()]} disabled={!make}
          onChange={(name) => {
            if (name === manualLabel()) { setManualModel(true); setModel(null); setTypedModel(''); }
            else setModel(models.find((m) => m.name === name) ?? null);
          }} />
      )}
      {suggestions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.hint}>{t('Tu voulais dire :')}</Text>
          <View style={styles.chips}>
            {suggestions.map((s) => <Chip key={`${s.id}-${s.name}`} label={`${make?.name} ${s.name}`} onPress={() => pickSuggestion(s)} />)}
          </View>
        </View>
      )}
      {(manualMake || manualModel) && (
        <Text style={styles.hint}>{t('Si ta voiture n\'existe pas encore, elle sera ajoutée au catalogue après vérification par l\'équipe.')}</Text>
      )}
      <Picker label={t('Year')} placeholder={t('Select Year (e.g. 2016)')} value={year} options={YEARS.map(String)} onChange={setYear} />
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('Color')}</Text>
        <View style={styles.swatches}>
          {CAR_COLORS.map((c) => (
            <Pressable key={c.value} onPress={() => setColor(color === c.value ? null : c.value)}
              accessibilityRole="radio" accessibilityState={{ selected: color === c.value }} accessibilityLabel={c.label}
              style={[styles.swatch, { backgroundColor: c.hex }, color === c.value && styles.swatchOn]} />
          ))}
        </View>
        <Text style={styles.hint}>{CAR_COLORS.find((c) => c.value === color)?.label ?? t('No color selected')}</Text>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField label={t('Power (hp)')} icon="flash-outline" placeholder={t('ex. 385')} keyboardType="number-pad"
            value={power} onChangeText={(t) => { setPower(t); setSpecsFromCatalog(false); }} maxLength={4} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label={t('Weight (kg)')} icon="barbell-outline" placeholder={t('ex. 1450')} keyboardType="number-pad"
            value={weight} onChangeText={(t) => { setWeight(t); setSpecsFromCatalog(false); }} maxLength={4} />
        </View>
      </View>
      <Text style={styles.hint}>
        {specsFromCatalog ? t('Valeurs théoriques du catalogue (Wikidata), modifiables.') : t('Facultatif : affiché dans ton garage.')}
      </Text>
      {showNickname && (
        <TextField label={t('Nickname (optional)')} icon="pricetag-outline" placeholder={t('ex. La Bleue')} autoCapitalize="words"
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
  row: { flexDirection: 'row', gap: spacing.md },
  label: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  swatchOn: { borderWidth: 3, borderColor: colors.accent },
});
