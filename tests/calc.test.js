import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults, migrate, VERSION } from '../js/store.js';
import { dayTotals, dayMacros } from '../js/calc.js';

// 2026-10-12 es lunes (índice 0)
const PAST = '2026-10-12';

test('migración v1 -> v2: las comidas marcadas guardan sus calorías del momento', () => {
  const d = withDefaults({
    v: 1,
    diet: { plan: { 0: [{ id: 'm1', name: 'Desayuno', kcal: 400, p: 20, c: 50, f: 10 }] }, done: { [PAST]: { m1: true } } },
  });
  assert.equal(d.v, VERSION);
  assert.deepEqual(d.diet.done[PAST].m1, { name: 'Desayuno', kcal: 400, p: 20, c: 50, f: 10 });
});

test('migración: datos sin versión se tratan como v1 y una migración no se repite', () => {
  const d = withDefaults({ diet: { plan: { 0: [{ id: 'a', name: 'X', kcal: 100 }] }, done: { [PAST]: { a: true } } } });
  assert.equal(d.diet.done[PAST].a.kcal, 100);
  const again = migrate({ ...d, diet: { ...d.diet, done: { [PAST]: { a: { kcal: 999 } } } } });
  assert.equal(again.diet.done[PAST].a.kcal, 999, 'no vuelve a tocar datos ya migrados');
});

test('historial: cambiar o reemplazar el plan no altera las calorías de días pasados', () => {
  Object.assign(state, withDefaults({ v: 1, diet: { plan: { 0: [{ id: 'm1', name: 'Almuerzo', kcal: 650, p: 40, c: 60, f: 20 }] }, done: { [PAST]: { m1: true } } } }));
  assert.equal(dayTotals(PAST).total, 650);
  state.diet.plan[0] = [{ id: 'nuevo', name: 'Otro', kcal: 300 }]; // se importa otro plan
  assert.equal(dayTotals(PAST).total, 650);
  assert.equal(dayTotals(PAST).mealsDone, 1);
  assert.equal(dayMacros(PAST).p, 40);
});

test('cuotas: interés, tasa equivalente y plazo', async () => {
  const { breakdown, monthlyRate } = await import('../js/installments.js');
  // 6 cuotas de $20.000 por algo de $110.000: interés $10.000 (9,1 %), tasa ~2,5 % mensual
  const b = breakdown({ price: 110000, cuota: 20000, n: 6, firstYm: '2026-11' });
  assert.equal(b.total, 120000);
  assert.equal(b.interest, 10000);
  assert.equal(b.lastYm, '2027-04');
  assert.ok(Math.abs(b.rate - 0.0254) < 0.0003, String(b.rate));
  // sin interés
  assert.equal(monthlyRate(120000, 20000, 6), 0);
  assert.equal(breakdown({ price: 120000, cuota: 20000, n: 6, firstYm: '2026-11' }).interest, 0);
  // precio desconocido (compra antigua): no se inventa el interés
  assert.equal(breakdown({ price: null, cuota: 20000, n: 6, firstYm: '2026-11' }).interest, null);
});
