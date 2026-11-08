// Servidor de Gestión Personal (Cloudflare Worker).
//
// Hace solo dos cosas y nunca ve datos personales legibles:
//  1. Notificaciones: guarda a qué dirección de push avisar y a qué horas. Cada minuto revisa qué
//     teléfonos tienen un aviso a esa hora (en su zona horaria) y les manda un "aviso vacío". El
//     propio teléfono arma el mensaje con sus datos (qué medicamento toca, qué hábitos faltan…).
//  2. Respaldo automático: guarda el respaldo CIFRADO en el teléfono con la contraseña del usuario.
//  3. Estadísticas anónimas y reportes de fallas: cuántos teléfonos abren la app cada día (solo
//     versión y tipo de teléfono, sin identificador) y los errores o problemas que se reportan.
//     Se ven en /admin con la clave ADMIN_TOKEN.
//
// Variables: VAPID_PUBLIC (clave pública, texto) y los secretos VAPID_PRIVATE_JWK y ADMIN_TOKEN.

const ORIGINS = ['https://kick-off-s.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
// Solo se envían avisos a servicios de push conocidos (evita usar el servidor para llamar a otras direcciones).
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
const MAX_BACKUP = 2_000_000; // caracteres (~1,5 MB de datos cifrados)
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
// Borrado automático de datos sin uso (el aviso de privacidad de la app, js/privacy.js, informa estos plazos).
const DAY = 24 * 3600 * 1000;
const BACKUP_DAYS = 365;
const PUSH_DAYS = 90;
const CLEANUP_CRON = '0 4 * * *';
const REPORT_DAYS = 90; // reportes de fallas: se borran a los 90 días
const REPORTS_PER_DAY = 500; // tope diario (evita que alguien llene la base)

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function cors(req) {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

async function body(req, max) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) throw new Error('muy grande');
  const text = await req.text();
  if (text.length > max) throw new Error('muy grande');
  return JSON.parse(text);
}

// ---------- notificaciones ----------
function validSlots(slots) {
  if (!Array.isArray(slots) || slots.length > 300) return null;
  const out = [];
  for (const s of slots) {
    if (!s || !/^\d{2}:\d{2}$/.test(s.t)) return null;
    const d = s.d == null ? null : Array.isArray(s.d) && s.d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6) ? s.d : undefined;
    if (d === undefined) return null;
    if (s.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return null;
    out.push({ t: s.t, d, date: s.date || null });
  }
  return out;
}
function validEndpoint(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length < 64;
  } catch {
    return false;
  }
};

// Hora, fecha y día de la semana (0 = lunes) en la zona horaria del teléfono.
function localNow(tz, now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  );
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { time: `${p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}`, wd };
}
export const due = (slots, l) => slots.some((s) => s.t === l.time && (s.date ? s.date === l.date : !s.d || s.d.includes(l.wd)));

// Firma VAPID (JWT ES256) para un servicio de push.
async function vapidAuth(env, endpoint, cache) {
  const aud = new URL(endpoint).origin;
  if (cache[aud]) return cache[aud];
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://kick-off-s.github.io/AppPersonal/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return (cache[aud] = `vapid t=${header}.${claims}.${b64url(sig)}, k=${env.VAPID_PUBLIC}`);
}

// Aviso vacío: el teléfono arma el mensaje al recibirlo.
async function sendPush(env, endpoint, cache) {
  const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, endpoint, cache), TTL: '1800', Urgency: 'high', 'Content-Length': '0' } });
  return r.status;
}

async function runReminders(env) {
  const now = new Date();
  const { results } = await env.DB.prepare('SELECT id, endpoint, tz, slots, last_sent FROM subs').all();
  const cache = {};
  await Promise.all(
    results.map(async (row) => {
      const l = localNow(row.tz, now);
      const key = `${l.date} ${l.time}`;
      if (row.last_sent === key || !due(JSON.parse(row.slots), l)) return;
      await env.DB.prepare('UPDATE subs SET last_sent = ? WHERE id = ?').bind(key, row.id).run();
      const status = await sendPush(env, row.endpoint, cache).catch(() => 0);
      // la suscripción ya no existe (app borrada o permiso quitado): se elimina
      if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(row.id).run();
    })
  );
}

