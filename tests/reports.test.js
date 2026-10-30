import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults, APP_VERSION } from '../js/store.js';
import { CHANGELOG } from '../js/changelog.js';
import { todayStr, addDays } from '../js/util.js';

test('historial: la versión actual tiene su entrada arriba y las versiones van de nueva a antigua', () => {
  assert.equal(CHANGELOG[0].v, APP_VERSION, 'agrega la entrada de la versión nueva en js/changelog.js');
  const n = (v) => v.split('.').map(Number);
  for (let i = 1; i < CHANGELOG.length; i++) {
    const [a, b] = [n(CHANGELOG[i - 1].v), n(CHANGELOG[i].v)];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]), `${CHANGELOG[i - 1].v} antes de ${CHANGELOG[i].v}`);
    assert.ok(CHANGELOG[i].items.length, CHANGELOG[i].v);
  }
});

test('informe nutricional: promedios, cambio de peso y textos escapados', async () => {
  const { nutritionReportHTML, nutritionData } = await import('../js/reports.js');
  const t = todayStr();
  Object.assign(
    state,
    withDefaults({
      settings: { name: 'Ana <script>', kcalGoal: 1800, body: { height: 165, age: 40 } },
      weight: [
        { id: 'a', date: addDays(t, -20), kg: 72 },
        { id: 'b', date: addDays(t, -3), kg: 70.5 },
      ],
      log: { [t]: [{ id: 'x', name: 'Completo <b>', qty: 1, kcal: 600, p: 20, c: 60, f: 30 }], [addDays(t, -1)]: [{ id: 'y', name: 'Completo <b>', qty: 1, kcal: 400, p: 10, c: 40, f: 20 }] },
      water: { [t]: [500, 500] },
    })
  );
  const r = nutritionData(14);
  assert.equal(r.logged, 2);
  assert.equal(r.avg.kcal, 500);
  assert.equal(r.change, -1.5, 'contra el último peso antes del período');
  assert.equal(r.extras[0].n, 2);
  const html = nutritionReportHTML(14, { weight: true, food: true, extras: true, plan: true, exercise: true, meds: false, note: 'hola <img>' });
  assert.ok(!/<script>|<img>|<b>Completo/.test(html), 'nada sin escapar');
  assert.match(html, /Ana &lt;script&gt;/);
  assert.match(html, /IMC/);
});
