// Utilidades compartidas: formato, fechas, hoja inferior (modal) y avisos.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- números ----------
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const money = (n) => (n < -0.5 ? '-' : '') + clp.format(Math.abs(Math.round(n || 0)));
export const num = (n, d = 0) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: d }).format(Math.round((n || 0) * 10 ** d) / 10 ** d);

// "1.200.000" -> 1200000 (solo dígitos)
export const parseMoney = (s) => parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0;
// "1,5" -> 1.5
export const parseQty = (s) => {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// ---------- fechas (siempre en hora local) ----------
const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
export const monthKey = (s) => s.slice(0, 7);
export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const monthLabel = (ym) => cap(new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(parseDate(ym + '-01')));
export const dayLabel = (s) => {
  const t = todayStr();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  if (s === addDays(t, 1)) return 'Mañana';
  return cap(new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'short' }).format(parseDate(s)));
};
export const shortDate = (s) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(parseDate(s));
// Los últimos n días, terminando hoy (el más antiguo primero).
export const lastDays = (n) => Array.from({ length: n }, (_, i) => addDays(todayStr(), i - n + 1));
export const weekdayShort = (s) => {
  const w = new Intl.DateTimeFormat('es-CL', { weekday: 'short' }).format(parseDate(s)).replace('.', '');
  return cap(w);
};
export const monthShort = (ym) => cap(new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(parseDate(ym + '-01')).replace('.', ''));
// 1.200.000 -> "1,2M", 350.000 -> "350k"
export const compact = (n) => {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
};
// 0 = lunes ... 6 = domingo
export const weekdayIndex = (s) => (parseDate(s).getDay() + 6) % 7;
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ---------- hoja inferior ----------
export function openSheet(html, onMount) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="backdrop"></div><section class="sheet" role="dialog" aria-modal="true">${html}</section>`;
  document.body.classList.add('modal-open');
  const sheet = root.querySelector('.sheet');
  const close = () => {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  };
  root.querySelector('.backdrop').addEventListener('click', close);
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  if (onMount) onMount(sheet, close);
  return close;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const vibrate = () => navigator.vibrate?.(8);

// Entrega un archivo al usuario: en el teléfono abre "Compartir" (Guardar en Archivos, WhatsApp, correo…);
// en el computador lo descarga. Llamarla directo desde el toque, antes de cualquier await (Safari lo exige).
// Devuelve false si el usuario canceló.
export async function shareFile(name, text, type, title) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  return true;
}
