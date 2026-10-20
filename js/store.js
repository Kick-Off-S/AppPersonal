// Estado de la app. Todo vive en un solo objeto guardado en IndexedDB (con respaldo en localStorage).
// Ese mismo objeto es lo que se exporta/importa como respaldo.

const DB_NAME = 'gestion-personal';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'gestion-personal:state';
// Versión del esquema de datos. Al cambiar la forma de los datos: subirla y agregar un paso en MIGRATIONS.
export const VERSION = 2;
// Versión visible de la app. Al cambiarla, quienes ya usan la app ven las novedades una vez.
export const APP_VERSION = '4.1';

export const defaults = () => ({
  app: 'gestion-personal',
  v: VERSION,
  settings: { name: '', kcalGoal: 2000, waterGoal: 2000, goalKg: 0, lastBackup: null, backupSnooze: '', seenVersion: '', setupDone: false, theme: { palette: 'teal', mode: 'auto' }, modules: { health: true, finance: true, exercise: true, habits: true, shopping: true } },
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
  // salaryMode: 'fixed' (el sueldo se repite cada mes) | 'variable' (se ingresa cada mes)
  // extras: otros ingresos del mes { id, date, amount, note }
  // loans: préstamos { id, dir: 'lent' (presté) | 'borrowed' (me prestaron), person, amount, date, counted,
  //        n, cuota, start: 'YYYY-MM', prepaid, received: { 'YYYY-MM': true }, note }
  //        las cuotas pagadas de lo que me prestaron se registran como gastos con loanId y cuotaYm
  finance: { income: {}, expenses: [], fixed: [], budgets: {}, salaryMode: 'fixed', extras: [], loans: [] }, // income['YYYY-MM'] = sueldo líquido
  // Cuentas de ahorro: { id, name, kind, rate? (% anual) }
  savingsAccounts: [{ id: 'general', name: 'Ahorro general', kind: 'cuenta' }],
  // type: 'in' aporte | 'out' retiro | 'int' interés o rentabilidad (amount con signo: + ganancia, − pérdida)
  //       | 'move' traspaso de acc a to (no cuenta como aporte ni retiro)
  savings: [], // { id, date, type, amount, note, acc, to?, ym? }
  savingsGoal: 0,
  // Ejercicio: rutinas por día de la semana (0 = lunes) con ejercicios; done[fecha][rutina][ejercicio] = { kg? }
  // log[fecha] = actividades extra { id, type, mins, kcal, note }
  exercise: { routines: [], done: {}, log: {} },
  // Hábitos: list { id, name, emoji, days }, done[fecha][hábito] = true
  habits: { list: [], done: {} },
  // Lista de compras: { id, name, qty, done }
  shopping: { items: [] },
});

