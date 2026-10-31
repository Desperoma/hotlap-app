import type { Visibility } from '@/lib/database.types';

import { t } from '@/i18n/core';
/** Visibilité d'un drive (voir « Confidentialité » dans le doc de cadrage). */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', get label() { return t('Only me'); } },
  { value: 'friends', get label() { return t('Friends'); } },
  { value: 'followers', get label() { return t('Followers'); } },
  { value: 'public', get label() { return t('Everyone'); } },
];

export const VISIBILITY_HINT: Record<Visibility, string> = {
  get private() { return t('Only you can see this drive.'); },
  get friends() { return t('Drivers you follow who follow you back can see it.'); },
  get followers() { return t('Everyone who follows you can see it, friends included.'); },
  get public() { return t('Everyone can see it.'); },
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  get private() { return t('Only me'); }, get friends() { return t('Friends'); }, get followers() { return t('Followers'); }, get public() { return t('Everyone'); },
};
