import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { VehicleForm } from '@/features/garage/VehicleForm';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
/** Ajouter un véhicule au garage, ou modifier celui dont l'id est passé en paramètre. */
export default function EditVehicleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { vehicles, addVehicle, updateVehicle } = useAuth();
  const existing = id ? vehicles?.find((v) => v.id === id) ?? null : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/garage'));

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>{existing ? t('Edit vehicle') : t('New vehicle')}</Text>
        <Text style={styles.muted}>{existing ? `${existing.make} ${existing.model}` : t('Add a car to your garage.')}</Text>
      </View>
      <VehicleForm
        key={existing?.id ?? 'new'}
        initial={existing}
        showNickname
        submitLabel={existing ? t('Save') : t('Add to garage')}
        onSubmit={async (v) => {
          if (existing) await updateVehicle(existing.id, v);
          else await addVehicle(v);
          back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  title: { ...type.h1, color: colors.text, fontSize: 26 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
});
