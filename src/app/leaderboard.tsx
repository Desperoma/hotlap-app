import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { flagOf } from '@/features/places/format';
import {
  circuitsWithLaps, leaderboardLaps, leaderboardSprint, type LapCircuit, type LeaderRow, type LeaderScope,
} from '@/features/sprint/api';
import { formatSprint, SPRINTS, type SprintKind } from '@/features/sprint/sprint';
import { colors, fonts, spacing, type } from '@/theme';

type Board = SprintKind | 'laps';
const BOARDS: { key: Board; label: string }[] = [...SPRINTS.map((s) => ({ key: s.kind as Board, label: s.label })), { key: 'laps', label: 'Laps' }];
const MEDALS = ['#F5C542', '#C9CED6', '#D08A4E'];

/**
 * Classements : sprints en départ arrêté (0-100, 0-200 km/h, 500 / 1 000 / 2 000 m) et meilleurs
 * tours par circuit ; monde, pays, amis, crews ou même modèle de voiture. Meilleur temps par
 * conducteur, sur les drives visibles (un drive privé n'apparaît que pour son auteur).
 */
export default function LeaderboardScreen() {
  const params = useLocalSearchParams<{ kind?: string; circuit?: string; circuitName?: string }>();
  const { profile, vehicles, primaryVehicle } = useAuth();
  const [board, setBoard] = useState<Board>(params.circuit ? 'laps' : (SPRINTS.some((s) => s.kind === params.kind) ? params.kind as SprintKind : '0_100'));
  const [scope, setScope] = useState<LeaderScope>('world');
  const [picked, setVehicleId] = useState<string | null>(null);
  const vehicleId = picked ?? primaryVehicle?.id ?? vehicles?.[0]?.id ?? null;
  const [circuits, setCircuits] = useState<LapCircuit[]>([]);
  const [circuitId, setCircuitId] = useState<string | null>(params.circuit ?? null);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState(false);

  const country = profile?.country_code?.trim() || null;
  const scopes: { key: LeaderScope; label: string }[] = [
    { key: 'world', label: 'World' },
    ...(country ? [{ key: 'country' as const, label: `${flagOf(country)} ${country}` }] : []),
    { key: 'friends', label: 'Friends' },
    { key: 'crews', label: 'Crews' },
    ...(vehicles?.length ? [{ key: 'model' as const, label: 'My model' }] : []),
  ];

  useEffect(() => {
    circuitsWithLaps().then((list) => {
      const named = params.circuit && !list.some((c) => c.id === params.circuit)
        ? [{ id: params.circuit, name: params.circuitName ?? 'Circuit', city: null, countryCode: null, laps: 0 }, ...list] : list;
      setCircuits(named);
      setCircuitId((c) => c ?? named[0]?.id ?? null);
    });
  }, [params.circuit, params.circuitName]);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(false);
    const f = { scope, country, vehicleId: scope === 'model' ? vehicleId : null };
    const q = board === 'laps' ? (circuitId ? leaderboardLaps(circuitId, f) : Promise.resolve([])) : leaderboardSprint(board, f);
    q.then((r) => live && setRows(r)).catch(() => live && (setRows([]), setError(true)));
    return () => { live = false; };
  }, [board, scope, country, vehicleId, circuitId]);

  const top = useMemo(() => rows?.filter((r) => r.rank <= 50) ?? [], [rows]);
  const meOutside = rows?.find((r) => r.isMe && r.rank > 50) ?? null;
  const myCar = vehicles?.find((v) => v.id === vehicleId);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>LEADERBOARD</Text>
        <Text style={styles.title}>{BOARDS.find((b) => b.key === board)?.label}</Text>
        <Text style={styles.muted}>
          {board === 'laps' ? 'Meilleur tour par conducteur sur ce circuit.' : 'Départ arrêté, mode Sprint, sur circuit ou route chronométrée validée.'}
        </Text>
      </View>

      <Chips items={BOARDS} value={board} onChange={setBoard} />
      <Chips items={scopes} value={scope} onChange={setScope} small />

      {scope === 'model' && vehicles && vehicles.length > 1 && (
        <Chips items={vehicles.map((v) => ({ key: v.id, label: `${v.make} ${v.model}` }))} value={vehicleId ?? ''} onChange={setVehicleId} small />
      )}
      {scope === 'model' && myCar && <Text style={styles.muted}>Toutes les {myCar.make} {myCar.model}.</Text>}

      {board === 'laps' && (
        circuits.length > 0
          ? <Chips items={circuits.map((c) => ({ key: c.id, label: c.name }))} value={circuitId ?? ''} onChange={setCircuitId} small />
          : <Text style={styles.muted}>Aucun tour chronométré pour l’instant. Le chrono au tour arrive avec la ligne de départ de chaque circuit.</Text>
      )}

      {rows === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : top.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="podium-outline" size={28} color={colors.textMuted} />
          <Text style={styles.muted}>
            {error ? 'Classement indisponible pour le moment.' : 'Personne ici pour l’instant. Lance un Sprint sur circuit pour ouvrir le classement.'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {top.map((r) => <Line key={r.userId} r={r} lap={board === 'laps'} />)}
          {meOutside && (
            <>
              <Text style={[styles.muted, { textAlign: 'center' }]}>···</Text>
              <Line r={meOutside} lap={board === 'laps'} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function Line({ r, lap }: { r: LeaderRow; lap: boolean }) {
  const name = r.isMe ? 'You' : r.displayName ?? r.username;
  const medal = MEDALS[r.rank - 1];
  return (
    <Pressable style={[styles.row, r.isMe && styles.me]} onPress={() => router.push(`/drive/${r.driveId}`)}
      accessibilityLabel={`Rank ${r.rank}, ${name}, ${formatSprint(r.timeMs)}`}>
      <View style={[styles.rank, medal ? { backgroundColor: medal } : null]}>
        <Text style={[styles.rankText, medal ? { color: colors.bg } : null]}>{r.rank}</Text>
      </View>
      <Avatar url={r.avatarUrl} name={r.displayName ?? r.username} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{name}{r.isSimulated ? ' · TEST' : ''}</Text>
        <Text style={styles.car} numberOfLines={1}>{r.car ?? '—'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.time, r.rank === 1 && { color: colors.accent }]}>{lap ? lapTime(r.timeMs) : formatSprint(r.timeMs)}</Text>
        {!lap && r.exitSpeedKmh != null ? <Text style={styles.car}>{Math.round(r.exitSpeedKmh)} km/h</Text> : null}
      </View>
    </Pressable>
  );
}

function Chips<T extends string>({ items, value, onChange, small }: {
  items: { key: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {items.map((i) => (
        <Pressable key={i.key} onPress={() => onChange(i.key)} accessibilityState={{ selected: i.key === value }}
          style={[styles.chip, small && styles.chipSmall, i.key === value && styles.chipActive]}>
          <Text style={[styles.chipText, i.key === value && styles.chipTextActive]} numberOfLines={1}>{i.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const lapTime = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card },
  chipSmall: { paddingVertical: 6 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 },
  chipTextActive: { color: colors.accentText },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent',
  },
  me: { borderColor: colors.accent },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  rankText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  car: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  time: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
});
