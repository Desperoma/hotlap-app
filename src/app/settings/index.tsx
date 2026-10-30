import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteAccount } from '@/features/moderation/api';
import { setPref, usePrefs } from '@/features/settings/prefs';
import { colors, fonts, spacing, type } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

/** Paramètres (bouton en haut du garage) : compte, confidentialité, sécurité, interface, autres. */
export default function SettingsScreen() {
  const { session, profile, signOut } = useAuth();
  const prefs = usePrefs();
  const [deleting, setDeleting] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  // Double confirmation : la suppression est définitive.
  const askDelete = () =>
    Alert.alert('Delete your account?', 'Your profile, drives, photos, comments and follows will be deleted for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue', style: 'destructive',
        onPress: () => Alert.alert('This can’t be undone', 'Delete your HotLap account now?', [
          { text: 'Keep my account', style: 'cancel' },
          {
            text: 'Delete account', style: 'destructive',
            onPress: async () => {
              if (!session) return;
              setDeleting(true);
              try {
                await deleteAccount(session.user.id);
                await signOut();
              } catch (e) {
                setDeleting(false);
                Alert.alert('Deletion failed', e instanceof Error ? e.message : String(e));
              }
            },
          },
        ]),
      },
    ]);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Section title="ACCOUNT">
        <Row icon="person-outline" title="Personal information" text="Name, photo, bio, city" onPress={() => router.push('/edit-profile')} />
        <Row icon="calendar-outline" title="Date of birth" text="Ask for a correction" onPress={() => router.push('/settings/birth-date')} />
        <Row icon="mail-outline" title="Email" text={session?.user.email ?? '—'} />
      </Section>

      <Section title="PRIVACY">
        <Row icon="lock-closed-outline" title="Privacy" text="Followers, garage, default drive visibility, private zone"
          onPress={() => router.push('/settings/privacy')} />
      </Section>

      <Section title="SECURITY">
        <Row icon="key-outline" title="Password and sessions" text="Change your password, sign out everywhere"
          onPress={() => router.push('/settings/security')} />
      </Section>

      <Section title="INTERFACE">
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.rowTitle}>Default view during a drive</Text>
          <SegmentedControl value={prefs.liveView} onChange={(v) => setPref('liveView', v)}
            options={[{ value: 'map', label: 'Map' }, { value: 'both', label: 'Both' }, { value: 'gforce', label: 'G-force' }]} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.rowTitle}>Map style</Text>
          <SegmentedControl value={prefs.mapType} onChange={(v) => setPref('mapType', v)}
            options={[{ value: 'standard', label: 'Dark' }, { value: 'satellite', label: 'Satellite' }]} />
        </View>
      </Section>

      {profile?.is_dev && (
        <Section title="DEVELOPER">
          <Row icon="construct-outline" title="Developer tools" text="Birth date requests, what dev accounts can do"
            onPress={() => router.push('/settings/dev')} />
        </Section>
      )}

      <Section title="OTHER">
        <Row icon="information-circle-outline" title="About HotLap" text={`Version ${Constants.expoConfig?.version ?? '—'}`} />
        <Row icon="log-out-outline" title="Sign out" onPress={signOut} />
        <Row icon="trash-outline" title={deleting ? 'Deleting…' : 'Delete account'} danger onPress={deleting ? undefined : askDelete} />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.section}>{title}</Text>
      <Card style={{ gap: spacing.lg }}>{children}</Card>
    </View>
  );
}

function Row({ icon, title, text, onPress, danger }: { icon: Icon; title: string; text?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {text ? <Text style={styles.hint} numberOfLines={2}>{text}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  section: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
