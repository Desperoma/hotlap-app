import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import type React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ClassBadge } from '@/components/ClassBadge';
import { DriveMap } from '@/components/DriveMap';
import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { Card } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatKm } from '@/features/recording/geo';
import { displayName, setLike } from '@/features/social/api';
import type { DriveFeedItem } from '@/lib/database.types';
import { colors, fonts, radius, type } from '@/theme';

/** Post du fil (accueil, profil) : carte du tracé et stats. */
export function DriveCard({ drive, onBlocked }: { drive: DriveFeedItem; onBlocked?: (userId: string) => void }) {
  return (
    <Card onPress={() => router.push(`/drive/${drive.id}`)} style={{ gap: 12 }}>
      <PostHeader drive={drive} onBlocked={onBlocked} />

      <Text style={styles.title}>{drive.title}</Text>
      {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}

      <DriveMap path={drive.path_preview} lite style={styles.preview} emptyLabel="Route hidden">
        <View style={styles.stats} pointerEvents="none">
          <Stat value={`${formatKm(drive.distance_m)} km`} label="DISTANCE" />
          <Stat value={`${Math.round(drive.duration_s / 60)}m`} label="TIME" />
          {drive.score != null && <Stat value={String(drive.score)} label="SCORE" />}
        </View>
      </DriveMap>

      <PostActions drive={drive} />
    </Card>
  );
}

/** En-tête d'un post : auteur, date, menu de modération. */
export function PostHeader({ drive, onBlocked, right }: {
  drive: DriveFeedItem; onBlocked?: (userId: string) => void; right?: React.ReactNode;
}) {
  const { session } = useAuth();
  const name = displayName(drive.author);
  const [menu, setMenu] = useState<ModerationTarget | null>(null);
  const isMine = session?.user.id === drive.owner_id;
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.push(`/user/${drive.owner_id}`)} style={styles.authorLink} accessibilityLabel={`Open ${name}'s profile`}>
        <Avatar url={drive.author.avatar_url} name={name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.author} numberOfLines={1}>{name}</Text>
          <View style={styles.metaRow}>
            {drive.vehicle_class && <ClassBadge cls={drive.vehicle_class.cls} size="sm" />}
            <Text style={[styles.time, { flexShrink: 1 }]} numberOfLines={1}>{timeAgo(drive.created_at)}{drive.vehicle ? ` · ${drive.vehicle.make} ${drive.vehicle.model}` : ''}</Text>
          </View>
        </View>
      </Pressable>
      {right}
      {!isMine && (
        <Pressable
          onPress={() => setMenu({ type: 'drive', id: drive.id, userId: drive.owner_id, userName: name })}
          hitSlop={12}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </Pressable>
      )}
      <ModerationSheet target={menu} onClose={() => setMenu(null)} onBlocked={onBlocked} />
    </View>
  );
}

/** J'aime (optimiste) et commentaires. */
export function PostActions({ drive }: { drive: DriveFeedItem }) {
  const { session } = useAuth();
  const [liked, setLiked] = useState(drive.liked_by_me);
  const likes = drive.like_count + (liked === drive.liked_by_me ? 0 : liked ? 1 : -1);
  // Optimiste : on bascule tout de suite, on revient en arrière si la base refuse.
  const toggleLike = async () => {
    if (!session) return;
    const next = !liked;
    setLiked(next);
    try {
      await setLike(drive.id, session.user.id, next);
    } catch (e) {
      setLiked(!next);
      Alert.alert('Like failed', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={styles.actions}>
      <Pressable style={styles.action} onPress={toggleLike} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.like : colors.textMuted} />
        <Text style={[styles.actionText, liked && { color: colors.like }]}>{likes}</Text>
      </Pressable>
      <Pressable style={styles.action} onPress={() => router.push(`/drive/${drive.id}`)} hitSlop={8} accessibilityLabel="Comments">
        <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
        <Text style={styles.actionText}>{drive.comment_count}</Text>
      </Pressable>
      {/* Partage : désactivé tant qu'il n'y a pas de nom de domaine pour des liens cliquables partout. */}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return 'just now';
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  authorLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  author: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  time: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  vehicle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  vehicleText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  title: { ...type.h2, color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  desc: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  preview: { height: 190, borderRadius: radius.md },
  // Bandeau lisible par-dessus la carte
  stats: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 32,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(14,16,14,0.78)',
  },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14 },
});
