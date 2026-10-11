import { DeviceMotion } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

const G = 9.80665;

/**
 * G-force live à partir de l'accéléromètre (gravité déjà retirée par DeviceMotion).
 * Hypothèse : téléphone fixé en portrait face au conducteur.
 *   lateral = axe x (virages), longitudinal = axe y (accélération / freinage).
 * Un lissage exponentiel atténue les vibrations de la route.
 * À affiner : calibration selon l'orientation réelle du support.
 */
export function useGForce(enabled = true, intervalMs = 100) {
  const [g, setG] = useState({ lateral: 0, longitudinal: 0 });
  const smooth = useRef({ lateral: 0, longitudinal: 0 });

  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | undefined;
    DeviceMotion.isAvailableAsync().then((ok) => {
      if (!ok) return;
      try {
        DeviceMotion.setUpdateInterval(intervalMs);
        sub = DeviceMotion.addListener(({ acceleration }) => {
          if (!acceleration) return;
          const a = 0.2;
          smooth.current = {
            lateral: smooth.current.lateral * (1 - a) + (acceleration.x / G) * a,
            longitudinal: smooth.current.longitudinal * (1 - a) + (acceleration.y / G) * a,
          };
          setG({ ...smooth.current });
        });
      } catch {
        // Capteur indisponible (simulateur, web) : on reste à 0 G.
      }
    });
    return () => sub?.remove();
  }, [enabled, intervalMs]);

  return g;
}
