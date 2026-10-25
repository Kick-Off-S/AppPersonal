// Conexión opcional con el servidor (Cloudflare): notificaciones push y respaldo automático cifrado.
// El servidor nunca recibe datos legibles:
//  - Notificaciones: solo la dirección de push del teléfono, su zona horaria y las HORAS de aviso.
//    El mensaje ("Hora de tu Losartán", "Te faltan 2 hábitos") lo arma el propio teléfono (sw.js).
//  - Respaldo: se cifra en el teléfono (AES-256) con una clave derivada de la contraseña del usuario.
import { state, exportPayload, replaceState } from './store.js';
import { toB64, fromB64 } from './security.js';
import { todayStr, addDays, monthKey, addMonths } from './util.js';

export const API = 'https://gestion-personal-api.gestion-personal-api.workers.dev';
const VAPID_PUBLIC = 'BMp-SBx--fu5snb0TuQdFlPcHg52e2nsuf9BRZaTB48mO7Tz_mjafPlXe9AXWNK_0IfsQpIykddL8Z_oMBvDZZQ';

const LS = 'gp-cloud'; // configuración de ESTE teléfono (no viaja en los respaldos)
const cfg = () => {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}');
  } catch {
    return {};
  }
};
const setCfg = (patch) => {
  const c = { ...cfg(), ...patch };
  try {
    localStorage.setItem(LS, JSON.stringify(c));
  } catch {
    /* sin almacenamiento */
  }
  return c;
};
// Fecha en que se aceptó cada uso de la nube ('push' | 'backup'); se quita al desactivarlo.
export const saveConsent = (kind, on = true) => setCfg({ consent: { ...cfg().consent, [kind]: on ? Date.now() : null } });
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64url = (b) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deviceId = () => cfg().device || setCfg({ device: b64url(rand(18)) }).device;

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `error ${r.status}`), { status: r.status });
  return j;
}

// ---------- notificaciones ----------
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const NOTIF_DEFAULTS = { meds: true, habits: '21:00', exercise: '18:00', water: false, bills: '09:00', details: true };
export const notifCfg = () => ({ ...NOTIF_DEFAULTS, ...(state.settings.notif || {}) });
const WATER_TIMES = ['11:00', '14:00', '17:00', '20:00'];
export { WATER_TIMES };

// Horas de aviso según los datos (el servidor solo recibe esto). d: días de la semana (0 = lunes) o null.
export function pushSlots() {
  const n = notifCfg();
  const out = new Map();
  const add = (t, d = null, date = null) => t && out.set(`${t}|${d ? d.join('') : ''}|${date || ''}`, { t, d, date });
  if (n.meds) for (const m of state.meds.list) for (const t of m.times) add(t, m.days || null);
  if (n.habits && state.habits.list.length) add(n.habits);
  if (n.exercise && state.exercise.routines.length) {
    const days = [...new Set(state.exercise.routines.flatMap((r) => r.days))].sort();
    if (days.length) add(n.exercise, days.length === 7 ? null : days);
  }
  if (n.water) for (const t of WATER_TIMES) add(t);
  if (n.bills) for (const date of billDates()) add(n.bills, null, date);
  return [...out.values()];
}

