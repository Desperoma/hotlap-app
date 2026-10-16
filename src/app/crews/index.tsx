import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { listMyCrews, searchCrews, type Crew, type MyCrew } from '@/features/crews/api';
import { colors, fonts, spacing, type } from '@/theme';

/** Mes crews, recherche d'un crew à rejoindre, création. */
export default function CrewsScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [mine, setMine] = useState<MyCrew[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Crew[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (me) listMyCrews(me).then(setMine).catch(() => setMine([]));
    }, [me]),
  );

  // Recherche à la frappe ; sans texte, les crews les plus fournis.
  useEffect(() => {
    const t = setTimeout(() => searchCrews(query).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [query]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const mineIds = new Set(mine?.map((c) => c.id));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>CREWS</Text>
        <Text style={styles.title}>Ride together.</Text>
        <Text style={styles.muted}>Join a crew to see its members’ drives in the Crews feed.</Text>
      </View>

      <Button title="Create a crew" icon="add" onPress={() => router.push('/crews/form')} />

      <Text style={styles.section}>MY CREWS</Text>
      {mine === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : mine.length === 0 ? (
        <Text style={styles.muted}>You’re not in a crew yet.</Text>
      ) : (
        mine.map((c) => <CrewRow key={c.id} crew={c} role={c.myRole} pending={c.myStatus === 'pending'} />)
      )}

      <Text style={styles.section}>FIND A CREW</Text>
      <TextField label="Search" icon="search" placeholder="Crew name" value={query} onChangeText={setQuery} autoCorrect={false} />
      {results === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : results.filter((c) => !mineIds.has(c.id)).length === 0 ? (
        <Text style={styles.muted}>{query.trim() ? 'No crew with that name. Create it!' : 'No crews yet. Be the first.'}</Text>
      ) : (
        results.filter((c) => !mineIds.has(c.id)).map((c) => <CrewRow key={c.id} crew={c} />)
      )}
    </Screen>
  );
}

export function CrewRow({ crew, role, pending }: { crew: Crew; role?: string | null; pending?: boolean }) {
  return (
    <Card style={styles.row} onPress={() => router.push(`/crews/${crew.id}`)}>
      <View style={styles.badge}><Text style={styles.badgeText}>{crew.name.slice(0, 2).toUpperCase()}</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>{crew.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            `${crew.member_count} ${crew.member_count === 1 ? 'member' : 'members'}`,
            crew.home_city,
            pending ? 'Request sent' : role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : null,
            !role && crew.join_policy === 'approval' ? 'On request' : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  section: { ...type.h2, color: colors.text, fontSize: 15, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: colors.accent, fontFamily: fonts.display, fontSize: 13 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  meta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
