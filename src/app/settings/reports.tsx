import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ReportCard } from '@/components/ReportCard';
import { Button, Screen } from '@/components/ui';
import { deleteReport, myReports, type ReportItem } from '@/features/moderation/reports';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Mes signalements : contenu, motif, date et suite donnée par l'équipe. */
export default function MyReportsScreen() {
  const [list, setList] = useState<ReportItem[] | null>(null);
  useEffect(() => { myReports().then(setList); }, []);
  const withdraw = (r: ReportItem) => Alert.alert(t('Withdraw this report?'), t('The team will no longer review it. You can report the content again later.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Withdraw'), style: 'destructive', onPress: async () => {
      try { await deleteReport(r.id); setList((l) => l?.filter((x) => x.id !== r.id) ?? null); }
      catch (e) { Alert.alert(t('Erreur'), e instanceof Error ? e.message : String(e)); }
    } },
  ]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('My reports')}</Text>
      </View>
      {list === null ? <ActivityIndicator color={colors.accent} /> : list.length === 0 ? (
        <Text style={styles.hint}>{t('You haven’t reported anything.')}</Text>
      ) : list.map((r) => (
        <ReportCard key={r.id} r={r} footer={
          <Button title={t('Withdraw report')} variant="ghost" icon="trash-outline" onPress={() => withdraw(r)} style={{ marginTop: 4 }} />
        } />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
