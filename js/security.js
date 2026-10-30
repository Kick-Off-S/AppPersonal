// Seguridad y privacidad: respaldo cifrado con contraseña, bloqueo de la app (PIN y Face ID / huella)
// y ocultar el contenido al salir de la app. Todo usa la criptografía del propio navegador (Web Crypto
// y WebAuthn): nada sale del teléfono.
import { state, save, saveNow } from './store.js';
import { esc, openSheet, toast, bioName } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

// base64 por partes (los respaldos pueden pesar cientos de KB)
export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// ---------- respaldo cifrado ----------
// AES-GCM 256 con clave derivada de la contraseña (PBKDF2-SHA256). Sin la contraseña no se puede leer.
const ITER = 600000; // recomendación OWASP para PBKDF2-SHA256 (los respaldos guardan su propio valor)

async function keyFrom(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(text, password, meta = {}) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await keyFrom(password, salt, ITER);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { app: 'gestion-personal', enc: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(data), ...meta };
}

// Lanza un error si la contraseña es incorrecta (AES-GCM verifica la integridad).
export async function decryptText(payload, password) {
  const key = await keyFrom(password, fromB64(payload.salt), payload.iter || ITER);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.data));
  return dec.decode(plain);
}

// Pide la contraseña de un respaldo cifrado. Resuelve con el texto descifrado (o null si se cancela).
export function askBackupPassword(payload) {
  return new Promise((resolve) => {
    let done = false;
    const close = openSheet(
      `<h3>Respaldo protegido</h3>
      <p class="muted small" style="margin-top:0">Este respaldo está cifrado. Escribe la contraseña con que lo guardaste.</p>
      <form id="pw"><label class="field">Contraseña<input name="p" type="password" autocomplete="current-password" required></label>
      <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Abrir respaldo</button></div></form>`,
      (sheet) => {
        sheet.querySelector('#pw').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const btn = sheet.querySelector('#ok');
          btn.disabled = true;
          btn.textContent = 'Abriendo…';
          try {
            const text = await decryptText(payload, new FormData(ev.target).get('p'));
            done = true;
            close();
            resolve(text);
          } catch {
            btn.disabled = false;
            btn.textContent = 'Abrir respaldo';
            toast('Contraseña incorrecta');
          }
        });
      },
      () => !done && ((done = true), resolve(null))
    );
  });
}

// ---------- PIN ----------
export async function hashPin(pin, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: 100000, hash: 'SHA-256' }, base, 256);
  return toB64(bits);
}
const lockCfg = () => state.settings.lock || {};

// Teclado de PIN con puntos. onDone(pin) se llama al completar el largo.
export function pinPad(host, { length = 4, title = '', onDone }) {
  let pin = '';
  host.innerHTML = `${title ? `<div class="pin-title">${esc(title)}</div>` : ''}<div class="pin-dots"></div>
    <div class="keypad pin-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
      .map((k) => (k ? `<button type="button" data-k="${k}">${k === 'del' ? '⌫' : k}</button>` : '<span></span>'))
      .join('')}</div>`;
  const dots = host.querySelector('.pin-dots');
  const draw = () => (dots.innerHTML = Array.from({ length }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''));
  host.querySelector('.pin-keys').onclick = (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < length) pin += k;
    draw();
    if (pin.length === length) {
      const p = pin;
      pin = '';
      setTimeout(() => (draw(), onDone(p)), 120);
    }
  };
  draw();
  return { shake: () => (dots.classList.remove('shake'), void dots.offsetWidth, dots.classList.add('shake')) };
}

