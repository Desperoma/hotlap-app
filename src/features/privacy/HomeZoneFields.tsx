import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, TextField } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';

import { currentCoords, HOME_ZONE_MIN_M, type HomeZoneInput } from './homeZone';

/**
 * Option « Masquer mes drives autour de chez moi » : activée par défaut, désactivable.
 * Utilisée à l'onboarding (étape localisation) et dans le réglage depuis le profil.
 */
export function HomeZoneFields({ value, onChange, hasZone = false }: {
  value: HomeZoneInput;
  onChange: (v: HomeZoneInput) => void;
  /** Une zone est déjà enregistrée : l'adresse devient facultative (« changer d'adresse »). */
  hasZone?: boolean;
}) {
  const [locating, setLocating] = useState(false);

  const useHere = async () => {
    setLocating(true);
    try {
      onChange({ ...value, here: await currentCoords(), address: '' });
    } catch (e) {
      Alert.alert('Position', e instanceof Error ? e.message : 'Position indisponible');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.row}>
        <Ionicons name="home-outline" size={18} color={colors.accent} />
        <Text style={styles.title}>Hide my drives near home</Text>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => onChange({ ...value, enabled })}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          accessibilityLabel="Masquer mes drives autour de chez moi"
        />
      </View>
      <Text style={styles.hint}>
        Recommandé. Les autres ne voient pas ton tracé à moins de {HOME_ZONE_MIN_M / 1000} km de chez toi ; toi, tu le vois
        en entier. Ton adresse n’est pas enregistrée : seule une zone approximative l’est.
      </Text>
      {value.enabled && (
        <>
          {value.here ? (
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.hint, { flex: 1, color: colors.text }]}>Position actuelle utilisée comme domicile.</Text>
              <Button title="Change" variant="ghost" onPress={() => onChange({ ...value, here: null })} />
            </View>
          ) : (
            <>
              <TextField
                label={hasZone ? 'New home address (optional)' : 'Home address'}
                icon="location-outline"
                placeholder="ex. 12 rue Serpenoise, Metz"
                autoCapitalize="words"
                value={value.address}
                onChangeText={(address) => onChange({ ...value, address })}
              />
              <Button title="I'm at home: use my location" icon="locate-outline" variant="ghost" onPress={useHere} loading={locating} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
