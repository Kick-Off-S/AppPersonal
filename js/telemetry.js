// Estadísticas anónimas y reportes de fallas.
//  - Una vez al día: versión de la app y tipo de teléfono (para saber cuántos la usan). Sin identificador.
//  - Errores: el mensaje técnico y en qué pantalla pasó (nunca tus datos). Máximo 5 al día.
//  - "Reportar un problema": lo que el usuario escribe, más el diagnóstico de datos si lo acepta.
// Se puede apagar en Ajustes → Privacidad (los reportes escritos a mano se envían igual: los pide el usuario).
import { state, APP_VERSION, diagLog } from './store.js';
import { API } from './cloud.js';
import { isIOS, isAndroid, standalone, todayStr, openSheet, toast } from './util.js';

export const enabled = () => state.settings.telemetry !== false;
export const platform = () => `${isIOS() ? 'ios' : isAndroid() ? 'android' : 'desktop'}${isIOS() || isAndroid() ? (standalone() ? '-app' : '-web') : ''}`;
const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    return null;
  }
};
const post = (path, body) =>
  fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).then((r) => {
    if (!r.ok) throw new Error('servidor ' + r.status);
    return r;
  });

// Una vez al día por teléfono.
export function ping() {
  if (!enabled() || ls('gp-ping') === todayStr()) return;
  ls('gp-ping', todayStr());
  post('/ping', { v: APP_VERSION, p: platform() }).catch(() => ls('gp-ping', '')); // si falla, se intenta mañana… o al volver a abrir
}

// Texto técnico sin datos personales: se quitan direcciones y números largos.
export function cleanError(err) {
  const raw = err?.stack || err?.message || String(err || 'Error');
  return String(raw)
    .replace(/https?:\/\/[^\s)]+\/(js\/[^\s):]+)/g, '$1') // solo la ruta del archivo de la app
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/\d{6,}/g, '[n]')
    .slice(0, 1500);
}
const view = () => (location.hash.slice(1) || 'inicio').split('=')[0].slice(0, 20);

const sent = new Set();
export function reportError(err, where = '') {
  if (!enabled()) return;
  const detail = cleanError(err);
  const message = (where ? where + ': ' : '') + detail.split('\n')[0].slice(0, 200);
  if (sent.has(message)) return;
  const key = 'gp-errs-' + todayStr();
  const n = +(ls(key) || 0);
  if (n >= 5) return;
  sent.add(message);
  ls(key, String(n + 1));
  post('/report', { kind: 'error', v: APP_VERSION, p: platform(), view: view(), message, detail }).catch(() => {});
}

// Reporte escrito por el usuario (con el diagnóstico si lo acepta).
export function sendUserReport(text, withDiag) {
  const detail = [`Navegador: ${navigator.userAgent}`, ...(withDiag ? ['', 'Diagnóstico de datos:', ...diagLog()] : [])].join('\n');
  return post('/report', { kind: 'user', v: APP_VERSION, p: platform(), view: view(), message: String(text).slice(0, 600), detail });
}

// Errores no atrapados (en cualquier pantalla)
window.addEventListener('error', (e) => e.error && reportError(e.error));
window.addEventListener('unhandledrejection', (e) => e.reason instanceof Error && reportError(e.reason, 'promesa'));

// Hoja "Reportar un problema" (Ajustes y Más).
export function reportSheet() {
  openSheet(
    `<h3>Reportar un problema</h3>
    <p class="small muted" style="margin-top:0">Cuéntanos qué pasó y qué estabas haciendo. Llega a quien administra la app. No escribas datos personales que no sean necesarios.</p>
    <textarea id="rep" rows="5" maxlength="600" placeholder="Ej: al tocar Terminar en Ejercicio la pantalla se queda en blanco"></textarea>
    <label class="cuotas"><input type="checkbox" id="diag" checked> <span>Adjuntar el diagnóstico técnico (tipo de teléfono y cómo se abrieron tus datos; no incluye lo que registras)</span></label>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="send">Enviar</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#send').onclick = async () => {
        const t = sheet.querySelector('#rep').value.trim();
        if (t.length < 5) return toast('Cuéntanos un poco más del problema');
        const b = sheet.querySelector('#send');
        b.disabled = true;
        b.textContent = 'Enviando…';
        try {
          await sendUserReport(t, sheet.querySelector('#diag').checked);
          close();
          toast('¡Gracias! Lo vamos a revisar 🙌');
        } catch {
          b.disabled = false;
          b.textContent = 'Enviar';
          toast('No se pudo enviar. Revisa tu internet e inténtalo de nuevo.');
        }
      };
    }
  );
}
