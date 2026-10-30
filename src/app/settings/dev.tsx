import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isoToDisplay } from '@/features/onboarding/validation';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

type Req = { id: string; user_id: string; username: string; current_birth: string | null; requested: string; reason: string | null; created_at: string };

/** Outils des comptes développeurs (profiles.is_dev, migration 0029). */
export default function DevToolsScreen() {
  const { profile } = useAuth();
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const load = useCallback(() => {
    supabase.rpc('dev_birth_date_requests').then(({ data, error }) => setReqs(error ? [] : ((data ?? []) as Req[])));
  }, []);
  useEffect(load, [load]);

  const decide = (r: Req, approve: boolean) =>
    Alert.alert(approve ? 'Accept?' : 'Reject?', `@${r.username} : ${isoToDisplay(r.current_birth)} → ${isoToDisplay(r.requested)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: approve ? 'Accept' : 'Reject', style: approve ? 'default' : 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('dev_decide_birth_date', { p_request: r.id, p_approve: approve });
          if (error) Alert.alert('Erreur', error.message);
          load();
        },
      },
    ]);

  if (!profile?.is_dev) return <Screen style={styles.center}><Text style={styles.hint}>Réservé aux comptes développeurs.</Text></Screen>;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>Developer</Text>
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={styles.label}>Ce compte est développeur</Text>
        <Text style={styles.hint}>
          · Tous les profils et garages sont visibles, quel que soit leur réglage.{'\n'}
          · Les drives s’affichent comme pour leur auteur : tous les drives, tracé complet (zone du domicile comprise),
          télémétrie et vitesses (mention DEV VIEW sur le drive).{'\n'}
          · Fiche d’un circuit : « Edit track path (dev) » pour corriger le tracé.{'\n'}
          · Statut donné depuis le SQL Editor de Supabase uniquement.
        </Text>
      </Card>

      <Text style={styles.section}>BIRTH DATE REQUESTS</Text>
      {reqs === null ? <ActivityIndicator color={colors.accent} /> : reqs.length === 0 ? (
        <Text style={styles.hint}>Aucune demande en attente.</Text>
      ) : reqs.map((r) => (
        <Card key={r.id} style={{ gap: spacing.sm }}>
          <Text style={styles.label}>@{r.username}</Text>
          <Text style={styles.hint}>{isoToDisplay(r.current_birth) || '—'} → {isoToDisplay(r.requested)} · {new Date(r.created_at).toLocaleDateString()}</Text>
          {r.reason ? <Text style={styles.hint}>« {r.reason} »</Text> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Reject" variant="secondary" style={{ flex: 1 }} onPress={() => decide(r, false)} />
            <Button title="Accept" style={{ flex: 1 }} onPress={() => decide(r, true)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  section: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