// Una vez al día: borra respaldos y avisos que nadie actualiza hace tiempo.
export async function cleanup(env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM backups WHERE updated < ?').bind(now - BACKUP_DAYS * DAY),
    env.DB.prepare('DELETE FROM subs WHERE updated < ?').bind(now - PUSH_DAYS * DAY),
    env.DB.prepare('DELETE FROM reports WHERE at < ?').bind(now - REPORT_DAYS * DAY),
  ]);
}

// ---------- estadísticas y reportes ----------
const txt = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max);
const PLATFORMS = ['ios-app', 'ios-web', 'android-app', 'android-web', 'desktop', 'otro'];
export function validPing(b) {
  if (!b || !/^\d{1,2}\.\d{1,3}$/.test(b.v)) return null;
  return { v: b.v, p: PLATFORMS.includes(b.p) ? b.p : 'otro' };
}
export function validReport(b) {
  const base = validPing(b);
  if (!base || !['error', 'user'].includes(b.kind)) return null;
  const message = txt(b.message, 600).trim();
  if (!message) return null;
  return { ...base, kind: b.kind, view: txt(b.view, 30), message, detail: txt(b.detail, 4000) };
}
const today = () => new Date().toISOString().slice(0, 10);

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function adminPage(env) {
  const since = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const { results: days } = await env.DB.prepare('SELECT day, SUM(n) AS n FROM stats WHERE day >= ? GROUP BY day ORDER BY day DESC').bind(since).all();
  const { results: plat } = await env.DB.prepare('SELECT platform, version, SUM(n) AS n FROM stats WHERE day >= ? GROUP BY platform, version ORDER BY n DESC').bind(since).all();
  const { results: reps } = await env.DB.prepare('SELECT * FROM reports ORDER BY at DESC LIMIT 150').all();
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first();
  const backups = await env.DB.prepare('SELECT COUNT(*) AS n FROM backups').first();
  const t = (rows, cols) => `<table><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Gestión Personal · panel</title>
  <style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#f4f7f6;color:#15201e}h1{font-size:20px}h2{font-size:15px;margin-top:24px;color:#0f766e}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid #dde6e4;text-align:left;vertical-align:top}th{background:#e2f1ef}td pre{white-space:pre-wrap;margin:0;font-size:11.5px;max-height:160px;overflow:auto}.k{display:flex;gap:10px;flex-wrap:wrap}.k div{background:#fff;padding:10px 14px;border-radius:10px}.k b{display:block;font-size:22px}.user{background:#fff7e6}</style></head><body>
  <h1>Gestión Personal · panel</h1>
  <div class="k"><div><b>${escH(days[0]?.n || 0)}</b>teléfonos hoy (o último día)</div><div><b>${escH(Math.max(0, ...days.map((d) => d.n)))}</b>máximo en un día (30 días)</div><div><b>${escH(subs?.n || 0)}</b>con notificaciones</div><div><b>${escH(backups?.n || 0)}</b>con respaldo en la nube</div><div><b>${escH(reps.length)}</b>reportes recientes</div></div>
  <h2>Teléfonos que abrieron la app por día</h2>${t(days, [['Día', (r) => escH(r.day)], ['Teléfonos', (r) => escH(r.n)]])}
  <h2>Por tipo de teléfono y versión (30 días, aperturas)</h2>${t(plat, [['Teléfono', (r) => escH(r.platform)], ['Versión', (r) => escH(r.version)], ['Aperturas', (r) => escH(r.n)]])}
  <h2>Reportes y errores</h2>${t(reps, [['Fecha', (r) => escH(new Date(r.at).toLocaleString('es-CL', { timeZone: 'America/Santiago' }))], ['Tipo', (r) => (r.kind === 'user' ? '🙋 usuario' : '⚠️ error')], ['Versión / teléfono / pantalla', (r) => `${escH(r.version)}<br>${escH(r.platform)}<br>${escH(r.view)}`], ['Mensaje', (r) => `<b>${escH(r.message)}</b>${r.detail ? `<pre>${escH(r.detail)}</pre>` : ''}`]])}
  </body></html>`;
}
// Comparación de la clave sin cortar en el primer carácter distinto.
const sameKey = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

