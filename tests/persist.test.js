// Guardado: si no se puede leer IndexedDB, la app no escribe encima (no pisa datos reales).
import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// IndexedDB que siempre falla al abrir (como el error transitorio de iOS)
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => ((req.error = new Error('Connection to Indexed Database server lost')), req.onerror?.()), 0);
    return req;
  },
};
const store = await import('../js/store.js');
const { csvCell } = await import('../js/backup.js');

test('falla la lectura: modo solo lectura y no se escribe nada', async () => {
  localStorage.setItem('gestion-personal:state', JSON.stringify({ v: 2, savedAt: '2026-01-01T00:00:00Z', settings: { name: 'copia vieja' } }));
  await store.load();
  assert.equal(store.readOnly, true);
  assert.equal(store.state.settings.name, 'copia vieja', 'se muestra lo que hay');
  store.state.settings.name = 'cambio';
  await store.saveNow();
  const ls = JSON.parse(localStorage.getItem('gestion-personal:state'));
  assert.equal(ls.settings.name, 'copia vieja', 'no se sobrescribió');
});

test('restaurar (elegido por el usuario) sale del modo solo lectura y conserva el bloqueo', async () => {
  store.state.settings.lock = { enabled: true, hash: 'h', salt: 's', len: 4 };
  await store.replaceState({ settings: { name: 'restaurado', lock: { enabled: false } } }, { keepLock: true });
  assert.equal(store.readOnly, false);
  assert.equal(store.state.settings.name, 'restaurado');
  assert.equal(store.state.settings.lock.hash, 'h', 'el PIN de este teléfono se mantiene');
});

test('el respaldo no incluye el PIN ni Face ID', () => {
  const p = store.exportPayload();
  assert.equal(p.data.settings.lock, undefined);
  assert.equal(store.state.settings.lock.hash, 'h', 'exportar no lo borra del teléfono');
});

test('CSV: textos que empiezan con = + - @ no se ejecutan como fórmula en Excel', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-5'), `"'-5"`);
  assert.equal(csvCell('Supermercado'), '"Supermercado"');
});
