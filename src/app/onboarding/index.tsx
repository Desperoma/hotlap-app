import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { GpsStep, IdentityStep, LocationStep, VehicleStep } from '@/features/onboarding/steps';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Onboarding en 5 étapes (voir « Onboarding » dans le doc de cadrage) :
 *   20 % Compte (Register + code reçu par email ; téléphone facultatif, non vérifié)
 *   40 % Identité · 60 % Localisation · 80 % Véhicule · 100 % GPS
 * Chaque étape est enregistrée tout de suite : l'utilisateur reprend là où il s'est arrêté.
 */
const STEPS = [
  { key: 'identity', percent: 40 },
  { key: 'location', percent: 60 },
  { key: 'vehicle', percent: 80 },
  { key: 'gps', percent: 100 },
] as const;

export default function OnboardingScreen() {
  const { profile, primaryVehicle, updateProfile, signOut } = useAuth();
  const [index, setIndex] = useState(() => {
    if (!profile?.first_name || !profile.birth_date) return 0;
    if (!profile.home_city) return 1;
    if (!primaryVehicle) return 2;
    return 3;
  });
  const step = STEPS[index];
  const next = () => setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => (index === 0 ? signOut() : setIndex(index - 1));
  const finish = () => updateProfile({ onboarded_at: new Date().toISOString() });

  return (
    <Screen scroll style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Ionicons name="arrow-back" size={22} color={colors.textMuted} onPress={back} accessibilityLabel="Retour" />
        <Text style={styles.headerTitle}>Account Setup</Text>
      </View>

      <View style={{ gap: 6 }}>
        <View style={styles.progressRow}>
          <Ionicons name="car-sport" size={16} color={colors.accent} />
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${step.percent}%` }]} />
          </View>
          <Ionicons name="flag" size={14} color={step.percent === 100 ? colors.accent : colors.textMuted} />
        </View>
        <Text style={styles.progressText}>{step.percent}%</Text>
      </View>

      {step.key === 'identity' && <IdentityStep onNext={next} />}
      {step.key === 'location' && <LocationStep onNext={next} />}
      {step.key === 'vehicle' && <VehicleStep onNext={next} />}
      {step.key === 'gps' && <GpsStep onFinish={finish} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerTitle: { ...type.h1, color: colors.text, fontSize: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  progressText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 11, textAlign: 'center' },
});
