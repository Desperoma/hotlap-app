import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { OptionsSheet, type SheetOption } from '@/components/OptionsSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { block, report, REPORT_REASONS, type ReportTarget } from '@/features/moderation/api';

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

  const noun = { drive: 'drive', comment: 'comment', user: 'driver', crew: 'crew' }[target.type];

  const confirmBlock = () => later(() =>
    Alert.alert(`Block ${target.userName}?`, 'You won’t see each other’s drives or comments, and follows between you are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await block(me, target.userId);
            onBlocked?.(target.userId);
            Alert.alert('Blocked', `${target.userName} is blocked. You can unblock from their profile.`);
          } catch (e) {
            Alert.alert('Block failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]));

  const options: SheetOption[] =
    step === 'menu'
      ? [
          { label: `Report this ${noun}`, onPress: () => setStep('reasons'), keepOpen: true },
          ...(target.type === 'user' || target.type === 'crew' ? [] : [{ label: `Block ${target.userName}`, onPress: confirmBlock, destructive: true }]),
        ]
      : REPORT_REASONS.map((r) => ({
          label: r.label,
          onPress: async () => {
            try {
              await report(me, target.type, target.id, r.value);
              later(() => Alert.alert('Thanks for reporting', 'Our team will review it. The author isn’t told who reported it.'));
            } catch (e) {
              later(() => Alert.alert('Report failed', e instanceof Error ? e.message : String(e)));
            }
          },
        }));

  return (
    <OptionsSheet
      visible={!!target}
      title={step === 'reasons' ? `Why are you reporting this ${noun}?` : undefined}
      options={options}
      onClose={onClose}
    />
  );
}
