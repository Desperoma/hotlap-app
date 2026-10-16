import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Les cartes Google (Android) exigent une clé dans le build : sans elle, le SDK ferme l'app dès
 * qu'une MapView s'affiche. app.config.ts publie seulement « clé présente ou non » (extra.androidMapsKey).
 * iOS utilise Apple Maps, sans clé.
 *
 * Limite : avec une app de développement, la config vient du serveur de dev (.env.local du PC) ;
 * si l'app installée a été compilée sans clé mais que .env.local en a une, ce garde-fou ne la voit pas.
 */
export const MAPS_AVAILABLE =
  Platform.OS !== 'android' || (Constants.expoConfig?.extra as { androidMapsKey?: boolean } | undefined)?.androidMapsKey === true;
