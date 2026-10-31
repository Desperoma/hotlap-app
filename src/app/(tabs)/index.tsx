import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { AdSlot, CommunityPostCard } from '@/components/CommunityPostCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLevels } from '@/features/levels/useLevels';
import { formatKm } from '@/features/recording/geo';
import {
  communityFeed, communityTrending, FEED_CATEGORIES, PAGE,
  type CommunityPost, type FeedCategory, type FeedSort, type FeedSource, type Trending,
} from '@/features/social/community';
import { formatSprint } from '@/features/sprint/sprint';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Une publicité tous les AD_EVERY posts. */
const AD_EVERY = 5;
type Item = { type: 'post'; post: CommunityPost } | { type: 'ad'; key: string };

const SORTS: { key: FeedSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'latest', get label() { return t('Latest'); }, icon: 'time-outline' },
  { key: 'top', get label() { return t('Top'); }, icon: 'flame-outline' },
  { key: 'nearby', get label() { return t('Nearby'); }, icon: 'navigate-outline' },
];
const SOURCES: { key: FeedSource; label: string; text: string }[] = [
  { key: 'world', get label() { return t('Everyone'); }, get text() { return t('Public drives from all drivers'); } },
  { key: 'following', get label() { return t('Following'); }, get text() { return t('You and the drivers you follow'); } },
  { key: 'crews', get label() { return t('Crews'); }, get text() { return t('Members of your crews'); } },
];

/**
 * Community : tendances en haut, catégories (route, sprints, tours), tri Latest / Top / Nearby,
 * filtre de source (tout le monde, abonnements, crews). Une pub tous les 5 posts.
 */
