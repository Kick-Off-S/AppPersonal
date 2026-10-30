import { load, state, save, APP_VERSION, replaceState, defaults, readOnly } from './store.js';
import { lockEnabled, lockScreen } from './security.js';
import { hasData, backup, backupAge, backupDue, snoozeBackup } from './backup.js';
import { MODULES, isOn } from './modules.js';
import { esc, openSheet, toast } from './util.js';
import { applyTheme } from './theme.js';
import { cloudStartup } from './cloud.js';
import { privacySheet } from './privacy.js';
import * as today from './views/today.js';
import * as diet from './views/diet.js';
import * as finance from './views/finance.js';
import * as savings from './views/savings.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';
import * as exercise from './views/exercise.js';
import * as habits from './views/habits.js';
import * as shopping from './views/shopping.js';
import * as meds from './views/meds.js';

const ICONS = {
  privacy: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-3.5"/>',
  today: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9 15l2 2 4-4"/>',
  progress: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/>',
  diet: '<path d="M9 5h11M9 12h11M9 19h11"/><path d="M3.5 5l1.3 1.3L7 4M3.5 12l1.3 1.3L7 11M3.5 19l1.3 1.3L7 18"/>',
  finance: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16" cy="13.5" r="1.1"/>',
  savings: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  exercise: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  habits: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  meds: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>',
  shopping: '<path d="M3 4h2.2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
};

// module: a qué módulo pertenece cada pestaña (sin module = siempre visible; lista = visible si alguno está activo).
// El orden define la barra de abajo: caben 5; si hay más, las 4 primeras + "Más".
const TABS = [
  { id: 'today', label: 'Hoy', view: today, module: ['health', 'exercise', 'habits', 'meds'] },
  { id: 'diet', label: 'Dieta', view: diet, module: 'health' },
  { id: 'exercise', label: 'Ejercicio', view: exercise, module: 'exercise' },
  { id: 'finance', label: 'Gastos', view: finance, module: 'finance', title: 'Gastos y sueldo' },
  { id: 'habits', label: 'Hábitos', view: habits, module: 'habits' },
  { id: 'meds', label: 'Remedios', view: meds, module: 'meds', title: 'Medicamentos' },
  { id: 'savings', label: 'Ahorro', view: savings, module: 'finance' },
  { id: 'shopping', label: 'Compras', view: shopping, module: 'shopping', title: 'Lista de compras' },
  { id: 'progress', label: 'Progreso', view: progress, module: 'health' },
  { id: 'settings', label: 'Ajustes', view: settings },
];
const visibleTabs = () => TABS.filter((t) => !t.module || isOn(t.module));
const MAX_BAR = 5;
const barTabs = () => (visibleTabs().length > MAX_BAR ? visibleTabs().slice(0, MAX_BAR - 1) : visibleTabs());
const moreTabs = () => (visibleTabs().length > MAX_BAR ? visibleTabs().slice(MAX_BAR - 1) : []);

// Pestaña "Más": lista de las secciones que no caben en la barra.
const moreView = {
  mount(el) {
    el.onclick = (e) => e.target.closest('[data-act="privacy"]') && (e.preventDefault(), privacySheet());
    el.innerHTML = `<div class="card more">${moreTabs()
      .map(
        (t) => `<a class="item" href="#${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t.id]}</svg>
        <div class="grow t">${t.title || t.label}</div><span class="muted">›</span></a>`
      )
      .join('')}
      <a class="item" href="#" data-act="privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.privacy}</svg>
        <div class="grow t">Privacidad y tus datos</div><span class="muted">›</span></a></div>
      <p class="small muted" style="text-align:center">Elige qué módulos ver en <a href="#settings">Ajustes</a>.</p>`;
  },
};
const MORE = { id: 'more', label: 'Más', view: moreView };

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $tabbar = document.getElementById('tabbar');
const $notice = document.getElementById('notice');

function drawTabbar() {
  $tabbar.innerHTML = [...barTabs(), ...(moreTabs().length ? [MORE] : [])]
    .map(
      (t) => `<a href="#${t.id}" data-tab="${t.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t.id]}</svg>
    <span>${t.label}</span></a>`
    )
    .join('');
}

