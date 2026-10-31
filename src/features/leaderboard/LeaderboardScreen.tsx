import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CircuitPicker, type PickedCircuit } from '@/components/CircuitPicker';
import { Dropdown } from '@/components/Dropdown';
import { ClassBadge } from '@/components/ClassBadge';
import { RankBadge } from '@/components/RankBadge';
import type { LevelInfo } from '@/features/levels/levels';
import { useLevels } from '@/features/levels/useLevels';
import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatLap } from '@/features/circuit/laps';
import { carImageFor } from '@/features/garage/carImage';
import { CLASSES, type ClassKey } from '@/features/garage/hpi';
import {
  INCLUDE_TEST_DRIVES, circuitsWithLaps, leaderboardLaps, leaderboardScore, leaderboardSprint, type LapCircuit, type LeaderRow, type LeaderScope,
} from '@/features/sprint/api';
import { formatSprint, sprintLabel, type SprintKind } from '@/features/sprint/sprint';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
type Group = 'score' | 'accel' | 'distance' | 'laps';
const GROUPS: { key: Group; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'score', get label() { return t('Score'); }, icon: 'star-outline' },
  { key: 'accel', get label() { return t('Acceleration'); }, icon: 'speedometer-outline' },
  { key: 'distance', get label() { return t('Distance'); }, icon: 'flag-outline' },
  { key: 'laps', get label() { return t('Laps'); }, icon: 'refresh' },
];
/** Nom du pays dans la langue du téléphone (FR → France), à défaut le code. */
const countryName = (code: string) => {
  try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
};

const SUBS: Record<'accel' | 'distance', SprintKind[]> = { accel: ['0_100', '0_200'], distance: ['500m', '1000m', '2000m'] };
const groupOf = (k?: string): Group | null =>
  SUBS.accel.includes(k as SprintKind) ? 'accel' : SUBS.distance.includes(k as SprintKind) ? 'distance' : null;

/** Or, argent, bronze : bord du podium (dégradé « métal ») et pastille du rang. */
const METAL: Record<1 | 2 | 3, { main: string; light: string; dark: string }> = {
  1: { main: '#F5C542', light: '#FFE9A3', dark: '#9C7412' },
  2: { main: '#C9CED6', light: '#F2F4F7', dark: '#7D838C' },
  3: { main: '#D08A4E', light: '#F3C29A', dark: '#7E4A20' },
};

/**
 * Classements. Onglets Score / Acceleration (0-100, 0-200 km/h) / Distance (500 m, 1 000 m,
 * 2 000 m) / Laps (par circuit), portée Monde / pays / amis / crews / même modèle, podium des
 * 3 premiers puis la liste. Meilleur temps par conducteur sur les drives visibles.
 * Onglet « Performance » de la barre du bas, et écran /leaderboard (avec retour) depuis un drive ou un circuit.
 */
