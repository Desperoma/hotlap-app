import { DeviceMotion } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { carAxes, lerp, sub, toCarG, type V } from './gforce';

const G = 9.80665;
// iOS (CoreMotion) donne l'accélération et la gravité de signe opposé à Android (gravité vers le bas,
// accélération inversée) : on ramène tout à la convention Android (au repos, +1 G vers le haut).
const SIGN = Platform.OS === 'ios' ? -1 : 1;

/**
 * G-force live à partir de l'accéléromètre, quelle que soit l'orientation du téléphone (support
 * vertical ou posé à plat) : la gravité donne le haut, l'axe le plus horizontal donne l'avant.
 *   lateral > 0 : vers la droite ; longitudinal > 0 : accélération, < 0 : freinage.
 * Un lissage exponentiel atténue les vibrations de la route ; l'orientation est lissée plus
 * lentement pour ne pas suivre les secousses.
 */
export function useGForce(enabled = true, intervalMs = 100) {
  const [g, setG] = useState({ lateral: 0, longitudinal: 0 });
  const smooth = useRef({ lateral: 0, longitudinal: 0 });
  const up = useRef<V | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let subscription: { remove: () => void } | undefined;
    DeviceMotion.isAvailableAsync().then((ok) => {
      if (!ok) return;
      try {
        DeviceMotion.setUpdateInterval(intervalMs);
        subscription = DeviceMotion.addListener(({ acceleration: rawAcc, accelerationIncludingGravity: rawInc }) => {
          if (!rawAcc) return;
          const acceleration = { x: rawAcc.x * SIGN, y: rawAcc.y * SIGN, z: rawAcc.z * SIGN };
          const accelerationIncludingGravity = rawInc ? { x: rawInc.x * SIGN, y: rawInc.y * SIGN, z: rawInc.z * SIGN } : null;
          // Au repos, l'accéléromètre mesure +1 G vers le haut : haut = (avec gravité − sans gravité).
          if (accelerationIncludingGravity) {
            const raw = sub(accelerationIncludingGravity, acceleration);
            up.current = up.current ? lerp(up.current, raw, 0.05) : raw;
          }
          const axes = up.current ? carAxes(up.current) : null;
          const now = axes ? toCarG(acceleration, axes) : { lateral: acceleration.x / G, longitudinal: acceleration.y / G };
          const a = 0.2;
          smooth.current = {
            lateral: smooth.current.lateral * (1 - a) + now.lateral * a,
            longitudinal: smooth.current.longitudinal * (1 - a) + now.longitudinal * a,
          };
          setG({ ...smooth.current });
        });
      } catch {
        // Capteur indisponible (simulateur, web) : on reste à 0 G.
      }
    });
    return () => subscription?.remove();
  }, [enabled, intervalMs]);

  return g;
}
