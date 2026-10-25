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
