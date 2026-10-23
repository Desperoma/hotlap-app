import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, useWindowDimensions, View,
  type ImageSourcePropType,
} from 'react-native';

import { placeholderOf, type ShowcaseStat } from '@/features/drives/showcase';
import { carImageFor } from '@/features/garage/carImage';
import { colors, fonts, spacing } from '@/theme';


const CARD_H = 100;
const GAP = 6;
const VISIBLE = 3;
const HERO_H = VISIBLE * CARD_H + (VISIBLE - 1) * GAP;
const CYCLE_MS = 2200;
const PAUSE_AFTER_TOUCH_MS = 8000;

/** Chronologie de la maquette (secondes) : voiture 0-0,6 · infos 0,6-1,1 · stats 1,1-1,6 · final ~2,0. */
const T = { car: [0, 600], info: [600, 500], stats: 1100, statStagger: 130, statDur: 360, values: 1600 } as const;

type Props = {
  make: string;
  model: string;
  category?: string | null;
  stats: ShowcaseStat[];
  /** Carte du bas (« SPRINT / 1/4 Mile » sur la maquette) */
  mode: { title: string; subtitle?: string | null };
  /** Bouton « + » à côté du modèle (changer de véhicule). Absent = pas de bouton. */
  onPressPlus?: () => void;
  /** Boutons ronds de la barre du haut */
  topLeft?: ReactNode;
  topRight?: ReactNode;
  /** Couleur du véhicule : choisit la bonne image quand le modèle en a plusieurs */
  color?: string | null;
  /** Image imposée ; sinon celle du modèle (ou la voiture par défaut) */
  carImage?: ImageSourcePropType;
};

/**
 * Vitrine d'un drive (récap et détail) : la voiture apparaît, puis marque / modèle / catégorie,
 * puis les cartes de stats glissent depuis la droite une à une. Ensuite, la carte active défile
 * de haut en bas (3 cartes visibles) ; un toucher sur une carte la met en avant.
 */
