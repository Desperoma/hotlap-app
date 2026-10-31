import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { HomeZoneFields } from '@/features/privacy/HomeZoneFields';
import { applyHomeZone, fetchHomeZone, homeZoneInputError, type HomeZone, type HomeZoneInput } from '@/features/privacy/homeZone';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Réglage de la zone privée autour du domicile (depuis le profil). */
export default function PrivacyZoneScreen() {
  const [zone, setZone] = useState<HomeZone | null | undefined>(undefined);
  const [form, setForm] = useState<HomeZoneInput>({ enabled: true, address: '', here: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchHomeZone()
      .then((z) => {
        setZone(z);
        setForm({ enabled: z ? z.enabled : true, address: '', here: null });
      })
      .catch(() => setZone(null));
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const save = async () => {
    const hasZone = !!zone;
    const e = homeZoneInputError(form, hasZone);
    if (e) return Alert.alert(t('Presque'), e);
    setBusy(true);
    try {
      await applyHomeZone(form, hasZone);
      back();
    } catch (err) {
      Alert.alert(t('Oups'), err instanceof Error ? err.message : t('Enregistrement impossible'));
    } finally {
      setBusy(false);
    }
  };

  const status = zone === undefined ? null
    : !zone ? t('Aucune zone enregistrée : tes drives publics sont visibles en entier.')
    : zone.enabled ? t('Zone active : tes tracés sont masqués autour de chez toi pour les autres.')
    : t('Zone désactivée : tes tracés sont visibles en entier. Réactive-la sans ressaisir ton adresse.');

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Private zone')}</Text>
      </View>
      {zone === undefined ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {status && <Text style={styles.status}>{status}</Text>}
          <HomeZoneFields value={form} onChange={setForm} hasZone={!!zone} />
          <Text style={styles.hint}>{t('Le changement s’applique aussi à tes drives déjà publiés.')}</Text>
          <Button title={t('Save')} onPress={save} loading={busy} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  status: { color: colors.text, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
