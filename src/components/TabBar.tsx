import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

import { t } from '@/i18n';
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;
const TABS: Record<string, { icon: Icon; label: string }> = {
  index: { icon: 'account-group', get label() { return t('COMMUNITY'); } },
  performance: { icon: 'speedometer', get label() { return t('PERF'); } },
  record: { icon: 'power', get label() { return t('START DRIVE'); } },
  map: { icon: 'map-marker-radius', get label() { return t('MAP'); } },
  profile: { icon: 'garage', get label() { return t('GARAGE'); } },
};

/** Durée de l'allumage d'un voyant : progressif, comme un tableau de bord au contact. */
const GLOW_MS = 480;

/**
 * Barre d'onglets façon tableau de bord : voyants qui s'allument et s'éteignent en fondu,
 * bouton central « Start drive » rond, cerclé de vert qui respire.
 */
export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[StyleSheet.absoluteFill, styles.bg]}>
        <LinearGradient colors={['#1C201C', '#0C0E0C']} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.hairline} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const cfg = TABS[route.name];
          if (!cfg) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return route.name === 'record'
            ? <StartButton key={route.key} onPress={onPress} />
            : <Gauge key={route.key} icon={cfg.icon} label={cfg.label} focused={focused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

/** Onglet : icône et libellé éteints ; la couche allumée (verte, halo) apparaît en fondu par-dessus. */
function Gauge({ icon, label, focused, onPress }: { icon: Icon; label: string; focused: boolean; onPress: () => void }) {
  const lit = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(lit, {
      toValue: focused ? 1 : 0,
      duration: focused ? GLOW_MS : GLOW_MS * 0.6,
      easing: focused ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, lit]);
  const scale = lit.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Pressable onPress={onPress} style={styles.slot} accessibilityRole="tab" accessibilityState={{ selected: focused }}
      accessibilityLabel={label.toLowerCase()}>
      {/* Voyant au-dessus de l'icône */}
      <View style={styles.ledTrack}>
        <Animated.View style={[styles.led, { opacity: lit, transform: [{ scaleX: scale }] }]} />
      </View>
      <View>
        <MaterialCommunityIcons name={icon} size={24} color={colors.textFaint} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.litIcon, { opacity: lit }]}>
          <MaterialCommunityIcons name={icon} size={24} color={colors.accent} />
        </Animated.View>
      </View>
      <View>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Animated.Text style={[styles.label, styles.labelLit, StyleSheet.absoluteFill, { opacity: lit }]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

/** Bouton « Start drive » : cerclage vert dont le halo respire lentement. */
function StartButton({ onPress }: { onPress: () => void }) {
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breathe]);
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Pressable onPress={onPress} style={styles.centerSlot} accessibilityRole="button" accessibilityLabel={t('Start a drive')}>
      {({ pressed }) => (
        <View style={styles.centerLift}>
          <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
          <View style={[styles.ring, pressed && { transform: [{ scale: 0.95 }] }]}>
            <LinearGradient colors={['#262B26', '#0E100E']} style={styles.knob}>
              <MaterialCommunityIcons name="power" size={22} color={colors.accent} />
              <Text style={styles.startText}>{t('START')}</Text>
              <Text style={styles.startSub}>{t('DRIVE')}</Text>
            </LinearGradient>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg },
  bg: { borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  hairline: {
    position: 'absolute', top: 0, left: 24, right: 24, height: 1, backgroundColor: 'rgba(255,255,255,0.07)',
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 6 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: 58 },
  ledTrack: { width: 26, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  led: {
    flex: 1, borderRadius: 2, backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  litIcon: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  label: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 8.5, letterSpacing: 0.8, textAlign: 'center' },
  labelLit: {
    color: colors.accent, textShadowColor: 'rgba(198,244,50,0.7)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 },
  },
  // Même largeur que les autres onglets : le bouton est exactement au centre de l'écran.
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 58 },
  centerLift: { marginTop: -34, alignItems: 'center', justifyContent: 'center', width: 84, height: 84 },
  halo: {
    position: 'absolute', width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(198,244,50,0.18)',
    shadowColor: colors.accent, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  ring: {
    width: 74, height: 74, borderRadius: 37, padding: 3, backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  knob: { flex: 1, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  startText: { color: colors.text, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2, marginTop: 1 },
  startSub: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 8, letterSpacing: 1.2 },
});
