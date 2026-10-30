import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClassBadge } from '@/components/ClassBadge';
import { Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { CLASSES } from '@/features/garage/hpi';
import { driverXp, type DriverXp } from '@/features/levels/api';
import { RANK_IMAGES } from '@/features/levels/images';
import { levelFromXp, RANKS, XP_RULES } from '@/features/levels/levels';
import { colors, fonts, radius, spacing, type } from '@/theme';

const n = (v: number) => v.toLocaleString('en-US');

/** Rangs et niveaux : rang actuel, les 12 rangs, barème d'XP, XP gagnée par activité, classes de véhicules. */
export default function RanksScreen() {
  const { user } = useLocalSearchParams<{ user?: string }>();
  const { session } = useAuth();
  const userId = user || session?.user.id;
  const isMe = userId === session?.user.id;
  const [data, setData] = useState<DriverXp | null | undefined>(undefined);
  useEffect(() => { if (userId) driverXp(userId).then(setData); }, [userId]);
  const info = data ? levelFromXp(data.xp) : null;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} hitSlop={12}
        accessibilityLabel="Back" style={{ alignSelf: 'flex-start', padding: 4 }}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <View style={{ gap: 4 }}>
        <Text style={styles.overline}>HOTLAP DRIVER PROFILE</Text>
        <Text style={styles.title}>{info ? `Level ${info.level}` : 'Driver ranks'}</Text>
        {info && <Text style={[styles.muted, { color: info.rank.color }]}>{info.rank.name} · {info.rank.tagline}</Text>}
      </View>

      {data === undefined ? <ActivityIndicator color={colors.accent} /> : info && data ? (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.heroRow}>
            <Image source={RANK_IMAGES[info.rank.key]} style={{ width: 96, height: 96 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.strong}>Level progression</Text>
              <Text style={styles.accent}>{n(info.into)} / {n(info.span)} XP</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${info.progress * 100}%` }]} /></View>
              <View style={styles.between}>
                <Text style={styles.faint}>Level {info.level}</Text>
                <Text style={styles.faint}>Level {info.level + 1}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.faint}>{n(info.xp)} XP in total{isMe ? '' : ' (real drives only)'}</Text>
          <View style={{ gap: 6 }}>
            <Earned label="Distance" xp={data.breakdown.distance} detail={`${n(Math.round(data.distanceM / 1000))} km`} />
            <Earned label="New tracks" xp={data.breakdown.tracks} detail={`${data.tracksVisited}`} />
            <Earned label="Verified sessions" xp={data.breakdown.sessions} detail={`${data.sessions}`} />
            <Earned label="Personal lap records" xp={data.breakdown.personalBests} detail={`${data.personalBests}`} />
            <Earned label="Track categories" xp={data.breakdown.categories} detail={`${data.categories}`} />
          </View>
        </Card>
      ) : (
        <Text style={styles.muted}>Niveau indisponible pour le moment.</Text>
      )}

      <Text style={styles.section}>12 RANKS</Text>
      <View style={styles.grid}>
        {RANKS.map((r) => {
          const current = info?.rank.key === r.key;
          const locked = info ? r.minLevel > info.level : false;
          return (
            <View key={r.key} style={[styles.rankCell, current && { borderColor: r.color }]}>
              <Image source={RANK_IMAGES[r.key]} style={[styles.rankImg, locked && { opacity: 0.35 }]} />
              <Text style={[styles.rankName, locked && { color: colors.textFaint }]} numberOfLines={1} adjustsFontSizeToFit>{r.name.toUpperCase()}</Text>
              <View style={[styles.rankBar, { backgroundColor: r.color }, locked && { opacity: 0.35 }]} />
              <Text style={styles.rankLvl}>LVL {r.minLevel}{r.maxLevel ? ` – ${r.maxLevel}` : '+'}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.section}>HOW TO EARN XP</Text>
      <Card style={{ paddingVertical: spacing.sm }}>
        {XP_RULES.map((r, i) => (
          <View key={r.label} style={[styles.rule, i > 0 && styles.ruleSep]}>
            <Text style={[styles.ruleLabel, r.soon && { color: colors.textFaint }]}>{r.label}{r.soon ? ' · soon' : ''}</Text>
            <Text style={[styles.ruleXp, r.soon && { color: colors.textFaint }]}>{r.xp}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.faint}>
        Une session validée est un drive lancé depuis la fiche d’un circuit avec au moins un tour chronométré.
        L’XP se recalcule depuis tes drives : supprimer un drive retire l’XP qu’il rapportait.
      </Text>

      <Text style={styles.section}>VEHICLE CLASSES</Text>
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.muted}>
          HPI sur 999 = 999 × (0,60 × rapport poids/puissance + 0,40 × accélération). L’accélération est ton meilleur
          0-100 km/h mesuré en Sprint avec la voiture, sinon une estimation. Renseigne puissance et poids dans le garage.
        </Text>
        {CLASSES.map((c) => (
          <View key={c.key} style={styles.classRow}>
            <ClassBadge cls={c.key} />
            <Text style={styles.ruleLabel}>{c.min} – {c.max}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Earned({ label, xp, detail }: { label: string; xp: number; detail: string }) {
  return (
    <View style={styles.between}>
      <Text style={styles.muted}>{label} <Text style={styles.faint}>({detail})</Text></Text>
      <Text style={[styles.strong, { color: xp > 0 ? colors.accent : colors.textFaint }]}>+{n(xp)} XP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overline: { ...type.overline, color: colors.accent },
  title: { ...type.h1, color: colors.text, fontSize: 28 },
  section: { ...type.h2, color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  faint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  strong: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  accent: { color: colors.accent, fontFamily: fonts.bold, fontSize: 15 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rankCell: {
    width: '31.5%', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: 4,
  },
  rankImg: { width: 64, height: 64 },
  rankName: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  rankBar: { width: 40, height: 2, borderRadius: 1 },
  rankLvl: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
  rule: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: spacing.md },
  ruleSep: { borderTopWidth: 1, borderTopColor: colors.border },
  ruleLabel: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 14 },
  ruleXp: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
});
