import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/**
 * Saisie du code envoyé par email à l'inscription. Sa longueur (6 à 10 chiffres) dépend du
 * réglage « Email OTP Length » de Supabase : l'app accepte toutes ces longueurs.
 */
export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmail, resendEmailCode, isDemo } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(email ?? '', code); // la session s'ouvre : la navigation passe à l'onboarding
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Vérification impossible'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await resendEmailCode(email ?? '');
      Alert.alert(t('Code renvoyé'), t('Un nouveau code a été envoyé à {0}.', email));
    } catch (e) {
      Alert.alert(t('Oups'), e instanceof Error ? e.message : t('Envoi impossible'));
    }
  };

  return (
    <Screen scroll style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
      <Ionicons name="arrow-back" size={22} color={colors.textMuted} onPress={() => router.back()} />
      <View style={styles.icon}><Ionicons name="mail-open-outline" size={32} color={colors.accentText} /></View>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{t('Check your inbox')}</Text>
        <Text style={styles.subtitle}>{t('Saisis le code reçu par email à')}{' '}<Text style={{ color: colors.text }}>{email}</Text>.
        </Text>
      </View>
      <TextField label={t('Verification code')} icon="keypad-outline" placeholder="12345678" keyboardType="number-pad"
        maxLength={10} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={t('Verify email')} onPress={submit} loading={busy} disabled={code.length < 6} />
      <Pressable onPress={resend} style={{ alignSelf: 'center' }}>
        <Text style={styles.link}>{t('Renvoyer le code')}</Text>
      </Pressable>
      {isDemo && <Text style={styles.demo}>{t('Mode démo : n\'importe quel code de 6 chiffres ou plus fonctionne.')}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { ...type.h1, color: colors.text, fontSize: 26 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  link: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13, textDecorationLine: 'underline' },
  demo: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
});
