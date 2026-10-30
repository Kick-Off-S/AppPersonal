// Compartir un préstamo con la otra persona, sin servidor: los datos viajan dentro de un enlace
// …/AppPersonal/#prestamo=<código>. Lo que va después de "#" nunca se envía a ningún servidor.
// Quien lo recibe lo anota "al revés" (si tú prestaste, a esa persona le prestaron) con las cuotas
// ya pagadas. Compartirlo de nuevo actualiza el mismo préstamo (shareId), sin duplicarlo.
import { addMonths } from './util.js';

const PREFIX = 'prestamo=';
const enc = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)));

// settled: meses ('YYYY-MM') de las cuotas ya pagadas o cobradas · from: nombre de quien comparte
export function encodeLoan(l, settled, from) {
  return enc(JSON.stringify({ k: 'gp-loan', v: 1, id: l.shareId, d: l.dir, p: from, a: l.amount, f: l.date, n: l.n, c: l.cuota, au: l.auto ? 1 : 0, s: l.start, pp: l.prepaid || 0, st: settled, no: l.note || '' }));
}
export const shareLink = (base, code) => `${base}#${PREFIX}${code}`;

const YM = /^\d{4}-\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const text = (s, max) =>
  String(s ?? '')
    .replace(/[<>"'`&\\]/g, '')
    .trim()
    .slice(0, max);

// Acepta el enlace completo, el mensaje de WhatsApp que lo contiene o solo el código.
// Todo se valida: el enlace puede venir de cualquiera.
export function decodeLoan(input) {
  const s = String(input || '');
  const m = s.match(/prestamo=([A-Za-z0-9_-]+)/) || s.trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m || m[1].length > 3000) return null;
  let p;
  try {
    p = JSON.parse(dec(m[1]));
  } catch {
    return null;
  }
  if (!p || p.k !== 'gp-loan' || p.v !== 1) return null;
  const n = Math.round(Number(p.n));
  const amount = Math.round(Number(p.a));
  const cuota = Math.round(Number(p.c));
  const from = text(p.p, 40);
  if (!(n >= 1 && n <= 120) || !(amount > 0 && amount < 1e11) || !(cuota > 0 && cuota < 1e11)) return null;
  if (!YMD.test(p.f) || !YM.test(p.s) || !['lent', 'borrowed'].includes(p.d) || !from) return null;
  return {
    id: /^[A-Za-z0-9]{4,40}$/.test(p.id) ? p.id : null,
    dir: p.d,
    from,
    amount,
    date: p.f,
    n,
    cuota,
    auto: !!p.au,
    start: p.s,
    prepaid: Math.min(n, Math.max(0, Math.round(Number(p.pp)) || 0)),
    settled: Array.isArray(p.st) ? p.st.filter((x) => YM.test(x)).slice(0, 120) : [],
    note: text(p.no, 60),
  };
}

// El préstamo como lo ve quien lo recibe.
export function mirrorOf(p) {
  const dir = p.dir === 'lent' ? 'borrowed' : 'lent';
  const sched = Array.from({ length: p.n }, (_, k) => addMonths(p.start, k));
  const done = new Set(p.settled);
  const received = {};
  let prepaid = p.prepaid;
  if (dir === 'lent') {
    for (const ym of p.settled) if (sched.indexOf(ym) >= p.prepaid) received[ym] = true;
  } else while (prepaid < p.n && done.has(sched[prepaid])) prepaid++; // las pagadas al inicio quedan como "ya pagadas"
  return { dir, person: p.from, amount: p.amount, date: p.date, n: p.n, cuota: p.cuota, auto: p.auto, start: p.start, prepaid, received, note: p.note, shareId: p.id };
}
