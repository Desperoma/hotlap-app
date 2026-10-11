import type { TextStyle } from 'react-native';

/**
 * Michroma (titres larges, look « HOTLAP ») + Inter (texte courant).
 * Les noms correspondent aux clés chargées dans src/app/_layout.tsx.
 */
export const fonts = {
  display: 'Michroma_400Regular',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 36, letterSpacing: 4 },
  h1: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.5 },
  h2: { fontFamily: fonts.display, fontSize: 18 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  body: { fontFamily: fonts.regular, fontSize: 15 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  label: { fontFamily: fonts.semibold, fontSize: 13 },
  caption: { fontFamily: fonts.regular, fontSize: 12 },
  stat: { fontFamily: fonts.display, fontSize: 20 },
} satisfies Record<string, TextStyle>;
