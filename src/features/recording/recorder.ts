import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { acceptPoint, type TrackPoint } from './geo';

/**
 * Enregistrement d'un drive, y compris écran verrouillé.
 *
 * - La tâche d'arrière-plan DOIT être définie au chargement du module, au niveau racine :
 *   ce fichier est importé dans src/app/_layout.tsx pour cette raison.
 * - Les points sont gardés en mémoire et sauvegardés dans AsyncStorage toutes les 20 s,
 *   pour survivre à un crash ou à un kill de l'app pendant un drive.
 * - Nécessite un development build (npx expo run:ios / run:android), pas Expo Go.
 */

export const LOCATION_TASK = 'hotlap-drive-recording';
const STORAGE_KEY = 'hotlap/current-drive';

export type RecorderState = {
  status: 'idle' | 'recording' | 'paused';
  startedAt: number | null;
  points: TrackPoint[];
};

let state: RecorderState = { status: 'idle', startedAt: null, points: [] };
const listeners = new Set<(s: RecorderState) => void>();
let lastPersist = 0;

function emit() {
  listeners.forEach((l) => l(state));
  if (Date.now() - lastPersist > 20_000) {
    lastPersist = Date.now();
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }
}

export const recorder = {
  getState: () => state,
  subscribe(listener: (s: RecorderState) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Ajoute des positions brutes en appliquant le filtre GPS. */
  ingest(locations: Location.LocationObject[]) {
    if (state.status !== 'recording') return;
    const points = [...state.points];
    for (const loc of locations) {
      const p: TrackPoint = {
        ts: loc.timestamp,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        altitude: loc.coords.altitude,
        speed: loc.coords.speed,
        accuracy: loc.coords.accuracy,
      };
      if (acceptPoint(points[points.length - 1], p)) points.push(p);
    }
    state = { ...state, points };
    emit();
  },

  async requestPermissions() {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied' as const;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? ('always' as const) : ('foreground' as const);
  },

  async start() {
    state = { status: 'recording', startedAt: Date.now(), points: [] };
    emit();
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      activityType: Location.LocationActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'HotLap enregistre votre drive',
        notificationBody: 'Le tracé continue écran verrouillé.',
        notificationColor: '#C6F432',
      },
    });
  },

  pause() {
    if (state.status === 'recording') {
      state = { ...state, status: 'paused' };
      emit();
    }
  },

  resume() {
    if (state.status === 'paused') {
      state = { ...state, status: 'recording' };
      emit();
    }
  },

  /** Arrête le GPS et renvoie le drive brut à résumer puis publier. */
  async stop() {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    const finished = state;
    state = { status: 'idle', startedAt: null, points: [] };
    await AsyncStorage.removeItem(STORAGE_KEY);
    emit();
    return finished;
  },

  /** Au démarrage de l'app : récupère un drive interrompu par un crash. */
  async restore() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RecorderState;
    return saved.points.length > 0 ? saved : null;
  },
};

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  recorder.ingest(data.locations);
});
