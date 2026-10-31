import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ClassBadge } from '@/components/ClassBadge';
import { carImageFor } from '@/features/garage/carImage';
import { hpiFor } from '@/features/garage/hpi';
import type { VehicleStats } from '@/features/garage/stats';
import { kwToHp } from '@/features/garage/units';
import { colors, fonts, spacing } from '@/theme';

import { t } from '@/i18n';
type Car = {
  make: string; model: string; year: number | null; color?: string | null; nickname?: string | null;
  power_kw?: number | null; weight_kg?: number | null; is_primary?: boolean;
};
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const H = 240;

/**
 * Voiture du garage en grand, sans cadre (la photo se fond dans le fond de page), avec ses infos
 * posées par-dessus l'image. `flip` met la photo à droite : le garage alterne photo | infos puis infos | photo. La vitesse max n'apparaît
 * que si la voiture a déjà fait un drive (visible par tous depuis 0023, sur les drives qu'on peut voir).
 */
export function GarageCarCard({ car, stats, flip = false, onPress, index = 0 }: {
  car: Car;
  stats?: VehicleStats | null;
  flip?: boolean;
  onPress?: () => void;
  /** Rang dans la liste : décale l'animation d'entrée */
  index?: number;
}) {
  const { width: W } = useWindowDimensions();
  const photoW = W * 0.72; // la photo occupe ~3/4 de la largeur…
  const infoW = W * 0.5;   // …et les infos la chevauchent d'environ un quart
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
  const hpi = hpiFor({ powerKw: car.power_kw, weightKg: car.weight_kg, best0to100Ms: stats?.best0to100Ms });
  const rows: { key: string; icon: Icon; label: string; value: string; unit?: string; accent?: boolean }[] = [];
  // Toujours : vitesse max (— tant que la voiture n'a pas roulé), puissance, poids.
  const vmax = stats && stats.driveCount > 0 && stats.maxSpeedKmh != null && stats.maxSpeedKmh > 0 ? stats.maxSpeedKmh : null;
  rows.push({ key: 'vmax', icon: 'speedometer', get label() { return t('Top speed'); }, value: vmax != null ? String(Math.round(vmax)) : '—', unit: vmax != null ? 'km/h' : undefined, accent: vmax != null });
  rows.push({ key: 'hp', icon: 'flash', get label() { return t('Power'); }, value: car.power_kw ? String(kwToHp(car.power_kw)) : '—', unit: car.power_kw ? 'hp' : undefined });
  rows.push({ key: 'kg', icon: 'weight', get label() { return t('Weight'); }, value: car.weight_kg ? car.weight_kg.toLocaleString('en-US') : '—', unit: car.weight_kg ? 'kg' : undefined });
  if (stats && stats.driveCount > 0) {
    rows.push({ key: 'drives', icon: 'map-marker-distance', label: `${stats.driveCount} ${stats.driveCount === 1 ? 'drive' : 'drives'}`, value: (stats.distanceM / 1000).toFixed(stats.distanceM < 10_000 ? 1 : 0), unit: 'km' });
  }

  const slide = appear.interpolate({ inputRange: [0, 1], outputRange: [flip ? 40 : -40, 0] });
  const slideInfo = appear.interpolate({ inputRange: [0, 1], outputRange: [flip ? -24 : 24, 0] });

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${car.make} ${car.model}`}
      style={({ pressed }) => [styles.root, { width: W, height: H }, pressed && { opacity: 0.85 }]}>
      <Animated.View pointerEvents="none" style={[styles.photo, { width: photoW, height: H }, flip ? { right: 0 } : { left: 0 },
        { opacity: appear, transform: [{ translateX: slide }] }]}>
        <Image source={source} resizeMode="cover" style={{ width: photoW, height: H }} accessibilityIgnoresInvertColors />
        {/* Fondus vers le fond de page : bord intérieur (large), haut et bas (fins) — la voiture n'a pas de cadre */}
        <LinearGradient pointerEvents="none" colors={[TRANSPARENT, colors.bg]} start={{ x: flip ? 1 : 0, y: 0.5 }} end={{ x: flip ? 0 : 1, y: 0.5 }}
          locations={[0.35, 0.95]} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={[colors.bg, TRANSPARENT]} style={[styles.fadeCol, { top: 0 }]} />
        <LinearGradient pointerEvents="none" colors={[TRANSPARENT, colors.bg]} style={[styles.fadeCol, { bottom: 0 }]} />
        <LinearGradient pointerEvents="none" colors={[colors.bg, TRANSPARENT]} start={{ x: flip ? 1 : 0, y: 0.5 }} end={{ x: flip ? 0.85 : 0.15, y: 0.5 }}
          style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View style={[styles.info, { width: infoW }, flip ? { left: spacing.lg } : { right: spacing.lg },
        { opacity: appear, transform: [{ translateX: slideInfo }] }]}>
        {car.is_primary && (
          <View style={styles.badge}>
            <Ionicons name="star" size={10} color={colors.accent} />
            <Text style={styles.badgeText}>{t('FAVORITE')}</Text>
          </View>
        )}
        <View style={styles.makeRow}>
          {hpi && <ClassBadge cls={hpi.cls.key} hpi={hpi.hpi} size="sm" />}
          <Text style={[styles.make, styles.shadow, { flexShrink: 1 }]} numberOfLines={1}>{car.make}</Text>
        </View>
        <Text style={[styles.model, styles.shadow]} numberOfLines={2} adjustsFontSizeToFit>{car.model}</Text>
        {[car.nickname, car.year].some(Boolean) ? (
          <Text style={[styles.sub, styles.shadow]} numberOfLines={1}>{[car.nickname, car.year].filter(Boolean).join(' · ')}</Text>
        ) : null}
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
          {onPress && (!car.power_kw || !car.weight_kg) && (
            <Text style={[styles.hint, styles.shadow]}>{t('Puissance et poids : « Edit details »')}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const glass = 'rgba(14,16,14,0.72)';
const TRANSPARENT = 'rgba(14,16,14,0)'; // colors.bg transparent (évite le gris d'un dégradé vers « transparent »)

const styles = StyleSheet.create({
  // Pleine largeur de l'écran : la photo touche le bord, sans carte autour.
  root: { marginHorizontal: -spacing.lg },
  photo: { position: 'absolute', top: 0, overflow: 'hidden' },
  fadeCol: { position: 'absolute', left: 0, right: 0, height: 36 },
  hint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  info: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', gap: 2 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  badgeText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1 },
  makeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  make: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
  model: { color: colors.text, fontFamily: fonts.medium, fontSize: 26, lineHeight: 30 },
  sub: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  stats: { gap: 5, marginTop: spacing.sm },
  stat: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: glass, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statAccent: { borderColor: colors.accent },
  statLabel: { flex: 1, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  statValue: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  statUnit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
});
