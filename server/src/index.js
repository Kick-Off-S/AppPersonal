// Servidor de Gestión Personal (Cloudflare Worker).
//
// Hace solo dos cosas y nunca ve datos personales legibles:
//  1. Notificaciones: guarda a qué dirección de push avisar y a qué horas. Cada minuto revisa qué
//     teléfonos tienen un aviso a esa hora (en su zona horaria) y les manda un "aviso vacío". El
//     propio teléfono arma el mensaje con sus datos (qué medicamento toca, qué hábitos faltan…).
//  2. Respaldo automático: guarda el respaldo CIFRADO en el teléfono con la contraseña del usuario.
//
// Variables: VAPID_PUBLIC (clave pública, texto) y el secreto VAPID_PRIVATE_JWK (clave privada).

const ORIGINS = ['https://kick-off-s.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
// Solo se envían avisos a servicios de push conocidos (evita usar el servidor para llamar a otras direcciones).
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
const MAX_BACKUP = 2_000_000; // caracteres (~1,5 MB de datos cifrados)
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function cors(req) {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

// ---------- rutas ----------
async function route(req, env) {
  const url = new URL(req.url);
  const [, kind, id] = url.pathname.split('/');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (!kind) return json(req, { ok: true, app: 'gestion-personal-api' });
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
    ctx.waitUntil(runReminders(env));
  },
};
