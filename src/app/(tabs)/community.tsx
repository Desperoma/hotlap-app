import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriveCard } from '@/components/DriveCard';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { feedFollowing, feedNearby, feedWorld } from '@/features/social/api';
import type { DriveFeedItem } from '@/lib/database.types';
import { colors, fonts, spacing, type } from '@/theme';

type Filter = 'following' | 'local' | 'world' | 'clubs';

const EMPTY: Record<Filter, string> = {
  following: 'Nothing here yet. Follow drivers or share a drive with your crew.',
  local: 'No public drives near you yet.',
  world: 'No public drives yet. Be the first to share one.',
  clubs: 'Clubs are coming soon.',
};

/** Fil social : Following (comptes suivis + moi), Local Discover (50 km), World (tous les drives publics). */
export default function CommunityScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [filter, setFilter] = useState<Filter>('following');
  const [items, setItems] = useState<DriveFeedItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (f: Filter, before?: string): Promise<DriveFeedItem[]> => {
    if (!me || f === 'clubs') return [];
    if (f === 'following') return feedFollowing(me, before);
    if (f === 'world') return feedWorld(me, before);
    // Local : position approximative suffisante, et pas de pagination (rayon fixe).
    if (before) return [];
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Location is off: enable it to see drives near you.');
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    return feedNearby(me, pos.coords.latitude, pos.coords.longitude);
  }, [me]);

  const load = useCallback(async (f: Filter) => {
    setError(null);
    setDone(false);
    try {
      const page = await fetchPage(f);
      setItems(page);
      setDone(page.length < 20);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchPage]);

  useFocusEffect(useCallback(() => { load(filter); }, [load, filter]));

  const choose = (f: Filter) => {
    if (f === filter) return;
    setItems(null);
    setFilter(f);
  };

  const refresh = async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  };

  const more = async () => {
    if (done || loadingMore || !items?.length) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(filter, items[items.length - 1].created_at);
      setItems([...items, ...page.filter((p) => !items.some((i) => i.id === p.id))]);
      setDone(page.length < 20);
    } catch {
      setDone(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={items ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        onEndReached={more}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
            <View style={styles.header}>
              <Text style={styles.title}>Community</Text>
              <Ionicons name="search" size={22} color={colors.text} />
            </View>
            <View style={styles.filters}>
              <Chip label="Following" active={filter === 'following'} onPress={() => choose('following')} />
              <Chip label="Local Discover" active={filter === 'local'} onPress={() => choose('local')} />
              <Chip label="World" active={filter === 'world'} onPress={() => choose('world')} />
              <Chip label="Clubs" active={filter === 'clubs'} onPress={() => choose('clubs')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          ) : (
            <Text style={styles.empty}>{error ?? EMPTY[filter]}</Text>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} /> : null}
        renderItem={({ item }) => (
          <DriveCard drive={item} onBlocked={(uid) => setItems((list) => list?.filter((d) => d.owner_id !== uid) ?? null)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.h1, color: colors.text, fontSize: 28 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center', marginTop: spacing.xxl, lineHeight: 20 },
});
