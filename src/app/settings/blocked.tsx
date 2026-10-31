import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { unblock } from '@/features/moderation/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

import {  t, locale  } from '@/i18n';
type Blocked = { user_id: string; username: string; display_name: string | null; avatar_url: string | null; blocked_at: string };

/** Comptes bloqués : la liste, et « Unblock » pour chacun (migration 0032). */
export default function BlockedScreen() {
  const { session } = useAuth();
  const [list, setList] = useState<Blocked[] | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const load = useCallback(() => {
    if (!isSupabaseConfigured) return setList([]);
    supabase.rpc('my_blocked').then(({ data }) => setList((data ?? []) as Blocked[]));
  }, []);
  useEffect(load, [load]);

  const doUnblock = (b: Blocked) => Alert.alert(t('Unblock @{0}?', b.username), t('You will see each other’s public drives and comments again. Follows are not restored.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Unblock'), onPress: async () => {
      if (!session) return;
      try { await unblock(session.user.id, b.user_id); load(); } catch (e) { Alert.alert(t('Unblock failed'), e instanceof Error ? e.message : String(e)); }
    } },
  ]);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>{t('Blocked accounts')}</Text>
      </View>
      {list === null ? <ActivityIndicator color={colors.accent} /> : list.length === 0 ? (
        <Text style={styles.hint}>{t('You haven’t blocked anyone.')}</Text>
      ) : list.map((b) => (
        <Card key={b.user_id} style={styles.row}>
          <Avatar url={b.avatar_url} name={b.display_name ?? b.username} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{b.display_name ?? b.username}</Text>
            <Text style={styles.hint}>@{b.username} · {new Date(b.blocked_at).toLocaleDateString(locale())}</Text>
          </View>
          <Button title={t('Unblock')} variant="secondary" onPress={() => doUnblock(b)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
