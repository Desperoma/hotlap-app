import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { reasonLabel, reportHref, STATUS_LABEL, type ReportItem } from '@/features/moderation/reports';
import { colors, fonts } from '@/theme';

const KIND: Record<string, string> = { drive: 'Drive', comment: 'Comment', user: 'Driver', crew: 'Crew' };

/** Un signalement : type, contenu visé, motif, date, statut ; ouvre le drive ou le profil. */
export function ReportCard({ r, footer }: { r: ReportItem; footer?: ReactNode }) {
  const href = reportHref(r);
  return (
    <Card style={{ gap: 6 }} onPress={href ? () => router.push(href as Href) : undefined}>
      <View style={styles.top}>
        <Text style={styles.kind}>{(KIND[r.target_type] ?? r.target_type).toUpperCase()}</Text>
        <Text style={[styles.status, r.status === 'open' && { color: colors.accent }]}>{STATUS_LABEL[r.status] ?? r.status}</Text>
      </View>
      <Text style={styles.label} numberOfLines={3}>{r.label ?? 'Deleted content'}</Text>
      <Text style={styles.hint}>
        {reasonLabel(r.reason)} · {new Date(r.created_at).toLocaleDateString()}{r.reporter ? ` · by @${r.reporter}` : ''}
      </Text>
      {r.details ? <Text style={styles.hint}>« {r.details} »</Text> : null}
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: { color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  status: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11 },
  label: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
