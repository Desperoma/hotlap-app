import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { unreadCount } from '@/features/notifications/api';
import { colors, fonts } from '@/theme';

import { t } from '@/i18n';
const POLL_MS = 30_000;

/**
 * Cloche des notifications, en haut à droite des onglets (sauf la carte).
 * Pas de push pour l'instant : le nombre de non-lues est relu toutes les 30 s,
 * au retour dans l'app et à chaque passage sur l'écran.
 */
export function NotificationBell() {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    unreadCount().then(setCount).catch(() => {});
  }, []);

  useFocusEffect(refresh);
  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => { clearInterval(t); sub.remove(); };
  }, [refresh]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 10 }]}>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={10}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? t('Notifications, {0} unread', count) : t('Notifications')}
      >
        <Ionicons name={count > 0 ? 'notifications' : 'notifications-outline'} size={22} color={colors.text} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, zIndex: 20 },
  btn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: colors.accentText, fontFamily: fonts.bold, fontSize: 10 },
});
