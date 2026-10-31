import { MIN_ACCOUNT_AGE } from '@/config';
import { t } from '@/i18n/core';

/** "JJ/MM/AAAA" -> "AAAA-MM-JJ", ou null si la date n'existe pas. */
export function parseBirthDate(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

export function ageOn(isoBirthDate: string, today = new Date()) {
  const [y, m, d] = isoBirthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

/** Renvoie un message d'erreur, ou null si la date est valable. */
export function birthDateError(input: string): string | null {
  const iso = parseBirthDate(input);
  if (!iso) return t('Date invalide (format JJ/MM/AAAA).');
  const age = ageOn(iso);
  if (age > 110) return t('Date invalide.');
  if (age < MIN_ACCOUNT_AGE) return t('Il faut avoir au moins {0} ans pour créer un compte.', MIN_ACCOUNT_AGE);
  return null;
}

/** Ajoute les « / » au fil de la saisie : 01011990 -> 01/01/1990 */
export function maskBirthDate(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

/** "1995-05-01" -> "01/05/1995" */
export const isoToDisplay = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
