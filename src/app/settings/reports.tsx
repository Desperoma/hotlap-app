import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ReportCard } from '@/components/ReportCard';
import { Screen } from '@/components/ui';
import { myReports, type ReportItem } from '@/features/moderation/reports';
import { colors, fonts, spacing, type } from '@/theme';

/** Mes signalements : contenu, motif, date et suite donnée par l'équipe. */
export default function MyReportsScreen() {
  const [list, setList] = useState<ReportItem[] | null>(null);
  useEffect(() => { myReports().then(setList); }, []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>My reports</Text>
      </View>
      {list === null ? <ActivityIndicator color={colors.accent} /> : list.length === 0 ? (
        <Text style={styles.hint}>You haven’t reported anything.</Text>
      ) : list.map((r) => <ReportCard key={r.id} r={r} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
