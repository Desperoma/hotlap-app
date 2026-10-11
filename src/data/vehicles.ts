/**
 * Catalogue minimal pour l'onboarding, en attendant la table vehicle_models (voir supabase/seed.sql).
 * Question ouverte du cadrage : quelle source de données pour le catalogue complet ?
 */
export const VEHICLE_CATALOG: Record<string, string[]> = {
  Alpine: ['A110', 'A110 S', 'A290'],
  Audi: ['A1', 'A3', 'A3 e-tron', 'A4', 'A5', 'RS3', 'RS6', 'S3', 'TT', 'R8'],
  BMW: ['Série 1', 'Série 3', 'M2', 'M3', 'M4', 'Z4'],
  Ferrari: ['296 GTB', 'F8 Tributo', 'Roma', 'SF90'],
  Honda: ['Civic Type R', 'S2000', 'NSX'],
  Mazda: ['MX-5', 'RX-7', 'RX-8'],
  Mercedes: ['Classe A', 'A45 AMG', 'C63 AMG', 'AMG GT'],
  Peugeot: ['208 GTi', '308 GTi', 'RCZ'],
  Porsche: ['718 Cayman', '911 Carrera', '911 GT3', 'Taycan'],
  Renault: ['Clio RS', 'Mégane RS'],
  Tesla: ['Model 3', 'Model S', 'Model Y'],
  Toyota: ['GR86', 'GR Yaris', 'Supra'],
  Volkswagen: ['Golf GTI', 'Golf R', 'Polo GTI'],
};

export const MAKES = Object.keys(VEHICLE_CATALOG).sort();

const thisYear = new Date().getFullYear();
export const YEARS = Array.from({ length: thisYear - 1979 }, (_, i) => thisYear + 1 - i - 1);
