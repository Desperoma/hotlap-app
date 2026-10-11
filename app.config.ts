import type { ExpoConfig } from "expo/config";

// Config Expo. En local, les variables viennent de .env.local (jamais commité) ;
// sur EAS Build, des variables d'environnement EAS (eas env:set), car .env.local n'est pas envoyé.
// GOOGLE_MAPS_ANDROID_API_KEY : nécessaire pour afficher la carte sur Android.

// Identifiant du projet EAS, affiché par `npx eas-cli@latest init` (pas un secret).
const EAS_PROJECT_ID = '';

const config: ExpoConfig = {
  "name": "HotLap",
  "slug": "hotlap",
  "scheme": "hotlap",
  "version": "0.1.0",
  "orientation": "portrait",
  "icon": "./assets/icon.png",
  "userInterfaceStyle": "dark",
  "backgroundColor": "#0E100E",
  "ios": {
    "bundleIdentifier": "com.hotlap.app",
    "supportsTablet": false,
    "infoPlist": {
      "UIBackgroundModes": [
        "location"
      ]
    }
  },
  "android": {
    "package": "com.hotlap.app",
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
        "androidGoogleMapsApiKey": process.env.GOOGLE_MAPS_ANDROID_API_KEY
      }
    ]
  ],
  "experiments": {
    "typedRoutes": true
  }
};

if (EAS_PROJECT_ID) {
  config.extra = { ...config.extra, eas: { projectId: EAS_PROJECT_ID } };
}

export default config;
