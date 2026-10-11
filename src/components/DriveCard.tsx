import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { formatKm } from '@/features/recording/geo';
import type { DriveFeedItem } from '@/lib/database.types';
import { colors, fonts, radius, type } from '@/theme';

/** Post du fil Community. */
export function DriveCard({ drive }: { drive: DriveFeedItem }) {
  const [liked, setLiked] = useState(drive.liked_by_me);
  const likes = drive.like_count + (liked === drive.liked_by_me ? 0 : liked ? 1 : -1);
  const name = drive.author.display_name ?? drive.author.username;
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Card onPress={() => router.push(`/drive/${drive.id}`)} style={{ gap: 12 }}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{name}</Text>
          <Text style={styles.time}>{timeAgo(drive.created_at)}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </View>

      {drive.vehicle && (
        <View style={styles.vehicle}>
          <Ionicons name="car-sport-outline" size={12} color={colors.textMuted} />
          <Text style={styles.vehicleText}>{drive.vehicle.make} {drive.vehicle.model}</Text>
        </View>
      )}

      <Text style={styles.title}>{drive.title}</Text>
      {drive.description ? <Text style={styles.desc}>{drive.description}</Text> : null}

      <View style={styles.preview}>
        <Ionicons name="git-network-outline" size={36} color={colors.routeBlue} />
        <View style={styles.stats}>
          <Stat value={`${formatKm(drive.distance_m)} km`} label="DISTANCE" />
          <Stat value={`${Math.round(drive.duration_s / 60)}m`} label="TIME" />
          {drive.score != null && <Stat value={String(drive.score)} label="SCORE" />}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => setLiked((l) => !l)} hitSlop={8}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.like : colors.textMuted} />
          <Text style={[styles.actionText, liked && { color: colors.like }]}>{likes}</Text>
        </Pressable>
        <View style={styles.action}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={styles.actionText}>{drive.comment_count}</Text>
        </View>
        <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
      </View>
    </Card>
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

function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  initials: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
  author: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  time: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  vehicle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  vehicleText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  title: { ...type.h2, color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  desc: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  preview: {
    height: 180, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.routeBlue,
    backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  stats: { position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', gap: 40 },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14 },
});
