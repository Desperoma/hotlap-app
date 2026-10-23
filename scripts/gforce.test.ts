import assert from 'node:assert/strict';

import { carAxes, toCarG } from '../src/features/recording/gforce';

const G = 9.80665;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

// Téléphone debout sur un support, écran vers le conducteur : haut = +y, avant = −z, droite = +x.
const upright = carAxes({ x: 0, y: G, z: 0 })!;
near(toCarG({ x: 0, y: 0, z: -G * 0.5 }, upright).longitudinal, 0.5); // accélération
near(toCarG({ x: 0, y: 0, z: G * 0.8 }, upright).longitudinal, -0.8); // freinage
near(toCarG({ x: G * 0.3, y: 0, z: 0 }, upright).lateral, 0.3);       // vers la droite
near(toCarG({ x: 0, y: G * 0.4, z: 0 }, upright).longitudinal, 0);    // bosse : ni accel ni frein

// Posé à plat, écran vers le ciel, haut de l'écran vers l'avant : haut = +z, avant = +y, droite = +x.
const flat = carAxes({ x: 0, y: 0, z: G })!;
near(toCarG({ x: 0, y: G * 0.5, z: 0 }, flat).longitudinal, 0.5);
near(toCarG({ x: -G * 0.2, y: 0, z: 0 }, flat).lateral, -0.2);

// Support incliné de 30° vers l'arrière : l'avant reste horizontal.
const t = Math.PI / 6;
const tilted = carAxes({ x: 0, y: G * Math.cos(t), z: G * Math.sin(t) })!;
near(tilted.forward.z * Math.sin(t) + tilted.forward.y * Math.cos(t), 0);
assert.ok(toCarG({ x: 0, y: 0, z: -G }, tilted).longitudinal > 0.8);

assert.equal(carAxes({ x: 0, y: 0, z: 0 }), null);
console.log('gforce: ok');
