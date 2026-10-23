import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui';
import { useGForce } from '@/features/recording/useGForce';
import { colors, fonts, type } from '@/theme';

const MAX_G = 1.5; // bord du cercle
const RINGS = [0.5, 1, 1.5];
const TRAIL = 24;
const DOT = 22;

type Peaks = { accel: number; brake: number; left: number; right: number };
const ZERO: Peaks = { accel: 0, brake: 0, left: 0, right: 0 };

/** Couleur selon l'intensité : vert citron, puis ambre, puis rouge au-delà de 1 G. */
const heat = (g: number) => (g < 0.5 ? colors.accent : g < 1 ? '#F59E0B' : '#EF4444');

/**
 * Cercle de force G (diagramme g-g) : le point montre l'accélération de la voiture vue d'en haut
 * (accélération en haut, freinage en bas, virages à gauche et à droite), avec sa traînée et les
 * pics atteints. Toucher le cercle remet les pics à zéro.
 */
export function GForceCard() {
  const g = useGForce();
  const { width } = useWindowDimensions();
  const size = Math.min(260, width - 96);
  const r = size / 2;
  const px = (v: number) => (Math.max(-MAX_G, Math.min(MAX_G, v)) / MAX_G) * (r - DOT / 2);

  // Point : le vecteur est ramené dans le cercle s'il le dépasse.
  const total = Math.hypot(g.lateral, g.longitudinal);
  const k = total > MAX_G ? MAX_G / total : 1;
  const x = px(g.lateral * k), y = -px(g.longitudinal * k);

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: 90, easing: Easing.linear, useNativeDriver: true }).start();
  }, [x, y, pos]);

  const trail = useRef<{ x: number; y: number }[]>([]);
  trail.current = [...trail.current.slice(-(TRAIL - 1)), { x, y }];

  const [peaks, setPeaks] = useState<Peaks>(ZERO);
  useEffect(() => {
    setPeaks((p) => {
      const n = {
        accel: Math.max(p.accel, g.longitudinal), brake: Math.max(p.brake, -g.longitudinal),
        left: Math.max(p.left, -g.lateral), right: Math.max(p.right, g.lateral),
      };
      return n.accel === p.accel && n.brake === p.brake && n.left === p.left && n.right === p.right ? p : n;
    });
  }, [g.lateral, g.longitudinal]);

  const color = heat(total);
  const side = g.lateral > 0.02 ? 'R' : g.lateral < -0.02 ? 'L' : '';
  const long = g.longitudinal > 0.02 ? 'accel' : g.longitudinal < -0.02 ? 'brake' : '';

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>LIVE G-FORCE</Text>
        <View style={styles.live}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <Pressable onPress={() => setPeaks(ZERO)} accessibilityLabel="Reset peak G-force"
        accessibilityHint="Remet les pics à zéro" style={[styles.circleWrap, { height: size + 36 }]}>
        <Text style={[styles.axisLabel, { top: 0 }]}>ACCEL</Text>
        <Text style={[styles.axisLabel, { bottom: 0 }]}>BRAKE</Text>
        <View style={[styles.circle, { width: size, height: size, borderRadius: r }]}>
          {RINGS.map((ring) => {
            const d = 2 * px(ring); // même échelle que le point
            return (
              <View key={ring} pointerEvents="none"
                style={[styles.ring, { width: d, height: d, borderRadius: d / 2, left: r - d / 2, top: r - d / 2 }, ring === MAX_G && styles.ringOuter]}>
                <Text style={styles.ringText}>{ring.toFixed(1)}</Text>
              </View>
            );
          })}
          <View style={[styles.lineH, { top: r }]} />
          <View style={[styles.lineV, { left: r }]} />
          <Text style={[styles.sideLabel, { left: 8, top: r - 8 }]}>L</Text>
          <Text style={[styles.sideLabel, { right: 8, top: r - 8 }]}>R</Text>

          {/* Pics : petits traits sur chaque axe */}
          <View style={[styles.peakH, { left: r - 8, top: r + px(-peaks.accel) - 1 }]} />
          <View style={[styles.peakH, { left: r - 8, top: r + px(peaks.brake) - 1 }]} />
          <View style={[styles.peakV, { top: r - 8, left: r + px(-peaks.left) - 1 }]} />
          <View style={[styles.peakV, { top: r - 8, left: r + px(peaks.right) - 1 }]} />

          {trail.current.map((p, i) => (
            <View key={i} pointerEvents="none" style={[styles.trail, {
              left: r + p.x - 3, top: r + p.y - 3, opacity: (i / TRAIL) * 0.5, backgroundColor: color,
            }]} />
          ))}

          <Animated.View pointerEvents="none" style={[styles.ball, {
            left: r - DOT / 2, top: r - DOT / 2, backgroundColor: color, shadowColor: color, transform: pos.getTranslateTransform(),
          }]} />
        </View>
      </Pressable>

      <View style={styles.row}>
        <Metric label={`LATERAL${side ? ` · ${side}` : ''}`} value={Math.abs(g.lateral)} />
        <Metric label={long === 'brake' ? 'BRAKE' : 'ACCEL'} value={Math.abs(g.longitudinal)} />
        <Metric label="TOTAL" value={total} color={color} />
      </View>
      <Text style={styles.peaks}>
        Peaks · accel {peaks.accel.toFixed(2)} · brake {peaks.brake.toFixed(2)} · L {peaks.left.toFixed(2)} · R {peaks.right.toFixed(2)} G
      </Text>
    </Card>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, alignItems: 'center' }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value.toFixed(2)}<Text style={styles.unit}> G</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { ...type.h2, color: colors.text, fontSize: 14 },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, backgroundColor: colors.accentSoft,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 10 },
  circleWrap: { alignItems: 'center', justifyContent: 'center' },
  circle: { backgroundColor: colors.bg, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  ringOuter: { borderColor: 'rgba(198,244,50,0.35)', borderWidth: 1.5 },
  ringText: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 9, marginTop: 2 },
  lineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  lineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  axisLabel: { position: 'absolute', color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  sideLabel: { position: 'absolute', color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11 },
  peakH: { position: 'absolute', width: 16, height: 2, borderRadius: 1, backgroundColor: colors.text, opacity: 0.6 },
  peakV: { position: 'absolute', width: 2, height: 16, borderRadius: 1, backgroundColor: colors.text, opacity: 0.6 },
  trail: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  ball: {
    position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 3, borderColor: colors.bg,
    shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  row: { flexDirection: 'row', marginTop: 10 },
  metricLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.5 },
  metricValue: { ...type.stat, color: colors.text, fontSize: 22 },
  unit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  peaks: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
