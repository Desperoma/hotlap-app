import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { birthDateError, isoToDisplay, maskBirthDate, parseBirthDate } from '@/features/onboarding/validation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

import {  t, locale  } from '@/i18n';
type Req = { id: string; requested: string; reason: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string };

/**
 * Date de naissance : verrouillée après l'inscription (elle conditionne l'enregistrement des
 * drives). On peut demander une correction, que l'équipe accepte ou refuse.
 */
export default function BirthDateScreen() {
  const { session, profile } = useAuth();
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  const load = useCallback(() => {
    if (!isSupabaseConfigured || !session) return setReqs([]);
    supabase.from('birth_date_requests').select('id, requested, reason, status, created_at').eq('user_id', session.user.id)
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setReqs((data ?? []) as Req[]));
  }, [session]);
  useEffect(load, [load]);

  const pending = reqs?.find((r) => r.status === 'pending');
  const err = date ? birthDateError(date) : null;

  const submit = async () => {
    const iso = parseBirthDate(date);
    if (!iso || !session) return;
    setBusy(true);
    const { error } = await supabase.from('birth_date_requests').insert({ user_id: session.user.id, requested: iso, reason: reason.trim() || null });
    setBusy(false);
    if (error) return Alert.alert(t('Demande impossible'), error.message.includes('one_pending') ? t('Une demande est déjà en attente.') : error.message);
    setDate(''); setReason(''); load();
  };
  const cancel = async () => {
    if (!pending) return;
    await supabase.from('birth_date_requests').delete().eq('id', pending.id);
    load();
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('Date of birth')}</Text>
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={styles.label}>{t('Current')}</Text>
        <Text style={styles.value}>{profile?.birth_date ? isoToDisplay(profile.birth_date) : '—'}</Text>
        <Text style={styles.hint}>{t('Elle conditionne l’âge minimal pour enregistrer des drives : tu ne peux pas la modifier toi-même.')}</Text>
      </Card>

      {reqs === null ? <ActivityIndicator color={colors.accent} /> : pending ? (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.label}>{t('Request pending')}</Text>
          <Text style={styles.hint}>{t('Nouvelle date demandée :')}{' '}{isoToDisplay(pending.requested)}{pending.reason ? ` · « ${pending.reason} »` : ''}</Text>
          <Button title={t('Cancel request')} variant="secondary" onPress={cancel} />
        </Card>
      ) : (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.label}>{t('Ask for a correction')}</Text>
          <TextField label={t('Correct date (DD/MM/YYYY)')} icon="calendar-outline" value={date} keyboardType="number-pad"
            onChangeText={(t) => setDate(maskBirthDate(t))} placeholder={t('DD/MM/YYYY')} />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <TextField label={t('Reason (optional)')} icon="chatbox-outline" value={reason} onChangeText={setReason} maxLength={300} />
          <Button title={t('Send request')} onPress={submit} loading={busy} disabled={!date || !!err} />
        </Card>
      )}

      {reqs?.filter((r) => r.status !== 'pending').map((r) => (
        <Text key={r.id} style={styles.hint}>
          {new Date(r.created_at).toLocaleDateString(locale())} · {isoToDisplay(r.requested)} · {r.status === 'approved' ? t('acceptée') : t('refusée')}
        </Text>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  value: { ...type.stat, color: colors.text, fontSize: 22 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
