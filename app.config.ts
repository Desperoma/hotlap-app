import type { ExpoConfig } from "expo/config";

// Config Expo. Les secrets viennent de .env.local (jamais commité).
// GOOGLE_MAPS_ANDROID_API_KEY : nécessaire pour afficher la carte sur Android.
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

export default config;