// Días (próximos 40) en que vence un gasto fijo o la cuota de un préstamo recibido.
function billDates() {
  const dates = new Set();
  const from = todayStr();
  const to = addDays(from, 40);
  const clampDay = (ym, day) => {
    const [y, m] = ym.split('-').map(Number);
    return `${ym}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
  };
  for (let ym = monthKey(from); ym <= monthKey(to); ym = addMonths(ym, 1)) {
    for (const f of state.finance.fixed) if (f.from <= ym) dates.add(clampDay(ym, f.day));
    for (const l of state.finance.loans) {
      if (l.dir !== 'borrowed') continue;
      for (let i = 0; i < l.n; i++) if (addMonths(l.start, i) === ym && i + 1 > (l.prepaid || 0)) dates.add(clampDay(ym, +String(l.date).slice(8, 10) || 1));
    }
  }
  return [...dates].filter((d) => d >= from && d <= to).sort();
}

const appKey = () => {
  const s = VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/');
  return fromB64(s + '='.repeat((4 - (s.length % 4)) % 4));
};
async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
export async function pushEnabled() {
  return Notification.permission === 'granted' && !!(await currentSub().catch(() => null));
}

// Debe llamarse directo desde un toque (iPhone exige el gesto para pedir permiso).
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permiso');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey() }));
  setCfg({ pushEndpoint: sub.endpoint, pushHash: '' });
  await syncPush(true);
}

export async function disablePush() {
  const sub = await currentSub().catch(() => null);
  await sub?.unsubscribe().catch(() => {});
  await api('DELETE', `/push/${deviceId()}`).catch(() => {});
  setCfg({ pushEndpoint: null, pushHash: '' });
  saveConsent('push', false);
}

// Envía las horas de aviso al servidor si cambiaron, o una vez por semana para indicar que el teléfono
// sigue en uso (el servidor borra los avisos que llevan 90 días sin actualizarse).
const WEEK = 7 * 24 * 3600 * 1000;
export async function syncPush(force = false) {
  if (!cfg().pushEndpoint) return;
  const sub = await currentSub().catch(() => null);
  if (!sub) return setCfg({ pushEndpoint: null });
  const body = { endpoint: sub.endpoint, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago', slots: pushSlots() };
  const hash = JSON.stringify(body);
  if (!force && hash === cfg().pushHash && Date.now() - (cfg().pushAt || 0) < WEEK) return;
  await api('PUT', `/push/${deviceId()}`, body);
  setCfg({ pushHash: hash, pushAt: Date.now() });
}

export const testPush = () => api('GET', `/push/${deviceId()}?test=1`);

// ---------- respaldo automático cifrado ----------
const ITER = 600000;
async function deriveRaw(password, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, 256));
}
const aes = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

// Código de recuperación: 20 caracteres fáciles de copiar (sin 0/O ni 1/I).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(rand(20), (b) => ALPHA[b % ALPHA.length]).join('');
export const formatCode = (c) => 'GP-' + c.match(/.{1,5}/g).join('-');
const parseCode = (s) => String(s || '').toUpperCase().replace(/^GP-?/, '').replace(/[^A-Z0-9]/g, '');

export const backupCfg = () => cfg().backup || null;

async function envelope(c) {
  const iv = rand(12);
  const plain = JSON.stringify({ payload: exportPayload(), token: c.token });
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(fromB64(c.key)), new TextEncoder().encode(plain));
  return JSON.stringify({ app: 'gestion-personal', enc: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: c.iter, salt: c.salt, iv: toB64(iv), data: toB64(data), at: Date.now() });
}

export async function uploadBackup() {
  const c = backupCfg();
  if (!c) return null;
  const r = await api('PUT', `/backup/${c.id}`, { token: c.token, data: await envelope(c) });
  setCfg({ backup: { ...c, last: r.updated || Date.now(), dirty: false } });
  return r;
}

// Activar: crea el código, deriva la clave de la contraseña y sube el primer respaldo.
export async function setupBackup(password) {
  const salt = rand(16);
  const key = await deriveRaw(password, salt);
  const c = { id: newCode(), token: b64url(rand(32)), salt: toB64(salt), iter: ITER, key: toB64(key), last: 0, dirty: true };
  setCfg({ backup: c });
  try {
    await uploadBackup();
  } catch (e) {
    setCfg({ backup: null });
    throw e;
  }
  return formatCode(c.id);
}

export async function disableBackup(removeRemote) {
  const c = backupCfg();
  if (c && removeRemote) await api('DELETE', `/backup/${c.id}`, { token: c.token }).catch(() => {});
  setCfg({ backup: null });
  saveConsent('backup', false);
}

// Recuperar en un teléfono nuevo (o después de borrar la app) con el código y la contraseña.
export async function restoreFromCloud(code, password) {
  const id = parseCode(code);
  const r = await api('GET', `/backup/${id}`);
  const env = JSON.parse(r.data);
  const key = await deriveRaw(password, fromB64(env.salt), env.iter || ITER);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, await aes(key), fromB64(env.data));
  } catch {
    throw new Error('contraseña');
  }
  const { payload, token } = JSON.parse(new TextDecoder().decode(plain));
  await replaceState(payload.data, { label: 'Antes de recuperar desde la nube', keepLock: true });
  // este teléfono sigue respaldando en el mismo código
  saveConsent('backup');
  setCfg({ backup: { id, token, salt: env.salt, iter: env.iter || ITER, key: toB64(key), last: r.updated, dirty: false } });
  return r.updated;
}

// ---------- automático ----------
// Cada vez que se guardan datos: actualizar horas de aviso y, si hay respaldo automático, subirlo
// (como máximo cada 10 minutos mientras se usa la app; al abrirla, si quedó algo pendiente).
let timer;
const MIN_GAP = 10 * 60 * 1000;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    syncPush().catch(() => {});
    const c = backupCfg();
    if (!c || !c.dirty) return;
    if (Date.now() - (c.last || 0) < MIN_GAP) return (timer = setTimeout(schedule, MIN_GAP - (Date.now() - c.last)));
    uploadBackup().catch(() => {});
  }, 15000);
}
window.addEventListener('data-saved', () => {
  const c = backupCfg();
  if (c && !c.dirty) setCfg({ backup: { ...c, dirty: true } });
  schedule();
});
export function cloudStartup() {
  if (backupCfg()?.dirty || (backupCfg() && Date.now() - (backupCfg().last || 0) > 24 * 3600 * 1000)) {
    setCfg({ backup: { ...backupCfg(), dirty: true } });
  }
  schedule();
}
