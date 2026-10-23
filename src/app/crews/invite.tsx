import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { cancelCrewInvite, getCrew, inviteToCrew, listInvitedIds, listMembers, type MyCrew } from '@/features/crews/api';
import { searchUsers } from '@/features/search/api';
import { listPeople } from '@/features/social/api';
import { colors, fonts, spacing, type } from '@/theme';

type Person = { id: string; username: string; displayName: string | null; avatarUrl: string | null };
type State = 'none' | 'invited' | 'member' | 'requested';

/**
 * Inviter dans un crew : par défaut mes abonnés et abonnements, ou une recherche par pseudo.
 * L'invité reçoit une notification et entre directement s'il accepte.
 */
export default function CrewInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [crew, setCrew] = useState<MyCrew | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Person[] | null>(null);
  const [state, setState] = useState<Record<string, State>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !me) return;
    getCrew(id, me).then(setCrew).catch(() => {});
    Promise.all([listMembers(id), listInvitedIds(id)]).then(([members, invited]) => {
      const s: Record<string, State> = {};
      for (const m of members) s[m.userId] = m.status === 'active' ? 'member' : 'requested';
      for (const u of invited) if (!s[u]) s[u] = 'invited';
      setState(s);
    }).catch(() => {});
    Promise.all([listPeople('followers'), listPeople('following')]).then(([a, b]) => {
      const byId = new Map<string, Person>();
      for (const p of [...b, ...a]) byId.set(p.id, p);
      setPeople([...byId.values()].sort((x, y) => (x.displayName ?? x.username).localeCompare(y.displayName ?? y.username)));
    }).catch(() => setPeople([]));
  }, [id, me]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits(null); return; }
    let live = true;
    const t = setTimeout(() => {
      searchUsers(query).then((r) => live && setHits(r.filter((u) => u.id !== me)
        .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url }))))
        .catch(() => live && setHits([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, me]);

  const list = useMemo(() => hits ?? people ?? [], [hits, people]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/crews/${id}`));

  const invite = async (p: Person) => {
    if (!id) return;
    setBusy(p.id);
    try {
      const r = await inviteToCrew(id, p.id);
      setState((s) => ({ ...s, [p.id]: r === 'invited' ? 'invited' : 'member' }));
    } catch (e) {
      Alert.alert('Invitation not sent', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (p: Person) => {
    if (!id) return;
    setBusy(p.id);
    try {
      await cancelCrewInvite(id, p.id);
      setState((s) => ({ ...s, [p.id]: 'none' }));
    } catch (e) {
      Alert.alert('Not cancelled', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>INVITE DRIVERS</Text>
        <Text style={styles.title} numberOfLines={1}>{crew?.name ?? 'Crew'}</Text>
        <Text style={styles.muted}>
          {crew?.join_policy === 'approval'
            ? 'Les invités entrent directement s’ils acceptent, sans passer par une demande.'
            : 'Les invités reçoivent une notification et rejoignent le crew en un geste.'}
        </Text>
      </View>

      <TextField label="Search a driver" icon="search" placeholder="@pseudo or name" autoCapitalize="none" autoCorrect={false}
        value={query} onChangeText={setQuery} />

      <Text style={styles.section}>{hits ? 'RESULTS' : 'YOUR FOLLOWERS & FOLLOWING'}</Text>
      {people === null && !hits ? <ActivityIndicator color={colors.accent} /> : null}
      {list.length === 0 && (people !== null || hits) ? (
        <Text style={styles.muted}>{hits ? 'No driver found.' : 'Search a driver by username to invite them.'}</Text>
      ) : null}
      {list.map((p) => {
        const st = state[p.id] ?? 'none';
        const name = p.displayName ?? p.username;
        return (
          <View key={p.id} style={styles.row}>
            <Pressable style={styles.person} onPress={() => router.push(`/user/${p.id}`)}>
              <Avatar url={p.avatarUrl} name={name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.muted} numberOfLines={1}>@{p.username}</Text>
              </View>
            </Pressable>
            {busy === p.id ? (
              <ActivityIndicator color={colors.accent} style={{ width: 92 }} />
            ) : st === 'member' ? (
              <Text style={[styles.tag, styles.tagMuted]}>MEMBER</Text>
            ) : st === 'invited' ? (
              <Pressable onPress={() => cancel(p)} style={[styles.btn, styles.btnGhost]} accessibilityLabel={`Cancel invitation for ${name}`}>
                <Text style={styles.btnGhostText}>Invited ✕</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => invite(p)} style={styles.btn} accessibilityLabel={`Invite ${name}`}>
                <Text style={styles.btnText}>{st === 'requested' ? 'Accept' : 'Invite'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  section: { ...type.overline, color: colors.textMuted },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  btn: { minWidth: 92, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent },
  btnText: { color: colors.accentText, fontFamily: fonts.semibold, fontSize: 13 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 },
  tag: { minWidth: 92, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1 },
  tagMuted: { color: colors.textFaint },
});
