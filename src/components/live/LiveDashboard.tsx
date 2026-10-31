import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useGForce } from '@/features/recording/useGForce';
import type { LiveView } from '@/features/settings/prefs';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { GForceBars, GForceCircle } from './GForce';

import { t } from '@/i18n';
/** Durée h:mm:ss */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Écran de drive en cours (route ouverte, sprint ou circuit), d'après la maquette « Circuit
 * session » : en-tête, puis la carte, le cercle de force G, ou les deux côte à côte (bouton de
 * vue), puis les chiffres propres au mode (`children`), puis Pause / Finish.
 */
export function LiveDashboard({ overline, name, elapsedMs, view, onView, map, paused, onBack, onPause, onFinish, children }: {
  overline: string; name: string; elapsedMs: number;
  view: LiveView; onView: (v: LiveView) => void;
  map: (style: object) => ReactNode;
  paused: boolean; onBack: () => void; onPause: () => void; onFinish: () => void;
  children: ReactNode;
}) {
  const g = useGForce(view !== 'map');
  const { width, height } = useWindowDimensions();
  const inner = width - spacing.lg * 2;
  const half = (inner - spacing.sm) / 2;
  const tall = height > 780;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.head}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn} accessibilityLabel={t('Back')}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>{paused ? t('PAUSED') : overline}</Text>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </View>
        <Text style={styles.elapsed}>{clock(elapsedMs)}</Text>
      </View>
      <ViewSwitch value={view} onChange={onView} />

      {view === 'both' ? (
        <View style={[styles.row, { height: tall ? 330 : 280 }]}>
          <View style={[styles.card, { width: half }]}>
            <Text style={styles.cardTitle}>{t('TRACK MAP')}</Text>
            {map({ flex: 1, borderRadius: radius.md, marginTop: 6 })}
          </View>
          <View style={[styles.card, { width: half, alignItems: 'center' }]}>
            <Text style={[styles.cardTitle, { alignSelf: 'flex-start' }]}>{t('LIVE G-FORCE')}</Text>
            <GForceCircle g={g} size={Math.min(half - 24, tall ? 170 : 140)} />
            <GForceBars g={g} compact />
          </View>
        </View>
      ) : view === 'map' ? (
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.cardTitle}>{t('TRACK MAP')}</Text>
          {map({ flex: 1, borderRadius: radius.md, marginTop: 6 })}
        </View>
      ) : (
        <View style={[styles.card, { alignItems: 'center', gap: spacing.md }]}>
          <GForceCircle g={g} size={Math.min(inner - 40, tall ? 300 : 230)} />
          <GForceBars g={g} />
        </View>
      )}

      <View style={{ gap: spacing.sm, flexShrink: 0 }}>{children}</View>

      <View style={styles.buttons}>
        <Button title={paused ? t('Resume') : t('Pause')} variant="secondary" style={{ flex: 1, height: 56 }} onPress={onPause} />
        <Button title={t('Finish')} icon="flag" style={{ flex: 1, height: 56 }} onPress={onFinish} />
      </View>
    </SafeAreaView>
  );
}

/** Choix de la vue pendant le drive : carte, les deux, G-force (vue par défaut : Settings > Interface). */
function ViewSwitch({ value, onChange }: { value: LiveView; onChange: (v: LiveView) => void }) {
  const items: { v: LiveView; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
    { v: 'map', icon: 'map-outline', label: t('Map') },
    { v: 'both', icon: 'view-split-vertical', label: t('Both') },
    { v: 'gforce', icon: 'target', label: t('G-force') },
  ];
  return (
    <View style={styles.switch}>
      {items.map((i) => (
        <Pressable key={i.v} onPress={() => onChange(i.v)} style={[styles.switchItem, value === i.v && styles.switchOn]}
          accessibilityLabel={i.label} accessibilityState={{ selected: value === i.v }} hitSlop={4}>
          <MaterialCommunityIcons name={i.icon} size={16} color={value === i.v ? colors.accentText : colors.textMuted} />
          <Text style={[styles.switchText, value === i.v && { color: colors.accentText }]}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Petite tuile : libellé, valeur, et en option un sous-texte coloré ou une jauge. */
export function Tile({ label, value, sub, subColor, bar }: { label: string; value: string; sub?: string; subColor?: string; bar?: number }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={[styles.tileSub, subColor ? { color: subColor } : null]} numberOfLines={1}>{sub}</Text> : null}
      {bar != null && (
        <View style={styles.tileSegs}>
          {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[styles.tileSeg, i < Math.round(bar * 5) && styles.tileSegOn]} />)}
        </View>
      )}
    </View>
  );
}

/** Vitesse en grand avec une jauge à segments de 0 à 300 km/h. */
export function SpeedCard({ kmh }: { kmh: number }) {
  const segs = 20;
  const lit = Math.round((Math.min(300, kmh) / 300) * segs);
  return (
    <View style={[styles.card, styles.speedCard]}>
      <View>
        <Text style={styles.tileLabel}>{t('SPEED')}</Text>
        <Text style={styles.speed}>{Math.round(kmh)}</Text>
        <Text style={styles.tileLabel}>{t('KM/H')}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.speedSegs}>
          {Array.from({ length: segs }, (_, i) => <View key={i} style={[styles.speedSeg, i < lit && styles.segOn]} />)}
        </View>
        <View style={styles.ticks}>
          {['0', '100', '200', '300'].map((t) => <Text key={t} style={styles.tick}>{t}</Text>)}
        </View>
      </View>
    </View>
  );
}

