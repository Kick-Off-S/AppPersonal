import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// IndexedDB falso y mínimo: permite simular que iPhone entrega la base vacía al reabrir la app.
const db = new Map();
let exists = false;
const later = (fn) => setTimeout(fn, 0);
globalThis.indexedDB = {
  open() {
    const req = {};
    later(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          const tx = {};
          const op = (fn) => {
            const r = {};
            later(() => ((r.result = fn()), later(() => tx.oncomplete?.())));
            return r;
          };
          tx.objectStore = () => ({ get: (k) => op(() => db.get(k)), put: (v, k) => op(() => void db.set(k, structuredClone(v))) });
          return tx;
        },
      };
      if (!exists) (exists = true), req.onupgradeneeded?.({ oldVersion: 0 });
      req.onsuccess();
    });
    return req;
  },
};

const store = await import('../js/store.js'); // store.state cambia al cargar: se lee siempre del módulo
const { load, saveNow, diagLog, hasDataIn, defaults } = store;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('si la base vuelve vacía al abrir, se usan los datos de la copia espejo y se reescriben', async () => {
  const mine = { ...defaults(), habits: { list: [{ id: 'h', name: 'Leer', days: [0, 1, 2, 3, 4, 5, 6] }], done: {} }, savedAt: '2026-10-25T10:00:00.000Z' };
  localStorage.setItem('gestion-personal:state', JSON.stringify(mine));
  const st = await load();
  assert.equal(st.habits.list[0].name, 'Leer');
  assert.ok(diagLog().some((l) => /base vacía \[base nueva\].*usa copia/.test(l)), diagLog().join('\n'));
  await wait(300); // load() vuelve a guardar en la base
  assert.equal(db.get('state').habits.list[0].name, 'Leer');
});

test('cada guardado deja la copia espejo al día', async () => {
  store.state.weight.push({ id: 'w', date: '2026-10-26', kg: 80 });
  await saveNow();
  const mirror = JSON.parse(localStorage.getItem('gestion-personal:state'));
  assert.equal(mirror.weight.length, 1);
  assert.equal(mirror.savedAt, db.get('state').savedAt);
});

test('el respaldo en la nube nunca sube una app vacía', async () => {
  const { uploadBackup } = await import('../js/cloud.js');
  localStorage.setItem('gp-cloud', JSON.stringify({ backup: { id: 'X', token: 't', key: '', salt: '', iter: 1 } }));
  await store.replaceState(defaults());
  assert.ok(!hasDataIn(store.state));
  globalThis.fetch = () => assert.fail('no debe llamar al servidor');
  await assert.rejects(uploadBackup(), /vacío/);
});
