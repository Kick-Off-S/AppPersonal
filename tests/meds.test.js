import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults } from '../js/store.js';
import { activeOn, dosesFor, setDose } from '../js/views/meds.js';

test('medicamento: respeta inicio, duración y días de la semana', () => {
  const m = { id: 'm', name: 'Amoxicilina', times: ['08:00', '20:00'], days: null, start: '2026-10-20', days_n: 7, qty: 1 };
  assert.equal(activeOn(m, '2026-10-19'), false, 'antes de empezar');
  assert.equal(activeOn(m, '2026-10-20'), true);
  assert.equal(activeOn(m, '2026-10-26'), true, 'día 7');
  assert.equal(activeOn(m, '2026-10-27'), false, 'terminó');
  const lunes = { ...m, days: [0], days_n: 0 };
  assert.equal(activeOn(lunes, '2026-10-26'), true); // lunes
  assert.equal(activeOn(lunes, '2026-10-27'), false);
});

test('tomas: ordenadas por hora; tomar descuenta stock y deshacer lo devuelve', () => {
  Object.assign(state, withDefaults({ meds: { list: [
    { id: 'a', name: 'B', times: ['20:00', '08:00'], start: '2026-01-01', qty: 2, stock: 10, lowAt: 8, unit: 'comprimido' },
    { id: 'b', name: 'A', times: ['12:00'], start: '2026-01-01', qty: 1, unit: 'gota' },
  ] } }));
  const d = '2026-10-25';
  assert.deepEqual(dosesFor(d).map((x) => x.time), ['08:00', '12:00', '20:00']);
  const m = state.meds.list[0];
  setDose(d, m, '08:00', 'taken');
  assert.equal(m.stock, 8);
  assert.equal(dosesFor(d)[0].status, 'taken');
  setDose(d, m, '08:00', 'taken'); // tocar de nuevo deshace
  assert.equal(m.stock, 10);
  setDose(d, m, '20:00', 'skipped');
  assert.equal(m.stock, 10, 'omitir no descuenta');
});

test('datos de medicamentos se validan al cargar', () => {
  const s = withDefaults({ meds: { list: [{ id: 'x', name: 'X', times: ['8', '09:30', 'x'], qty: '-1', days: [9, 1] }], log: 'basura' } });
  assert.deepEqual(s.meds.list[0].times, ['09:30']);
  assert.equal(s.meds.list[0].qty, 1);
  assert.deepEqual(s.meds.list[0].days, [1]);
  assert.deepEqual(s.meds.log, {});
});
