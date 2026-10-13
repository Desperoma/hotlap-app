import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ModerationSheet, type ModerationTarget } from '@/components/ModerationSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  addComment, deleteComment, displayName, initials, isLiked, listComments, setLike, type Comment,
} from '@/features/social/api';
import { colors, fonts, radius, spacing } from '@/theme';

/** Likes et commentaires sous un drive. */
export function DriveSocial({ driveId, likeCount, isOwner }: { driveId: string; likeCount: number; isOwner: boolean }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [liked, setLiked] = useState<boolean | null>(null);
  const [likes, setLikes] = useState(likeCount);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<ModerationTarget | null>(null);

  const loadComments = useCallback(() => {
    if (!me) return;
    listComments(driveId, me).then(setComments).catch(() => setComments([]));
  }, [driveId, me]);

  useEffect(() => {
    if (!me) return;
    isLiked(driveId, me).then(setLiked).catch(() => setLiked(false));
    loadComments();
  }, [driveId, me, loadComments]);

  const toggleLike = async () => {
    if (!me || liked === null) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await setLike(driveId, me, next);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      Alert.alert('Like failed', e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    if (!me || !draft.trim()) return;
    setSending(true);
    try {
      await addComment(driveId, me, draft);
      setDraft('');
      loadComments();
    } catch (e) {
      Alert.alert('Comment not sent', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const remove = (c: Comment) =>
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(c.id);
            setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={toggleLike} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.like : colors.textMuted} />
          <Text style={[styles.actionText, liked ? { color: colors.like } : null]}>{likes}</Text>
        </Pressable>
        <View style={styles.action}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
          <Text style={styles.actionText}>{comments?.length ?? '–'}</Text>
        </View>
      </View>

      <Text style={styles.section}>COMMENTS</Text>
      {comments === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : comments.length === 0 ? (
        <Text style={styles.muted}>No comments yet.</Text>
      ) : (
        comments.map((c) => {
          const name = displayName(c.author);
          return (
            <Pressable
              key={c.id}
              style={styles.comment}
              onLongPress={() => !c.isMine && c.author && setMenu({ type: 'comment', id: c.id, userId: c.author.id, userName: name })}
              accessibilityHint={c.isMine ? undefined : 'Long press to report or block'}
            >
              <Pressable onPress={() => c.author && router.push(`/user/${c.author.id}`)} style={styles.avatar}
                accessibilityLabel={`Open ${name}'s profile`}>
                <Text style={styles.initials}>{initials(name)}</Text>
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.author}>{name}</Text>
                <Text style={styles.body}>{c.body}</Text>
              </View>
              {!c.isMine && c.author && (
                <Pressable
                  onPress={() => c.author && setMenu({ type: 'comment', id: c.id, userId: c.author.id, userName: name })}
                  hitSlop={8}
                  accessibilityLabel="Report or block"
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
                </Pressable>
              )}
              {(c.isMine || isOwner) && (
                <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel="Delete comment">
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </Pressable>
          );
        })
      )}
      <ModerationSheet target={menu} onClose={() => setMenu(null)} onBlocked={loadComments} />

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          maxLength={1000}
          multiline
        />
        <Pressable onPress={send} disabled={sending || !draft.trim()} style={styles.send} accessibilityLabel="Send comment">
          {sending ? <ActivityIndicator color={colors.accentText} /> : <Ionicons name="arrow-up" size={20} color={colors.accentText} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  actionText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 15 },
  section: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  comment: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  initials: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 11 },
  author: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  body: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, backgroundColor: colors.input,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15, maxHeight: 120, paddingHorizontal: 6 },
  send: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
