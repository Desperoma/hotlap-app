import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { DriveCard } from '@/components/DriveCard';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatKm } from '@/features/recording/geo';
import {
  searchCircuits, searchDrives, searchPlaces, searchUsers,
  type CircuitHit, type PlaceHit, type UserHit,
} from '@/features/search/api';
import type { DriveFeedItem } from '@/lib/database.types';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'top' | 'drives' | 'people' | 'places';
type Results = { drives: DriveFeedItem[]; users: UserHit[]; circuits: CircuitHit[]; places: PlaceHit[] };
const EMPTY: Results = { drives: [], users: [], circuits: [], places: [] };

type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'user'; key: string; user: UserHit }
  | { kind: 'place'; key: string; place: PlaceHit }
  | { kind: 'circuit'; key: string; circuit: CircuitHit }
  | { kind: 'drive'; key: string; drive: DriveFeedItem };

/**
 * Recherche : drives (titre), pilotes, circuits et lieux.
 * Ouverte depuis la carte (mode=map) : seulement lieux et circuits, et le choix recentre la carte.
 */
export default function SearchScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const forMap = mode === 'map';
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>(forMap ? 'places' : 'top');
  const [res, setRes] = useState<Results>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setRes(EMPTY); setBusy(false); return; }
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const safe = <T,>(p: Promise<T[]>) => p.catch((e) => { if (id === seq.current) setError(e instanceof Error ? e.message : String(e)); return [] as T[]; });
      setError(null);
      const [drives, users, circuits, places] = await Promise.all([
        forMap ? Promise.resolve([]) : safe(searchDrives(query, me)),
        forMap ? Promise.resolve([]) : safe(searchUsers(query)),
        safe(searchCircuits(query)),
        safe(searchPlaces(query)),
      ]);
      if (id !== seq.current) return;
      setRes({ drives, users, circuits, places });
      setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, me, forMap]);

  const goToPoint = (lat: number, lng: number, zoom: number, label?: string) =>
    router.navigate({ pathname: '/map', params: { lat: String(lat), lng: String(lng), zoom: String(zoom), label: label ?? '', t: String(Date.now()) } });

  const rows = buildRows(res, forMap ? 'places' : tab);
  const nothing = q.trim().length >= 2 && !busy && rows.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.field}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            autoFocus value={q} onChangeText={setQ} style={styles.input}
            placeholder={forMap ? 'Search a place or a circuit' : 'Drives, drivers, places, circuits'}
            placeholderTextColor={colors.textFaint} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
          />
          {busy ? <ActivityIndicator size="small" color={colors.accent} /> : q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!forMap && (
        <View style={styles.tabs}>
          {(['top', 'drives', 'people', 'places'] as Tab[]).map((t) => (
            <Chip key={t} label={TAB_LABEL[t]} active={tab === t} onPress={() => setTab(t)} />
          ))}
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ? error : nothing ? 'No results.' : q.trim().length < 2 ? (forMap ? 'Type a city, an address or a circuit.' : 'Type at least 2 letters.') : ' '}
          </Text>
        }
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'section':
              return <Text style={styles.section}>{item.title}</Text>;
            case 'user':
              return (
                <Pressable style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
                  <Avatar url={item.user.avatar_url} name={item.user.display_name || item.user.username} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.user.display_name || item.user.username}</Text>
                    <Text style={styles.sub} numberOfLines={1}>@{item.user.username}{item.user.i_follow ? ' · Following' : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            case 'place':
              return (
                <Pressable style={styles.row} onPress={() => goToPoint(item.place.lat, item.place.lng, 12, item.place.label)}>
                  <View style={styles.icon}><Ionicons name="location" size={18} color={colors.text} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.place.label}</Text>
                    {item.place.detail ? <Text style={styles.sub} numberOfLines={1}>{item.place.detail}</Text> : null}
                  </View>
                  <Ionicons name="map-outline" size={16} color={colors.textFaint} />
                </Pressable>
              );
            case 'circuit':
              return (
                <Pressable style={styles.row} onPress={() => goToPoint(item.circuit.lat, item.circuit.lng, 14, item.circuit.name)}>
                  <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}><Ionicons name="flag" size={16} color={colors.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.circuit.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[item.circuit.city, item.circuit.country_code, item.circuit.lap_length_m ? `${formatKm(item.circuit.lap_length_m)} km` : null].filter(Boolean).join(' · ') || 'Circuit'}
                    </Text>
                  </View>
                  <Ionicons name="map-outline" size={16} color={colors.textFaint} />
                </Pressable>
              );
            case 'drive':
              return <DriveCard drive={item.drive} />;
          }
        }}
      />
    </SafeAreaView>
  );
}

const TAB_LABEL: Record<Tab, string> = { top: 'Top', drives: 'Drives', people: 'Drivers', places: 'Places' };

function buildRows(r: Results, tab: Tab): Row[] {
  const out: Row[] = [];
  const add = (title: string, items: Row[], max?: number) => {
    if (!items.length) return;
    if (tab === 'top') out.push({ kind: 'section', key: `s-${title}`, title });
    out.push(...(max ? items.slice(0, max) : items));
  };
  const users: Row[] = r.users.map((u) => ({ kind: 'user', key: `u-${u.id}`, user: u }));
  const places: Row[] = [
    ...r.circuits.map((c): Row => ({ kind: 'circuit', key: `c-${c.id}`, circuit: c })),
    ...r.places.map((p): Row => ({ kind: 'place', key: `p-${p.key}`, place: p })),
  ];
  const drives: Row[] = r.drives.map((d) => ({ kind: 'drive', key: `d-${d.id}`, drive: d }));
  if (tab === 'top') {
    add('DRIVERS', users, 3);
    add('PLACES', places, 4);
    add('DRIVES', drives, 5);
  } else if (tab === 'people') add('DRIVERS', users);
  else if (tab === 'places') add('PLACES', places);
  else add('DRIVES', drives);
  return out;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  field: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.input,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  section: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  sub: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  empty: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
});
