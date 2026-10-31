import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { collectAchievement, myAchievements, syncAchievements, type Achievement } from '@/features/achievements/api';
import { ACHIEVEMENTS, formatMetric, progressOf, TIERS } from '@/features/achievements/catalog';
import { t } from '@/i18n';
import { colors, fonts, radius, spacing, type } from '@/theme';

/**
 * Succès : du plus facile au quasi impossible. Chaque succès a sa jauge (métrique / seuil) et un
 * bouton « Collect », grisé tant qu'il n'est pas réalisé. Collecter ajoute l'XP au niveau.
 */
export default function AchievementsScreen() {
  const [list, setList] = useState<Achievement[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [gained, setGained] = useState<{ key: string; xp: number } | null>(null);

  useFocusEffect(useCallback(() => {
    syncAchievements().finally(() => myAchievements().then(setList));
  }, []));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const collect = async (a: Achievement) => {
    setBusy(a.key);
    try {
      const xp = await collectAchievement(a.key);
      setList((l) => l?.map((x) => (x.key === a.key ? { ...x, collected: true } : x)));
      setGained({ key: a.key, xp });
    } catch (e) {
      Alert.alert(t('Oups'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const done = list?.filter((a) => a.completed).length ?? 0;
  const earned = list?.filter((a) => a.collected).reduce((s, a) => s + a.xp, 0) ?? 0;
  const tiers = [...new Set(list?.map((a) => a.tier) ?? [])].sort();

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('Achievements')}</Text>
          {list ? <Text style={styles.muted}>{t('{0} / {1} completed · {2} XP collected', done, list.length, earned.toLocaleString())}</Text> : null}
        </View>
      </View>

      {list === undefined ? <ActivityIndicator color={colors.accent} /> : list === null ? (
        <Text style={styles.muted}>{t('Achievements are unavailable right now.')}</Text>
      ) : tiers.map((tier) => (
        <View key={tier} style={{ gap: spacing.sm }}>
          <View style={styles.tierRow}>
            <View style={[styles.tierDot, { backgroundColor: TIERS[tier]?.color ?? colors.textMuted }]} />
            <Text style={styles.section}>{(TIERS[tier]?.label() ?? '').toUpperCase()}</Text>
          </View>
          {list.filter((a) => a.tier === tier).map((a) => (
            <AchievementCard key={a.key} a={a} busy={busy === a.key} onCollect={() => collect(a)}
              gained={gained?.key === a.key ? gained.xp : null} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function AchievementCard({ a, busy, onCollect, gained }: { a: Achievement; busy: boolean; onCollect: () => void; gained: number | null }) {
  const def = ACHIEVEMENTS[a.key];
  const color = TIERS[a.tier]?.color ?? colors.accent;
  const p = a.completed ? 1 : progressOf(a);
  const current = a.value == null ? '—' : formatMetric(a.metric, a.value);
  const target = formatMetric(a.metric, a.target);
  const canCollect = a.completed && !a.collected;
  return (
    <View style={[styles.card, canCollect && { borderColor: colors.accent }]}>
      <View style={styles.cardTop}>
        <View style={[styles.icon, { borderColor: color, opacity: a.completed ? 1 : 0.45 }]}>
          <MaterialCommunityIcons name={def?.icon ?? 'trophy-outline'} size={22} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{def?.title() ?? a.key}</Text>
          <Text style={styles.desc}>{def?.desc() ?? ''}</Text>
        </View>
        <Text style={[styles.xp, a.collected && { color: colors.textFaint }]}>+{a.xp} XP</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${p * 100}%`, backgroundColor: a.completed ? colors.accent : color }]} /></View>
      <View style={styles.cardBottom}>
        <Text style={styles.progress}>
          {a.lowerIsBetter ? t('Best: {0} · goal {1}', current, target) : `${current} / ${target}`}
        </Text>
        {a.collected ? (
          <View style={styles.collected}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={styles.collectedText}>{gained != null ? t('+{0} XP collected', gained) : t('Collected')}</Text>
          </View>
        ) : (
          <Pressable onPress={onCollect} disabled={!canCollect || busy} accessibilityRole="button" accessibilityState={{ disabled: !canCollect }}
            style={[styles.btn, canCollect ? styles.btnOn : styles.btnOff]}>
            {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : (
              <Text style={[styles.btnText, canCollect ? { color: colors.accentText } : { color: colors.textFaint }]}>{t('Collect')}</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  section: { ...type.overline, color: colors.textMuted, fontSize: 10 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  name: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  desc: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  xp: { color: colors.accent, fontFamily: fonts.bold, fontSize: 13 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  progress: { flex: 1, color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12 },
  btn: { minWidth: 92, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnOn: { backgroundColor: colors.accent },
  btnOff: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  btnText: { fontFamily: fonts.bold, fontSize: 13 },
  collected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  collectedText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 },
});
