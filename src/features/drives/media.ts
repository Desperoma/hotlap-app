import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const MAX_PHOTOS = 8;
const BUCKET = 'drive-media';
const MAX_SIDE = 2048;

/** Choix de photos dans la galerie (pas de vidéo pour l'instant). */
export async function pickPhotos(remaining: number): Promise<string[]> {
  if (remaining <= 0) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,
    exif: false,
  });
  if (res.canceled) return [];
  return res.assets.slice(0, remaining).map((a) => a.uri);
}

/**
 * Réencode la photo en JPEG, 2048 px max. Le réencodage repart de l'image décodée :
 * les métadonnées EXIF (dont la position GPS de la prise de vue) ne sont pas recopiées.
 */
async function preparePhoto(uri: string) {
  const ctx = ImageManipulator.manipulate(uri);
  const first = await ctx.renderAsync();
  if (Math.max(first.width, first.height) > MAX_SIDE) {
    ctx.resize(first.width >= first.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** Envoie les photos d'un drive. Renvoie le nombre de photos envoyées avec succès. */
export async function uploadDrivePhotos(ownerId: string, driveId: string, uris: string[]): Promise<number> {
  if (!isSupabaseConfigured || uris.length === 0) return 0;
  let ok = 0;
  for (const [i, uri] of uris.slice(0, MAX_PHOTOS).entries()) {
    const local = await preparePhoto(uri);
    const body = await (await fetch(local)).arrayBuffer();
    const path = `${ownerId}/${driveId}/${Date.now()}-${i}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const { error } = await supabase
      .from('drive_media')
      .insert({ drive_id: driveId, owner_id: ownerId, storage_path: path, type: 'photo', position: i });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    ok++;
  }
  return ok;
}

/** URLs signées (1 h) des photos d'un drive visible par l'utilisateur. */
export async function listDrivePhotos(driveId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('drive_media')
    .select('storage_path')
    .eq('drive_id', driveId)
    .eq('type', 'photo')
    .order('position');
  if (error) throw error;
  if (!data?.length) return [];
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(data.map((m) => m.storage_path), 3600);
  if (signed.error) throw signed.error;
  return signed.data.map((s) => s.signedUrl).filter((u): u is string => !!u);
}

/** Supprime les fichiers d'un drive avant de supprimer le drive (la base ne nettoie pas Storage). */
export async function removeDrivePhotos(driveId: string) {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.from('drive_media').select('storage_path').eq('drive_id', driveId);
  if (data?.length) await supabase.storage.from(BUCKET).remove(data.map((m) => m.storage_path));
}
