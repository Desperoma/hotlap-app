import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import type { DetailsVisibility, FollowPolicy } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

const FOLLOW: { value: FollowPolicy; label: string }[] = [
  { value: 'open', label: 'Anyone can follow' },
  { value: 'approval', label: 'I approve' },
];
const DETAILS: { value: DetailsVisibility; label: string }[] = [
  { value: 'public', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Only me' },
];

/**
 * Confidentialité du compte : qui peut s'abonner, qui voit le garage et la ville, zone privée.
 * Pseudo, nom affiché, bio et photo restent toujours publics.
 */
export default function PrivacySettingsScreen() {
  const { profile, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const save = async (patch: { follow_policy?: FollowPolicy; details_visibility?: DetailsVisibility }) => {
    setSaving(true);
    try {
      await updateProfile(patch);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const policy = profile?.follow_policy ?? 'open';
  const details = profile?.details_visibility ?? 'followers';

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Privacy</Text>
      </View>

      <Card style={{ gap: spacing.md }}>
        <Text style={styles.label}>Who can follow you</Text>
        <SegmentedControl options={FOLLOW} value={policy} onChange={(v) => !saving && save({ follow_policy: v })} />
        <Text style={styles.hint}>
          {policy === 'open'
            ? 'Anyone can follow you right away.'
            : 'Each follow is a request you accept or decline. Switching back to “Anyone” accepts the pending requests.'}
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={styles.label}>Who sees your garage and city</Text>
        <SegmentedControl options={DETAILS} value={details} onChange={(v) => !saving && save({ details_visibility: v })} />
        <Text style={styles.hint}>
          Your username, name, bio and photo are always public. A car used on a drive stays visible on that drive.
        </Text>
      </Card>

      <Card onPress={() => router.push('/settings/privacy-zone')} style={styles.link}>
        <Ionicons name="home-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Private zone</Text>
          <Text style={styles.hint}>Hide your drives within 1 km of home.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>

      <Text style={styles.hint}>
        Each drive has its own visibility: Only me, Friends (you follow each other), Followers, or Everyone.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
