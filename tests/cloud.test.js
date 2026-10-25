import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { state, withDefaults } from '../js/store.js';
import { pushSlots } from '../js/cloud.js';
import { todayStr, addDays } from '../js/util.js';

const T = todayStr();
const set = (d) => Object.assign(state, withDefaults(d));

test('horas de aviso: solo horas y días (nada de nombres, dosis ni montos)', () => {
  set({
    settings: { notif: { meds: true, habits: '21:00', exercise: '18:30', bills: '09:00', water: true } },
    meds: { list: [{ id: 'm', name: 'Losartán', dose: '50 mg', times: ['08:00', '20:00'], start: '2026-01-01', qty: 1 }] },
    habits: { list: [{ id: 'h', name: 'Leer', days: [0, 1, 2, 3, 4, 5, 6] }] },
    exercise: { routines: [{ id: 'r', name: 'Pierna', days: [0, 3], items: [{ id: 'i' }] }] },
    finance: { fixed: [{ id: 'f', name: 'Arriendo', amount: 350000, day: 5, from: '2020-01', cat: 'x' }] },
  });
  const slots = pushSlots();
  const s = JSON.stringify(slots);
  for (const secreto of ['Losartán', '50 mg', 'Leer', 'Pierna', 'Arriendo', '350000']) assert.ok(!s.includes(secreto), `no envía "${secreto}"`);
  assert.ok(slots.some((x) => x.t === '08:00') && slots.some((x) => x.t === '20:00'), 'medicamentos');
  assert.ok(slots.some((x) => x.t === '21:00' && x.d === null), 'hábitos todos los días');
  assert.ok(slots.some((x) => x.t === '18:30' && JSON.stringify(x.d) === '[0,3]'), 'rutina solo lunes y jueves');
  assert.ok(slots.some((x) => x.t === '11:00'), 'agua');
  assert.ok(slots.filter((x) => x.date).every((x) => x.t === '09:00' && x.date.endsWith('-05') && x.date >= T && x.date <= addDays(T, 40)), 'pagos el día 5');
});

// sw.js no es un módulo: se carga en un contexto aislado para probar compose()
const sw = new vm.Script(readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + '\n;this.compose = compose;');
const ctx = { self: { addEventListener() {} }, caches: {}, location: { origin: 'x' }, indexedDB: {}, URL, Math, Date, JSON, Object, Promise, String, Number };
vm.createContext(ctx);
sw.runInContext(ctx);

test('mensaje del aviso: medicamento de esta hora no tomado, hábitos y pagos pendientes', () => {
  const now = new Date(2026, 9, 26, 8, 1); // lunes 26-10-2026 08:01
  const st = {
    settings: { notif: { habits: '08:00', bills: '08:00' }, waterGoal: 2000 },
    meds: { list: [{ id: 'm', name: 'Losartán', dose: '50 mg', times: ['08:00'], start: '2026-01-01' }], log: {} },
    habits: { list: [{ id: 'h', name: 'Leer', days: [0] }, { id: 'h2', name: 'Agua', days: [0] }], done: { '2026-10-26': { h2: true } } },
    finance: { fixed: [{ id: 'f', name: 'Arriendo', amount: 350000, day: 5, from: '2026-01' }], expenses: [], loans: [] },
  };
  const out = ctx.compose(st, now);
  assert.deepEqual([...out.map((m) => m.url)], ['#meds', '#habits', '#finance']); // copia: el arreglo viene de otro contexto
  assert.match(out[0].body, /Losartán 50 mg/);
  assert.match(out[1].body, /falta 1: Leer/);
  assert.match(out[2].body, /Arriendo/);
  st.meds.log = { '2026-10-26': { m: { '08:00': 'taken' } } };
  assert.ok(!ctx.compose(st, now).some((m) => m.url === '#meds'), 'ya tomado: no avisa');
});

test('servidor: borra respaldos y avisos sin uso con los plazos que informa el aviso de privacidad', async () => {
  const { cleanup, due } = await import('../server/src/index.js');
  const { BACKUP_DAYS, PUSH_DAYS } = await import('../js/privacy.js');
  const calls = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ sql, a }) }), batch: async (q) => calls.push(...q) } };
  const now = Date.UTC(2026, 9, 25);
  await cleanup(env, now);
  const day = 24 * 3600 * 1000;
  assert.deepEqual(calls.map((c) => [c.sql.split(' ')[2], (now - c.a[0]) / day]), [['backups', BACKUP_DAYS], ['subs', PUSH_DAYS]]);
  // avisos: hora exacta, día de la semana o fecha puntual
  const l = { time: '08:00', date: '2026-10-26', wd: 0 };
  assert.ok(due([{ t: '08:00', d: [0, 3] }], l));
  assert.ok(!due([{ t: '08:00', d: [1] }], l));
  assert.ok(due([{ t: '08:00', date: '2026-10-26' }], l) && !due([{ t: '08:00', date: '2026-10-27' }], l));
});

test('hábitos con hora: se ordenan por hora, avisan a esa hora y no si ya están hechos', async () => {
  const { habitsFor } = await import('../js/views/habits.js');
  set({
    settings: { notif: { habits: '21:00', meds: false, bills: false, exercise: false } },
    habits: { list: [{ id: 'a', name: 'Leer', days: [0, 1, 2, 3, 4, 5, 6] }, { id: 'b', name: 'Vitaminas', time: '08:30', days: [0, 1, 2, 3, 4, 5, 6] }, { id: 'c', name: 'Pesas', time: '07:00', days: [0, 3] }, { id: 'd', name: 'Malo', time: 'xx' }] },
  });
  assert.equal(state.habits.list.find((h) => h.id === 'd').time, undefined, 'hora inválida se descarta');
  assert.deepEqual(habitsFor('2026-10-26').map((h) => h.id), ['c', 'b', 'a', 'd']);
  const slots = pushSlots();
  assert.ok(slots.some((x) => x.t === '08:30' && x.d === null) && slots.some((x) => x.t === '07:00' && JSON.stringify(x.d) === '[0,3]'));
  const st = { settings: { notif: { habits: '21:00', meds: false } }, habits: { list: state.habits.list, done: {} } };
  const at = (h, m) => [...ctx.compose(st, new Date(2026, 9, 26, h, m))];
  assert.match(at(8, 32)[0].body, /Vitaminas/);
  assert.equal(at(9, 0).length, 0, 'fuera de la ventana no avisa');
  st.habits.done = { '2026-10-26': { b: true } };
  assert.equal(at(8, 32).length, 0, 'ya marcado: no avisa');
});
