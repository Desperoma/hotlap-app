import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { initials } from '@/features/social/api';
import { colors, fonts } from '@/theme';

/** Photo de profil ronde, ou initiales si pas de photo (ou si elle ne charge pas). */
export function Avatar({ url, name, size = 40, ring = false }: {
  url: string | null | undefined;
  name: string;
  size?: number;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.box, box, ring && styles.ring]}>
      {url && !failed ? (
        <Image source={{ uri: url }} style={box} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.33) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ring: { borderWidth: 2, borderColor: colors.accent },
  initials: { color: colors.accent, fontFamily: fonts.semibold },
});