function show() {
  if (document.body.classList.contains('locked')) return; // con la app bloqueada no se dibujan datos
  const tabs = visibleTabs();
  const id = location.hash.slice(1);
  const tab = (id === 'more' && moreTabs().length ? MORE : null) || tabs.find((t) => t.id === id) || tabs[0];
  // si la pestaña pedida está en un módulo apagado, mostramos la de inicio
  if (id && id !== tab.id) history.replaceState(null, '', '#' + tab.id);
  $title.textContent = tab.title || tab.label;
  // las secciones que viven en "Más" lo dejan marcado
  const active = moreTabs().includes(tab) ? 'more' : tab.id;
  $tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.tab === active));
  $view.scrollTop = 0;
  window.scrollTo(0, 0);
  drawNotice(tab === tabs[0]);
  try {
    tab.view.mount($view);
  } catch (err) {
    rescue(err);
  }
}

// Si una sección falla (por ejemplo, datos dañados), en vez de una pantalla rota se ofrece respaldar.
function rescue(err) {
  console.error(err);
  $view.onclick = null;
  $view.innerHTML = `<div class="card"><h2>Algo salió mal</h2>
    <p class="small" style="margin-top:0">Esta sección no se pudo mostrar. Tus datos siguen guardados en el teléfono.</p>
    <div class="actions"><button class="primary" id="rs-backup">Guardar respaldo</button><button id="rs-retry">Reintentar</button></div>
    <p class="small muted" style="margin-bottom:0">Si se repite, guarda un respaldo y avisa a quien te compartió la app. Detalle: ${esc(String(err?.message || err))}</p></div>`;
  $view.querySelector('#rs-backup').onclick = () => backup();
  $view.querySelector('#rs-retry').onclick = () => show();
}

// Recordatorio semanal de respaldo: arriba de la pestaña de inicio (sea cual sea según los módulos).
function drawNotice(home) {
  if (readOnly)
    return ($notice.innerHTML = `<div class="banner warn"><b>No pudimos leer tus datos guardados</b><br>Para no perder nada, la app no guardará cambios por ahora. Cierra la app por completo y vuelve a abrirla.</div>`);
  if (!home || !backupDue()) return ($notice.innerHTML = '');
  const age = backupAge();
  $notice.innerHTML = `<div class="banner warn"><b>Respalda tus datos</b><br>${age === null ? 'Aún no tienes ningún respaldo.' : `Tu último respaldo fue hace ${age} días.`} Te protege si pierdes o cambias el teléfono, o si se borra la app.
    <button class="primary sm block" data-n="cloud" style="margin-top:8px">Activar respaldo automático</button>
    <div class="actions"><button class="ghost sm" data-n="snooze">Ahora no</button><button class="sm" data-n="backup">Guardar archivo</button></div></div>`;
}
$notice.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  if (b.dataset.n === 'backup') return backup(() => drawNotice(true));
  if (b.dataset.n === 'cloud') return openInSettings(settings.cloudOnSheet);
  snoozeBackup();
  drawNotice(true);
});

window.addEventListener('hashchange', show);
window.addEventListener('save-failed', () => toast('No se pudo guardar: el teléfono no tiene espacio disponible'));
// "Olvidé mi PIN": borrar los datos de este teléfono (se puede restaurar un respaldo después)
window.addEventListener('reset-all', async () => {
  await replaceState(defaults());
  location.reload();
});
window.addEventListener('modules-changed', () => {
  applyTheme(); // por si se restauró un respaldo con otra apariencia
  drawTabbar();
  show();
});

// ---------- actualizaciones ----------
// El service worker nuevo se instala solo en segundo plano; cuando toma el control,
// avisamos para recargar y ver la versión nueva de inmediato. Se registra antes de cargar los datos
// y del bloqueo: si no, el aviso se pierde mientras se escribe el PIN.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBar();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      // En iPhone la app instalada vuelve del fondo sin recargar: revisamos al volver.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

await load();
applyTheme();
// con bloqueo activo no se dibuja ningún dato hasta desbloquear
if (lockEnabled()) await lockScreen();
drawTabbar();
show();
if (!welcome()) whatsNew();
cloudStartup(); // horas de aviso al día y respaldo automático pendiente