// ---------- rutas ----------
async function route(req, env) {
  const url = new URL(req.url);
  const [, kind, id] = url.pathname.split('/');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (!kind) return json(req, { ok: true, app: 'gestion-personal-api' });
  if (kind === 'ping' && req.method === 'POST') {
    const p = validPing(await body(req, 500));
    if (!p) return json(req, { error: 'datos' }, 400);
    await env.DB.prepare('INSERT INTO stats (day, version, platform, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, version, platform) DO UPDATE SET n = n + 1').bind(today(), p.v, p.p).run();
    return json(req, { ok: true });
  }
  if (kind === 'report' && req.method === 'POST') {
    const r = validReport(await body(req, 8000));
    if (!r) return json(req, { error: 'datos' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE at >= ?').bind(Date.parse(today())).first();
    if ((n?.n || 0) >= REPORTS_PER_DAY) return json(req, { ok: true, skipped: true });
    await env.DB.prepare('INSERT INTO reports (at, kind, version, platform, view, message, detail) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(Date.now(), r.kind, r.v, r.p, r.view, r.message, r.detail).run();
    return json(req, { ok: true });
  }
  if (kind === 'admin' && req.method === 'GET') {
    if (!env.ADMIN_TOKEN || !sameKey(url.searchParams.get('k') || '', env.ADMIN_TOKEN)) return new Response('No autorizado', { status: 403 });
    return new Response(await adminPage(env), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  }
  if (!ID_RE.test(id || '')) return json(req, { error: 'id' }, 400);

  if (kind === 'push') {
    if (req.method === 'PUT') {
      const b = await body(req, 50_000);
      const slots = validSlots(b.slots);
      if (!validEndpoint(b.endpoint) || !validTz(b.tz) || !slots) return json(req, { error: 'datos' }, 400);
      await env.DB.prepare('INSERT INTO subs (id, endpoint, tz, slots, updated) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET endpoint = ?2, tz = ?3, slots = ?4, updated = ?5')
        .bind(id, b.endpoint, b.tz, JSON.stringify(slots), Date.now())
        .run();
      return json(req, { ok: true, slots: slots.length });
    }
    if (req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run();
      return json(req, { ok: true });
    }
    if (req.method === 'GET' && url.searchParams.get('test') === '1') {
      // aviso de prueba inmediato (desde Ajustes)
      const row = await env.DB.prepare('SELECT endpoint FROM subs WHERE id = ?').bind(id).first();
      if (!row) return json(req, { error: 'sin suscripción' }, 404);
      return json(req, { ok: true, status: await sendPush(env, row.endpoint, {}) });
    }
  }

  if (kind === 'backup') {
    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated FROM backups WHERE id = ?').bind(id).first();
      return row ? json(req, { data: row.data, updated: row.updated }) : json(req, { error: 'no existe' }, 404);
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      const b = await body(req, MAX_BACKUP + 1000);
      if (typeof b.token !== 'string' || b.token.length < 30) return json(req, { error: 'token' }, 400);
      const th = await sha256(b.token);
      const row = await env.DB.prepare('SELECT token_hash FROM backups WHERE id = ?').bind(id).first();
      if (row && row.token_hash !== th) return json(req, { error: 'no autorizado' }, 403);
      if (req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM backups WHERE id = ?').bind(id).run();
        return json(req, { ok: true });
      }
      if (typeof b.data !== 'string' || b.data.length > MAX_BACKUP) return json(req, { error: 'datos' }, 400);
      await env.DB.prepare('INSERT INTO backups (id, token_hash, data, size, updated) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET data = ?3, size = ?4, updated = ?5')
        .bind(id, th, b.data, b.data.length, Date.now())
        .run();
      return json(req, { ok: true, updated: Date.now() });
    }
  }
  return json(req, { error: 'ruta' }, 404);
}

export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (e) {
      return json(req, { error: e.message === 'muy grande' ? 'muy grande' : 'error' }, e.message === 'muy grande' ? 413 : 400);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(event.cron === CLEANUP_CRON ? cleanup(env) : runReminders(env));
  },
};
