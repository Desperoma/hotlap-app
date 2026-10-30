import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, fonts, radius, spacing, type } from '@/theme';

type Mode = 'login' | 'register';

/** Écrans Login + Register de la maquette (un seul écran, deux modes). */
export default function AuthScreen() {
  const { signIn, signUp, isDemo } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === 'login') await signIn(identifier, password);
      else {
        const codeSent = await signUp({ username, email, password, phone });
        if (codeSent) router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      }
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.hero}>
        <Image source={require('../../../assets/logo/logo-full.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="HotLap" />
        <Text style={styles.tagline}>All your routes in one place</Text>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{mode === 'login' ? 'Welcome back.' : 'Create Account'}</Text>

          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[{ value: 'login', label: 'Log in' }, { value: 'register', label: 'Register' }]}
          />

          {mode === 'login' ? (
            <>
              <TextField label="Email or username" icon="person-outline" placeholder="you@mail.com or your username"
                keyboardType="email-address" autoComplete="username" autoCorrect={false}
                value={identifier} onChangeText={setIdentifier} />
              <TextField label="Password" icon="lock-closed-outline" placeholder="Enter your password" secure
                value={password} onChangeText={setPassword} />
              <Pressable style={{ alignSelf: 'flex-end' }}>
                <Text style={styles.link}>Forgot password?</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextField label="Username" icon="person-outline" placeholder="e.g. romain_rx7 (letters, numbers, _ .)"
                autoCapitalize="none" autoCorrect={false}
                value={username} onChangeText={setUsername} />
              <TextField label="Email" icon="mail-outline" placeholder="Enter your email" keyboardType="email-address"
                value={email} onChangeText={setEmail} />
              <TextField label="Phone (optional)" icon="call-outline" placeholder="+33 6 12 34 56 78"
                keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              <Text style={styles.hint}>Facultatif, jamais affiché aux autres utilisateurs.</Text>
              <TextField label="Password" icon="lock-closed-outline" placeholder="Create a secure password" secure
                value={password} onChangeText={setPassword} />
            </>
          )}

          <Button title={mode === 'login' ? 'Log in' : 'Register'} onPress={submit} loading={loading} />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.or}>Or</Text>
            <View style={styles.divider} />
          </View>

          {/* Connexion sociale : phase V1 (voir cadrage). */}
          <View style={styles.socialRow}>
            <SocialButton icon="logo-google" />
            <SocialButton icon="logo-apple" />
          </View>

          {isDemo && (
            <Text style={styles.demo}>Mode démo : Supabase n'est pas configuré, n'importe quel identifiant fonctionne.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SocialButton({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      style={styles.social}
      onPress={() => Alert.alert('Bientôt', 'La connexion Google et Apple arrive en V1.')}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    alignItems: 'center', paddingTop: spacing.xxl, paddingBottom: 48, backgroundColor: '#090A09',
    borderBottomLeftRadius: 0, borderBottomRightRadius: 120,
  },
  logo: { width: 170, height: 121 },
  tagline: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, marginTop: 8 },
  form: { padding: spacing.lg, gap: spacing.lg, paddingTop: spacing.xl },
  title: { ...type.h1, color: colors.text },
  link: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, textDecorationLine: 'underline' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  social: {
    width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  hint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 11, marginTop: -8 },
  demo: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
});
