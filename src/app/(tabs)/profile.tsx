import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DriveLogRow } from '@/components/DriveLogRow';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCounters, listDrives, type DriveLogItem, type ProfileCounters } from '@/features/profile/api';
import { colors, fonts, radius, spacing, type } from '@/theme';

/** Driver Profile : identité, compteurs, raccourcis, My Garage / Drive Log. */
export default function ProfileScreen() {
  const { session, profile, primaryVehicle, signOut } = useAuth();
  const [tab, setTab] = useState<'garage' | 'log'>('garage');
  const [counters, setCounters] = useState<ProfileCounters | null>(null);
  const [drives, setDrives] = useState<DriveLogItem[] | null>(null);
  const userId = session?.user.id;

  // Rechargé à chaque retour sur l'onglet (ex. après avoir sauvegardé un drive).
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      getCounters(userId).then(setCounters).catch(() => {});
      listDrives(userId).then(setDrives).catch(() => setDrives([]));
    }, [userId]),
  );
  const name = profile?.display_name ?? profile?.username ?? 'Driver';
  // Onboarding fait = 4 éléments sur 6 ; la bio et la photo complètent le profil.
  const completion = [profile?.username, profile?.first_name, profile?.home_city, primaryVehicle, profile?.bio, profile?.avatar_url]
    .filter(Boolean).length / 6;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.overline}>DRIVER PROFILE</Text>
          <Text style={styles.handle}>@{profile?.username ?? 'driver'}</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={signOut} accessibilityLabel="Se déconnecter">
          <Ionicons name="log-out-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card style={{ gap: spacing.lg }}>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{name[0]?.toUpperCase()}</Text></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.badge}>
              <Ionicons name="car-sport-outline" size={12} color={colors.accent} />
              <Text style={styles.badgeText}>ROAD CREW MEMBER</Text>
            </View>
          </View>
        </View>
        <Text style={styles.bio}>
          {profile?.bio ?? 'Your road story starts here. Add a bio and let the crew know what you drive.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Edit profile" icon="create-outline" style={{ flex: 1 }} />
          <Pressable style={styles.shareBtn}><Ionicons name="share-outline" size={20} color={colors.text} /></Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <View style={styles.progressHead}>
            <Text style={styles.overline}>PROFILE CHECK-IN</Text>
            <Text style={[styles.overline, { color: colors.accent }]}>{Math.round(completion * 100)}%</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${completion * 100}%` }]} /></View>
        </View>
      </Card>

      <Card style={styles.counters}>
        <Counter value={counters?.drives ?? 0} label="DRIVES" />
        <Counter value={counters?.crew ?? 0} label="CREW" />
        <Counter value={counters?.following ?? 0} label="FOLLOWING" />
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <Shortcut icon="radio-button-on" title="Record a drive" text="Log a new road session" onPress={() => router.push('/record')} />
        <Shortcut icon="map-outline" title="Explore the map" text="Find roads and drivers nearby" onPress={() => router.push('/map')} />
      </Card>

      <View style={styles.tabs}>
        <TabLink icon="car-sport-outline" label="MY GARAGE" active={tab === 'garage'} onPress={() => setTab('garage')} />
        <TabLink icon="time-outline" label="DRIVE LOG" active={tab === 'log'} onPress={() => setTab('log')} />
      </View>

      {tab === 'garage' ? (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.section}>YOUR MACHINE</Text>
          <Card style={{ gap: 6 }}>
            <Ionicons name="car-sport" size={44} color={colors.accent} style={{ alignSelf: 'flex-end' }} />
            {primaryVehicle?.year ? <Text style={styles.year}>{primaryVehicle.year}</Text> : null}
            <Text style={styles.make}>{primaryVehicle?.make.toUpperCase()}</Text>
            <Text style={styles.model}>{primaryVehicle?.model}</Text>
            <Text style={styles.edit}>Edit car details →</Text>
          </Card>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.section}>RECENT DRIVES</Text>
          {counters?.bestScore != null && (
            <Text style={styles.bio}>Best score: <Text style={{ color: colors.accent }}>{counters.bestScore}</Text></Text>
          )}
          {drives === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : drives.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}>
              <Ionicons name="flag-outline" size={28} color={colors.textMuted} />
              <Text style={styles.name}>No drives logged yet</Text>
              <Text style={[styles.bio, { textAlign: 'center' }]}>Start recording to build your personal road history.</Text>
              <Button title="Record your first drive" trailingIcon="arrow-forward" onPress={() => router.push('/record')} />
            </Card>
          ) : (
            drives.map((d) => <DriveLogRow key={d.id} drive={d} />)
          )}
        </View>
      )}
    </Screen>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.overline}>{label}</Text>
    </View>
  );
}

function Shortcut({ icon, title, text, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; text: string; onPress: () => void;
}) {
  return (
    <Pressable style={styles.shortcut} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.shortcutTitle}>{title}</Text>
        <Text style={styles.bio}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function TabLink({ icon, label, active, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabLink, active && styles.tabLinkActive]}>
      <Ionicons name={icon} size={16} color={active ? colors.text : colors.textMuted} />
      <Text style={[styles.tabLabel, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  handle: { ...type.h1, color: colors.text, fontSize: 20 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  avatarText: { ...type.h1, color: colors.text },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  bio: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  shareBtn: {
    width: 54, height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  counters: { flexDirection: 'row' },
  counterValue: { ...type.stat, color: colors.text, fontSize: 24 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shortcutTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabLink: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  tabLinkActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabLabel: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1 },
  section: { ...type.h2, color: colors.text, fontSize: 15 },
  year: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  make: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 1 },
  model: { ...type.h1, color: colors.text, fontSize: 28 },
  edit: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12, marginTop: 6 },
});
