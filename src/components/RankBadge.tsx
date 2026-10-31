import { Image, StyleSheet, Text, View } from 'react-native';

import { RANK_IMAGES } from '@/features/levels/images';
import type { LevelInfo } from '@/features/levels/levels';
import { fonts } from '@/theme';

/**
 * Badge de rang : roue du rang, niveau, et en option le nom du rang. `sm` pour les lignes de liste,
 * `md` pour les en-têtes de post et de drive.
 */
export function RankBadge({ info, size = 'sm', showName }: { info: LevelInfo | undefined; size?: 'sm' | 'md'; showName?: boolean }) {
  if (!info) return null;
  const s = size === 'sm' ? 16 : 22;
  return (
    <View style={[styles.row, { borderColor: `${info.rank.color}66` }]} accessibilityLabel={`${info.rank.name}, level ${info.level}`}>
      <Image source={RANK_IMAGES[info.rank.key]} style={{ width: s, height: s }} />
      <Text style={[styles.lvl, { color: info.rank.color, fontSize: size === 'sm' ? 10 : 12 }]}>
        {showName ? `${info.rank.name.toUpperCase()} · ` : ''}LVL {info.level}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingLeft: 2, paddingRight: 7, paddingVertical: 1, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.25)',
  },
  lvl: { fontFamily: fonts.bold, letterSpacing: 0.4 },
});