export function DriveShowcase({ make, model, category, stats, mode, onPressPlus, topLeft, topRight, color, carImage }: Props) {
  const { width: W } = useWindowDimensions();
  const car = useRef(new Animated.Value(0)).current;
  const info = useRef(new Animated.Value(0)).current;
  const values = useRef(new Animated.Value(0)).current;
  const cards = useMemo(() => stats.map(() => new Animated.Value(0)), [stats.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const scroll = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState(0);
  const [cycling, setCycling] = useState(false);
  const touchedAt = useRef(0);

  // Entrée en 4 temps (ou état final direct si « Réduire les animations » est activé).
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      setRevealed(true);
      Animated.timing(values, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setTimeout(() => !cancelled && setCycling(true), 1200);
    };
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        [car, info, values, ...cards].forEach((v) => v.setValue(1));
        setRevealed(true);
        return;
      }
      const ease = Easing.out(Easing.cubic);
      Animated.parallel([
        Animated.timing(car, { toValue: 1, duration: T.car[1], easing: ease, useNativeDriver: true }),
        Animated.timing(info, { toValue: 1, delay: T.info[0], duration: T.info[1], easing: ease, useNativeDriver: true }),
        ...cards.map((v, i) =>
          Animated.timing(v, {
            toValue: 1,
            delay: T.stats + Math.min(i, VISIBLE - 1) * T.statStagger,
            duration: T.statDur,
            easing: ease,
            useNativeDriver: true,
          })),
      ]).start();
      setTimeout(finish, T.values);
    });
    return () => {
      cancelled = true;
    };
  }, [car, info, values, cards]);

  // Défilement automatique de la carte active.
  useEffect(() => {
    if (!cycling || stats.length < 2) return;
    const id = setInterval(() => {
      if (Date.now() - touchedAt.current < PAUSE_AFTER_TOUCH_MS) return;
      setActive((a) => (a + 1) % stats.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [cycling, stats.length]);

  // Fenêtre de 3 cartes : la carte active reste au milieu dès que possible.
  const windowStart = Math.max(0, Math.min(active - 1, stats.length - VISIBLE));
  useEffect(() => {
    Animated.timing(scroll, {
      toValue: -windowStart * (CARD_H + GAP),
      duration: 420,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [windowStart, scroll]);

  const pick = (i: number) => {
    touchedAt.current = Date.now();
    setActive(i);
  };

  // Voiture : 1,15 × la largeur de l'écran, l'avant vers 62 % de la largeur, l'arrière coupé à gauche.
  // Photos de face / trois-quarts : la zone à gauche de la colonne de stats, image entière.
  const imgW = W - 128 - spacing.md * 3;
  const imgH = HERO_H;
  const source = useMemo(() => carImage ?? carImageFor({ make, model, color }).source, [carImage, make, model, color]);
  const fadeUp = (v: Animated.Value, dy: number) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }],
  });

  return (
    <View>
      {(topLeft || topRight) && (
        <View style={styles.topBar}>
          <View>{topLeft}</View>
          <View>{topRight}</View>
        </View>
      )}

      <Animated.View style={[styles.header, fadeUp(info, 8)]}>
        <Text style={styles.make} numberOfLines={1}>{make}</Text>
        <View style={styles.modelRow}>
          <Text style={styles.model} numberOfLines={1} adjustsFontSizeToFit>{model}</Text>
          {onPressPlus && (
            <Pressable onPress={onPressPlus} style={styles.plus} hitSlop={10} accessibilityLabel="Change vehicle">
              <Ionicons name="add" size={18} color={colors.text} />
            </Pressable>
          )}
        </View>
        {category ? <Text style={styles.category}>{category}</Text> : null}
      </Animated.View>

      <View style={[styles.hero, { height: HERO_H }]}>
        <Animated.Image
          source={source}
          resizeMode="contain"
          style={[
            styles.car,
            {
              width: imgW,
              height: imgH,
              left: spacing.md,
              top: 0,
              opacity: car,
              transform: [{ translateX: car.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            },
          ]}
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${make} ${model}`}
        />

        <View style={[styles.column, { height: HERO_H }]}>
          <Animated.View style={{ transform: [{ translateY: scroll }] }}>
            {stats.map((s, i) => (
              <StatCard
                key={s.key}
                stat={s}
                active={revealed && i === active}
                revealed={revealed}
                appear={cards[i]}
                values={values}
                onPress={() => pick(i)}
              />
            ))}
          </Animated.View>
        </View>
      </View>

      <Animated.View style={[styles.mode, { opacity: info }]}>
        <Text style={styles.modeTitle}>{mode.title.toUpperCase()}</Text>
        {mode.subtitle ? <Text style={styles.modeSub} numberOfLines={1}>{mode.subtitle}</Text> : null}
      </Animated.View>
    </View>
  );
}

function StatCard({ stat, active, revealed, appear, values, onPress }: {
  stat: ShowcaseStat;
  active: boolean;
  revealed: boolean;
  appear: Animated.Value;
  values: Animated.Value;
  onPress: () => void;
}) {
  const focus = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(focus, { toValue: active ? 1 : 0, duration: 280, useNativeDriver: true }).start();
  }, [active, focus]);

  const fg = active ? colors.text : colors.textMuted;
  return (
    <Animated.View
      style={{
        height: CARD_H,
        marginBottom: GAP,
        opacity: appear,
        transform: [
          { translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [72, 0] }) },
          // Carte active légèrement plus grande, comme sur la maquette
          { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      <Pressable onPress={onPress} style={styles.card} accessibilityLabel={`${stat.label}: ${stat.value} ${stat.unit ?? ''}`}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.cardActive, { opacity: focus }]} />
        <MaterialCommunityIcons name={stat.icon} size={20} color={active ? colors.accent : colors.textMuted} />
        <Text style={[styles.label, { color: fg }]} numberOfLines={1}>{stat.label}</Text>
        <Animated.View style={[styles.valueRow, { opacity: revealed ? values.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : 1 }]}>
          <Text style={[active ? styles.valueActive : styles.value, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
            {revealed ? stat.value : placeholderOf(stat.value)}
          </Text>
          {stat.unit ? <Text style={[styles.unit, { color: fg }]}>{stat.unit}</Text> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Bouton rond de la barre du haut (menu, cloche, retour…) */
export function ShowcaseButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.roundBtn} hitSlop={8} accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const glass = 'rgba(27,30,27,0.78)';

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  make: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  model: { flexShrink: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 30, letterSpacing: -0.3 },
  plus: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  category: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  hero: { width: '100%', marginBottom: spacing.lg },
  car: { position: 'absolute' },
  column: { position: 'absolute', right: spacing.md, top: 0, width: 128, overflow: 'hidden' },
  card: {
    flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', gap: 2,
    backgroundColor: glass, overflow: 'hidden',
  },
  cardActive: { backgroundColor: '#262a26', borderRadius: 16 },
  label: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17, marginTop: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24 },
  valueActive: { fontFamily: fonts.semibold, fontSize: 23, lineHeight: 28 },
  unit: { fontFamily: fonts.regular, fontSize: 13 },
  mode: {
    marginHorizontal: spacing.lg, height: 64, borderRadius: 16, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  modeTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.5 },
  modeSub: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