export default function CommunityScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [category, setCategory] = useState<FeedCategory>('all');
  const [sort, setSort] = useState<FeedSort>('latest');
  const [source, setSource] = useState<FeedSource>('world');
  const [sheet, setSheet] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [trending, setTrending] = useState<Trending[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pos = useRef<{ lat: number; lng: number } | null>(null);
  const req = useRef(0);

  const query = useCallback(async (offset: number) => {
    if (!me) return [];
    let lat: number | undefined, lng: number | undefined;
    if (sort === 'nearby') {
      if (!pos.current) {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') throw new Error(t('Location is off: enable it to see drives near you.'));
        const p = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
        pos.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      }
      ({ lat, lng } = pos.current);
    }
    return communityFeed(me, { source, category, sort, lat, lng }, offset);
  }, [me, source, category, sort]);

  const load = useCallback(async () => {
    const id = ++req.current;
    setError(null);
    setDone(false);
    try {
      const page = await query(0);
      if (id !== req.current) return;
      setPosts(page);
      setDone(page.length < PAGE);
    } catch (e) {
      if (id !== req.current) return;
      setPosts([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [query]);

  useFocusEffect(useCallback(() => {
    load();
    communityTrending().then(setTrending).catch(() => {});
  }, [load]));

  const pick = <T,>(set: (v: T) => void, cur: T) => (v: T) => {
    if (v === cur) return;
    setPosts(null);
    set(v);
  };

  const refresh = async () => {
    setRefreshing(true);
    pos.current = null;
    await Promise.all([load(), communityTrending().then(setTrending).catch(() => {})]);
    setRefreshing(false);
  };

  const more = async () => {
    if (done || loadingMore || !posts?.length) return;
    setLoadingMore(true);
    const id = req.current;
    try {
      const page = await query(posts.length);
      if (id !== req.current) return;
      setPosts((list) => [...(list ?? []), ...page.filter((p) => !(list ?? []).some((i) => i.id === p.id))]);
      setDone(page.length < PAGE);
    } catch {
      setDone(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const levels = useLevels((posts ?? []).map((p) => p.owner_id));
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    (posts ?? []).forEach((p, i) => {
      out.push({ type: 'post', post: p });
      if ((i + 1) % AD_EVERY === 0) out.push({ type: 'ad', key: `ad-${i}` });
    });
    return out;
  }, [posts]);

  const empty = error ?? (
    sort === 'nearby' ? t('No public drives within 50 km yet.')
      : source === 'following' ? t('Nothing here yet. Follow drivers to see their drives here.')
      : source === 'crews' ? t('No drives from your crews yet. Join a crew from your garage.')
      : category === 'all' ? t('No public drives yet. Be the first to share one.') : t('No drives in this category yet.')
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.type === 'post' ? it.post.id : it.key)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        onEndReached={more}
        onEndReachedThreshold={0.5}
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Image source={require('../../../assets/logo/logo-mark.png')} style={{ width: 52, height: 19 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                <Text style={styles.title}>{t('Community')}</Text>
              </View>
              <Pressable onPress={() => router.push('/search')} hitSlop={12} accessibilityLabel={t('Search')}>
                <Ionicons name="search" size={22} color={colors.text} />
              </Pressable>
            </View>

            <TrendingRow items={trending} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}
              style={{ marginHorizontal: -spacing.lg }}>
              <View style={{ width: spacing.lg - spacing.sm }} />
              {FEED_CATEGORIES.map((c) => (
                <Pressable key={c.key} onPress={() => pick(setCategory, category)(c.key)} accessibilityState={{ selected: c.key === category }}
                  style={[styles.cat, c.key === category && styles.catActive]}>
                  <Text style={[styles.catText, c.key === category && styles.catTextActive]}>{c.label}</Text>
                </Pressable>
              ))}
              <View style={{ width: spacing.lg - spacing.sm }} />
            </ScrollView>

            <View style={styles.sortRow}>
              <View style={styles.sorts}>
                {SORTS.map((s) => {
                  const active = s.key === sort;
                  return (
                    <Pressable key={s.key} onPress={() => pick(setSort, sort)(s.key)} style={[styles.sort, active && styles.sortActive]}
                      accessibilityState={{ selected: active }}>
                      <Ionicons name={s.icon} size={14} color={active ? colors.text : colors.textFaint} />
                      <Text style={[styles.sortText, active && styles.sortTextActive]}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => setSheet(true)} style={[styles.filter, source !== 'world' && styles.filterOn]}
                accessibilityLabel={t('Filter by source')} hitSlop={6}>
                <Ionicons name="options-outline" size={18} color={source !== 'world' ? colors.accentText : colors.text} />
              </Pressable>
            </View>
            {source !== 'world' && (
              <Text style={styles.sourceNote}>{t('Showing:')}{' '}{SOURCES.find((s) => s.key === source)?.label}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          posts === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
            : <Text style={styles.empty}>{empty}</Text>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} /> : undefined}
        renderItem={({ item }) => item.type === 'ad' ? <AdSlot /> : (
          <CommunityPostCard post={item.post} level={levels.get(item.post.owner_id)}
            onBlocked={(uid) => setPosts((list) => list?.filter((d) => d.owner_id !== uid) ?? null)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
      />

      <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('Show drives from')}</Text>
            {SOURCES.map((s) => (
              <Pressable key={s.key} style={styles.sheetRow} onPress={() => { pick(setSource, source)(s.key); setSheet(false); }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetLabel}>{s.label}</Text>
                  <Text style={styles.sheetText}>{s.text}</Text>
                </View>
                <Ionicons name={s.key === source ? 'radio-button-on' : 'radio-button-off'} size={20}
                  color={s.key === source ? colors.accent : colors.textFaint} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/** Bandeau des tendances : meilleurs temps et route de la semaine, puis les crews. */
function TrendingRow({ items }: { items: Trending[] }) {
  const by = (k: Trending['key']) => items.find((t) => t.key === k);
  const cards = [
    { key: 'sprint_0_100', title: t('0-100 TOP RUNS'), icon: 'speedometer' as const, t: by('sprint_0_100'),
      value: (t: Trending) => formatSprint(t.timeMs ?? 0), go: () => router.push({ pathname: '/leaderboard', params: { kind: '0_100' } }) },
    { key: 'sprint_500m', title: t('500 M FASTEST'), icon: 'flash' as const, t: by('sprint_500m'),
      value: (t: Trending) => formatSprint(t.timeMs ?? 0), go: () => router.push({ pathname: '/leaderboard', params: { kind: '500m' } }) },
    { key: 'route_week', title: t('BEST ROUTE THIS WEEK'), icon: 'map' as const, t: by('route_week'),
      value: (t: Trending) => `${formatKm(t.distanceM ?? 0)} km`, go: (t?: Trending) => t && router.push(`/drive/${t.driveId}`) },
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.overline}>{t('TRENDING')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
        {cards.map((c) => (
          <Pressable key={c.key} style={styles.trend} onPress={() => c.go(c.t)}>
            <View style={styles.trendHead}>
              <Ionicons name={c.icon} size={14} color={colors.accent} />
              <Text style={styles.trendTitle} numberOfLines={1}>{c.title}</Text>
            </View>
            {c.t ? (
              <>
                <Text style={styles.trendValue}>{c.value(c.t)}</Text>
                <View style={styles.trendWho}>
                  <Avatar url={c.t.avatarUrl} name={c.t.name} size={20} />
                  <Text style={styles.trendName} numberOfLines={1}>{c.t.name}{c.t.car ? ` · ${c.t.car}` : ''}</Text>
                </View>
                {!c.t.thisWeek && <Text style={styles.trendNote}>{t('All-time')}</Text>}
              </>
            ) : (
              <Text style={styles.trendEmpty}>{t('Nobody yet. Be the first.')}</Text>
            )}
          </Pressable>
        ))}
        <Pressable style={styles.trend} onPress={() => router.push('/crews')}>
          <View style={styles.trendHead}>
            <Ionicons name="people" size={14} color={colors.accent} />
            <Text style={styles.trendTitle}>{t('CREWS')}</Text>
          </View>
          <Text style={[styles.trendValue, { fontSize: 18 }]}>{t('Drive together')}</Text>
          <Text style={styles.trendEmpty}>{t('Find or start a crew')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: 140 },
  // paddingRight : place pour la cloche (NotificationBell)
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 52 },
  title: { ...type.h1, color: colors.text, fontSize: 28 },
  overline: { ...type.overline, color: colors.accent },
  trend: {
    width: 168, minHeight: 118, borderRadius: radius.lg, padding: 12, gap: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  trendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendTitle: { flex: 1, color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.8 },
  trendValue: { ...type.stat, color: colors.text, fontSize: 24, lineHeight: 30 },
  trendWho: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendName: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  trendNote: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10 },
  trendEmpty: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12 },
  cat: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  catActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catText: { color: colors.text, fontFamily: fonts.medium, fontSize: 13 },
  catTextActive: { color: colors.accentText },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sorts: {
    flex: 1, flexDirection: 'row', backgroundColor: colors.input, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 4,
  },
  sort: { flex: 1, height: 36, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  sortActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  sortText: { color: colors.textFaint, fontFamily: fonts.medium, fontSize: 13 },
  sortTextActive: { color: colors.text },
  filter: {
    width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  filterOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  sourceNote: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, marginTop: -spacing.sm },
  empty: { color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center', marginTop: spacing.xxl, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm,
  },
  sheetTitle: { ...type.h2, color: colors.text, fontSize: 17, marginBottom: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  sheetLabel: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  sheetText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
