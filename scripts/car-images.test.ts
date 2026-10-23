/* Tests hors ligne du choix de visuel (npm run cars:test). */
import assert from 'node:assert/strict';

import { matchCarImage } from '../src/features/garage/carImageMatch';

const pick = (make: string, model: string, color?: string) => matchCarImage({ make, model, color });

assert.equal(pick('Porsche', '911 GT3')?.models[0], '911');
assert.equal(pick('Porsche', '911 Carrera S', 'green')?.color, 'green');
assert.equal(pick('Audi', 'RS 3')?.models[0], 'RS3');
assert.equal(pick('Audi', 'RS 6')?.models[0], 'RS');
assert.equal(pick('BMW', 'M40i')?.make, 'BMW'); // pas « M4 » exact : l'image BMW la plus proche (M…)
assert.ok(pick('BMW', 'M40i')?.models.some((m) => m.startsWith('M')));
assert.equal(pick('Nissan', 'GT-R Nismo')?.models[0], 'GT-R');
assert.equal(pick('Mercedes-Benz', 'AMG GT')?.make, 'Mercedes');
assert.equal(pick('Range Rover', 'Sport')?.models[0], 'Range Rover Sport');
assert.equal(pick('Renault', 'Mégane R.S.')?.make, 'Renault');
assert.equal(pick('Lexus', 'LC 500')?.models.length, 0); // image de secours de la marque
assert.equal(pick('Lamborghini', 'Huracán EVO')?.models[0], 'Huracan');
assert.equal(pick('Peugeot', '208'), null);
assert.equal(matchCarImage(null), null);
// Modèle sans image : le plus proche de la même marque
assert.equal(pick('Mazda', 'RX-7')?.models[0], 'MX-5');
assert.equal(pick('Mercedes', 'C63 AMG')?.make, 'Mercedes');
console.log('car images: ok');
