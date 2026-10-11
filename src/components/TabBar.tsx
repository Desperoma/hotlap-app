import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

const TABS: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { icon: 'map-outline', label: 'Discover' },
  community: { icon: 'people', label: 'Community' },
  record: { icon: 'add', label: 'Record' },
  map: { icon: 'location', label: 'Map' },
  profile: { icon: 'person', label: 'Profile' },
};

/**
 * Barre d'onglets de la maquette : onglet actif = pastille citron surélevée,
 * bouton central « + » toujours mis en avant.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const cfg = TABS[route.name];
        if (!cfg) return null;
        const focused = state.index === index;
        const isCenter = route.name === 'record';
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isCenter) {
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.slot} accessibilityLabel="Record a drive">
              <View style={styles.center}>
                <Ionicons name="add" size={34} color={colors.accentText} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.slot} accessibilityLabel={cfg.label}>
            {focused ? (
              <View style={styles.activeWrap}>
                <View style={styles.activeBubble}>
                  <Ionicons name={cfg.icon} size={22} color={colors.accentText} />
                </View>
                <Text style={styles.activeLabel}>{cfg.label}</Text>
              </View>
            ) : (
              <Ionicons name={cfg.icon} size={22} color={colors.textMuted} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 52 },
  center: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, marginTop: -28,
    alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  activeWrap: { alignItems: 'center', marginTop: -26 },
  activeBubble: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg,
  },
  activeLabel: { color: colors.text, fontFamily: fonts.medium, fontSize: 11, marginTop: 2 },
});
