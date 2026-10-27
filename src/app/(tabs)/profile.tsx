import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { GarageCarCard } from '@/components/GarageCarCard';
import { DriveLogRow } from '@/components/DriveLogRow';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { placeLine } from '@/features/places/format';
import { listMyCrews, type MyCrew } from '@/features/crews/api';
import { myVehicleStats, type VehicleStats } from '@/features/garage/stats';
import { deleteAccount } from '@/features/moderation/api';
import { CheckInBar } from '@/features/profile/CheckInBar';
import { getCounters, listDrives, type DriveLogItem, type ProfileCounters } from '@/features/profile/api';
import { listPeople } from '@/features/social/api';
import { colors, fonts, radius, spacing, type } from '@/theme';

/** Driver Profile : identité, compteurs, raccourcis, My Garage / Drive Log. */
export default function ProfileScreen() {
  const { session, profile, vehicles, primaryVehicle, signOut } = useAuth();
  const [tab, setTab] = useState<'garage' | 'log'>('garage');
  const [carStats, setCarStats] = useState<Map<string, VehicleStats>>(new Map());
  const [counters, setCounters] = useState<ProfileCounters | null>(null);
  const [requests, setRequests] = useState(0);
  const [drives, setDrives] = useState<DriveLogItem[] | null>(null);
  const [crews, setCrews] = useState<MyCrew[]>([]);
  const userId = session?.user.id;

  const [deleting, setDeleting] = useState(false);

  // Double confirmation : la suppression est définitive.
  const askDelete = () =>
    Alert.alert('Delete your account?', 'Your profile, drives, photos, comments and follows will be deleted for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert('This can’t be undone', 'Delete your HotLap account now?', [
            { text: 'Keep my account', style: 'cancel' },
            {
              text: 'Delete account',
              style: 'destructive',
              onPress: async () => {
                if (!userId) return;
                setDeleting(true);
                try {
                  await deleteAccount(userId);
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

  // Rechargé à chaque retour sur l'onglet (ex. après avoir sauvegardé un drive).
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      getCounters(userId).then(setCounters).catch(() => {});
      listPeople('requests').then((r) => setRequests(r.length)).catch(() => {});
      listDrives(userId).then(setDrives).catch(() => setDrives([]));
      listMyCrews(userId).then((c) => setCrews(c.filter((x) => x.myStatus === 'active'))).catch(() => {});
      myVehicleStats().then(setCarStats).catch(() => {});
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
          <Avatar url={profile?.avatar_url} name={name} size={72} ring />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{name}</Text>
            {profile && placeLine(profile) ? <Text style={styles.place} numberOfLines={1}>{placeLine(profile)}</Text> : null}
            <Pressable style={styles.badge} onPress={() => router.push(crews.length === 1 ? `/crews/${crews[0].id}` : '/crews')}>
              <Ionicons name="people-outline" size={12} color={colors.accent} />
              <Text style={styles.badgeText} numberOfLines={1}>
                {crews.length === 0 ? 'NO CREW YET' : crews.length === 1 ? crews[0].name.toUpperCase() : `${crews.length} CREWS`}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.bio}>
          {profile?.bio ?? 'Your road story starts here. Add a bio and let the crew know what you drive.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Edit profile" icon="create-outline" style={{ flex: 1 }} onPress={() => router.push('/edit-profile')} />
        </View>
        <CheckInBar userId={userId} completion={completion} />
      </Card>

      <Card style={styles.counters}>
        <Counter value={counters?.drives ?? 0} label="DRIVES" onPress={() => setTab('log')} />
        <Counter value={counters?.followers ?? 0} label="FOLLOWERS" onPress={() => router.push('/people/followers')} />
        <Counter value={counters?.following ?? 0} label="FOLLOWING" onPress={() => router.push('/people/following')} />
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <Shortcut icon="radio-button-on" title="Record a drive" text="Log a new road session" onPress={() => router.push('/record')} />
        <Shortcut icon="map-outline" title="Explore the map" text="Find roads and drivers nearby" onPress={() => router.push('/map')} />
        <Shortcut icon="people-outline" title="Crews" text="Create, join or manage your crews" onPress={() => router.push('/crews')} />
        <Shortcut icon="compass-outline" title="Discover" text="Live G-force, drives and circuits near you" onPress={() => router.push('/discover')} />
        {requests > 0 && (
          <Shortcut icon="person-add-outline" title={`Follow requests (${requests})`} text="Accept or decline"
            onPress={() => router.push('/people/requests')} />
        )}
        <Shortcut icon="lock-closed-outline" title="Privacy" text="Followers, garage and city, private zone"
          onPress={() => router.push('/settings/privacy')} />
      </Card>

      <View style={styles.tabs}>
        <TabLink icon="car-sport-outline" label="MY GARAGE" active={tab === 'garage'} onPress={() => setTab('garage')} />
        <TabLink icon="time-outline" label="DRIVE LOG" active={tab === 'log'} onPress={() => setTab('log')} />
      </View>

      {tab === 'garage' ? (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.section}>MY MACHINES</Text>
          {vehicles && vehicles.length > 0 ? (
            vehicles.map((v, i) => (
              <GarageCarCard key={v.id} car={v} stats={carStats.get(v.id)} flip={i % 2 === 1} index={i}
                onPress={() => router.push({ pathname: '/garage/edit', params: { id: v.id } })} />
            ))
          ) : (
            <Card style={{ alignItems: 'center', gap: spacing.md }}>
              <Text style={styles.bio}>No car in your garage yet.</Text>
              <Button title="Add a vehicle" icon="add" onPress={() => router.push('/garage/edit')} />
            </Card>
          )}
          <Button title={`Open my garage (${vehicles?.length ?? 0})`} variant="secondary" icon="construct-outline"
            onPress={() => router.push('/garage')} />
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

      <Button title="Delete account" variant="ghost" icon="trash-outline" onPress={askDelete} loading={deleting} />
    </Screen>
  );
}

function Counter({ value, label, onPress }: { value: number; label: string; onPress: () => void }) {
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.overline}>{label}</Text>
    </Pressable>
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
  place: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  // paddingRight : place pour la cloche (NotificationBell)
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 52 },
  overline: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  handle: { ...type.h1, color: colors.text, fontSize: 20 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  otherCar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  badgeText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  bio: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
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
