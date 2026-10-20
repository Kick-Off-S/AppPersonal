import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults, clean } from '../js/store.js';

test('respaldo antiguo: se completa lo que falta y el ahorro pasa a "Ahorro general"', () => {
  const d = withDefaults({ savings: [{ id: 's1', date: '2026-10-01', type: 'in', amount: 1000 }], finance: { income: { '2026-10': 900000 } } });
  assert.equal(d.savingsAccounts[0].id, 'general');
  assert.equal(d.savings[0].acc, 'general');
  assert.deepEqual(d.finance.loans, []);
  assert.equal(d.settings.theme.palette, 'teal');
  assert.equal(d.settings.modules.health, true);
});

test('respaldo manipulado: ids, emoji y claves no pueden inyectar HTML', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const d = withDefaults({
    habits: { list: [{ id: 'x' + evil, name: 'Leer' + evil, emoji: evil, days: [0] }], done: {} },
    foods: [{ id: 'f1', name: 'Pan', unit: '1 u', kcal: 10, sizes: { ['L' + evil]: 10 } }],
    finance: { budgets: { 'Comida "rica"': 1000 } },
  });
  const h = d.habits.list[0];
  assert.ok(!/[<>"]/.test(h.id), 'el id queda sin caracteres peligrosos');
  assert.equal(h.name, 'Leer' + evil, 'el texto libre se conserva (se escapa al mostrarlo)');
  assert.ok(!Object.keys(d.foods[0].sizes).some((k) => /[<>"]/.test(k)), 'las claves se limpian');
  assert.ok('Comida "rica"' in d.finance.budgets, 'los nombres de categoría de los topes se conservan');
});

test('clean descarta funciones y deja números', () => {
  assert.deepEqual(clean({ a: 1, b: () => 1, c: true }), { a: 1, b: undefined, c: true });
});
