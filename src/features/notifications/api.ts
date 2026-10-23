import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Notifications de la cloche (migration 0016) : créées par la base, lues ici. */
export type NotificationType = 'like' | 'comment' | 'follow' | 'follow_request' | 'follow_accepted';

export type AppNotification = {
  id: number;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  driveId: string | null;
  driveTitle: string | null;
  commentExcerpt: string | null;
  /** Je suis déjà l'auteur en retour (pour « Follow back ») */
  iFollow: boolean;
  /** Demande d'abonnement encore en attente */
  requestPending: boolean;
};

type Row = {
  id: number; type: NotificationType; created_at: string; read_at: string | null;
  actor_id: string; actor_username: string; actor_display_name: string | null; actor_avatar_url: string | null;
  drive_id: string | null; drive_title: string | null; comment_excerpt: string | null;
  i_follow: boolean; request_pending: boolean;
};

export async function listNotifications(before?: string): Promise<AppNotification[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: 30, ...(before ? { p_before: before } : {}) });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, type: r.type, createdAt: r.created_at, read: !!r.read_at,
    actor: { id: r.actor_id, username: r.actor_username, displayName: r.actor_display_name, avatarUrl: r.actor_avatar_url },
    driveId: r.drive_id, driveTitle: r.drive_title, commentExcerpt: r.comment_excerpt,
    iFollow: r.i_follow, requestPending: r.request_pending,
  }));
}

export async function unreadCount(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { data, error } = await supabase.rpc('unread_notifications_count');
  if (error) throw error;
  return (data as number | null) ?? 0;
}

export async function markAllRead() {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('mark_notifications_read', {});
  if (error) throw error;
}

/** Texte d'une notification, sans le nom de l'auteur (affiché en gras devant). */
export function notificationText(n: AppNotification): string {
  switch (n.type) {
    case 'like': return `liked your drive${n.driveTitle ? ` “${n.driveTitle}”` : ''}.`;
    case 'comment': return `commented${n.driveTitle ? ` on “${n.driveTitle}”` : ''}: ${n.commentExcerpt ?? ''}`;
    case 'follow': return n.iFollow ? 'followed you back. You are now friends.' : 'started following you.';
    case 'follow_request': return n.requestPending ? 'wants to follow you.' : 'sent you a follow request.';
    case 'follow_accepted': return 'accepted your follow request.';
  }
}
