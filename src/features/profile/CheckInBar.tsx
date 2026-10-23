import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/theme';

const key = (userId: string) => `hotlap:checkin-done:${userId}`;

/**
 * Barre « Profile check-in ». À 100 %, au retour sur l'onglet Profil, elle se remplit,
 * s'efface puis se replie ; elle ne revient que si le profil redevient incomplet.
 */
export function CheckInBar({ userId, completion }: { userId: string | undefined; completion: number }) {
  const complete = completion >= 1;
  const [hidden, setHidden] = useState<boolean | null>(null); // null : pas encore lu
  const fill = useRef(new Animated.Value(completion)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const running = useRef(false);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(key(userId))
      .then((v) => {
        if (!complete && v) AsyncStorage.removeItem(key(userId)).catch(() => {});
        setHidden(complete && v === '1');
      })
      .catch(() => setHidden(false));
  }, [userId, complete]);

  useEffect(() => {
    Animated.timing(fill, { toValue: completion, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [completion, fill]);

  useFocusEffect(useCallback(() => {
    if (!complete || hidden !== false || running.current || !userId) return;
    running.current = true;
    let cancelled = false;
    (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      await new Promise((r) => setTimeout(r, reduce ? 0 : 900)); // le temps de voir les 100 %
      if (cancelled) return;
      Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : 350, useNativeDriver: true }).start(() => {
        if (cancelled) return;
        if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setHidden(true);
        AsyncStorage.setItem(key(userId), '1').catch(() => {});
      });
    })();
    return () => { cancelled = true; running.current = false; opacity.setValue(1); };
  }, [complete, hidden, userId, opacity]));

  if (hidden !== false) return null;
  return (
    <Animated.View style={{ gap: 6, opacity }}>
      <View style={styles.head}>
        <Text style={styles.overline}>PROFILE CHECK-IN</Text>
        <Text style={[styles.overline, { color: colors.accent }]}>{complete ? 'COMPLETE' : `${Math.round(completion * 100)}%`}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
});
