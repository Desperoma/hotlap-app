/**
 * Palette HotLap, relevée sur la maquette (thème sombre unique pour l'instant).
 * Toujours passer par ces tokens plutôt que des couleurs en dur dans les écrans.
 */
export const colors = {
  bg: '#0E100E',
  bgElevated: '#161916',
  card: '#1B1E1B',
  cardPressed: '#232723',
  input: '#121412',
  border: '#2A2E2A',
  borderStrong: '#3A3F3A',

  text: '#F4F6F2',
  textMuted: '#9AA09A',
  textFaint: '#5E645E',

  accent: '#C6F432', // vert citron des boutons principaux
  accentText: '#0E100E', // texte posé sur l'accent
  accentSoft: 'rgba(198, 244, 50, 0.14)',

  routeBlue: '#3B82F6',
  routePurple: '#8B5CF6',
  like: '#C6F432',
  danger: '#F05252',
  live: '#7BD13F',
} as const;

export type ColorToken = keyof typeof colors;
