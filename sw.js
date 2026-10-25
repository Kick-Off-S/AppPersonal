// Service worker: deja la app disponible sin internet.
// Sube VERSION cada vez que cambies archivos para que los teléfonos se actualicen.
const VERSION = 'gp-v29';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-v2.svg',
  'icons/icon-v2-192.png',
  'icons/icon-v2-512.png',
  'icons/apple-touch-icon-v2.png',
  'icons/icon-v2-maskable-512.png',
  'js/app.js',
  'js/store.js',
  'js/util.js',
  'js/foods.js',
  'js/calc.js',
  'js/charts.js',
  'js/foodpicker.js',
  'js/backup.js',
  'js/modules.js',
  'js/theme.js',
  'js/security.js',
  'js/scanner.js',
  'js/nutrition.js',
  'js/cloud.js',
  'js/privacy.js',
  'js/vendor/zxing.min.js',
  'js/views/today.js',
  'js/views/diet.js',
  'js/views/progress.js',
  'js/views/finance.js',
  'js/views/savings.js',
  'js/views/settings.js',
  'js/views/exercise.js',
  'js/views/habits.js',
  'js/views/shopping.js',
  'js/views/meds.js',
  'js/views/loans.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita copiar archivos viejos desde la caché HTTP del navegador.
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: responde rápido desde caché y actualiza en segundo plano.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- notificaciones ----------
// El servidor manda un aviso vacío a la hora elegida; aquí se arma el mensaje con los datos del
// teléfono (IndexedDB), así ningún dato personal pasa por el servidor.
const readState = () =>
  new Promise((resolve) => {
    const req = indexedDB.open('gestion-personal', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const g = req.result.transaction('kv').objectStore('kv').get('state');
        g.onsuccess = () => resolve(g.result || null);
        g.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDaysStr = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const money = (n) => '$' + Math.round(n).toLocaleString('es-CL');

function compose(st, now = new Date()) {
  const today = ymd(now);
  const wd = (now.getDay() + 6) % 7;
  const ym = today.slice(0, 7);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const near = (t) => t && Math.abs(toMin(t) - nowMin) <= 3;
  const n = { meds: true, habits: '21:00', exercise: '18:00', water: false, bills: '09:00', ...(st.settings?.notif || {}) };
  const out = [];

  // medicamentos de esta hora que aún no se toman
  if (n.meds) {
    const due = [];
    for (const m of st.meds?.list || []) {
      if (m.start && today < m.start) continue;
      if (m.days_n && m.start && today >= addDaysStr(m.start, m.days_n)) continue;
      if (m.days && !m.days.includes(wd)) continue;
      for (const t of m.times || []) if (toMin(t) <= nowMin + 1 && nowMin - toMin(t) <= 5 && !st.meds.log?.[today]?.[m.id]?.[t]) due.push(`${m.name}${m.dose ? ' ' + m.dose : ''}`);
    }
    if (due.length) out.push({ title: '💊 Hora de tu medicamento', body: due.join(', '), url: '#meds' });
  }
  // hábitos pendientes de hoy
  if (n.habits && near(n.habits)) {
    const left = (st.habits?.list || []).filter((h) => (!h.days || h.days.includes(wd)) && !st.habits.done?.[today]?.[h.id]);
    if (left.length) out.push({ title: '✅ Hábitos de hoy', body: `Te ${left.length === 1 ? 'falta' : 'faltan'} ${left.length}: ${left.map((h) => h.name).join(', ')}`, url: '#habits' });
  }
  // rutina del día
  if (n.exercise && near(n.exercise)) {
    const rs = (st.exercise?.routines || []).filter((r) => r.days?.includes(wd));
    const left = rs.filter((r) => Object.keys(st.exercise.done?.[today]?.[r.id] || {}).length < (r.items || []).length);
    if (left.length) out.push({ title: '💪 Hoy toca entrenar', body: left.map((r) => `${r.name} (${Object.keys(st.exercise.done?.[today]?.[r.id] || {}).length} de ${r.items.length})`).join(', '), url: '#exercise' });
  }
  // agua
  if (n.water && ['11:00', '14:00', '17:00', '20:00'].some(near)) {
    const ml = (st.water?.[today] || []).reduce((a, b) => a + b, 0);
    const goal = st.settings?.waterGoal || 0;
    if (goal && ml < goal) out.push({ title: '💧 Toma agua', body: `Llevas ${ml.toLocaleString('es-CL')} de ${goal.toLocaleString('es-CL')} ml`, url: '#today' });
  }
  // pagos del mes vencidos o de hoy (gastos fijos sin pagar y cuotas de préstamos recibidos)
  if (n.bills && near(n.bills)) {
    const fin = st.finance || {};
    const exp = fin.expenses || [];
    const day = +today.slice(8, 10);
    const items = [];
    for (const f of fin.fixed || []) if (f.from <= ym && f.day <= day && !exp.some((e) => e.fixedId === f.id && e.date?.slice(0, 7) === ym)) items.push(`${f.name} ${money(f.amount)}`);
    for (const l of fin.loans || []) {
      if (l.dir !== 'borrowed') continue;
      for (let i = 0; i < l.n; i++) {
        const [y, mo] = l.start.split('-').map(Number);
        const d = new Date(y, mo - 1 + i, 1);
        if (`${d.getFullYear()}-${pad(d.getMonth() + 1)}` === ym && i + 1 > (l.prepaid || 0) && !exp.some((e) => e.loanId === l.id && e.cuotaYm === ym))
          items.push(`Cuota ${i + 1}/${l.n} ${l.person}`);
      }
    }
    if (items.length) out.push({ title: '📅 Pagos pendientes', body: items.join(', '), url: '#finance' });
  }
  return out;
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      const st = await readState().catch(() => null);
      const msgs = st ? compose(st) : [];
      const details = (st?.settings?.notif?.details ?? true) !== false;
      const first = msgs[0];
      // iPhone exige mostrar algo en cada aviso; si ya está todo hecho, se dice eso.
      const title = !first ? 'Gestión Personal' : msgs.length === 1 && details ? first.title : 'Gestión Personal';
      const body = !first ? 'Todo al día ✅' : details ? msgs.map((m) => (msgs.length > 1 ? `${m.title}: ${m.body}` : m.body)).join('\n') : 'Tienes recordatorios pendientes. Toca para verlos.';
      await self.registration.showNotification(title, { body, icon: 'icons/icon-v2-192.png', badge: 'icons/icon-v2-192.png', tag: 'gp-reminder', renotify: true, data: { url: first?.url || '#today' } });
    })()
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(self.registration.scope + (e.notification.data?.url || '#today'));
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const c = all.find((x) => x.url.startsWith(self.registration.scope));
      if (c) {
        await c.focus();
        return c.navigate ? c.navigate(url.href).catch(() => {}) : null;
      }
      return self.clients.openWindow(url.href);
    })()
  );
});
