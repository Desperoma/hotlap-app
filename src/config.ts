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
  { code: 'FR', name: 'France', regionLabel: 'Département' },
  { code: 'BE', name: 'Belgique', regionLabel: 'Province' },
  { code: 'CH', name: 'Suisse', regionLabel: 'Canton' },
  { code: 'LU', name: 'Luxembourg', regionLabel: 'Canton' },
  { code: 'DE', name: 'Allemagne', regionLabel: 'Land' },
  { code: 'NL', name: 'Pays-Bas', regionLabel: 'Province' },
  { code: 'IT', name: 'Italie', regionLabel: 'Région' },
  { code: 'ES', name: 'Espagne', regionLabel: 'Communauté autonome' },
  { code: 'PT', name: 'Portugal', regionLabel: 'District' },
  { code: 'GB', name: 'Royaume-Uni', regionLabel: 'Comté' },
  { code: 'AT', name: 'Autriche', regionLabel: 'Land' },
  { code: 'MA', name: 'Maroc', regionLabel: 'Région' },
  { code: 'DZ', name: 'Algérie', regionLabel: 'Wilaya' },
  { code: 'TN', name: 'Tunisie', regionLabel: 'Gouvernorat' },
  { code: 'CA', name: 'Canada', regionLabel: 'Province' },
  { code: 'US', name: 'États-Unis', regionLabel: 'État' },
];
