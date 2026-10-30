import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, type } from '@/theme';

const MAX_G = 1.5; // bord du cercle
const RINGS = [0.5, 1, 1.5];
const TRAIL = 18;

export type G = { lateral: number; longitudinal: number };

/**
 * Cercle de force G (diagramme g-g, vue de dessus) : accélération en haut, freinage en bas,
 * virages à gauche et à droite. Point vert citron lumineux et sa traînée.
 */
export function GForceCircle({ g, size }: { g: G; size: number }) {
  const r = size / 2;
  const dot = Math.max(14, Math.round(size * 0.075));
  const px = (v: number) => (Math.max(-MAX_G, Math.min(MAX_G, v)) / MAX_G) * (r - dot / 2);
  const total = Math.hypot(g.lateral, g.longitudinal);
  const k = total > MAX_G ? MAX_G / total : 1;
  const x = px(g.lateral * k), y = -px(g.longitudinal * k);

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: 90, easing: Easing.linear, useNativeDriver: true }).start();
  }, [x, y, pos]);
  const trail = useRef<{ x: number; y: number }[]>([]);
  trail.current = [...trail.current.slice(-(TRAIL - 1)), { x, y }];

  return (
    <View style={{ width: size, height: size + 32, alignItems: 'center' }} accessibilityLabel={`G-force ${total.toFixed(1)} G`}>
      <Text style={styles.axis}>ACCEL</Text>
      <View style={{ width: size, height: size }}>
        {RINGS.map((ring) => {
          const d = 2 * px(ring);
          return (
            <View key={ring} pointerEvents="none" style={[styles.ring, ring === MAX_G && styles.ringOuter,
              { width: d, height: d, borderRadius: d / 2, left: r - d / 2, top: r - d / 2 }]}>
              <Text style={styles.ringText}>{ring.toFixed(1)}</Text>
            </View>
          );
        })}
        <View style={[styles.lineH, { top: r }]} />
        <View style={[styles.lineV, { left: r }]} />
        <Text style={[styles.side, { left: 2, top: r - 16 }]}>L</Text>
        <Text style={[styles.side, { right: 2, top: r - 16 }]}>R</Text>
        {trail.current.map((p, i) => (
          <View key={i} pointerEvents="none" style={[styles.trail, {
            width: dot * 0.6, height: dot * 0.6, borderRadius: dot,
            left: r + p.x - dot * 0.3, top: r + p.y - dot * 0.3, opacity: (i / TRAIL) * 0.35,
          }]} />
        ))}
        <Animated.View pointerEvents="none" style={[styles.ball, {
          width: dot, height: dot, borderRadius: dot / 2, left: r - dot / 2, top: r - dot / 2, transform: pos.getTranslateTransform(),
        }]} />
      </View>
      <Text style={styles.axis}>BRAKE</Text>
    </View>
  );
}

/** Latéral, longitudinal et total, avec une jauge à 5 segments (0 → 1,5 G). */
export function GForceBars({ g, compact }: { g: G; compact?: boolean }) {
  const total = Math.hypot(g.lateral, g.longitudinal);
  return (
    <View style={styles.bars}>
      <Bar label={compact ? 'LATERAL' : 'LATERAL G'} v={Math.abs(g.lateral)} compact={compact} />
      <Bar label={compact ? 'LONGITUDINAL' : 'LONGITUDINAL G'} v={Math.abs(g.longitudinal)} compact={compact} />
      <Bar label={compact ? 'TOTAL' : 'TOTAL G'} v={total} compact={compact} />
    </View>
  );
}

function Bar({ label, v, compact }: { label: string; v: number; compact?: boolean }) {
  const lit = Math.round(Math.min(1, v / MAX_G) * 5);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[styles.barLabel, compact && { fontSize: 8 }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      <Text style={[styles.barValue, compact && { fontSize: 18 }]}>{v.toFixed(1)}<Text style={styles.unit}> G</Text></Text>
      <View style={styles.segs}>
        {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[styles.seg, i < lit && styles.segOn]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1, height: 16 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  ringOuter: { borderColor: colors.accent, borderWidth: 1.5 },
  ringText: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 9, marginTop: 2 },
  lineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  lineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  side: { position: 'absolute', color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11 },
  trail: { position: 'absolute', backgroundColor: colors.accent },
  ball: {
    position: 'absolute', backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  bars: { flexDirection: 'row', gap: 12 },
  barLabel: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.6 },
  barValue: { ...type.stat, color: colors.text, fontSize: 26, lineHeight: 30 },
  unit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  segs: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 5, borderRadius: 1, backgroundColor: colors.bgElevated },
  segOn: { backgroundColor: colors.accent },
});