/** Tour en cours : chrono, écart avec le meilleur tour, avancement du tour en 3 tiers (S1-S3). */
export function LapCard({ label, time, deltaMs, progress }: { label: string; time: string; deltaMs: number | null; progress: number | null }) {
  const ahead = deltaMs != null && deltaMs <= 0;
  return (
    <View style={styles.card}>
      <View style={styles.lapHead}>
        <View style={styles.lapDash} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <View style={styles.lapRow}>
        <Text style={styles.lapTime} numberOfLines={1} adjustsFontSizeToFit>{time}</Text>
        {deltaMs != null && (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={styles.deltaBox}>
              <Text style={[styles.delta, { color: ahead ? colors.accent : colors.danger }]}>
                {ahead ? '−' : '+'}{(Math.abs(deltaMs) / 1000).toFixed(3)}
              </Text>
            </View>
            <Text style={styles.tileLabel}>{t('VS. BEST')}</Text>
          </View>
        )}
      </View>
      {progress != null && (
        <View style={styles.sectors}>
          {[0, 1, 2].map((i) => {
            const fill = Math.max(0, Math.min(1, progress * 3 - i));
            return (
              <View key={i} style={{ flex: 1, gap: 4, alignItems: 'center' }}>
                <View style={styles.sectorTrack}><View style={[styles.sectorFill, { width: `${fill * 100}%` }]} /></View>
                <Text style={[styles.sectorText, fill > 0 && fill < 1 && { color: colors.accent }]}>S{i + 1}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, paddingBottom: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  overline: { ...type.overline, color: colors.accent, fontSize: 10 },
  name: { ...type.h2, color: colors.text, fontSize: 18 },
  elapsed: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 16 },
  switch: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 3, gap: 3, borderWidth: 1, borderColor: colors.border },
  switchItem: { flex: 1, height: 34, borderRadius: 9, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  switchText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 },
  switchOn: { backgroundColor: colors.accent },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTitle: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: 'auto', paddingTop: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 3 },
  tileLabel: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.8 },
  tileValue: { color: colors.text, fontFamily: fonts.bold, fontSize: 19 },
  tileSub: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11 },
  tileSegs: { flexDirection: 'row', gap: 3, marginTop: 2 },
  tileSeg: { flex: 1, height: 4, borderRadius: 1, backgroundColor: colors.bgElevated },
  tileSegOn: { backgroundColor: colors.accent },
  segOn: { backgroundColor: colors.accent },
  speedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  speed: { ...type.stat, color: colors.text, fontSize: 44, lineHeight: 50 },
  speedSegs: { flexDirection: 'row', gap: 2, height: 22 },
  speedSeg: { flex: 1, borderRadius: 2, backgroundColor: colors.bgElevated },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10 },
  lapHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lapDash: { width: 16, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  lapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lapTime: { ...type.stat, flex: 1, color: colors.text, fontSize: 52, lineHeight: 60 },
  deltaBox: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  delta: { fontFamily: fonts.bold, fontSize: 20 },
  sectors: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sectorTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  sectorFill: { height: 4, backgroundColor: colors.accent },
  sectorText: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 11 },
});
