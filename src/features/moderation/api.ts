import { removeOldAvatars } from '@/features/profile/avatar';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { t } from '@/i18n/core';
export type ReportTarget = 'drive' | 'comment' | 'user' | 'crew';
export type ReportReason = 'dangerous_driving' | 'spam' | 'harassment' | 'inappropriate' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'dangerous_driving', get label() { return t('Dangerous or illegal driving'); } },
  { value: 'harassment', get label() { return t('Harassment or hate'); } },
  { value: 'inappropriate', get label() { return t('Inappropriate content'); } },
  { value: 'spam', get label() { return t('Spam'); } },
  { value: 'other', get label() { return t('Something else'); } },
];

/** Signale un contenu à l'équipe. Un même contenu n'est compté qu'une fois par utilisateur. */
export async function report(me: string, targetType: ReportTarget, targetId: string, reason: ReportReason) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('reports')
    .upsert(
      { reporter_id: me, target_type: targetType, target_id: targetId, reason },
      { onConflict: 'reporter_id,target_type,target_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Bloque un conducteur : plus de contenu ni d'interaction dans les deux sens. */
export async function block(me: string, userId: string) {
  if (!isSupabaseConfigured || me === userId) return;
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: me, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unblock(me: string, userId: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
  if (error) throw error;
}

export async function isBlocked(me: string, userId: string) {
  if (!isSupabaseConfigured) return false;
  const { count } = await supabase.from('blocks').select('blocked_id', { count: 'exact', head: true })
    .eq('blocker_id', me).eq('blocked_id', userId);
  return (count ?? 0) > 0;
}

/**
 * Supprime définitivement le compte : d'abord les photos (Storage), puis l'utilisateur,
 * ce qui efface en cascade toutes ses données. Déconnecte ensuite la session locale.
 */
export async function deleteAccount(me: string) {
  if (!isSupabaseConfigured) return;
  const { data: media } = await supabase.from('drive_media').select('storage_path').eq('owner_id', me);
  if (media?.length) {
    const { error: e } = await supabase.storage.from('drive-media').remove(media.map((m) => m.storage_path));
    if (e) throw e;
  }
  await removeOldAvatars(me);
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