// ---------- limpieza de datos ----------
// Un respaldo puede venir de otra persona (o estar manipulado). Los textos libres se muestran siempre
// escapados; el resto (ids, fechas, números, claves) se inserta tal cual en el HTML, así que les quitamos
// cualquier carácter que permita inyectar código.
const FREE_TEXT = new Set(['name', 'note', 'desc', 'label', 'person', 'cat', 'unit', 'reps', 'title', 'qty', 'type', 'time', 'emoji']);
const UNSAFE = /[<>"'`&\\]/g;
export function clean(v, key = '') {
  if (typeof v === 'string') return FREE_TEXT.has(key) ? v : v.replace(UNSAFE, '');
  if (Array.isArray(v)) return v.map((x) => clean(x, key));
  if (v && typeof v === 'object') {
    const o = {};
    // las claves de los topes son nombres de categoría (texto libre que se muestra escapado)
    for (const [k, x] of Object.entries(v)) o[key === 'budgets' ? k : k.replace(UNSAFE, '')] = clean(x, k);
    return o;
  }
  return typeof v === 'number' || typeof v === 'boolean' || v === null ? v : undefined;
}

// ---------- migraciones ----------
// Cada paso lleva los datos de la versión anterior a "to". Se aplican en orden y una sola vez
// (los datos guardan su versión en "v"). Deben tolerar datos incompletos.
const weekday = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
};
export const MIGRATIONS = [
  {
    to: 2,
    what: 'Dieta: guardar las calorías y macros de cada comida cumplida (el historial ya no depende del plan actual)',
    run(d) {
      const plan = d.diet?.plan || {};
      for (const [date, marks] of Object.entries(d.diet?.done || {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !marks || typeof marks !== 'object') continue;
        for (const [id, v] of Object.entries(marks)) {
          if (v !== true) continue;
          const m = (plan[weekday(date)] || []).find((x) => x.id === id);
          if (m) marks[id] = { name: m.name, kcal: m.kcal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0 };
        }
      }
    },
  },
];
export function migrate(d) {
  let v = Number(d.v) || 1;
  for (const step of MIGRATIONS) if (v < step.to) step.run(d), (v = step.to);
  d.v = v;
  return d;
}

// Completa lo que falte (por si un respaldo viene de una versión anterior), limpia y migra los datos.
export function withDefaults(data) {
  const base = defaults();
  const d = clean(data && typeof data === 'object' ? data : {});
  const out = { ...base, ...d };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.settings.modules = { ...base.settings.modules, ...((d.settings && d.settings.modules) || {}) };
  out.settings.theme = { ...base.settings.theme, ...((d.settings && d.settings.theme) || {}) };
  out.diet = { ...base.diet, ...(d.diet || {}) };
  out.diet.plan = { ...base.diet.plan, ...((d.diet && d.diet.plan) || {}) };
  out.diet.done = (d.diet && d.diet.done) || {};
  out.finance = { ...base.finance, ...(d.finance || {}) };
  for (const k of ['foods', 'savings', 'weight']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['expenses', 'fixed', 'extras', 'loans']) if (!Array.isArray(out.finance[k])) out.finance[k] = [];
  for (const k of ['log', 'water']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!out.finance.budgets || typeof out.finance.budgets !== 'object') out.finance.budgets = {};
  // v3: ejercicio, hábitos y compras
  out.exercise = { ...base.exercise, ...(d.exercise || {}) };
  if (!Array.isArray(out.exercise.routines)) out.exercise.routines = [];
  for (const k of ['done', 'log']) if (!out.exercise[k] || typeof out.exercise[k] !== 'object') out.exercise[k] = {};
  out.habits = { ...base.habits, ...(d.habits || {}) };
  if (!Array.isArray(out.habits.list)) out.habits.list = [];
  if (!out.habits.done || typeof out.habits.done !== 'object') out.habits.done = {};
  out.shopping = { ...base.shopping, ...(d.shopping || {}) };
  if (!Array.isArray(out.shopping.items)) out.shopping.items = [];
  // Ahorro por cuentas (v2.4): los movimientos antiguos quedan en "Ahorro general".
  if (!Array.isArray(out.savingsAccounts) || !out.savingsAccounts.length) out.savingsAccounts = base.savingsAccounts;
  const firstAcc = out.savingsAccounts[0].id;
  for (const m of out.savings) if (!m.acc || !out.savingsAccounts.some((a) => a.id === m.acc)) m.acc = firstAcc;
  out.app = base.app;
  out.v = Number(d.v) || 1; // sin versión = datos de la primera versión
  migrate(out);
  return out;
}

export let state = defaults();

// ---------- IndexedDB ----------
// Una sola conexión, reutilizada. Abrir tiene tiempo límite (en iPhone a veces no responde) y si iOS
// corta la conexión se vuelve a abrir. Cada operación se reintenta una vez.
let dbP = null;
function openDB() {
  if (dbP) return dbP;
  dbP = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin indexedDB'));
    const t = setTimeout(() => reject(new Error('IndexedDB no responde')), 4000);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      clearTimeout(t);
      const db = req.result;
      db.onclose = () => (dbP = null);
      db.onversionchange = () => (db.close(), (dbP = null));
      resolve(db);
    };
    req.onerror = () => (clearTimeout(t), reject(req.error));
  }).catch((e) => {
    dbP = null;
    throw e;
  });
  return dbP;
}

