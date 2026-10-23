import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CarThumb } from '@/components/CarThumb';
import { DriveLogRow } from '@/components/DriveLogRow';
import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { listUserCrews, type Crew } from '@/features/crews/api';
import { block, isBlocked, unblock } from '@/features/moderation/api';
import { getCounters, listDrives, type DriveLogItem, type ProfileCounters } from '@/features/profile/api';
import { displayName, follow, getPublicProfile, unfollow } from '@/features/social/api';
import type { PublicProfile, Vehicle } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Profil d'un autre conducteur : identité, compteurs (sans les listes), suivre / demande / ne plus suivre,
 * garage et ville selon son réglage, drives visibles par moi.
 */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [counters, setCounters] = useState<ProfileCounters | null>(null);
  const [drives, setDrives] = useState<DriveLogItem[] | null>(null);
  const [rel, setRel] = useState<'none' | 'following' | 'requested'>('none');
  const [garage, setGarage] = useState<Pick<Vehicle, 'id' | 'make' | 'model' | 'year' | 'color' | 'is_primary'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [menu, setMenu] = useState<ModerationTarget | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);

  // Mon propre profil : l'onglet Profile.
  useEffect(() => {
    if (id && id === me) router.replace('/profile');
  }, [id, me]);

  const load = useCallback(() => {
    if (!id || !me) return;
    getPublicProfile(id).then(setProfile).catch(() => setProfile(null));
    getCounters(id).then((c) => {
      setCounters(c);
      setRel(c.iFollow ? 'following' : c.requested ? 'requested' : 'none');
    }).catch(() => {});
    listDrives(id).then(setDrives).catch(() => setDrives([]));
    loadGarage(id).then(setGarage).catch(() => setGarage([]));
    isBlocked(me, id).then(setBlocked).catch(() => {});
    listUserCrews(id).then(setCrews).catch(() => setCrews([]));
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
    const prev = rel;
    setBusy(true);
    try {
      if (prev === 'none') {
        const r = await follow(id);
        setRel(r);
      } else {
        await unfollow(me, id);
        setRel('none');
      }
      // Les drives Friends / Followers et le garage deviennent visibles (ou non) : on recharge.
      load();
    } catch (e) {
      setRel(prev);
      Alert.alert('Follow failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = () => {
    if (blocked) {
      unblock(me, id).then(() => { setBlocked(false); load(); })
        .catch((e) => Alert.alert('Unblock failed', e instanceof Error ? e.message : String(e)));
      return;
    }
    Alert.alert(`Block ${name}?`, 'You won’t see each other’s drives or comments, and follows between you are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () =>
          block(me, id)
            .then(() => { setBlocked(true); setRel('none'); setDrives([]); setGarage([]); getCounters(id).then(setCounters).catch(() => {}); })
            .catch((e) => Alert.alert('Block failed', e instanceof Error ? e.message : String(e))),
      },
    ]);
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => setMenu({ type: 'user', id, userId: id, userName: name })} hitSlop={12}
          accessibilityLabel="Report this driver" style={{ padding: 4 }}>
          <Ionicons name="flag-outline" size={20} color={colors.text} />
        </Pressable>
      </View>
      <ModerationSheet target={menu} onClose={() => setMenu(null)} />

      <Card style={{ gap: spacing.lg }}>
        <View style={styles.identity}>
          <Avatar url={profile.avatar_url} name={name} size={72} ring />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.muted}>
              @{profile.username}{profile.home_city ? ` · ${profile.home_city}` : ''}
            </Text>
          </View>
        </View>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        {crews.length > 0 && (
          <View style={styles.crews}>
            {crews.map((c) => <Chip key={c.id} icon="people" label={c.name} onPress={() => router.push(`/crews/${c.id}`)} />)}
          </View>
        )}
        {counters?.followsMe && (
          <View style={styles.crews}>
            <Chip icon={counters.iFollow ? 'people' : 'person'} label={counters.iFollow ? 'Friends' : 'Follows you'} />
          </View>
        )}
        {!blocked && (
          <Button
            title={rel === 'following' ? 'Following' : rel === 'requested' ? 'Requested' : profile.follow_policy === 'approval' ? 'Ask to follow' : 'Follow'}
            icon={rel === 'following' ? 'checkmark' : rel === 'requested' ? 'time-outline' : 'person-add-outline'}
            variant={rel === 'none' ? 'primary' : 'secondary'}
            onPress={toggleFollow}
            loading={busy}
          />
        )}
        <Button title={blocked ? `Unblock ${name}` : `Block ${name}`} variant="ghost"
          icon={blocked ? 'lock-open-outline' : 'ban-outline'} onPress={toggleBlock} />
      </Card>

      <Card style={styles.counters}>
        <Counter value={counters?.drives ?? 0} label="DRIVES" />
        <Counter value={counters?.followers ?? 0} label="FOLLOWERS" />
        <Counter value={counters?.following ?? 0} label="FOLLOWING" />
      </Card>

      {garage.length > 0 && (
        <>
          <Text style={styles.section}>GARAGE</Text>
          <Card style={{ gap: spacing.sm }}>
            {garage.map((v) => (
              <View key={v.id} style={styles.garageRow}>
                <CarThumb vehicle={v} size={44} />
                <Text style={[styles.garageText, { flex: 1 }]}>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</Text>
                {v.is_primary && <Ionicons name="star" size={14} color={colors.accent} />}
              </View>
            ))}
          </Card>
        </>
      )}

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

/** Garage d'un autre conducteur : vide si son réglage ne me le montre pas. */
async function loadGarage(userId: string) {
  if (!isSupabaseConfigured) return [];
  // Fonction dédiée : la lecture directe de vehicles inclut aussi les voitures de ses drives visibles.
  const { data, error } = await supabase.rpc('user_garage', { p_user: userId });
  if (error) throw error;
  return (data ?? []) as Pick<Vehicle, 'id' | 'make' | 'model' | 'year' | 'color' | 'is_primary'>[];
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  crews: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  garageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  garageText: { color: colors.text, fontFamily: fonts.medium, fontSize: 14 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  bio: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  counters: { flexDirection: 'row' },
  counterValue: { ...type.stat, color: colors.text, fontSize: 24 },
  overline: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  section: { ...type.h2, color: colors.text, fontSize: 15 },
});
