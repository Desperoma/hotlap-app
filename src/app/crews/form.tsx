import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { createCrew, getCrew, updateCrew, type CrewJoinPolicy } from '@/features/crews/api';
import { colors, fonts, spacing, type } from '@/theme';

const POLICIES: { value: CrewJoinPolicy; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'approval', label: 'On request' },
];
const POLICY_HINT: Record<CrewJoinPolicy, string> = {
  open: 'Anyone can join right away.',
  approval: 'Drivers ask to join; you or an admin accept them.',
};

/** Créer un crew, ou le modifier (paramètre id, admins). */
export default function CrewFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, profile } = useAuth();
  const me = session?.user.id;
  const [loading, setLoading] = useState(!!id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState(id ? '' : profile?.home_city ?? '');
  const [policy, setPolicy] = useState<CrewJoinPolicy>('open');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !me) return;
    getCrew(id, me)
      .then((c) => {
        if (!c) return;
        setName(c.name);
        setDescription(c.description ?? '');
        setCity(c.home_city ?? '');
        setPolicy(c.join_policy);
      })
      .finally(() => setLoading(false));
  }, [id, me]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/crews'));

  const save = async () => {
    if (!me) return;
    if (name.trim().length < 3) return Alert.alert('Presque', 'Le nom du crew fait au moins 3 caractères.');
    setBusy(true);
    try {
      const input = { name, description, joinPolicy: policy, homeCity: city, countryCode: profile?.country_code ?? null };
      if (id) {
        await updateCrew(id, input);
        back();
      } else {
        const newId = await createCrew(me, input);
        router.replace(`/crews/${newId}`);
      }
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Screen style={{ justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></Screen>;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{id ? 'Edit crew' : 'New crew'}</Text>
      </View>
      <TextField label="Name" icon="people-outline" placeholder="ex. Lorraine Twisties" autoCapitalize="words"
        value={name} onChangeText={setName} maxLength={40} />
      <TextField label="Description" icon="create-outline" placeholder="Who you are, where you drive (optional)"
        autoCapitalize="sentences" value={description} onChangeText={setDescription} maxLength={280} multiline />
      <TextField label="Home city (optional)" icon="location-outline" placeholder="ex. Metz" autoCapitalize="words"
        value={city} onChangeText={setCity} maxLength={80} />
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.label}>Who can join</Text>
        <SegmentedControl options={POLICIES} value={policy} onChange={setPolicy} />
        <Text style={styles.muted}>{POLICY_HINT[policy]}</Text>
      </View>
      <Text style={styles.muted}>Crew names and descriptions are public. Keep them friendly: no street-racing calls.</Text>
      <Button title={id ? 'Save' : 'Create crew'} icon="checkmark" onPress={save} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerTitle: { ...type.h1, color: colors.text, fontSize: 20 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
