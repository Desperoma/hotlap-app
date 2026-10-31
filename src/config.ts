import { t } from '@/i18n/core';
/**
 * Réglages produit centralisés. Chaque valeur renvoie à une question du doc de cadrage.
 */

/**
 * Âge minimum pour CRÉER UN COMPTE (consentement numérique RGPD : 13 à 16 ans selon le pays, 15 en France).
 * 16 = le plus strict de l'UE, valable partout. Question ouverte du cadrage.
 * L'âge pour ENREGISTRER un drive est distinct : il dépend du pays et du lieu (route ou circuit),
 * table country_rules côté base, voir src/features/recording/authorization.ts.
 */
export const MIN_ACCOUNT_AGE = 16;

/** Pays proposés à l'onboarding (ISO 3166-1 alpha-2). « Autre » permet la saisie libre. */
export const COUNTRIES: { code: string; name: string; regionLabel: string }[] = [
  { code: 'FR', get name() { return t('France'); }, get regionLabel() { return t('Département'); } },
  { code: 'BE', get name() { return t('Belgique'); }, get regionLabel() { return t('Province'); } },
  { code: 'CH', get name() { return t('Suisse'); }, get regionLabel() { return t('Canton'); } },
  { code: 'LU', get name() { return t('Luxembourg'); }, get regionLabel() { return t('Canton'); } },
  { code: 'DE', get name() { return t('Allemagne'); }, get regionLabel() { return t('Land'); } },
  { code: 'NL', get name() { return t('Pays-Bas'); }, get regionLabel() { return t('Province'); } },
  { code: 'IT', get name() { return t('Italie'); }, get regionLabel() { return t('Région'); } },
  { code: 'ES', get name() { return t('Espagne'); }, get regionLabel() { return t('Communauté autonome'); } },
  { code: 'PT', get name() { return t('Portugal'); }, get regionLabel() { return t('District'); } },
  { code: 'GB', get name() { return t('Royaume-Uni'); }, get regionLabel() { return t('Comté'); } },
  { code: 'AT', get name() { return t('Autriche'); }, get regionLabel() { return t('Land'); } },
  { code: 'MA', get name() { return t('Maroc'); }, get regionLabel() { return t('Région'); } },
  { code: 'DZ', get name() { return t('Algérie'); }, get regionLabel() { return t('Wilaya'); } },
  { code: 'TN', get name() { return t('Tunisie'); }, get regionLabel() { return t('Gouvernorat'); } },
  { code: 'CA', get name() { return t('Canada'); }, get regionLabel() { return t('Province'); } },
  { code: 'US', get name() { return t('États-Unis'); }, get regionLabel() { return t('État'); } },
];
