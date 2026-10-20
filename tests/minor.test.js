import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/store.js';
import { cuotaOf, remainingOf, scheduleOf } from '../js/views/loans.js';
import { amountLabel } from '../js/foodpicker.js';
import { BASE_FOODS } from '../js/foods.js';
import { offToFood } from '../js/scanner.js';

test('préstamo con cuota calculada sola: las cuotas suman exactamente el monto', () => {
  state.finance.expenses = [];
  const l = { id: 'x', dir: 'lent', person: 'J', amount: 200000, n: 3, cuota: 66667, auto: true, start: '2026-11', prepaid: 0, received: {}, date: '2026-10-01' };
  assert.equal(scheduleOf(l).reduce((a, c) => a + cuotaOf(l, c.i), 0), 200000);
  assert.equal(remainingOf(l).amount, 200000);
  const conInteres = { ...l, auto: false, cuota: 70000 };
  assert.equal(remainingOf(conInteres).amount, 210000, 'con cuota escrita a mano se respeta (interés)');
});

test('plurales: scoops, shots, porciones individuales, vasos medianos, sándwiches', () => {
  const f = (n) => BASE_FOODS.find((x) => x.name === n);
  assert.equal(amountLabel(f('Proteína whey'), 'unit', 2), '2 scoops');
  assert.equal(amountLabel(f('Tequila (shot)'), 'unit', 2), '2 shots');
  assert.equal(amountLabel(f('Chorrillana'), 'unit', 2), '2 porciones individuales');
  assert.equal(amountLabel(f('Café latte'), 'unit', 2), '2 vasos medianos');
  assert.equal(amountLabel(f('Churrasco italiano'), 'unit', 2), '2 sándwiches');
  assert.equal(amountLabel(f('Avena en hojuelas'), 'unit', 1), '1 cda');
});

test('Open Food Facts: "500 cc" y "1,5 Lt" son líquidos (ml)', () => {
  const n = { 'energy-kcal_100g': 40 };
  assert.equal(offToFood('1', { product_name: 'Jugo', quantity: '500 cc', nutriments: n }).unit, '100 ml');
  assert.equal(offToFood('1', { product_name: 'Bebida', quantity: '1,5 Lt', nutriments: n }).unit, '100 ml');
  assert.equal(offToFood('1', { product_name: 'Arroz', quantity: '1 kg', nutriments: n }).unit, '100 g');
});
