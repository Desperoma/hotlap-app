import type { TrackPoint } from '@/features/recording/geo';

import type { PendingDrive } from './pending';

/**
 * Drive simulé pour tester l'app sans rouler (Expo Go, bureau, revue App Store…).
 * Uniquement dans les versions de développement (__DEV__) : jamais dans l'app publiée.
 *
 * Tracé « route de col » d'environ 12 km : lignes droites en montée, épingles, puis une
 * portion sinueuse, avec un léger bruit GPS. 1 point par seconde à ~50 km/h.
 */
export function simulatedDrive(start: { lat: number; lng: number }, now = Date.now()): PendingDrive {
  type Seg = [lengthM: number, turnDeg: number, climbM: number];
  const segs: Seg[] = [];
  for (let i = 0; i < 12; i++) segs.push([450, 0, 28], [45, i % 2 ? 165 : -165, 4]); // épingles
  for (let i = 0; i < 24; i++) segs.push([140, 0, -6], [90, i % 2 ? 60 : -60, -2]); // descente sinueuse

  const speedMs = 14; // ~50 km/h
  const points: TrackPoint[] = [];
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((start.lat * Math.PI) / 180);
  let x = 0, y = 0, z = 600, heading = Math.PI / 4, carry = 0;
  const startedAt = now - 30 * 60_000;
  let t = startedAt;

  const push = () => {
    const noise = () => (Math.random() - 0.5) * 3;
    points.push({
      ts: t,
      lat: start.lat + (y + noise()) / mPerDegLat,
      lng: start.lng + (x + noise()) / mPerDegLng,
      altitude: z + (Math.random() - 0.5) * 4,
      speed: speedMs,
      accuracy: 5,
    });
  };

  push();
  for (const [len, turn, climb] of segs) {
    const steps = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < steps; i++) {
      heading += ((turn / steps) * Math.PI) / 180;
      x += (Math.cos(heading) * len) / steps;
      y += (Math.sin(heading) * len) / steps;
      z += climb / steps;
      carry += len / steps;
      if (carry >= speedMs) {
        carry -= speedMs;
        t += 1000;
        push();
      }
    }
  }
  return { startedAt, endedAt: t, points, circuitId: null, circuitName: null };
}
