import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { OptionsSheet, type SheetOption } from '@/components/OptionsSheet';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  answerRequest, deleteCrew, getCrew, joinCrew, leaveCrew, listMembers, listMyCrewInvites, removeMember, respondCrewInvite,
  setMemberRole, transferCrew, type CrewInvite, type CrewMember, type MyCrew,
} from '@/features/crews/api';
import { displayName } from '@/features/social/api';
import { colors, fonts, spacing, type } from '@/theme';

const ROLE_LABEL = { owner: 'OWNER', admin: 'ADMIN', member: '' } as const;

/**
 * Détail d'un crew : rejoindre / demander / quitter ; pour les admins, valider les demandes,
 * gérer les membres ; pour le propriétaire, nommer des admins, transmettre ou supprimer le crew.
 */
export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [crew, setCrew] = useState<MyCrew | null | undefined>(undefined);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [memberMenu, setMemberMenu] = useState<CrewMember | null>(null);
  const [crewMenu, setCrewMenu] = useState(false);
  const [report, setReport] = useState<ModerationTarget | null>(null);
  const [invite, setInvite] = useState<CrewInvite | null>(null);

  const load = useCallback(() => {
    if (!id || !me) return;
    getCrew(id, me).then(setCrew).catch(() => setCrew(null));
    listMembers(id).then(setMembers).catch(() => setMembers([]));
    listMyCrewInvites().then((l) => setInvite(l.find((i) => i.crewId === id) ?? null)).catch(() => setInvite(null));
  }, [id, me]);
  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/crews'));

  if (crew === undefined) return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  if (!crew || !me) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>This crew doesn’t exist anymore.</Text>
        <Button title="Back" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  const active = crew.myStatus === 'active';
  const isOwner = active && crew.myRole === 'owner';
  const isAdmin = active && (crew.myRole === 'owner' || crew.myRole === 'admin');
  const canInvite = isAdmin || (active && crew.join_policy === 'open');
  const pending = members.filter((m) => m.status === 'pending');
  const roster = members.filter((m) => m.status === 'active');
  const later = (fn: () => void) => setTimeout(fn, 400); // après la fermeture de la feuille (iOS)

  const run = async (fn: () => Promise<unknown>, failTitle: string) => {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const join = () =>
    run(async () => {
      const status = await joinCrew(crew.id);
      if (status === 'pending') Alert.alert('Request sent', `An admin of ${crew.name} will review it.`);
    }, 'Couldn’t join');

  const leave = () =>
    Alert.alert(crew.myStatus === 'pending' ? 'Cancel your request?' : `Leave ${crew.name}?`, undefined, [
      { text: 'Stay', style: 'cancel' },
      { text: crew.myStatus === 'pending' ? 'Cancel request' : 'Leave', style: 'destructive', onPress: () => run(() => leaveCrew(crew.id), 'Couldn’t leave') },
    ]);

  const confirmDelete = () =>
    later(() =>
      Alert.alert(`Delete ${crew.name}?`, 'The crew and its member list are deleted for everyone. Drives are not affected.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete crew', style: 'destructive', onPress: () => run(async () => { await deleteCrew(crew.id); back(); }, 'Couldn’t delete') },
      ]));

  const memberOptions = (m: CrewMember): SheetOption[] => {
    const name = displayName(m.profile);
    const opts: SheetOption[] = [{ label: 'View profile', onPress: () => router.push(`/user/${m.userId}`) }];
    if (m.userId === me || m.role === 'owner') return opts;
    if (isOwner) {
      opts.push(m.role === 'admin'
        ? { label: 'Remove admin role', onPress: () => run(() => setMemberRole(crew.id, m.userId, 'member'), 'Update failed') }
        : { label: 'Make admin', onPress: () => run(() => setMemberRole(crew.id, m.userId, 'admin'), 'Update failed') });
      opts.push({
        label: `Transfer ownership to ${name}`,
        onPress: () => later(() => Alert.alert(`Give ${crew.name} to ${name}?`, 'You will stay in the crew as an admin.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Transfer', onPress: () => run(() => transferCrew(crew.id, m.userId), 'Transfer failed') },
        ])),
      });
    }
    if (isOwner || (isAdmin && m.role === 'member')) {
      opts.push({
        label: `Remove ${name} from the crew`,
        destructive: true,
        onPress: () => later(() => Alert.alert(`Remove ${name}?`, undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => run(() => removeMember(crew.id, m.userId), 'Remove failed') },
        ])),
      });
    }
    return opts;
  };

  const crewOptions: SheetOption[] = [
    ...(isAdmin ? [{ label: 'Edit crew', onPress: () => router.push({ pathname: '/crews/form', params: { id: crew.id } }) }] : []),
    ...(isOwner ? [{ label: 'Delete crew', destructive: true, onPress: confirmDelete }] : []),
    ...(!isOwner ? [{ label: 'Report this crew', onPress: () => later(() => setReport({ type: 'crew', id: crew.id, userId: crew.owner_id, userName: crew.name })) }] : []),
  ];

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        {crewOptions.length > 0 && (
          <Pressable onPress={() => setCrewMenu(true)} hitSlop={12} accessibilityLabel="Crew options" style={{ padding: 4 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        )}
      </View>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.badge}><Text style={styles.badgeText}>{crew.name.slice(0, 2).toUpperCase()}</Text></View>
        <Text style={styles.title}>{crew.name}</Text>
        <Text style={styles.muted}>
          {[`${crew.member_count} ${crew.member_count === 1 ? 'member' : 'members'}`, crew.home_city,
            crew.join_policy === 'approval' ? 'Joins on request' : 'Open crew'].filter(Boolean).join(' · ')}
        </Text>
        {crew.description ? <Text style={styles.desc}>{crew.description}</Text> : null}
        {invite && !active && (
          <View style={styles.invite}>
            <Text style={styles.inviteText}><Text style={styles.name}>{invite.inviterName}</Text> invited you to join.</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Decline" variant="secondary" style={{ flex: 1 }} disabled={busy}
                onPress={() => run(() => respondCrewInvite(crew.id, false), 'Update failed')} />
              <Button title="Join" icon="checkmark" style={{ flex: 1 }} loading={busy}
                onPress={() => run(() => respondCrewInvite(crew.id, true), 'Couldn’t join')} />
            </View>
          </View>
        )}
        {crew.myStatus === null && !invite && (
          <Button title={crew.join_policy === 'open' ? 'Join crew' : 'Ask to join'} icon="people" onPress={join} loading={busy} />
        )}
        {canInvite && (
          <Button title="Invite drivers" variant="secondary" icon="person-add-outline"
            onPress={() => router.push({ pathname: '/crews/invite', params: { id: crew.id } })} />
        )}
        {crew.myStatus === 'pending' && (
          <Button title="Request sent · Cancel" variant="secondary" icon="time-outline" onPress={leave} disabled={busy} />
        )}
        {active && !isOwner && <Button title="Leave crew" variant="ghost" icon="exit-outline" onPress={leave} disabled={busy} />}
      </Card>

      {isAdmin && pending.length > 0 && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.section}>REQUESTS ({pending.length})</Text>
          {pending.map((m) => (
            <Card key={m.userId} style={styles.member}>
              <Avatar url={m.profile?.avatar_url} name={displayName(m.profile)} size={40} />
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{displayName(m.profile)}</Text>
              <Pressable onPress={() => run(() => answerRequest(crew.id, m.userId, false), 'Update failed')} hitSlop={8}
                accessibilityLabel={`Decline ${displayName(m.profile)}`} style={styles.iconBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => run(() => answerRequest(crew.id, m.userId, true), 'Update failed')} hitSlop={8}
                accessibilityLabel={`Accept ${displayName(m.profile)}`} style={[styles.iconBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="checkmark" size={20} color={colors.accentText} />
              </Pressable>
            </Card>
          ))}
        </View>
      )}

      <Text style={styles.section}>MEMBERS</Text>
      {roster.map((m) => (
        <Card key={m.userId} style={styles.member} onPress={() => setMemberMenu(m)}>
          <Avatar url={m.profile?.avatar_url} name={displayName(m.profile)} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{m.userId === me ? 'You' : displayName(m.profile)}</Text>
            {m.profile?.username ? <Text style={styles.meta}>@{m.profile.username}</Text> : null}
          </View>
          {ROLE_LABEL[m.role] ? <Text style={styles.role}>{ROLE_LABEL[m.role]}</Text> : null}
        </Card>
      ))}

      <OptionsSheet visible={!!memberMenu} title={memberMenu ? displayName(memberMenu.profile) : undefined}
        options={memberMenu ? memberOptions(memberMenu) : []} onClose={() => setMemberMenu(null)} />
      <OptionsSheet visible={crewMenu} options={crewOptions} onClose={() => setCrewMenu(false)} />
      <ModerationSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: colors.accent, fontFamily: fonts.display, fontSize: 16 },
  title: { ...type.h1, color: colors.text, fontSize: 26 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  desc: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  section: { ...type.h2, color: colors.text, fontSize: 15 },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  invite: { gap: spacing.sm, borderWidth: 1, borderColor: colors.accent, borderRadius: 14, padding: spacing.md },
  inviteText: { color: colors.text, fontFamily: fonts.regular, fontSize: 14 },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  role: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