// ---------- Face ID / huella (WebAuthn) ----------
// La credencial queda en el teléfono; el sistema verifica la cara o la huella y la app solo recibe "ok".
export async function biometricAvailable() {
  try {
    return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}

export async function registerBiometric() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Gestión Personal' },
      user: { id: rand(16), name: 'gestion-personal', displayName: 'Gestión Personal' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  return toB64(cred.rawId);
}

async function verifyBiometric(credId) {
  await navigator.credentials.get({
    publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: fromB64(credId), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
  });
}

// ---------- bloqueo ----------
const fmtWait = (ms) => (ms >= 60000 ? `${Math.ceil(ms / 60000)} min` : `${Math.ceil(ms / 1000)} s`);
export const lockEnabled = () => !!lockCfg().enabled && !!lockCfg().hash;

export async function setPin(pin) {
  const salt = toB64(rand(16));
  state.settings.lock = { ...lockCfg(), enabled: true, salt, hash: await hashPin(pin, salt), len: pin.length, after: lockCfg().after ?? 0 };
  save();
}
export const checkPin = async (pin) => (await hashPin(pin, lockCfg().salt)) === lockCfg().hash;

let showing = null;
// Muestra la pantalla de bloqueo y resuelve al desbloquear. Mientras tanto la app no muestra datos.
export function lockScreen() {
  if (showing) return showing;
  showing = new Promise((resolve) => {
    const cfg = lockCfg();
    const el = document.createElement('div');
    el.id = 'lock';
    el.innerHTML = `<div class="lock-box">
      <img src="icons/icon-v2-192.png" alt="" width="64" height="64" style="border-radius:16px">
      <h3>Gestión Personal</h3>
      <div id="pad"></div>
      ${cfg.credId ? `<button class="primary block" id="bio" style="margin-top:12px">Desbloquear con ${bioName()}</button>` : ''}
      <button class="ghost block sm" id="forgot" style="margin-top:8px">¿Olvidaste tu PIN?</button>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('locked');
    // intentos fallidos guardados (cerrar y abrir la app no los reinicia); desde el 5º, espera creciente
    const waitLeft = () => Math.max(0, (lockCfg().until || 0) - Date.now());
    const unlock = () => {
      if (lockCfg().fails || lockCfg().until) (state.settings.lock.fails = 0), (state.settings.lock.until = 0), saveNow();
      el.remove();
      document.body.classList.remove('locked');
      showing = null;
      resolve();
    };
    const pad = pinPad(el.querySelector('#pad'), {
      length: cfg.len || 4,
      title: 'Ingresa tu PIN',
      async onDone(pin) {
        if (waitLeft()) return toast(`Demasiados intentos: espera ${fmtWait(waitLeft())}`);
        if (await checkPin(pin)) return unlock();
        pad.shake();
        const lk = state.settings.lock;
        lk.fails = (lk.fails || 0) + 1;
        if (lk.fails >= 5) {
          // 30 s, 1 min, 2 min, 4 min… hasta 1 hora
          lk.until = Date.now() + Math.min(3600000, 30000 * 2 ** (lk.fails - 5));
          toast(`Demasiados intentos: espera ${fmtWait(waitLeft())}`);
        } else toast(`PIN incorrecto (${5 - lk.fails} ${5 - lk.fails === 1 ? 'intento' : 'intentos'} antes de esperar)`);
        saveNow();
      },
    });
    el.querySelector('#bio')?.addEventListener('click', async () => {
      try {
        await verifyBiometric(cfg.credId);
        unlock();
      } catch {
        toast('No se pudo verificar. Usa tu PIN.');
      }
    });
    el.querySelector('#forgot').onclick = () => {
      if (!confirm('El PIN no se puede recuperar. Puedes borrar los datos de este teléfono y luego restaurar un respaldo. ¿Borrar todo?')) return;
      if (!confirm('Última confirmación: se borrarán todos los datos de la app en este teléfono.')) return;
      window.dispatchEvent(new Event('reset-all'));
    };
  });
  return showing;
}

// Al salir de la app: tapar el contenido (vista de apps abiertas) y, si corresponde, bloquear al volver.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!lockEnabled()) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    document.body.classList.add('privacy');
  } else {
    document.body.classList.remove('privacy');
    // mínimo 3 s: el menú Compartir o el selector de archivos tapan la app un instante y no deben bloquearla
    const after = Math.max(3, lockCfg().after ?? 0) * 1000;
    if (hiddenAt && Date.now() - hiddenAt >= after) lockScreen();
  }
});
