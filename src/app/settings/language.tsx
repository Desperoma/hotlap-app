import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LanguageList } from '@/components/LanguagePicker';
import { Screen } from '@/components/ui';
import { t } from '@/i18n';
import { colors, fonts, spacing, type } from '@/theme';

/** Settings > Language : anglais, français, espagnol, allemand. */
export default function LanguageScreen() {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('Language')}</Text>
      </View>
      <LanguageList />
      <Text style={styles.hint}>{t('Rank names stay in English in every language.')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
