import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults, normalizePlan, VERSION } from '../js/store.js';
import { dayTotals, dietStreak } from '../js/calc.js';
import { todayStr, addDays, weekdayIndex } from '../js/util.js';
import { burnedFor, routineProgress } from '../js/views/exercise.js';

const T = todayStr();
const Y = addDays(T, -1);
const set = (data) => Object.assign(state, withDefaults(data));

test('datos con tipos malos se corrigen: items {} no rompe y "500" + "600" suma 1100', () => {
  const plan = normalizePlan({ 0: [{ name: 'A', kcal: '500', items: {} }, { name: 'B', kcal: '600' }], 1: { no: 'lista' } });
  assert.deepEqual(plan[0][0].items, []);
  assert.equal(plan[0][0].kcal + plan[0][1].kcal, 1100);
  assert.deepEqual(plan[1], []);
  const d = withDefaults({ finance: { income: null, expenses: [{ amount: '1000' }, 'basura'] }, settings: { kcalGoal: -500 } });
  assert.deepEqual(d.finance.income, {});
  assert.equal(d.finance.expenses.length, 1);
  assert.equal(d.finance.expenses[0].amount, 1000);
  assert.equal(d.settings.kcalGoal, 0);
  assert.equal(d.v, VERSION);
});

test('dieta: marcas de hoy que ya no están en el plan (copiar día / importar) no suman', () => {
  const wd = weekdayIndex(T);
  set({ v: 3, diet: { plan: { [wd]: [{ id: 'nuevo', name: 'Almuerzo', kcal: 600 }] }, done: { [T]: { viejo: { kcal: 600 }, nuevo: { kcal: 600 } } } } });
  assert.equal(dayTotals(T).total, 600);
  assert.equal(dayTotals(T).mealsDone, 1);
});

test('dieta: agregar una comida al plan hoy no cambia el % ni la racha de ayer', () => {
  const wd = weekdayIndex(Y);
  set({ v: 3, diet: { plan: { [wd]: [{ id: 'a', name: 'A', kcal: 300 }, { id: 'b', name: 'B', kcal: 400 }] }, done: { [Y]: { a: { kcal: 300 }, b: { kcal: 400 } } }, counts: { [Y]: 2 } } });
  assert.equal(dietStreak(), 1);
  state.diet.plan[wd].push({ id: 'c', name: 'Snack', kcal: 150 });
  assert.equal(dayTotals(Y).mealsTotal, 2);
  assert.equal(dietStreak(), 1);
});

test('migración v3: los días pasados guardan cuántas comidas tenía el plan', () => {
  const wd = weekdayIndex(Y);
  const d = withDefaults({ v: 2, diet: { plan: { [wd]: [{ id: 'a', kcal: 1 }, { id: 'b', kcal: 1 }, { id: 'c', kcal: 1 }] }, done: { [Y]: { a: { kcal: 1 } } } } });
  assert.equal(d.diet.counts[Y], 3);
});

test('ejercicio: editar la rutina después no cambia las calorías ni el avance de ayer', () => {
  const wd = weekdayIndex(Y);
  const r = { id: 'r1', name: 'Pierna', days: [wd], mins: 60, intensity: 'moderada', items: [{ id: 'i1', name: 'Sentadilla' }] };
  set({ v: 2, weight: [{ id: 'w', date: Y, kg: 80 }], exercise: { routines: [r], done: { [Y]: { r1: { i1: {} } } } } });
  const before = burnedFor(Y);
  assert.equal(before, Math.round((5 - 1) * 80 * 1), 'MET − 1 × kg × horas');
  state.exercise.routines[0].items.push({ id: 'i2', name: 'Prensa' });
  state.exercise.routines[0].intensity = 'alta';
  assert.equal(burnedFor(Y), before);
  assert.deepEqual(routineProgress(Y, state.exercise.routines[0]), { n: 1, total: 1 });
});
