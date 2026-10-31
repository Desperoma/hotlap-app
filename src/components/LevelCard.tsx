import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DriverXp } from '@/features/levels/api';
import { RANK_IMAGES } from '@/features/levels/images';
import { levelFromXp } from '@/features/levels/levels';
import { colors, fonts, radius, spacing } from '@/theme';

import {  t, locale  } from '@/i18n';
const n = (v: number) => v.toLocaleString(locale());

/**
 * Carte niveau du profil (maquette « Driver profile ») : visuel du rang, niveau, barre d'XP,
 * puis distance totale, drives, circuits visités et succès. Ouvre l'écran des rangs.
 */
export function LevelCard({ data, userId, toCollect = 0 }: { data: DriverXp; userId?: string; toCollect?: number }) {
  const info = levelFromXp(data.xp);
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: info.progress, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fill, info.progress]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable style={styles.card} onPress={() => router.push({ pathname: '/ranks', params: userId ? { user: userId } : {} })}
        accessibilityRole="button" accessibilityLabel={t('{0}, level {1}, {2} of {3} XP', info.rank.name, info.level, n(info.into), n(info.span))}>
        <Image source={RANK_IMAGES[info.rank.key]} style={styles.wheel} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.rank, { color: info.rank.color }]}>{info.rank.name.toUpperCase()}</Text>
          <Text style={styles.level}>
            <Text style={{ color: colors.accent }}>LVL {info.level}</Text>
            <Text style={styles.xp}>  ·  {n(info.into)} / {n(info.span)} XP</Text>
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width }]} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      <View style={styles.tiles}>
        <Tile icon="road-variant" value={`${n(Math.round(data.distanceM / 1000))} km`} label={t('Total distance')} />
        <Tile icon="map-marker-path" value={n(data.driveCount)} label={t('Drives')} />
        <Tile icon="flag-checkered" value={n(data.tracksVisited)} label={t('Tracks visited')} />
        <Tile icon="trophy-outline" value={n(data.achievements)} label={t('Achievements')} badge={toCollect}
          onPress={userId ? undefined : () => router.push('/achievements')} />
      </View>
    </View>
  );
}

function Tile({ icon, value, label, badge = 0, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string; label: string; badge?: number; onPress?: () => void;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={badge ? t('{0}, {1} to collect', label, badge) : label}>
      <View>
        <MaterialCommunityIcons name={icon} size={18} color={onPress ? colors.accent : colors.textMuted} />
        {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>}
      </View>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  wheel: { width: 64, height: 64 },
  rank: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1 },
  level: { fontFamily: fonts.bold, fontSize: 13 },
  xp: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bgElevated, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1, alignItems: 'center', gap: 3, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: 4,
  },
  tileValue: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  badge: {
    position: 'absolute', top: -6, right: -12, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: fonts.bold, fontSize: 9 },
  tileLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
});
