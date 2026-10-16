import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
const SIDE = 512;

/** Choix d'une photo de profil, recadrée au carré par le système. null si annulé. */
export async function pickAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  return res.canceled ? null : res.assets[0]?.uri ?? null;
}

/**
 * Envoie la photo (512 px, JPEG réencodé : EXIF et position GPS retirés) dans avatars/<user>/,
 * supprime les anciennes et renvoie l'URL publique à enregistrer dans profiles.avatar_url.
 */
export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: SIDE, height: SIDE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  if (!isSupabaseConfigured) return saved.uri;

  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  await removeOldAvatars(userId, path);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Supprime toutes les photos de profil de l'utilisateur, sauf `keep`. */
export async function removeOldAvatars(userId: string, keep?: string) {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from(BUCKET).remove(old);
}
