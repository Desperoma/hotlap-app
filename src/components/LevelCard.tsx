import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DriverXp } from '@/features/levels/api';
import { RANK_IMAGES } from '@/features/levels/images';
import { levelFromXp } from '@/features/levels/levels';
import { colors, fonts, radius, spacing } from '@/theme';

const n = (v: number) => v.toLocaleString('en-US');

/**
 * Carte niveau du profil (maquette « Driver profile ») : visuel du rang, niveau, barre d'XP,
 * puis distance totale, drives, circuits visités et succès. Ouvre l'écran des rangs.
 */
export function LevelCard({ data, userId }: { data: DriverXp; userId?: string }) {
  const info = levelFromXp(data.xp);
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: info.progress, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fill, info.progress]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable style={styles.card} onPress={() => router.push({ pathname: '/ranks', params: userId ? { user: userId } : {} })}
        accessibilityRole="button" accessibilityLabel={`${info.rank.name}, level ${info.level}, ${n(info.into)} of ${n(info.span)} XP`}>
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
        <Tile icon="road-variant" value={`${n(Math.round(data.distanceM / 1000))} km`} label="Total distance" />
        <Tile icon="map-marker-path" value={n(data.driveCount)} label="Drives" />
        <Tile icon="flag-checkered" value={n(data.tracksVisited)} label="Tracks visited" />
        <Tile icon="trophy-outline" value={n(data.achievements)} label="Achievements" />
      </View>
    </View>
  );
}

function Tile({ icon, value, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
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
  tileLabel: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
});
