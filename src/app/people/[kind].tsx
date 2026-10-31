import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  answerFollowRequest, follow, listPeople, removeFollower, unfollow, type PersonRow,
} from '@/features/social/api';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
type Kind = 'followers' | 'following' | 'requests';
const TITLE: Record<Kind, string> = { get followers() { return t('Followers'); }, get following() { return t('Following'); }, get requests() { return t('Follow requests'); } };
const EMPTY: Record<Kind, string> = {
  get followers() { return t('No followers yet.'); },
  get following() { return t('You don’t follow anyone yet.'); },
  get requests() { return t('No pending requests.'); },
};

/** Mes listes (jamais celles des autres) : followers, following, demandes reçues. */
export default function PeopleScreen() {
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind: Kind = raw === 'following' || raw === 'requests' ? raw : 'followers';
  const { session } = useAuth();
  const me = session?.user.id;
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listPeople(kind).then(setRows).catch(() => setRows([]));
  }, [kind]);
  useEffect(load, [load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert(t('Oups'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const actions = (p: PersonRow) => {
    if (!me) return null;
    const busy = busyId === p.id;
    if (kind === 'requests') {
      return (
        <View style={styles.actions}>
          <Button title={t('Accept')} onPress={() => run(p.id, () => answerFollowRequest(p.id, true))} loading={busy} />
          <Button title={t('Decline')} variant="ghost" onPress={() => run(p.id, () => answerFollowRequest(p.id, false))} disabled={busy} />
        </View>
      );
    }
    if (kind === 'following') {
      return <Button title={t('Unfollow')} variant="secondary" onPress={() => run(p.id, () => unfollow(me, p.id))} loading={busy} />;
    }
    // Followers : suivre en retour (on devient Friends), ou retirer.
    return (
      <View style={styles.actions}>
        {!p.iFollow && <Button title={t('Follow back')} onPress={() => run(p.id, () => follow(p.id))} loading={busy} />}
        <Pressable hitSlop={10} accessibilityLabel={t('Remove follower')} disabled={busy}
          onPress={() => Alert.alert(t('Remove this follower?'), t('@{0} will no longer see your Followers drives.', p.username), [
            { text: t('Cancel'), style: 'cancel' },
            { text: t('Remove'), style: 'destructive', onPress: () => run(p.id, () => removeFollower(me, p.id)) },
          ])}>
          <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  };

  return (
    <Screen style={{ paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{TITLE[kind]}</Text>
      </View>
      {rows === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<Text style={styles.muted}>{EMPTY[kind]}</Text>}
          renderItem={({ item: p }) => {
            const name = p.displayName ?? p.username;
            return (
              <View style={styles.row}>
                <Pressable style={styles.who} onPress={() => router.push(`/user/${p.id}`)}>
                  <Avatar url={p.avatarUrl} name={name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      @{p.username}{p.iFollow && p.followsMe ? t(' · Friends') : ''}
                    </Text>
                  </View>
                </Pressable>
                {actions(p)}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
});
