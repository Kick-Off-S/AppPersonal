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

test('préstamo compartido: el enlace se lee al revés y no acepta datos malos', async () => {
  const { encodeLoan, shareLink, decodeLoan, mirrorOf } = await import('../js/loanshare.js');
  const l = { shareId: 'abc123', dir: 'lent', amount: 300000, date: '2026-10-01', n: 6, cuota: 50000, auto: true, start: '2026-11', prepaid: 0, note: 'para el auto' };
  const link = shareLink('https://kick-off-s.github.io/AppPersonal/', encodeLoan(l, ['2026-11', '2026-12'], 'Ana <b>'));
  const p = decodeLoan(`Hola Juan, te comparto el préstamo: ${link}`);
  assert.equal(p.from, 'Ana b', 'sin caracteres peligrosos');
  const m = mirrorOf(p);
  assert.equal(m.dir, 'borrowed');
  assert.equal(m.person, 'Ana b');
  assert.equal(m.prepaid, 2, 'las 2 primeras cuotas quedan pagadas');
  assert.equal(m.shareId, 'abc123');
  // el que pidió prestado comparte: a quien prestó le quedan como cobradas
  const back = mirrorOf(decodeLoan(encodeLoan({ ...l, dir: 'borrowed' }, ['2027-01'], 'Juan')));
  assert.equal(back.dir, 'lent');
  assert.deepEqual(back.received, { '2027-01': true });
  // basura o datos fuera de rango
  assert.equal(decodeLoan('https://x/#prestamo=nada'), null);
  assert.equal(decodeLoan(encodeLoan({ ...l, n: 999 }, [], 'Ana')), null);
  assert.equal(decodeLoan(encodeLoan(l, [], '')), null);
});
