import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Picker } from '@/components/Picker';
import { TextField } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

import { listAdmin1, listCountries, regionLabel, searchCities, type GeoAdmin1, type GeoCity, type GeoCountry } from './api';

export type PlaceValue = { countryCode: string | null; region: string; city: string };

/**
 * Pays, région et ville du profil. Région en liste quand le référentiel GeoNames couvre le pays,
 * ville avec suggestions ; la saisie libre reste possible pour un lieu absent.
 */
export function PlaceFields({ value, onChange }: { value: PlaceValue; onChange: (v: PlaceValue) => void }) {
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [admin1, setAdmin1] = useState<GeoAdmin1[]>([]);
  const [suggestions, setSuggestions] = useState<GeoCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const typed = useRef(false); // suggestions seulement après une frappe

  useEffect(() => { listCountries().then(setCountries).catch(() => {}); }, []);
  useEffect(() => {
    setAdmin1([]);
    if (value.countryCode) listAdmin1(value.countryCode).then(setAdmin1).catch(() => {});
  }, [value.countryCode]);

  const admin1Code = admin1.find((a) => a.name === value.region)?.code ?? null;

  useEffect(() => {
    if (!typed.current || value.city.trim().length < 2) { setSuggestions([]); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchCities(value.city, { country: value.countryCode, admin1: admin1Code })
        .then((r) => live && setSuggestions(r))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [value.city, value.countryCode, admin1Code]);

  const country = countries.find((c) => c.code === value.countryCode) ?? null;
  const label = regionLabel(value.countryCode);

  const pickCity = (c: GeoCity) => {
    typed.current = false;
    setSuggestions([]);
    onChange({ ...value, city: c.name, region: c.admin1_name ?? value.region });
  };

  return (
    <>
      <Picker label="Country" placeholder="Select Country" value={country?.name ?? null}
        options={countries.map((c) => c.name)}
        onChange={(name) => {
          const code = countries.find((c) => c.name === name)?.code ?? null;
          if (code !== value.countryCode) onChange({ countryCode: code, region: '', city: '' });
        }} />
      {admin1.length > 0 ? (
        <Picker label={label} placeholder={`Select ${label}`} value={value.region || null}
          options={admin1.map((a) => a.name)} onChange={(region) => onChange({ ...value, region })} />
      ) : (
        <TextField label={label} icon="map-outline" placeholder="ex. Grand Est" autoCapitalize="words"
          value={value.region} onChangeText={(region) => onChange({ ...value, region })} />
      )}
      <View style={{ gap: 6 }}>
        <TextField label="Home city" icon="home-outline" placeholder="ex. Metz" autoCapitalize="words" autoCorrect={false}
          value={value.city}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 200)}
          onChangeText={(city) => { typed.current = true; onChange({ ...value, city }); }} />
        {focused && (searching || suggestions.length > 0) && (
          <View style={styles.list}>
            {searching && suggestions.length === 0 ? <ActivityIndicator color={colors.accent} style={{ padding: 10 }} /> : null}
            {suggestions.map((c) => (
              <Pressable key={c.id} style={styles.row} onPress={() => pickCity(c)} accessibilityRole="button">
                <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  {c.admin1_name ? <Text style={styles.sub}>{c.admin1_name}{value.countryCode ? '' : ` · ${c.country_code}`}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {admin1.length > 0 && <Text style={styles.credit}>Places: GeoNames (CC BY 4.0)</Text>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
  name: { color: colors.text, fontFamily: fonts.medium, fontSize: 15 },
  sub: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  credit: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10 },
});
