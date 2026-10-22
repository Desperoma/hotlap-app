import type { Visibility } from '@/lib/database.types';

/** Visibilité d'un drive (voir « Confidentialité » dans le doc de cadrage). */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'friends', label: 'Friends' },
  { value: 'followers', label: 'Followers' },
  { value: 'public', label: 'Everyone' },
];

export const VISIBILITY_HINT: Record<Visibility, string> = {
  private: 'Only you can see this drive.',
  friends: 'Drivers you follow who follow you back can see it.',
  followers: 'Everyone who follows you can see it, friends included.',
  public: 'Everyone can see it.',
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'Only me', friends: 'Friends', followers: 'Followers', public: 'Everyone',
};
