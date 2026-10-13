import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '@/theme';

/** keepOpen : l'action change le contenu de la feuille au lieu de la fermer (ex. étape suivante). */
export type SheetOption = { label: string; onPress: () => void; destructive?: boolean; keepOpen?: boolean };

/**
 * Liste d'actions en bas d'écran. Remplace Alert quand il y a plus de 3 choix
 * (Android n'affiche que 3 boutons dans une Alert).
 */
export function OptionsSheet({ visible, title, options, onClose }: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {options.map((o) => (
          <Pressable
            key={o.label}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.cardPressed }]}
            onPress={() => {
              if (!o.keepOpen) onClose();
              o.onPress();
            }}
          >
            <Text style={[styles.label, o.destructive && { color: colors.danger }]}>{o.label}</Text>
          </Pressable>
        ))}
        <View style={styles.sep} />
        <Pressable style={styles.option} onPress={onClose}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderTopWidth: 1, borderColor: colors.border,
  },
  title: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13, marginBottom: spacing.sm },
  option: { minHeight: 52, justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  label: { color: colors.text, fontFamily: fonts.medium, fontSize: 16 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
});
