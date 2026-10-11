import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { colors, fonts, spacing, type } from '@/theme';

const PROMISES = [
  { icon: 'locate-outline', title: 'Navigation-grade GPS', text: 'Filters weak fixes for a cleaner route' },
  { icon: 'pulse-outline', title: 'Live drive stats', text: 'Distance, elapsed time and average speed' },
  { icon: 'shield-checkmark-outline', title: 'Private by default', text: 'Only you can access your recorded route' },
] as const;

/** Drive Mode : écran d'intro avant d'ouvrir la carte live. */
export default function RecordScreen() {
  return (
    <Screen scroll style={{ gap: spacing.xl, paddingTop: spacing.lg, alignItems: 'stretch' }}>
      <Text style={styles.overline}>HOTLAP / DRIVE MODE</Text>

      <View style={styles.iconRing}>
        <View style={styles.iconInner}>
          <Ionicons name="navigate" size={40} color={colors.accentText} />
        </View>
      </View>

      <Text style={styles.title}>Your road.{'\n'}Your story.</Text>
      <Text style={styles.subtitle}>
        Record a precise GPS track, watch your stats come alive and save every drive to your private log.
      </Text>

      <Card style={{ gap: spacing.lg }}>
        {PROMISES.map((p) => (
          <View key={p.title} style={styles.promise}>
            <Ionicons name={p.icon} size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.promiseTitle}>{p.title}</Text>
              <Text style={styles.promiseText}>{p.text}</Text>
            </View>
            <Ionicons name="checkmark" size={18} color={colors.accent} />
          </View>
        ))}
      </Card>

      <Text style={styles.warning}>Set up before you move. Never interact with your phone while driving.</Text>

      <Button title="OPEN LIVE DRIVE MAP" icon="radio-button-on" trailingIcon="arrow-forward"
        onPress={() => router.navigate('/map')} />
      <Text style={styles.footnote}>Location is requested only when you enter the map or start a drive.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overline: { ...type.overline, color: colors.textMuted },
  iconRing: {
    alignSelf: 'center', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconInner: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  title: { ...type.h1, color: colors.text, fontSize: 30, textAlign: 'center', lineHeight: 40 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  promiseTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  promiseText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  warning: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  footnote: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, textAlign: 'center' },
});
