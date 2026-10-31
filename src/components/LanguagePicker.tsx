import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/Dropdown';
import { LANGS, t, useLang, type Lang } from '@/i18n';
import { colors, fonts, radius, spacing } from '@/theme';

/** Les 4 langues, chacune dans sa propre langue. Choisir une langue redessine toute l'app. */
export function LanguageList({ onPick }: { onPick?: (l: Lang) => void }) {
  const { lang, setLang } = useLang();
  return (
    <View style={{ gap: spacing.sm }}>
      {LANGS.map((l) => {
        const on = l.key === lang;
        return (
          <Pressable key={l.key} onPress={() => { onPick?.(l.key); if (!on) setLang(l.key); }}
            style={[styles.row, on && styles.rowOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <View style={[styles.code, on && styles.codeOn]}><Text style={[styles.codeText, on && { color: colors.accentText }]}>{l.flag}</Text></View>
            <Text style={styles.label}>{l.label}</Text>
            {on && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Petit bouton « EN ▾ » (écran de connexion) qui ouvre la liste des langues. */
export function LanguageChip() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.key === lang)!;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.chip} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Language')}>
        <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
        <Text style={styles.chipText}>{current.flag}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
      </Pressable>
      <Sheet visible={open} title={t('Language')} onClose={() => setOpen(false)}>
        <LanguageList onPick={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  rowOn: { borderColor: colors.accent },
  code: { width: 34, height: 24, borderRadius: 6, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  codeOn: { backgroundColor: colors.accent },
  codeText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5 },
  label: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 12 },
});
