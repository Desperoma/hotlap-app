import type { ExpoConfig } from "expo/config";

// Config Expo. En local, les variables viennent de .env.local (jamais commité) ;
// sur EAS Build, des variables d'environnement EAS (eas env:set), car .env.local n'est pas envoyé.
// GOOGLE_MAPS_ANDROID_API_KEY : nécessaire pour afficher la carte sur Android.

// Identifiant du projet EAS, affiché par `npx eas-cli@latest init` (pas un secret).
const EAS_PROJECT_ID = '2917e236-175f-4b58-a141-f86c1179dd06'; // @hotlaphar/hotlap

// Variantes de l'app (APP_VARIANT, fixé par chaque profil de eas.json). Identifiants différents :
// les versions de test et la version des testeurs s'installent côte à côte sur un même téléphone.
//   development : app de développement (se connecte au serveur Expo du PC), outils de test
//   preview     : « HotLap Test », version autonome pour Romain, outils de test (drive simulé)
//   beta        : « HotLap », version pour les testeurs (amis), sans outils de test
//   production  : version des stores
type Variant = 'development' | 'preview' | 'beta' | 'production';
const VARIANT = (process.env.APP_VARIANT ?? 'production') as Variant;
const VARIANTS: Record<Variant, { name: string; suffix: string; scheme: string }> = {
  development: { name: 'HotLap Dev', suffix: '.dev', scheme: 'hotlap-dev' },
  preview: { name: 'HotLap Test', suffix: '.test', scheme: 'hotlap-test' },
  beta: { name: 'HotLap', suffix: '', scheme: 'hotlap' },
  production: { name: 'HotLap', suffix: '', scheme: 'hotlap' },
};
const V = VARIANTS[VARIANT] ?? VARIANTS.production;

// Sans clé, le SDK Google Maps ferme l'app Android dès qu'une carte s'affiche. L'app lit
// extra.androidMapsKey (vrai / faux, jamais la clé elle-même) et n'affiche alors pas de carte.
const ANDROID_MAPS_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() || undefined;
if (!ANDROID_MAPS_KEY && process.env.EAS_BUILD_PLATFORM === 'android') {
  console.warn('GOOGLE_MAPS_ANDROID_API_KEY absente : les cartes seront désactivées dans ce build Android.');
}

const config: ExpoConfig = {
  "name": V.name,
  "slug": "hotlap",
  "owner": "hotlaphar",
  "scheme": V.scheme,
  "version": "0.1.0",
  "orientation": "portrait",
  "icon": "./assets/icon.png",
  "userInterfaceStyle": "dark",
  "backgroundColor": "#0E100E",
  "ios": {
    "bundleIdentifier": `com.hotlap.app${V.suffix}`,
    "supportsTablet": false,
    "infoPlist": {
      "UIBackgroundModes": [
        "location"
      ]
    }
  },
  "android": {
    "package": `com.hotlap.app${V.suffix}`,
    "adaptiveIcon": {
      "backgroundColor": "#0E100E",
      "foregroundImage": "./assets/android-icon-foreground.png",
      "backgroundImage": "./assets/android-icon-background.png",
      "monochromeImage": "./assets/android-icon-monochrome.png"
    },
    "predictiveBackGestureEnabled": false
  },
  "web": {
    "favicon": "./assets/favicon.png"
  },
  "plugins": [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        "image": "./assets/splash-icon.png",
        "imageWidth": 220,
        "resizeMode": "contain",
        "backgroundColor": "#0E100E"
      }
    ],
    [
      "expo-location",
      {
        "locationAlwaysAndWhenInUsePermission": "HotLap enregistre le tracé de votre drive, y compris écran verrouillé.",
        "locationWhenInUsePermission": "HotLap utilise votre position pour afficher la carte et enregistrer vos drives.",
        "isIosBackgroundLocationEnabled": true,
        "isAndroidBackgroundLocationEnabled": true,
        "isAndroidForegroundServiceEnabled": true
      }
    ],
    [
      "expo-image-picker",
      {
        "photosPermission": "HotLap accède à vos photos pour les ajouter à vos drives et à votre garage."
      }
    ],
    [
      "react-native-maps",
      {
        "androidGoogleMapsApiKey": ANDROID_MAPS_KEY
      }
    ]
  ],
  "extra": {
    "androidMapsKey": !!ANDROID_MAPS_KEY,
    "variant": VARIANT
  },
  "experiments": {
    "typedRoutes": true
  }
};

if (EAS_PROJECT_ID) {
  config.extra = { ...config.extra, eas: { projectId: EAS_PROJECT_ID } };
}

export default config;
