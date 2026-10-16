import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TrackPoint } from '@/features/recording/geo';

/**
 * Drive terminé mais pas encore publié.
 *
 * Entre « Finish » et « Save », le drive n'existe que sur le téléphone : il est gardé ici
 * (mémoire + AsyncStorage) pour survivre à un kill de l'app, à une perte de réseau ou à
 * un échec de sauvegarde. Il n'est effacé qu'après une sauvegarde réussie ou un abandon
 * confirmé par l'utilisateur.
 */
export type PendingDrive = {
  startedAt: number;
  endedAt: number;
  points: TrackPoint[];
  /** Circuit détecté au départ (recording_context), sinon null = route ouverte */
  circuitId: string | null;
  circuitName: string | null;
  /** Véhicule choisi avant le départ (garage) ; modifiable sur le récap. Absent sur les anciens drives en attente. */
  vehicleId?: string | null;
};

const KEY = 'hotlap/pending-drive';
let current: PendingDrive | null | undefined;

export async function setPendingDrive(drive: PendingDrive) {
  current = drive;
  await AsyncStorage.setItem(KEY, JSON.stringify(drive));
}

export async function getPendingDrive(): Promise<PendingDrive | null> {
  if (current !== undefined) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw ? (JSON.parse(raw) as PendingDrive) : null;
  } catch {
    current = null;
  }
  return current;
}

export async function clearPendingDrive() {
  current = null;
  await AsyncStorage.removeItem(KEY);
}
