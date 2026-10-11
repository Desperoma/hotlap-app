import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriveCard } from '@/components/DriveCard';
import { Chip } from '@/components/ui';
import { FEED } from '@/data/mock';
import { colors, spacing, type } from '@/theme';

type Filter = 'following' | 'local' | 'clubs';

/**
 * Fil social. MVP : Following en ordre chronologique.
 * TODO phase 4 : requête Supabase (drives des comptes suivis, visibility in followers/public).
 */
export default function CommunityScreen() {
  const [filter, setFilter] = useState<Filter>('following');
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={filter === 'following' ? FEED : []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
            <View style={styles.header}>
              <Text style={styles.title}>Community</Text>
              <Ionicons name="search" size={22} color={colors.text} />
            </View>
            <View style={styles.filters}>
              <Chip label="Following" active={filter === 'following'} onPress={() => setFilter('following')} />
              <Chip label="Local Discover" active={filter === 'local'} onPress={() => setFilter('local')} />
              <Chip label="Clubs" active={filter === 'clubs'} onPress={() => setFilter('clubs')} />
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Bientôt disponible (V1).</Text>}
        renderItem={({ item }) => <DriveCard drive={item} />}
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
  filters: { flexDirection: 'row', gap: spacing.sm },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
