import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Screen } from '@/components/ui';
import {
  listNotifications, markAllRead, notificationText, type AppNotification,
} from '@/features/notifications/api';
import { respondCrewInvite } from '@/features/crews/api';
import { answerFollowRequest, follow } from '@/features/social/api';
import { colors, fonts, spacing, type } from '@/theme';

/** Notifications : likes, commentaires, nouveaux abonnés, demandes reçues et acceptées, invitations de crew. */
export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listNotifications();
      setItems(list);
      // Ouvrir l'écran vaut lecture ; les non-lues gardent leur pastille jusqu'au prochain passage.
      if (list.some((n) => !n.read)) markAllRead().catch(() => {});
    } catch {
      setItems([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const open = (n: AppNotification) => {
    if ((n.type === 'like' || n.type === 'comment') && n.driveId) router.push(`/drive/${n.driveId}`);
    else if (n.type === 'crew_invite' && n.crewId) router.push(`/crews/${n.crewId}`);
    else router.push(`/user/${n.actor.id}`);
  };

  const run = async (n: AppNotification, fn: () => Promise<unknown>) => {
    setBusyId(n.id);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const actions = (n: AppNotification) => {
    const busy = busyId === n.id;
    if (n.type === 'follow_request' && n.requestPending) {
      return (
        <View style={styles.actions}>
          <Button title="Accept" onPress={() => run(n, () => answerFollowRequest(n.actor.id, true))} loading={busy} />
          <Button title="Decline" variant="ghost" onPress={() => run(n, () => answerFollowRequest(n.actor.id, false))} disabled={busy} />
        </View>
      );
    }
    if (n.type === 'crew_invite' && n.invitePending && n.crewId) {
      const crewId = n.crewId;
      return (
        <View style={styles.actions}>
          <Button title="Join crew" onPress={() => run(n, () => respondCrewInvite(crewId, true))} loading={busy} />
          <Button title="Decline" variant="ghost" onPress={() => run(n, () => respondCrewInvite(crewId, false))} disabled={busy} />
        </View>
      );
    }
    if (n.type === 'follow' && !n.iFollow) {
      return <Button title="Follow back" variant="secondary" onPress={() => run(n, () => follow(n.actor.id))} loading={busy} />;
    }
    return null;
  };

  return (
    <Screen style={{ paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>
      {items === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={28} color={colors.textMuted} />
              <Text style={styles.muted}>No notifications yet. Likes, comments and new followers show up here.</Text>
            </View>
          }
          renderItem={({ item: n }) => {
            const name = n.actor.displayName ?? n.actor.username;
            return (
              <View style={[styles.row, !n.read && styles.unread]}>
                <Pressable style={styles.main} onPress={() => open(n)}>
                  <Avatar url={n.actor.avatarUrl} name={name} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.text} numberOfLines={3}>
                      <Text style={styles.name}>{name} </Text>{notificationText(n)}
                    </Text>
                    <Text style={styles.time}>{ago(n.createdAt)}</Text>
                  </View>
                  {!n.read && <View style={styles.dot} />}
                </Pressable>
                {actions(n)}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  row: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  unread: { borderColor: colors.accent },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  name: { color: colors.text, fontFamily: fonts.semibold },
  text: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  time: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
});