// ---------- bienvenida: elegir módulos la primera vez ----------
// Va a Ajustes y abre una de sus hojas (p. ej., activar o recuperar el respaldo en la nube).
function openInSettings(sheet) {
  if (location.hash !== '#settings') location.hash = '#settings';
  setTimeout(sheet, 80);
}

function welcome() {
  if (state.settings.setupDone) return false;
  state.settings.setupDone = true;
  save();
  if (hasData()) return false; // quien ya usaba la app sigue con todo activo
  welcomeSheet(new Set(MODULES.map((m) => m.id)));
  return true;
}

function welcomeSheet(chosen) {
  openSheet(
    `<h3>¡Bienvenido!</h3>
    <p class="muted small" style="margin-top:0">¿Qué quieres usar? Puedes cambiarlo cuando quieras en <b>Ajustes</b>.</p>
    <div id="mods">${MODULES.map(
      (m) => `<label class="mod"><input type="checkbox" class="switch" data-m="${m.id}" ${chosen.has(m.id) ? 'checked' : ''}>
        <span class="grow"><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span></label>`
    ).join('')}</div>
    <div class="privacy-intro small"><b>🔒 Tus datos son tuyos.</b> Todo lo que registras queda solo en este teléfono: sin cuentas, sin publicidad y sin compartir con nadie. Las notificaciones y el respaldo en la nube son opcionales y te pedimos permiso antes de activarlos. <a href="#" id="priv">Cómo tratamos tus datos</a></div>
    <div class="actions"><button class="primary" id="go">Empezar</button></div>
    <div class="banner" style="margin-top:14px"><b>¿Ya usabas la app?</b> Si cambiaste de teléfono o se borró la app, recupera tus datos:
      <div class="actions"><button class="sm" id="r-cloud">Desde la nube</button><button class="sm" id="r-file">Desde un archivo</button></div></div>`,
    (sheet, close) => {
      // el aviso abre en su propia hoja; al cerrarlo se vuelve a la bienvenida con lo elegido
      sheet.querySelector('#priv').onclick = (e) => {
        e.preventDefault();
        privacySheet(() => welcomeSheet(chosen));
      };
      sheet.querySelector('#r-cloud').onclick = () => (close(), openInSettings(settings.cloudRestoreSheet));
      sheet.querySelector('#r-file').onclick = () => {
        close();
        openInSettings(() => {
          document.getElementById('backup-card')?.scrollIntoView({ block: 'center' });
          toast('Toca "Restaurar" y elige tu archivo de respaldo');
        });
      };
      sheet.querySelector('#mods').onchange = (e) => {
        const m = e.target.dataset.m;
        if (e.target.checked) chosen.add(m);
        else chosen.delete(m);
      };
      sheet.querySelector('#go').onclick = () => {
        if (!chosen.size) return toast('Elige al menos uno');
        for (const m of MODULES) state.settings.modules[m.id] = chosen.has(m.id);
        save();
        close();
        drawTabbar();
        show();
      };
    }
  );
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ---------- novedades (una vez por versión, solo a quien ya usaba la app) ----------
function whatsNew() {
  if (state.settings.seenVersion === APP_VERSION) return;
  const returning = hasData();
  state.settings.seenVersion = APP_VERSION;
  save();
  if (!returning) return;
  openSheet(
    `<h3>Novedades de la versión ${APP_VERSION}</h3>
    <ul class="news">
      <li><b>⚖️ Meta de peso realista (Progreso → Meta de peso):</b> calcula tu IMC, el rango de peso saludable para tu estatura y una meta sugerida. Te dice en cuántas semanas la lograrías a un ritmo sano y si la fecha que elegiste es realista.</li>
      <li><b>🍽️ Avisos de comidas:</b> con las notificaciones activadas, te avisa a la hora de cada comida de tu plan si aún no la marcas (se puede apagar en Ajustes → Notificaciones).</li>
      <li><b>🔒 Privacidad a mano:</b> en Más → Privacidad y tus datos ves cómo se tratan tus datos.</li>
      <li>De la 4.9: copia de seguridad interna de tus datos y diagnóstico.</li>
    </ul>
    <div class="actions"><button class="primary" data-close>¡Entendido!</button></div>`
  );
}

function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = '<span>Hay una versión nueva de la app</span><button class="sm primary">Actualizar</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(bar);
}
