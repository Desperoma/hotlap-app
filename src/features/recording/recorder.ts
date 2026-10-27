import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { acceptPoint, speedOf, type TrackPoint } from './geo';

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
  /** Mode choisi avant le départ (Sprint : chrono en départ arrêté ; circuit : chrono au tour) */
  mode?: 'free' | 'sprint' | 'circuit';
  /** Drive sur circuit : circuit choisi avant le départ */
  circuitId?: string | null;
  circuitName?: string | null;
  /** Drive simulé en temps réel (outils de test) : pas de GPS, points rejoués */
  simulated?: boolean;
};

export type StartOptions = { circuitId?: string | null; circuitName?: string | null };
let stopSimulation: (() => void) | null = null;

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
      const prev = points[points.length - 1];
      if (acceptPoint(prev, p)) points.push({ ...p, speed: speedOf(prev, p) });
    }
    state = { ...state, points };
    emit();
  },

  async requestPermissions() {
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') return 'denied' as const;
    } catch {
      return 'denied' as const;
    }
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      return bg.status === 'granted' ? ('always' as const) : ('foreground' as const);
    } catch {
      // iOS refuse la demande si l'app ne déclare pas l'usage « Toujours » dans son Info.plist :
      // c'est le cas dans Expo Go (ERR_LOCATION_INFO_PLIST). L'app de développement EAS le déclare.
      return 'foreground' as const;
    }
  },

  /**
   * Drive simulé en temps réel (outils de test) : `play` reçoit une fonction qui ajoute un point
   * comme le ferait le GPS et renvoie de quoi arrêter la lecture.
   */
  startSimulated(mode: 'free' | 'sprint' | 'circuit', play: (push: (p: TrackPoint) => void) => () => void, opts: StartOptions = {}) {
    state = { status: 'recording', startedAt: Date.now(), points: [], mode, simulated: true, ...opts };
    emit();
    stopSimulation = play((p) => {
      if (state.status !== 'recording') return;
      const prev = state.points[state.points.length - 1];
      if (acceptPoint(prev, p)) {
        state = { ...state, points: [...state.points, { ...p, speed: speedOf(prev, p) }] };
        emit();
      }
    });
  },

  async start(mode: 'free' | 'sprint' | 'circuit' = 'free', opts: StartOptions = {}) {
    state = { status: 'recording', startedAt: Date.now(), points: [], mode, ...opts };
    emit();
    try {
      await this.startUpdates();
    } catch (e) {
      // Ex. Expo Go sur iOS : pas de localisation en arrière-plan. On revient à l'état initial.
      state = { status: 'idle', startedAt: null, points: [] };
      emit();
      throw e;
    }
  },

  async startUpdates() {
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
    stopSimulation?.();
    stopSimulation = null;
    if (!state.simulated && await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
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
