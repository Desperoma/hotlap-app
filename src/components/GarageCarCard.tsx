import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { carImageFor } from '@/features/garage/carImage';
import type { VehicleStats } from '@/features/garage/stats';
import { kwToHp } from '@/features/garage/units';
import { colors, fonts, spacing } from '@/theme';

type Car = {
  make: string; model: string; year: number | null; color?: string | null; nickname?: string | null;
  power_kw?: number | null; weight_kg?: number | null; is_primary?: boolean;
};
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const H = 210;

/**
 * Voiture du garage en grand, avec ses infos à côté (comme la vitrine d'un drive). `flip` met la
 * photo à droite : le garage alterne photo | infos puis infos | photo. La vitesse max n'apparaît
 * que si la voiture a déjà fait un drive (et uniquement pour son propriétaire : `stats` absent sinon).
 */
export function GarageCarCard({ car, stats, flip = false, onPress, index = 0 }: {
  car: Car;
  stats?: VehicleStats | null;
  flip?: boolean;
  onPress?: () => void;
  /** Rang dans la liste : décale l'animation d'entrée */
  index?: number;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) return appear.setValue(1);
      Animated.timing(appear, { toValue: 1, duration: 450, delay: Math.min(index, 5) * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    return () => { live = false; };
  }, [appear, index]);

  const { source } = carImageFor(car);
  const rows: { key: string; icon: Icon; label: string; value: string; unit?: string; accent?: boolean }[] = [];
  if (stats && stats.driveCount > 0 && stats.maxSpeedKmh != null && stats.maxSpeedKmh > 0) {
    rows.push({ key: 'vmax', icon: 'speedometer', label: 'Top speed', value: String(Math.round(stats.maxSpeedKmh)), unit: 'km/h', accent: true });
  }
  if (car.power_kw) rows.push({ key: 'hp', icon: 'flash', label: 'Power', value: String(kwToHp(car.power_kw)), unit: 'hp' });
  if (car.weight_kg) rows.push({ key: 'kg', icon: 'weight', label: 'Weight', value: car.weight_kg.toLocaleString('en-US'), unit: 'kg' });
  if (stats && stats.driveCount > 0) {
    rows.push({ key: 'drives', icon: 'map-marker-distance', label: `${stats.driveCount} ${stats.driveCount === 1 ? 'drive' : 'drives'}`, value: (stats.distanceM / 1000).toFixed(stats.distanceM < 10_000 ? 1 : 0), unit: 'km' });
  }
  if (car.power_kw && car.weight_kg && rows.length < 4) {
    rows.push({ key: 'ratio', icon: 'scale-balance', label: 'Weight / power', value: (car.weight_kg / kwToHp(car.power_kw)).toFixed(1), unit: 'kg/hp' });
  }

  const slide = appear.interpolate({ inputRange: [0, 1], outputRange: [flip ? 30 : -30, 0] });
  const slideInfo = appear.interpolate({ inputRange: [0, 1], outputRange: [flip ? -24 : 24, 0] });

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${car.make} ${car.model}`}
      style={({ pressed }) => [styles.root, car.is_primary && styles.favorite, pressed && { opacity: 0.85 }]}>
      <View style={[styles.row, flip && { flexDirection: 'row-reverse' }]}>
        <Animated.View style={[styles.photo, { opacity: appear, transform: [{ translateX: slide }] }]}>
          <Image source={source} resizeMode="contain" style={styles.img} accessibilityIgnoresInvertColors />
        </Animated.View>

        <Animated.View style={[styles.info, { opacity: appear, transform: [{ translateX: slideInfo }] }]}>
          {car.is_primary && (
            <View style={styles.badge}>
              <Ionicons name="star" size={10} color={colors.accent} />
              <Text style={styles.badgeText}>FAVORITE</Text>
            </View>
          )}
          <Text style={styles.make} numberOfLines={1}>{car.make}</Text>
          <Text style={styles.model} numberOfLines={2} adjustsFontSizeToFit>{car.model}</Text>
          <Text style={styles.sub} numberOfLines={1}>{[car.nickname, car.year].filter(Boolean).join(' · ') || ' '}</Text>
          <View style={styles.stats}>
            {rows.slice(0, 4).map((r) => (
              <View key={r.key} style={[styles.stat, r.accent && styles.statAccent]}>
                <MaterialCommunityIcons name={r.icon} size={14} color={r.accent ? colors.accent : colors.textMuted} />
                <Text style={styles.statLabel} numberOfLines={1}>{r.label}</Text>
                <Text style={[styles.statValue, r.accent && { color: colors.accent }]} numberOfLines={1}>
                  {r.value}{r.unit ? <Text style={styles.statUnit}> {r.unit}</Text> : null}
                </Text>
              </View>
            ))}
            {rows.length === 0 && <Text style={styles.sub}>Ajoute puissance et poids dans « Edit details ».</Text>}
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const glass = 'rgba(27,30,27,0.78)';

const styles = StyleSheet.create({
  root: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  favorite: { borderColor: colors.accent },
  row: { flexDirection: 'row', minHeight: H },
  photo: { flex: 1.1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  img: { width: '100%', height: H - 20 },
  info: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 2, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  badgeText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1 },
  make: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 },
  model: { color: colors.text, fontFamily: fonts.medium, fontSize: 20, lineHeight: 24 },
  sub: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  stats: { gap: 5, marginTop: spacing.sm },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: glass, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  statAccent: { borderWidth: 1, borderColor: colors.accent },
  statLabel: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  statValue: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  statUnit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
});
