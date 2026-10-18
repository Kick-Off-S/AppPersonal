// Estado de la app. Todo vive en un solo objeto guardado en IndexedDB (con respaldo en localStorage).
// Ese mismo objeto es lo que se exporta/importa como respaldo.

const DB_NAME = 'gestion-personal';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'gestion-personal:state';
export const VERSION = 1;
// Versión visible de la app. Al cambiarla, quienes ya usan la app ven las novedades una vez.
export const APP_VERSION = '2.2';

export const defaults = () => ({
  app: 'gestion-personal',
  v: VERSION,
  settings: { name: '', kcalGoal: 2000, waterGoal: 2000, goalKg: 0, lastBackup: null, backupSnooze: '', seenVersion: '' },
  // plan[0..6] = comidas de lunes a domingo: { id, name, time, desc, kcal, p?, c?, f? }
  // done['YYYY-MM-DD'] = { [mealId]: true } -> las comidas cumplidas cuentan para las calorías del día
  diet: { plan: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, done: {} },
  foods: [], // alimentos personalizados
  log: {}, // comidas FUERA de la dieta: 'YYYY-MM-DD' -> [{ id, name, qty, unit, kcal, p, c, f, per }]
  water: {}, // 'YYYY-MM-DD' -> [ml, ml, ...]
  weight: [], // { id, date, kg }
  // fixed: gastos fijos mensuales { id, name, amount, cat, day, from: 'YYYY-MM' }
  // expenses en cuotas comparten groupId y llevan cuota: [i, n]
  // budgets['Categoría'] = tope mensual de gasto
  finance: { income: {}, expenses: [], fixed: [], budgets: {} }, // income['YYYY-MM'] = sueldo líquido
  savings: [], // { id, date, type: 'in' | 'out', amount, note, ym? }
  savingsGoal: 0,
});

// Completa lo que falte (por si un respaldo viene de una versión anterior).
export function withDefaults(data) {
  const base = defaults();
  const d = data && typeof data === 'object' ? data : {};
  const out = { ...base, ...d };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.diet = { ...base.diet, ...(d.diet || {}) };
  out.diet.plan = { ...base.diet.plan, ...((d.diet && d.diet.plan) || {}) };
  out.diet.done = (d.diet && d.diet.done) || {};
  out.finance = { ...base.finance, ...(d.finance || {}) };
  for (const k of ['foods', 'savings', 'weight']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['expenses', 'fixed']) if (!Array.isArray(out.finance[k])) out.finance[k] = [];
  for (const k of ['log', 'water']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!out.finance.budgets || typeof out.finance.budgets !== 'object') out.finance.budgets = {};
  out.app = base.app;
  out.v = VERSION;
  return out;
}

export let state = defaults();

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idb = (mode, fn) =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      })
  );

export async function load() {
  let raw;
  try {
    raw = await idb('readonly', (s) => s.get(KEY));
  } catch {
    /* cae a localStorage */
  }
  if (!raw) {
    try {
      raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch {
      raw = null;
    }
  }
  state = withDefaults(raw);
  // Pide al navegador que no borre los datos si falta espacio.
  navigator.storage?.persist?.().catch(() => {});
  return state;
}

let timer;
let pending = null;

function flush() {
  clearTimeout(timer);
  const snapshot = JSON.stringify(state);
  pending = idb('readwrite', (s) => s.put(JSON.parse(snapshot), KEY))
    .catch(() => {
      try {
        localStorage.setItem(LS_KEY, snapshot);
      } catch {
        /* sin espacio: nada más que hacer */
      }
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// Guarda con un pequeño retraso para agrupar cambios seguidos.
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

// Guarda al salir de la app (importante en iPhone, que cierra las apps sin aviso).
export function saveNow() {
  return flush();
}

export async function replaceState(data) {
  state = withDefaults(data);
  await flush();
  return state;
}

export function exportPayload() {
  return { app: 'gestion-personal', version: VERSION, exportedAt: new Date().toISOString(), data: state };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => flush());
