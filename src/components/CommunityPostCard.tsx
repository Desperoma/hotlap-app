import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PostActions, PostHeader } from '@/components/DriveCard';
import { DriveMap } from '@/components/DriveMap';
import { Card } from '@/components/ui';
import { formatLap } from '@/features/circuit/laps';
import { carImageFor } from '@/features/garage/carImage';
import { formatKm } from '@/features/recording/geo';
import type { CommunityPost } from '@/features/social/community';
import { formatSprint, sprintLabel } from '@/features/sprint/sprint';
import { colors, fonts, radius, type } from '@/theme';

const MEDAL = ['#F5C542', '#C9CED6', '#D08A4E'];

/**
 * Post du fil Community. Deux mises en page :
 * - performance (sprint, tour) : la voiture en grand, le temps, le rang mondial et l'écart au record précédent ;
 * - road trip : le tracé avec distance, durée et dénivelé, puis les photos.
 */
export function CommunityPostCard({ post, onBlocked }: { post: CommunityPost; onBlocked?: (userId: string) => void }) {
  return (
    <Card onPress={() => router.push(`/drive/${post.id}`)} style={{ gap: 12 }}>
      <PostHeader drive={post} onBlocked={onBlocked} right={<Kind post={post} />} />
      {post.badge ? <Performance post={post} /> : <RoadTrip post={post} />}
      <View style={{ gap: 4 }}>
        <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
        {post.description ? <Text style={styles.desc} numberOfLines={3}>{post.description}</Text> : null}
      </View>
      <PostActions drive={post} />
    </Card>
  );
}

function Kind({ post }: { post: CommunityPost }) {
  const perf = !!post.badge;
  return (
    <View style={[styles.kind, perf && { borderColor: colors.accent }]}>
      <Ionicons name={perf ? 'speedometer-outline' : 'map-outline'} size={11} color={perf ? colors.accent : colors.textMuted} />
      <Text style={[styles.kindText, perf && { color: colors.accent }]}>{perf ? 'PERFORMANCE' : 'ROAD TRIP'}</Text>
    </View>
  );
}

function Performance({ post }: { post: CommunityPost }) {
  const b = post.badge!;
  const lap = b.kind === 'lap';
  const source = useMemo(() => carImageFor(post.vehicle).source, [post.vehicle]);
  const delta = b.prevMs != null ? b.timeMs - b.prevMs : null;
  const medal = b.rank != null ? MEDAL[b.rank - 1] : undefined;
  return (
    <View style={styles.hero}>
      <LinearGradient colors={['#1F241F', '#101210']} style={StyleSheet.absoluteFill} />
      <Image source={source} style={styles.car} resizeMode="contain" />
      <LinearGradient colors={['transparent', 'rgba(14,16,14,0.92)']} style={styles.heroFade} pointerEvents="none" />
      {b.rank != null && (
        <View style={[styles.rank, medal ? { backgroundColor: medal } : null]}>
          <Ionicons name="trophy" size={11} color={medal ? colors.bg : colors.accent} />
          <Text style={[styles.rankText, medal ? { color: colors.bg } : null]}>#{b.rank} {lap ? 'CIRCUIT' : 'GLOBAL'}</Text>
        </View>
      )}
      <View style={styles.heroStats} pointerEvents="none">
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>{lap ? 'BEST LAP' : sprintLabel(b.kind).toUpperCase()}</Text>
          <Text style={styles.heroTime}>{lap ? formatLap(b.timeMs) : formatSprint(b.timeMs)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {delta != null ? (
            <>
              <Text style={[styles.delta, { color: delta <= 0 ? colors.accent : colors.danger }]}>
                {delta <= 0 ? '−' : '+'}{(Math.abs(delta) / 1000).toFixed(2)} s
              </Text>
              <Text style={styles.heroLabel}>VS PREVIOUS</Text>
            </>
          ) : (
            <Text style={styles.heroLabel}>FIRST RUN</Text>
          )}
          {b.exitKmh != null && !lap ? <Text style={styles.exit}>{Math.round(b.exitKmh)} km/h exit</Text> : null}
        </View>
      </View>
    </View>
  );
}

function RoadTrip({ post }: { post: CommunityPost }) {
  const h = Math.floor(post.duration_s / 3600), m = Math.round((post.duration_s % 3600) / 60);
  return (
    <View style={{ gap: 8 }}>
      <DriveMap path={post.path_preview} lite style={styles.map} emptyLabel="Route hidden">
        <View style={styles.strip} pointerEvents="none">
          <Stat value={`${formatKm(post.distance_m)} km`} label="DISTANCE" />
          <Stat value={h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`} label="TIME" />
          <Stat value={post.elevationGainM != null ? `${post.elevationGainM} m` : '—'} label="ELEVATION" />
          {post.score != null && <Stat value={String(post.score)} label="SCORE" />}
        </View>
      </DriveMap>
      {post.photos.length > 0 && (
        <View style={styles.photos}>
          {post.photos.map((u) => <Image key={u} source={{ uri: u }} style={styles.photo} />)}
        </View>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Emplacement publicitaire entre deux posts. Simple encart maison pour l'instant : une vraie régie
 * (AdMob…) demande un module natif, donc un build de développement, pas Expo Go.
 */
export function AdSlot() {
  return (
    <View style={styles.ad} accessibilityLabel="Sponsored">
      <Text style={styles.adTag}>SPONSORED</Text>
      <View style={styles.adBody}>
        <View style={styles.adIcon}><Ionicons name="megaphone-outline" size={20} color={colors.textMuted} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adTitle}>Your brand here</Text>
          <Text style={styles.adText}>Ad space between posts. Coming soon.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.h2, color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  desc: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  kind: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  kindText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.6 },
  hero: { height: 210, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end' },
  car: { position: 'absolute', left: '6%', right: '6%', top: 8, height: 150, width: '88%' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  rank: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(14,16,14,0.8)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rankText: { color: colors.accent, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5 },
  heroStats: { flexDirection: 'row', alignItems: 'flex-end', padding: 14 },
  heroLabel: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  heroTime: { ...type.stat, color: colors.text, fontSize: 38, lineHeight: 44 },
  delta: { fontFamily: fonts.bold, fontSize: 16 },
  exit: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  map: { height: 190, borderRadius: radius.md },
  strip: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(14,16,14,0.8)',
  },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 0.6 },
  photos: { flexDirection: 'row', gap: 6 },
  photo: { flex: 1, aspectRatio: 1.2, borderRadius: 10, backgroundColor: colors.bgElevated },
  ad: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    backgroundColor: colors.bgElevated, padding: 14, gap: 10,
  },
  adTag: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1 },
  adBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  adTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  adText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
});
