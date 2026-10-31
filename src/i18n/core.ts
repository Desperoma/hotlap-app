/**
 * Traductions (anglais, français, espagnol, allemand). Le texte anglais sert de clé :
 *   t('Leaderboard')                      → « Classement » en français
 *   t('Unblock @{0}?', username)          → valeurs insérées à la place de {0}, {1}…
 * Une clé absente d'une langue s'affiche en anglais. Les dictionnaires sont dans
 * src/i18n/locales/*.json (npm run i18n:check liste les traductions manquantes).
 * Fichier sans dépendance Expo : utilisable dans les modules testés hors de l'app.
 */
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

export type Lang = 'en' | 'fr' | 'es' | 'de';
export const LANGS: { key: Lang; label: string; flag: string }[] = [
  { key: 'en', label: 'English', flag: 'EN' },
  { key: 'fr', label: 'Français', flag: 'FR' },
  { key: 'es', label: 'Español', flag: 'ES' },
  { key: 'de', label: 'Deutsch', flag: 'DE' },
];
const DICTS: Record<Lang, Record<string, string>> = { en, fr, es, de };

let current: Lang = 'en';
export const getLang = () => current;
export const setLangNow = (l: Lang) => { current = l; };
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'fr' || v === 'es' || v === 'de';

export function t(key: string, ...args: (string | number | null | undefined)[]): string {
  const s = DICTS[current][key] ?? DICTS.en[key] ?? key;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] ?? '').toString()) : s;
}

/** Locale pour les dates et les nombres (toLocaleDateString…). */
export const locale = () => ({ en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' })[current];
