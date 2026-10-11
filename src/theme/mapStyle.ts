import type { MapStyleElement } from 'react-native-maps';

/** Style sombre Google Maps (Android). Sur iOS, Apple Maps passe en sombre via userInterfaceStyle. */
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1d2420' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a938c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121412' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#212a24' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3326' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3530' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4a3f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1a1f' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