export function LeaderboardScreen({ asTab }: { asTab?: boolean }) {
  const params = useLocalSearchParams<{ kind?: string; circuit?: string; circuitName?: string }>();
  const { profile, vehicles, primaryVehicle } = useAuth();
  const [group, setGroup] = useState<Group>(params.circuit ? 'laps' : groupOf(params.kind) ?? (asTab ? 'accel' : 'score'));
  const [sprint, setSprint] = useState<SprintKind>(groupOf(params.kind) ? params.kind as SprintKind : '0_100');
  const [scope, setScope] = useState<LeaderScope>('world');
  const [cls, setCls] = useState<ClassKey | 'all'>('all');
  const [picked, setVehicleId] = useState<string | null>(null);
  const vehicleId = picked ?? primaryVehicle?.id ?? vehicles?.[0]?.id ?? null;
  const [circuits, setCircuits] = useState<LapCircuit[]>([]);
  const [circuitId, setCircuitId] = useState<string | null>(params.circuit ?? null);
  // Circuit choisi par la recherche (absent de la liste des circuits qui ont des tours).
  const [pickedCircuit, setPickedCircuit] = useState<PickedCircuit | null>(null);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState(false);
  // L'onglet reste monté : on recharge à chaque retour (drive publié, voiture d'un drive changée…).
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick((t) => t + 1); }, []));

  // Un lien (récap de sprint, circuit) vers l'onglet déjà monté : on suit ses paramètres.
  useEffect(() => {
    const g = groupOf(params.kind);
    if (g) { setGroup(g); setSprint(params.kind as SprintKind); }
  }, [params.kind]);
  useEffect(() => {
    if (params.circuit) { setGroup('laps'); setCircuitId(params.circuit); }
  }, [params.circuit]);

  // Changement d'onglet : première épreuve du groupe si l'épreuve courante n'en fait pas partie.
  const chooseGroup = (g: Group) => {
    setGroup(g);
    if ((g === 'accel' || g === 'distance') && !SUBS[g].includes(sprint)) setSprint(SUBS[g][0]);
  };

  const country = profile?.country_code?.trim() || null;
  const scopes: { key: LeaderScope; label: string; hint?: string }[] = [
    { key: 'world', label: t('World') },
    ...(country ? [{ key: 'country' as const, label: countryName(country) }] : []),
    { key: 'friends', label: t('Friends'), hint: t('You and the drivers you follow') },
    { key: 'crews', label: t('Crews'), hint: t('You and the members of your crews') },
    // Score : toutes voitures confondues, donc pas de classement par modèle.
    ...(vehicles?.length && group !== 'score' ? [{ key: 'model' as const, label: t('My model'), hint: t('Same make and model as my car') }] : []),
  ];
  useEffect(() => { if (group === 'score' && scope === 'model') setScope('world'); }, [group, scope]);

  useEffect(() => {
    circuitsWithLaps().then((list) => {
      const named = params.circuit && !list.some((c) => c.id === params.circuit)
        ? [{ id: params.circuit, name: params.circuitName ?? 'Circuit', city: null, countryCode: null, laps: 0 }, ...list] : list;
      setCircuits(named);
      setCircuitId((c) => c ?? named[0]?.id ?? null);
    });
  }, [params.circuit, params.circuitName, focusTick]);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(false);
    if (group === 'score' && scope === 'model') return;
    const f = { scope, country, vehicleId: scope === 'model' ? vehicleId : null, cls: cls === 'all' ? null : cls };
    const q = group === 'score' ? leaderboardScore(f)
      : group === 'laps' ? (circuitId ? leaderboardLaps(circuitId, f) : Promise.resolve([])) : leaderboardSprint(sprint, f);
    q.then((r) => live && setRows(r)).catch(() => live && (setRows([]), setError(true)));
    return () => { live = false; };
  }, [group, sprint, scope, country, vehicleId, circuitId, cls, focusTick]);

  const top = useMemo(() => rows?.filter((r) => r.rank <= 50) ?? [], [rows]);
  const levels = useLevels((rows ?? []).map((r) => r.userId));
  const podium = top.filter((r) => r.rank <= 3).slice(0, 3);
  const rest = top.filter((r) => !podium.includes(r));
  const meOutside = rows?.find((r) => r.isMe && r.rank > 50) ?? null;
  const myCar = vehicles?.find((v) => v.id === vehicleId);
  const circuit = circuits.find((c) => c.id === circuitId) ?? (pickedCircuit?.id === circuitId ? pickedCircuit : undefined);
  const metric: Metric = group === 'score' ? 'score' : group === 'laps' ? 'lap' : 'sprint';

  const scopeLabel = scope === 'world' ? t('World rankings') : scope === 'country' ? `${country} rankings`
    : scope === 'friends' ? t('You and the drivers you follow') : scope === 'crews' ? t('You and your crews')
    : myCar ? t('All {0} {1}', myCar.make, myCar.model) : t('Same model');
  const selected = group === 'score' ? t('Score · Open road')
    : group === 'laps' ? t('Laps · {0}', circuit?.name ?? 'Circuit')
    : `${group === 'accel' ? 'Acceleration' : 'Distance'} · ${sprintLabel(sprint)}`;
  const classLabel = cls === 'all' ? '' : t(' · Class {0}', cls);
  const what = group === 'score' ? t('Highest score') : group === 'laps' ? t('Fastest lap time') : t('Fastest recorded time');

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: asTab ? 140 : spacing.xl }}>
      <View style={styles.topBar}>
        {!asTab && (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityLabel={t('Back')} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        )}
        <View style={{ flex: 1, gap: 2, paddingRight: asTab ? 52 : 0 }}>
          <Text style={styles.overline}>{t('PERF')}</Text>
          <Text style={styles.title}>{t('Leaderboard')}</Text>
        </View>
      </View>

      <View style={styles.groups}>
        {GROUPS.map((g) => {
          const active = g.key === group;
          return (
            <Pressable key={g.key} onPress={() => chooseGroup(g.key)} style={[styles.group, active && styles.groupActive]}
              accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Ionicons name={g.icon} size={15} color={active ? colors.accent : colors.textFaint} />
              <Text style={[styles.groupText, active && styles.groupTextActive]} numberOfLines={1} adjustsFontSizeToFit>{g.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filters}>
        {(group === 'accel' || group === 'distance') && (
          <Dropdown label={group === 'accel' ? t('Target') : t('Distance')} value={sprint} onChange={setSprint} style={styles.filter}
            options={SUBS[group].map((k) => ({ key: k, label: sprintLabel(k) }))} />
        )}
        <Dropdown label={t('Ranking')} value={scope} onChange={setScope} options={scopes} style={styles.filter} />
        <Dropdown label={t('Class')} value={cls} onChange={setCls} style={styles.filter}
          options={[{ key: 'all' as const, label: t('All classes') },
            ...CLASSES.map((c) => ({ key: c.key, label: t('{0}–{1} HPI', c.min, c.max), left: <ClassBadge cls={c.key} size="sm" /> }))]} />
      </View>
      {group === 'laps' && (
        <CircuitPicker value={circuit ?? null} withLaps={circuits} onChange={(c) => { setPickedCircuit(c); setCircuitId(c.id); }} />
      )}
      {scope === 'model' && vehicles && vehicles.length > 1 && (
        <Dropdown label={t('My model')} value={vehicleId ?? ''} onChange={setVehicleId}
          options={vehicles.map((v) => ({ key: v.id, label: `${v.make} ${v.model}` }))} />
      )}

      <View style={styles.selected}>
        <Text style={styles.selectedOver}>{t('SELECTED LEADERBOARD')}</Text>
        <Text style={styles.selectedTitle}>{selected}</Text>
        <Text style={styles.muted}>{scopeLabel}{classLabel} · {what}</Text>
        {group === 'laps' && circuits.length === 0 && !circuit && (
          <Text style={styles.faint}>{t('Aucun tour chronométré pour l’instant : choisis un circuit, ou lance un drive depuis sa fiche.')}</Text>
        )}
        {INCLUDE_TEST_DRIVES && <Text style={styles.faint}>{t('Version de test : les drives simulés (TEST) de tout le monde sont inclus.')}</Text>}
        {group !== 'laps' && (
          <Text style={styles.faint}>
            {group === 'score' ? t('Best score of a drive on open roads, all cars combined.')
              : t('Standing start in Sprint mode, on a circuit or a validated timed road.')}
          </Text>
        )}
      </View>

      {rows === null ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
      ) : top.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="podium-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            {error ? t('Classement indisponible pour le moment.')
              : group === 'score' ? t('Personne ici pour l’instant. Publie un drive sur route ouverte (visibilité autre que Private) pour entrer au classement.')
              : group === 'laps' ? t('Personne ici pour l’instant. Roule sur ce circuit pour ouvrir le classement.')
              : t('Personne ici pour l’instant. Lance un Sprint sur circuit pour ouvrir le classement.')}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Podium rows={podium} metric={metric} levels={levels} />
          {rest.map((r) => <Line key={r.userId} r={r} metric={metric} level={levels.get(r.userId)} />)}
          {meOutside && (
            <>
              <Text style={[styles.muted, { textAlign: 'center' }]}>···</Text>
              <Line r={meOutside} metric={metric} level={levels.get(meOutside.userId)} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

type Metric = 'score' | 'lap' | 'sprint';
const value = (r: LeaderRow, m: Metric) => (m === 'score' ? `${r.score} pts` : m === 'lap' ? formatLap(r.timeMs) : formatSprint(r.timeMs));
const nameOf = (r: LeaderRow) => (r.isMe ? 'You' : r.displayName ?? r.username);

/** Podium : 2e à gauche, 1er au centre (plus haut), 3e à droite. */
function Podium({ rows, metric, levels }: { rows: LeaderRow[]; metric: Metric; levels: Map<string, LevelInfo> }) {
  const order = [rows.find((r) => r.rank === 2), rows.find((r) => r.rank === 1), rows.find((r) => r.rank === 3)];
  // Ex æquo : rank() peut donner deux 1ers ; on remplit les places restantes dans l'ordre.
  const left = rows.filter((r) => !order.includes(r));
  const slots = order.map((r) => r ?? left.shift());
  return (
    <View style={styles.podium}>
      {slots.map((r, i) => r ? <Step key={r.userId} r={r} place={([2, 1, 3] as const)[i]} metric={metric} level={levels.get(r.userId)} />
        : <View key={i} style={{ flex: 1 }} />)}
    </View>
  );
}

function Step({ r, place, metric, level }: { r: LeaderRow; place: 1 | 2 | 3; metric: Metric; level?: LevelInfo }) {
  const m = METAL[place];
  const first = place === 1;
  const source = useMemo(() => carImageFor(r.make ? { make: r.make, model: r.model ?? '' } : null).source, [r.make, r.model]);
  return (
    <Pressable style={[styles.step, { marginTop: first ? 0 : 26 }]} onPress={() => router.push(`/drive/${r.driveId}`)}
      accessibilityLabel={t('Rank {0}, {1}, {2}', r.rank, nameOf(r), value(r, metric))}>
      {/* Bord « métal » : dégradé clair → foncé sous la carte */}
      <LinearGradient colors={[m.light, m.main, m.dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.metal}>
        <View style={[styles.stepInner, r.isMe && { backgroundColor: '#1F2614' }]}>
          <View style={[styles.medal, { backgroundColor: m.main }]}>
            <Text style={styles.medalText}>{place}</Text>
          </View>
          <Image source={source} style={[styles.podiumCar, first && { height: 62 }]} resizeMode="contain" />
          <Avatar url={r.avatarUrl} name={r.displayName ?? r.username} size={first ? 34 : 28} />
          <Text style={styles.stepName} numberOfLines={1}>{nameOf(r)}</Text>
          <RankBadge info={level} />
          {r.isSimulated && <Text style={styles.testTag}>{t('TEST')}</Text>}
          <Text style={styles.stepCar} numberOfLines={1}>{r.car ?? '—'}</Text>
          {r.cls && <ClassBadge cls={r.cls} size="sm" />}
          <Text style={[styles.stepValue, { color: first ? colors.accent : colors.text }, first && { fontSize: 18 }]} numberOfLines={1}
            adjustsFontSizeToFit>{value(r, metric)}</Text>
        </View>
      </LinearGradient>
      <LinearGradient colors={[m.main, 'transparent']} style={[styles.plinth, { height: first ? 26 : 14 }]} />
    </Pressable>
  );
}

function Line({ r, metric, level }: { r: LeaderRow; metric: Metric; level?: LevelInfo }) {
  const source = useMemo(() => carImageFor(r.make ? { make: r.make, model: r.model ?? '' } : null).source, [r.make, r.model]);
  return (
    <Pressable style={[styles.row, r.isMe && styles.me]} onPress={() => router.push(`/drive/${r.driveId}`)}
      accessibilityLabel={t('Rank {0}, {1}, {2}', r.rank, nameOf(r), value(r, metric))}>
      <Text style={styles.rank}>{r.rank}</Text>
      <Image source={source} style={styles.thumb} resizeMode="contain" />
      <Avatar url={r.avatarUrl} name={r.displayName ?? r.username} size={30} />
      <View style={{ flex: 1 }}>
        <View style={styles.carRow}>
          <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>{nameOf(r)}{r.isSimulated ? t(' · TEST') : ''}</Text>
          <RankBadge info={level} />
        </View>
        <View style={styles.carRow}>
          {r.cls && <ClassBadge cls={r.cls} size="sm" />}
          <Text style={[styles.car, { flexShrink: 1 }]} numberOfLines={1}>{r.car ?? '—'}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.time}>{value(r, metric)}</Text>
        {metric === 'score' && r.distanceM != null ? <Text style={styles.car}>{(r.distanceM / 1000).toFixed(1)} km</Text>
          : metric === 'sprint' && r.exitSpeedKmh != null ? <Text style={styles.car}>{Math.round(r.exitSpeedKmh)} km/h</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text, fontSize: 28 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  faint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  groups: {
    flexDirection: 'row', backgroundColor: colors.input, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 4, gap: 2,
  },
  group: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.sm, paddingHorizontal: 2 },
  groupActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  groupText: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 11 },
  groupTextActive: { color: colors.text },
  filters: { flexDirection: 'row', gap: spacing.sm },
  filter: { flex: 1 },
  selected: { gap: 3, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: spacing.md },
  selectedOver: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  selectedTitle: { ...type.h2, color: colors.text, fontSize: 19 },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  podium: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  step: { flex: 1 },
  metal: { borderRadius: 16, padding: 2 },
  stepInner: { borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', paddingHorizontal: 6, paddingTop: 14, paddingBottom: 10, gap: 3 },
  medal: {
    position: 'absolute', top: -1, alignSelf: 'center', width: 24, height: 18, borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  medalText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 11 },
  podiumCar: { width: '100%', height: 48, marginTop: 4 },
  testTag: { color: '#F59E0B', fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1 },
  stepName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13, maxWidth: '100%' },
  stepCar: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10, maxWidth: '100%' },
  stepValue: { fontFamily: fonts.bold, fontSize: 15, marginTop: 2 },
  plinth: { marginHorizontal: 10, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, opacity: 0.35 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card,
    borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent',
  },
  me: { borderColor: colors.accent, backgroundColor: '#1A2012' },
  rank: { width: 24, textAlign: 'center', color: colors.textMuted, fontFamily: fonts.bold, fontSize: 14 },
  thumb: { width: 52, height: 30 },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  car: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  time: { color: colors.text, fontFamily: fonts.semibold, fontSize: 16 },
});
