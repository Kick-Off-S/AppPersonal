import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults } from '../js/store.js';
import { categoryFor, CATEGORIES, MERCHANTS } from '../js/merchants.js';

test('comercios: la categoría se completa sola y manda el historial del usuario', () => {
  Object.assign(state, withDefaults({}));
  assert.equal(categoryFor('lider'), 'Supermercado');
  assert.equal(categoryFor('Mc Donalds'), 'Comida fuera');
  assert.equal(categoryFor('COPEC Vicuña Mackenna'), 'Combustible');
  assert.equal(categoryFor('Farmacias Ahumada'), 'Salud');
  assert.equal(categoryFor('algo raro'), '');
  // si el usuario anotó Lider como "Hogar", se respeta
  Object.assign(state, withDefaults({ finance: { expenses: [{ id: 'x', desc: 'Líder', cat: 'Hogar', amount: 1, date: '2026-10-01' }] } }));
  assert.equal(categoryFor('lider'), 'Hogar');
});

test('cada comercio usa una categoría de la lista', () => {
  for (const m of MERCHANTS) assert.ok(CATEGORIES.includes(m.cat), m.name);
});

test('tarjetas: gasto del mes y cupo disponible (compras de este mes + cuotas que faltan)', async () => {
  const { cardMonth } = await import('../js/cards.js');
  const { todayStr, addMonths, monthKey } = await import('../js/util.js');
  const ym = monthKey(todayStr());
  const d = (m) => `${addMonths(ym, m)}-10`;
  const visa = { id: 'v', name: 'Visa', kind: 'credit', limit: 500000 };
  Object.assign(
    state,
    withDefaults({
      finance: {
        cards: [visa],
        expenses: [
          { id: 'a', amount: 30000, cat: 'Supermercado', date: d(-1), cardId: 'v' }, // mes pasado: ya pagado
          { id: 'b', amount: 20000, cat: 'Supermercado', date: d(0), cardId: 'v' },
          { id: 'c1', amount: 50000, cat: 'Tiendas', date: d(0), cardId: 'v', groupId: 'g', cuota: [1, 2] },
          { id: 'c2', amount: 50000, cat: 'Tiendas', date: d(1), cardId: 'v', groupId: 'g', cuota: [2, 2] },
          { id: 'z', amount: 9999, cat: 'Otros', date: d(0) }, // sin tarjeta
        ],
      },
    })
  );
  const m = cardMonth(state.finance.cards[0], ym);
  assert.equal(m.spent, 70000);
  assert.equal(m.used, 120000);
  assert.equal(m.avail, 380000);
});
