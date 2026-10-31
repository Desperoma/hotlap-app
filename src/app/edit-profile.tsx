import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { OptionsSheet } from '@/components/OptionsSheet';
import { Button, Card, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isoToDisplay } from '@/features/onboarding/validation';
import { PlaceFields, type PlaceValue } from '@/features/places/PlaceFields';
import { pickAvatar, removeOldAvatars, uploadAvatar } from '@/features/profile/avatar';
import { colors, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
const BIO_MAX = 280;

/**
 * Modifier son profil. Public : photo, nom affiché, bio, ville.
 * Privé (jamais montré aux autres) : prénom, nom, téléphone. La date de naissance est verrouillée.
 */
export default function EditProfileScreen() {
  const { session, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [place, setPlace] = useState<PlaceValue>({
    countryCode: profile?.country_code?.trim() || null, region: profile?.region ?? '', city: profile?.home_city ?? '',
  });
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);

  // Profil arrivé après l'ouverture de l'écran (ou rechargé) : on remplit les champs non modifiés.
  const touched = useRef(false);
  useEffect(() => {
    if (!profile || touched.current) return;
    setDisplayName(profile.display_name ?? profile.username ?? '');
    setBio(profile.bio ?? '');
    setPlace({ countryCode: profile.country_code?.trim() || null, region: profile.region ?? '', city: profile.home_city ?? '' });
    setFirst(profile.first_name ?? '');
    setLast(profile.last_name ?? '');
    setPhone(profile.phone ?? '');
  }, [profile]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { touched.current = true; set(v); };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const userId = session?.user.id;
  if (!profile || !userId) return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;

  const changePhoto = async () => {
    try {
      const uri = await pickAvatar();
      if (!uri) return;
      setPhotoBusy(true);
      const url = await uploadAvatar(userId, uri);
      await updateProfile({ avatar_url: url });
    } catch (e) {
      Alert.alert(t('Photo not updated'), e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateProfile({ avatar_url: null });
      await removeOldAvatars(userId);
    } catch (e) {
      Alert.alert(t('Photo not removed'), e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (!first.trim() || !last.trim()) return Alert.alert(t('Presque'), t('Prénom et nom sont obligatoires.'));
    if (!place.countryCode || !place.city.trim()) return Alert.alert(t('Presque'), t('Le pays et la ville sont obligatoires.'));
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        country_code: place.countryCode,
        region: place.region.trim() || null,
        home_city: place.city.trim(),
        first_name: first.trim(),
        last_name: last.trim(),
        phone: phone.trim() || null,
      });
      back();
    } catch (e) {
      Alert.alert(t('Not saved'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const name = displayName.trim() || profile.username;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel={t('Back')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Edit profile')}</Text>
      </View>

      <Pressable style={styles.photo} onPress={() => (profile.avatar_url ? setPhotoMenu(true) : changePhoto())}
        disabled={photoBusy} accessibilityLabel={t('Change profile photo')}>
        <Avatar url={profile.avatar_url} name={name} size={96} ring />
        {photoBusy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.link}>{t('Change photo')}</Text>}
      </Pressable>
      <OptionsSheet
        visible={photoMenu}
        onClose={() => setPhotoMenu(false)}
        options={[
          { label: t('Choose a new photo'), onPress: () => setTimeout(changePhoto, 400) },
          { label: t('Remove photo'), destructive: true, onPress: removePhoto },
        ]}
      />

      <Text style={styles.section}>{t('PUBLIC')}</Text>
      <Text style={styles.hint}>@{profile.username}{' '}{t('· ton pseudo ne change pas.')}</Text>
      <TextField label={t('Display name')} icon="person-outline" placeholder={profile.username} autoCapitalize="words"
        value={displayName} onChangeText={touch(setDisplayName)} maxLength={40} />
      <View style={{ gap: 6 }}>
        <TextField label={t('Bio')} icon="create-outline" placeholder={t('What do you drive, where, why?')} autoCapitalize="sentences"
          value={bio} onChangeText={touch(setBio)} maxLength={BIO_MAX} multiline />
        <Text style={[styles.hint, { textAlign: 'right' }]}>{bio.length}/{BIO_MAX}</Text>
      </View>
      <PlaceFields value={place} onChange={touch(setPlace)} />

      <Text style={styles.section}>{t('PRIVATE')}</Text>
      <Text style={styles.hint}>{t('Visible par toi seul.')}</Text>
      <TextField label={t('First name')} icon="person-outline" autoCapitalize="words" value={first} onChangeText={touch(setFirst)} />
      <TextField label={t('Last name')} icon="person-outline" autoCapitalize="words" value={last} onChangeText={touch(setLast)} />
      <TextField label={t('Phone (optional)')} icon="call-outline" placeholder="+33 6 12 34 56 78" keyboardType="phone-pad"
        value={phone} onChangeText={touch(setPhone)} maxLength={20} />
      <Card style={{ gap: 4 }}>
        <Text style={styles.label}>{t('Date of birth')}</Text>
        <Text style={styles.hint}>
          {profile.birth_date ? isoToDisplay(profile.birth_date) : '—'}{' '}{t('· verrouillée : elle conditionne l\'enregistrement des drives. Pour la corriger, contacte le support.')}</Text>
      </Card>

      <Button title={t('Save')} icon="checkmark" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerTitle: { ...type.h1, color: colors.text, fontSize: 20 },
  photo: { alignItems: 'center', gap: spacing.sm },
  link: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
  section: { ...type.overline, color: colors.textMuted, fontSize: 11, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: -8 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
});
