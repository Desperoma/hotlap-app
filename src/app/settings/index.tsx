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

import { LANGS, t, useLang } from '@/i18n';
type Icon = keyof typeof Ionicons.glyphMap;

/** Paramètres (bouton en haut du garage) : compte, confidentialité, sécurité, interface, autres. */
export default function SettingsScreen() {
  const { session, profile, signOut } = useAuth();
  const prefs = usePrefs();
  const { lang } = useLang();
  const [deleting, setDeleting] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  // Double confirmation : la suppression est définitive.
  const askDelete = () =>
    Alert.alert(t('Delete your account?'), t('Your profile, drives, photos, comments and follows will be deleted for good.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Continue'), style: 'destructive',
        onPress: () => Alert.alert(t('This can’t be undone'), t('Delete your HotLap account now?'), [
          { text: t('Keep my account'), style: 'cancel' },
          {
            text: t('Delete account'), style: 'destructive',
            onPress: async () => {
              if (!session) return;
              setDeleting(true);
              try {
                await deleteAccount(session.user.id);
                await signOut();
              } catch (e) {
                setDeleting(false);
                Alert.alert(t('Deletion failed'), e instanceof Error ? e.message : String(e));
              }
            },
          },
        ]),
      },
    ]);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{t('Settings')}</Text>
      </View>

      <Section title={t('ACCOUNT')}>
        <Row icon="person-outline" title={t('Personal information')} text={t('Name, photo, bio, city')} onPress={() => router.push('/edit-profile')} />
        <Row icon="calendar-outline" title={t('Date of birth')} text={t('Ask for a correction')} onPress={() => router.push('/settings/birth-date')} />
        <Row icon="mail-outline" title={t('Email')} text={session?.user.email ?? '—'} />
      </Section>

      <Section title={t('PRIVACY')}>
        <Row icon="lock-closed-outline" title={t('Privacy')} text={t('Followers, garage, default drive visibility, private zone')}
          onPress={() => router.push('/settings/privacy')} />
        <Row icon="ban-outline" title={t('Blocked accounts')} text={t('See and unblock the drivers you blocked')}
          onPress={() => router.push('/settings/blocked')} />
        <Row icon="flag-outline" title={t('My reports')} text={t('Posts, comments and drivers you reported')}
          onPress={() => router.push('/settings/reports')} />
      </Section>

      <Section title={t('SECURITY')}>
        <Row icon="key-outline" title={t('Password and sessions')} text={t('Change your password, sign out everywhere')}
          onPress={() => router.push('/settings/security')} />
      </Section>

      <Section title={t('INTERFACE')}>
        <Row icon="language-outline" title={t('Language')} text={LANGS.find((l) => l.key === lang)?.label}
          onPress={() => router.push('/settings/language')} />
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.rowTitle}>{t('Default view during a drive')}</Text>
          <SegmentedControl value={prefs.liveView} onChange={(v) => setPref('liveView', v)}
            options={[{ value: 'map', label: t('Map') }, { value: 'both', label: t('Both') }, { value: 'gforce', label: t('G-force') }]} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.rowTitle}>{t('Map style')}</Text>
          <SegmentedControl value={prefs.mapType} onChange={(v) => setPref('mapType', v)}
            options={[{ value: 'standard', label: t('Dark') }, { value: 'satellite', label: t('Satellite') }]} />
        </View>
      </Section>

      {profile?.is_dev && (
        <Section title={t('DEVELOPER')}>
          <Row icon="construct-outline" title={t('Developer tools')} text={t('Reports, birth date requests, what dev accounts can do')}
            onPress={() => router.push('/settings/dev')} />
        </Section>
      )}

      <Section title={t('OTHER')}>
        <Row icon="information-circle-outline" title={t('About HotLap')} text={t('Version {0}', Constants.expoConfig?.version ?? '—')} />
        <Row icon="log-out-outline" title={t('Sign out')} onPress={() => { signOut(); router.replace('/'); }} />
      </Section>

      <Section title={t('DANGER ZONE')}>
        <Row icon="trash-outline" title={deleting ? t('Deleting…') : t('Delete account')} text={t('Deletes your profile, drives and photos for good')}
          danger onPress={deleting ? undefined : askDelete} />
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
