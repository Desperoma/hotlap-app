import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DriveLogRow } from '@/components/DriveLogRow';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCounters, listDrives, type DriveLogItem, type ProfileCounters } from '@/features/profile/api';
import { displayName, getPublicProfile, initials, isFollowing, setFollow } from '@/features/social/api';
import type { PublicProfile } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

/** Profil public d'un autre conducteur : identité, compteurs, suivre / ne plus suivre, drives visibles. */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [counters, setCounters] = useState<ProfileCounters | null>(null);
  const [drives, setDrives] = useState<DriveLogItem[] | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mon propre profil : l'onglet Profile.
  useEffect(() => {
    if (id && id === me) router.replace('/profile');
  }, [id, me]);

  const load = useCallback(() => {
    if (!id || !me) return;
    getPublicProfile(id).then(setProfile).catch(() => setProfile(null));
    getCounters(id).then(setCounters).catch(() => {});
    listDrives(id).then(setDrives).catch(() => setDrives([]));
    isFollowing(me, id).then(setFollowing).catch(() => {});
  }, [id, me]);

  useEffect(load, [load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (profile === undefined) {
    return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  }
  if (!profile || !id || !me) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>This driver doesn’t exist.</Text>
        <Button title="Back" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  const name = displayName(profile);

  const toggleFollow = async () => {
    const next = !following;
    setBusy(true);
    setFollowing(next);
    setCounters((c) => (c ? { ...c, crew: c.crew + (next ? 1 : -1) } : c));
    try {
      await setFollow(me, id, next);
      // Les drives « Crew » deviennent visibles (ou non) : on recharge la liste.
      listDrives(id).then(setDrives).catch(() => {});
    } catch (e) {
      setFollowing(!next);
      setCounters((c) => (c ? { ...c, crew: c.crew + (next ? -1 : 1) } : c));
      Alert.alert('Follow failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ alignSelf: 'flex-start', padding: 4 }}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>

      <Card style={{ gap: spacing.lg }}>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.muted}>
              @{profile.username}{profile.home_city ? ` · ${profile.home_city}` : ''}
            </Text>
          </View>
        </View>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        <Button
          title={following ? 'Following' : 'Follow'}
          icon={following ? 'checkmark' : 'person-add-outline'}
          variant={following ? 'secondary' : 'primary'}
          onPress={toggleFollow}
          disabled={busy}
        />
      </Card>

      <Card style={styles.counters}>
        <Counter value={counters?.drives ?? 0} label="DRIVES" />
        <Counter value={counters?.crew ?? 0} label="CREW" />
        <Counter value={counters?.following ?? 0} label="FOLLOWING" />
      </Card>

      <Text style={styles.section}>DRIVES</Text>
      {drives === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : drives.length === 0 ? (
        <Text style={styles.muted}>No drives shared with you yet.</Text>
      ) : (
        drives.map((d) => <DriveLogRow key={d.id} drive={d} />)
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

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  avatarText: { ...type.h1, color: colors.text },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  bio: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  counters: { flexDirection: 'row' },
  counterValue: { ...type.stat, color: colors.text, fontSize: 24 },
  overline: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  section: { ...type.h2, color: colors.text, fontSize: 15 },
});
