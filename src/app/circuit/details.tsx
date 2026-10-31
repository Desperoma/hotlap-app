import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/Dropdown';
import { TrackIcon } from '@/components/TrackIcon';
import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  CATEGORIES, devCreateCircuit, devUpdateCircuit, getCircuit, type CircuitCategory, type CircuitEdit,
} from '@/features/circuit/api';
import { t } from '@/i18n';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Comptes dev : infos d'un circuit (nom, catégorie, ville, pays, site, ligne de départ).
 * Création (?lat&lng, appui long sur la carte) ou modification (?id). Écran plein, champ du nom
 * en haut : le clavier ne le recouvre plus.
 */
export default function CircuitDetailsScreen() {
  const { id, lat, lng } = useLocalSearchParams<{ id?: string; lat?: string; lng?: string }>();
  const { profile } = useAuth();
  const creating = !id;
  const [form, setForm] = useState<CircuitEdit | null>(creating
    ? { name: '', category: 'racing', city: '', countryCode: '', website: '', resetStartLine: false } : null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CircuitEdit>(k: K, v: CircuitEdit[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  useEffect(() => {
    if (!id) return;
    getCircuit(id).then((c) => {
      if (!c) return router.back();
      setForm({ name: c.name, category: c.category, city: c.city ?? '', countryCode: c.countryCode ?? '', website: c.website ?? '', resetStartLine: false });
    }).catch(() => router.back());
  }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/map'));
  const save = async () => {
    if (!form || form.name.trim().length < 2) return;
    setBusy(true);
    try {
      if (creating) {
        const at = { latitude: Number(lat), longitude: Number(lng) };
        const newId = await devCreateCircuit(form.name.trim(), form.category, at);
        if (form.city || form.countryCode || form.website) await devUpdateCircuit(newId, form);
        router.replace(`/circuit/${newId}`);
      } else {
        await devUpdateCircuit(id!, form);
        back();
      }
    } catch (e) {
      Alert.alert(creating ? t('Création impossible') : t('Enregistrement impossible'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!profile?.is_dev) {
    return <SafeAreaView style={styles.center}><Text style={styles.hint}>{t('Réservé aux comptes développeurs.')}</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.overline}>DEV</Text>
              <Text style={styles.title}>{creating ? t('New track (dev)') : t('Edit track details')}</Text>
            </View>
          </View>
          {!form ? <ActivityIndicator color={colors.accent} /> : (
            <>
              <TextField label={t('Track name')} icon="flag-outline" value={form.name} onChangeText={(v) => set('name', v)}
                autoFocus={creating} autoCapitalize="words" maxLength={120} placeholder={t('ex. Lorraine Twisties')} />
              <Dropdown label={t('Category')} value={form.category} onChange={(v: CircuitCategory) => set('category', v)} style={{ flex: 0 }}
                options={CATEGORIES.map((c) => ({ key: c.key, label: c.label, left: <TrackIcon category={c.key} size={20} /> }))} />
              <TextField label={t('City')} icon="business-outline" value={form.city} onChangeText={(v) => set('city', v)}
                autoCapitalize="words" maxLength={120} placeholder={t('ex. Metz')} />
              <TextField label={t('Country code')} icon="globe-outline" value={form.countryCode}
                onChangeText={(v) => set('countryCode', v.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase())} autoCapitalize="characters" placeholder="FR" />
              <TextField label={t('Website')} icon="link-outline" value={form.website} onChangeText={(v) => set('website', v)}
                keyboardType="url" maxLength={300} placeholder="https://" />
              {creating ? (
                <Text style={styles.hint}>{t('A 400 m area is created around the point: draw the path next from the track page.')}</Text>
              ) : (
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{t('Reset the start line')}</Text>
                    <Text style={styles.hint}>{t('It will be placed again where the next drive starts.')}</Text>
                  </View>
                  <Switch value={form.resetStartLine} onValueChange={(v) => set('resetStartLine', v)}
                    trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#fff" />
                </View>
              )}
              <Button title={creating ? t('Create track') : t('Save')} icon={creating ? 'add' : 'checkmark'} onPress={save}
                loading={busy} disabled={form.name.trim().length < 2} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overline: { ...type.overline, color: '#F59E0B', fontSize: 10 },
  title: { ...type.h1, color: colors.text, fontSize: 22 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
