import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, notEligible, generatePlan, TEMPLATE_FOODS } from '../js/nutrition.js';
import { BASE_FOODS } from '../js/foods.js';

test('Mifflin-St Jeor: mujer 30 años, 165 cm, 70 kg, moderada', () => {
  const r = evaluate({ sex: 'f', age: 30, height: 165, weight: 70, activity: 'mod', goal: 'keep' });
  assert.equal(r.bmr, 1420); // 10*70 + 6.25*165 - 5*30 - 161 = 1420.25
  assert.equal(r.tdee, Math.round(1420.25 * 1.55));
  assert.equal(r.kcal, 2200);
  assert.equal(r.bmi, 25.7);
  assert.equal(r.bmiCat, 'sobrepeso');
  assert.ok(Math.abs(r.p * 4 + r.c * 4 + r.f * 9 - r.kcal) <= 10, 'los macros suman las calorías');
});

test('bajar de peso nunca baja del mínimo seguro ni de la TMB', () => {
  const r = evaluate({ sex: 'f', age: 60, height: 150, weight: 50, activity: 'sed', goal: 'lose' });
  assert.ok(r.kcal >= 1200 && r.kcal >= r.bmr);
  assert.equal(r.floored, true);
  const m = evaluate({ sex: 'm', age: 25, height: 180, weight: 80, activity: 'mod', goal: 'lose' });
  assert.ok(m.kcal >= 1500 && m.kcal < m.tdee);
});

test('IMC ≥ 30: la proteína se calcula con peso de referencia (no 2 g × peso total)', () => {
  const r = evaluate({ sex: 'm', age: 40, height: 175, weight: 120, activity: 'light', goal: 'lose' });
  assert.ok(r.p < 2 * 120 && r.p <= Math.round(25 * 1.75 * 1.75 * 2));
});

test('no corresponde guía automática: menores, embarazo o enfermedad', () => {
  assert.ok(notEligible({ age: 16 }));
  assert.ok(notEligible({ age: 30, pregnant: true }));
  assert.ok(notEligible({ age: 30, condition: true }));
  assert.equal(notEligible({ age: 30 }), null);
});

test('plantillas: todos los alimentos existen en la base', () => {
  for (const n of TEMPLATE_FOODS) assert.ok(BASE_FOODS.some((f) => f.name === n), n);
});

test('plan guía: 7 días de 5 comidas, cerca de la meta y sin cantidades vacías', () => {
  for (const kcal of [1300, 1800, 2400, 3000]) {
    const plan = generatePlan(kcal);
    for (let d = 0; d < 7; d++) {
      assert.equal(plan[d].length, 5);
      const total = plan[d].reduce((a, m) => a + m.kcal, 0);
      assert.ok(Math.abs(total - kcal) / kcal < 0.15, `${kcal} kcal, día ${d}: ${total}`);
      for (const m of plan[d]) for (const it of m.items) assert.ok(it.amount > 0 && Number.isFinite(it.kcal), `${m.name}: ${it.name}`);
    }
  }
});

test('plan guía con meta de proteína: el promedio semanal llega a ≥ 85 % de la meta sin pasarse de calorías', () => {
  const r = evaluate({ sex: 'f', age: 34, height: 162, weight: 74, activity: 'light', goal: 'lose' });
  const plan = generatePlan(r.kcal, r.p);
  const days = Object.values(plan);
  const avgP = days.reduce((a, d) => a + d.reduce((x, m) => x + m.p, 0), 0) / 7;
  assert.ok(avgP >= r.p * 0.85, `proteína promedio ${Math.round(avgP)} de ${r.p}`);
  for (const d of days) assert.ok(Math.abs(d.reduce((a, m) => a + m.kcal, 0) - r.kcal) / r.kcal < 0.15);
});

test('plan para subir de peso: la proteína no se dispara (≤ 135 % de la meta en promedio)', () => {
  const r = evaluate({ sex: 'm', age: 28, height: 178, weight: 72, activity: 'mod', goal: 'gain' });
  const days = Object.values(generatePlan(r.kcal, r.p));
  const avgP = days.reduce((a, d) => a + d.reduce((x, m) => x + m.p, 0), 0) / 7;
  assert.ok(avgP <= r.p * 1.35, `proteína promedio ${Math.round(avgP)} de ${r.p}`);
  for (const d of days) assert.ok(Math.abs(d.reduce((a, m) => a + m.kcal, 0) - r.kcal) / r.kcal < 0.15);
});
