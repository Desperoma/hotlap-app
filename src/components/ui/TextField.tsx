import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius } from '@/theme';

type Props = TextInputProps & { label: string; icon: keyof typeof Ionicons.glyphMap; secure?: boolean };

export function TextField({ label, icon, secure, style, ...rest }: Props) {
  const [hidden, setHidden] = useState(secure ?? false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, style]}
          secureTextEntry={secure ? hidden : false}
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  field: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.input,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
  },
  fieldFocused: { borderColor: colors.accent },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
});