const idbOnce = (mode, fn) =>
  openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch (e) {
          dbP = null; // conexión cerrada por el sistema
          return reject(e);
        }
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('transacción abortada'));
      })
  );
const idb = (mode, fn) => idbOnce(mode, fn).catch(() => ((dbP = null), idbOnce(mode, fn)));
const hasIDB = () => 'indexedDB' in window;

// Si no se pudieron leer los datos guardados, la app no escribe nada (para no pisarlos con datos
// vacíos o viejos) hasta que se vuelva a abrir. La app muestra un aviso.
export let readOnly = false;

export async function load() {
  let fromIdb;
  let idbFailed = false;
  if (hasIDB()) {
    try {
      fromIdb = await idb('readonly', (s) => s.get(KEY));
    } catch {
      idbFailed = true;
    }
  }
  let fromLs = null;
  try {
    fromLs = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch {
    fromLs = null;
  }
  // Gana la copia guardada más recientemente (savedAt). Sin marca (datos antiguos) se prefiere IndexedDB.
  const at = (x) => (x && typeof x.savedAt === 'string' ? x.savedAt : '');
  let raw = fromIdb || fromLs;
  if (fromIdb && fromLs && at(fromLs) > at(fromIdb)) raw = fromLs;
  readOnly = idbFailed;
  state = withDefaults(raw);
  // Pide al navegador que no borre los datos si falta espacio.
  navigator.storage?.persist?.().catch(() => {});
  return state;
}

let timer;
let pending = null;

function flush() {
  clearTimeout(timer);
  if (readOnly) return Promise.resolve();
  state.savedAt = new Date().toISOString();
  const snapshot = JSON.stringify(state);
  pending = (hasIDB() ? idb('readwrite', (s) => s.put(JSON.parse(snapshot), KEY)) : Promise.reject(new Error('sin indexedDB')))
    .then(() => {
      // guardado normal OK: la copia de emergencia ya no sirve (y podría quedar vieja)
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        /* sin almacenamiento */
      }
    })
    .catch(() => {
      try {
        localStorage.setItem(LS_KEY, snapshot);
      } catch {
        window.dispatchEvent(new Event('save-failed'));
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

// ---------- copia para deshacer ----------
// Antes de restaurar un respaldo o borrar todo se guarda una copia de los datos actuales en el
// teléfono, para poder volver atrás (Ajustes → Respaldo).
const PREV = 'previous';
export async function keepPrevious(label) {
  try {
    await idb('readwrite', (s) => s.put({ label, at: new Date().toISOString(), data: JSON.parse(JSON.stringify(state)) }, PREV));
  } catch {
    /* sin IndexedDB no hay copia para deshacer */
  }
}
export async function getPrevious() {
  try {
    return (await idb('readonly', (s) => s.get(PREV))) || null;
  } catch {
    return null;
  }
}

// Reemplaza todos los datos (restaurar un respaldo, borrar todo, deshacer).
//   label: guarda antes una copia para deshacer.  keepLock: conserva el bloqueo de este teléfono.
export async function replaceState(data, { label = '', keepLock = false } = {}) {
  if (label) await keepPrevious(label);
  const lock = state.settings?.lock;
  state = withDefaults(data);
  if (keepLock) state.settings.lock = lock;
  readOnly = false; // el usuario eligió estos datos explícitamente
  await flush();
  return state;
}

// El bloqueo (PIN y Face ID) es de cada teléfono: no viaja en los respaldos.
export function exportPayload() {
  const { lock, ...settings } = state.settings;
  return { app: 'gestion-personal', version: VERSION, exportedAt: new Date().toISOString(), data: { ...state, settings } };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => flush());
