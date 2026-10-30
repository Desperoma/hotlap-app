import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, fonts, spacing, type } from '@/theme';

/** Sécurité : changer de mot de passe, se déconnecter de tous les appareils. */
export default function SecurityScreen() {
  const { session, signOut } = useAuth();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const err = pwd && pwd.length < 8 ? '8 caractères minimum' : confirm && confirm !== pwd ? 'Les deux mots de passe diffèrent' : null;

  const change = async () => {
    if (!isSupabaseConfigured || err || !pwd) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      return Alert.alert('Changement impossible',
        m.includes('reauth') || m.includes('nonce') ? 'Reconnecte-toi puis réessaie (connexion trop ancienne).'
          : m.includes('same') ? 'Choisis un mot de passe différent de l’actuel.'
          : m.includes('weak') ? 'Mot de passe trop faible.' : error.message);
    }
    setPwd(''); setConfirm('');
    Alert.alert('Mot de passe changé', 'Utilise-le à ta prochaine connexion.');
  };

  const signOutEverywhere = () => Alert.alert('Sign out everywhere?', 'All your devices will need to log in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut({ scope: 'global' }).catch(() => {}); await signOut(); } },
  ]);

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title}>Security</Text>
      </View>
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.label}>Change password</Text>
        <Text style={styles.hint}>Compte : {session?.user.email ?? '—'}</Text>
        <TextField label="New password" icon="lock-closed-outline" value={pwd} onChangeText={setPwd} secure autoCapitalize="none" />
        <TextField label="Confirm" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" />
        {err ? <Text style={styles.error}>{err}</Text> : null}
        <Button title="Update password" onPress={change} loading={busy} disabled={!pwd || !confirm || !!err} />
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.label}>Sessions</Text>
        <Text style={styles.hint}>Déconnecte HotLap sur tous tes téléphones, celui-ci compris.</Text>
        <Button title="Sign out everywhere" variant="secondary" icon="log-out-outline" onPress={signOutEverywhere} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.h1, color: colors.text, fontSize: 24 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
