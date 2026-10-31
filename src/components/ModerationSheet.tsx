import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { OptionsSheet, type SheetOption } from '@/components/OptionsSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { block, report, REPORT_REASONS, type ReportTarget } from '@/features/moderation/api';

import { t } from '@/i18n';
export type ModerationTarget = {
  type: ReportTarget;
  id: string;
  /** Auteur du contenu, pour proposer de le bloquer */
  userId: string;
  userName: string;
};

/** Menu « … » d'un contenu d'un autre utilisateur : signaler (avec motif) ou bloquer l'auteur. */
export function ModerationSheet({ target, onClose, onBlocked }: {
  target: ModerationTarget | null;
  onClose: () => void;
  onBlocked?: (userId: string) => void;
}) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [step, setStep] = useState<'menu' | 'reasons'>('menu');

  useEffect(() => {
    if (target) setStep('menu');
  }, [target]);

  if (!me || !target || target.userId === me) return null;

  // Une alerte ouverte pendant la fermeture de la feuille peut être ignorée sur iOS : on attend la fin de l'animation.
  const later = (fn: () => void) => setTimeout(fn, 400);

  const noun = { drive: t('drive'), comment: t('comment'), user: t('driver'), crew: t('crew') }[target.type];

  const confirmBlock = () => later(() =>
    Alert.alert(t('Block {0}?', target.userName), t('You won’t see each other’s drives or comments, and follows between you are removed.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Block'),
        style: 'destructive',
        onPress: async () => {
          try {
            await block(me, target.userId);
            onBlocked?.(target.userId);
            Alert.alert(t('Blocked'), t('{0} is blocked. You can unblock from their profile.', target.userName));
          } catch (e) {
            Alert.alert(t('Block failed'), e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]));

  const options: SheetOption[] =
    step === 'menu'
      ? [
          { label: t('Report this {0}', noun), onPress: () => setStep('reasons'), keepOpen: true },
          ...(target.type === 'user' || target.type === 'crew' ? [] : [{ label: t('Block {0}', target.userName), onPress: confirmBlock, destructive: true }]),
        ]
      : REPORT_REASONS.map((r) => ({
          label: r.label,
          onPress: async () => {
            try {
              await report(me, target.type, target.id, r.value);
              later(() => Alert.alert(t('Thanks for reporting'), t('Our team will review it. The author isn’t told who reported it.')));
            } catch (e) {
              later(() => Alert.alert(t('Report failed'), e instanceof Error ? e.message : String(e)));
            }
          },
        }));

  return (
    <OptionsSheet
      visible={!!target}
      title={step === 'reasons' ? t('Why are you reporting this {0}?', noun) : undefined}
      options={options}
      onClose={onClose}
    />
  );
}
