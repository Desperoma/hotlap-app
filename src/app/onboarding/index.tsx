import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { GpsStep, IdentityStep, LanguageStep, LocationStep, VehicleStep } from '@/features/onboarding/steps';
import { colors, fonts, spacing, type } from '@/theme';

import { t, useLang } from '@/i18n';
/**
 * Onboarding en 5 étapes (voir « Onboarding » dans le doc de cadrage) :
 *   20 % Compte (Register + code reçu par email ; téléphone facultatif, non vérifié)
 *   30 % Langue · 40 % Identité · 60 % Localisation · 80 % Véhicule · 100 % GPS
 * Chaque étape est enregistrée tout de suite : l'utilisateur reprend là où il s'est arrêté.
 */
const STEPS = [
  { key: 'language', percent: 30 },
  { key: 'identity', percent: 40 },
  { key: 'location', percent: 60 },
  { key: 'vehicle', percent: 80 },
  { key: 'gps', percent: 100 },
] as const;

/** Étape en cours, gardée hors du composant : changer de langue remonte tout l'écran. */
let savedIndex: number | null = null;

export default function OnboardingScreen() {
  const { profile, primaryVehicle, updateProfile, signOut } = useAuth();
  const { chosen } = useLang();
  const [index, setIndexState] = useState(() => {
    if (savedIndex != null) return savedIndex;
    if (!chosen) return 0;
    if (!profile?.first_name || !profile.birth_date) return 1;
    if (!profile.home_city) return 2;
    if (!primaryVehicle) return 3;
    return 4;
  });
  const setIndex = (i: number) => { savedIndex = i; setIndexState(i); };
  const step = STEPS[index];
  const next = () => setIndex(Math.min(index + 1, STEPS.length - 1));
  const back = () => {
    if (index > 0) return setIndex(index - 1);
    savedIndex = null;
    signOut();
  };
  const finishAndForget = async () => { await updateProfile({ onboarded_at: new Date().toISOString() }); savedIndex = null; };

  return (
    <Screen scroll style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Ionicons name="arrow-back" size={22} color={colors.textMuted} onPress={back} accessibilityLabel={t('Retour')} />
        <Text style={styles.headerTitle}>{t('Account Setup')}</Text>
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

      {step.key === 'language' && <LanguageStep onNext={next} />}
      {step.key === 'identity' && <IdentityStep onNext={next} />}
      {step.key === 'location' && <LocationStep onNext={next} />}
      {step.key === 'vehicle' && <VehicleStep onNext={next} />}
      {step.key === 'gps' && <GpsStep onFinish={finishAndForget} />}
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
