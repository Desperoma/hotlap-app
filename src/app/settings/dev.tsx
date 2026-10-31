import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReportCard } from '@/components/ReportCard';
import { deleteReport, devReports, devSetReportStatus, STATUS_LABEL, type ReportItem } from '@/features/moderation/reports';
import { isoToDisplay } from '@/features/onboarding/validation';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

import {  t, locale  } from '@/i18n';
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
  const [repStatus, setRepStatus] = useState<'open' | 'reviewed' | 'actioned' | 'dismissed'>('open');
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const loadReports = useCallback(() => { setReports(null); devReports(repStatus).then(setReports); }, [repStatus]);
  useEffect(loadReports, [loadReports]);
  const setStatus = async (r: ReportItem, st: 'reviewed' | 'actioned' | 'dismissed') => {
    try { await devSetReportStatus(r.id, st); loadReports(); } catch (e) { Alert.alert(t('Erreur'), e instanceof Error ? e.message : String(e)); }
  };

  const remove = (r: ReportItem) => Alert.alert(t('Delete this report?'), t('It is removed for good, for the reporter too.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: async () => {
      try { await deleteReport(r.id); loadReports(); } catch (e) { Alert.alert(t('Erreur'), e instanceof Error ? e.message : String(e)); }
    } },
  ]);

  const decide = (r: Req, approve: boolean) =>
    Alert.alert(approve ? t('Accept?') : t('Reject?'), `@${r.username} : ${isoToDisplay(r.current_birth)} → ${isoToDisplay(r.requested)}`, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: approve ? t('Accept') : t('Reject'), style: approve ? 'default' : 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('dev_decide_birth_date', { p_request: r.id, p_approve: approve });
          if (error) Alert.alert(t('Erreur'), error.message);
          load();
        },
      },
    ]);

  if (!profile?.is_dev) return <Screen style={styles.center}><Text style={styles.hint}>{t('Réservé aux comptes développeurs.')}</Text></Screen>;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('Developer')}</Text>
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={styles.label}>{t('Ce compte est développeur')}</Text>
        <Text style={styles.hint}>{t('· Tous les profils et garages sont visibles, quel que soit leur réglage.')}{'\n'}{t('· Les drives s’affichent comme pour leur auteur : tous les drives, tracé complet (zone du domicile comprise), télémétrie et vitesses (mention DEV VIEW sur le drive).')}{'\n'}{t('· Fiche d’un circuit : « Edit track path (dev) » pour corriger le tracé.')}{'\n'}{t('· Statut donné depuis le SQL Editor de Supabase uniquement.')}</Text>
      </Card>

      <Text style={styles.section}>{t('REPORTS')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(['open', 'reviewed', 'actioned', 'dismissed'] as const).map((st) => (
          <Pressable key={st} onPress={() => setRepStatus(st)} style={[styles.tab, repStatus === st && styles.tabOn]}>
            <Text style={[styles.tabText, repStatus === st && { color: colors.accentText }]}>{STATUS_LABEL[st]}</Text>
          </Pressable>
        ))}
      </View>
      {reports === null ? <ActivityIndicator color={colors.accent} /> : reports.length === 0 ? (
        <Text style={styles.hint}>{t('Aucun signalement.')}</Text>
      ) : reports.map((r) => (
        <ReportCard key={r.id} r={r} footer={
          <View style={{ gap: spacing.sm, marginTop: 4 }}>
            {repStatus === 'open' && (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button title={t('Dismiss')} variant="ghost" style={{ flex: 1 }} onPress={() => setStatus(r, 'dismissed')} />
                <Button title={t('Reviewed')} variant="secondary" style={{ flex: 1 }} onPress={() => setStatus(r, 'reviewed')} />
                <Button title={t('Actioned')} style={{ flex: 1 }} onPress={() => setStatus(r, 'actioned')} />
              </View>
            )}
            <Button title={t('Delete report')} variant="ghost" icon="trash-outline" onPress={() => remove(r)} />
          </View>
        } />
      ))}

      <Text style={styles.section}>{t('BIRTH DATE REQUESTS')}</Text>
      {reqs === null ? <ActivityIndicator color={colors.accent} /> : reqs.length === 0 ? (
        <Text style={styles.hint}>{t('Aucune demande en attente.')}</Text>
      ) : reqs.map((r) => (
        <Card key={r.id} style={{ gap: spacing.sm }}>
          <Text style={styles.label}>@{r.username}</Text>
          <Text style={styles.hint}>{isoToDisplay(r.current_birth) || '—'} → {isoToDisplay(r.requested)} · {new Date(r.created_at).toLocaleDateString(locale())}</Text>
          {r.reason ? <Text style={styles.hint}>« {r.reason} »</Text> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title={t('Reject')} variant="secondary" style={{ flex: 1 }} onPress={() => decide(r, false)} />
            <Button title={t('Accept')} style={{ flex: 1 }} onPress={() => decide(r, true)} />
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
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.card },
  tabOn: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
