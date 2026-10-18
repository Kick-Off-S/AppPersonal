import { load, state, save, APP_VERSION } from './store.js';
import { hasData, backup, backupAge, backupDue, snoozeBackup } from './backup.js';
import { MODULES, isOn } from './modules.js';
import { esc, openSheet, toast } from './util.js';
import * as today from './views/today.js';
import * as diet from './views/diet.js';
import * as finance from './views/finance.js';
import * as savings from './views/savings.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';

const ICONS = {
  today: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9 15l2 2 4-4"/>',
  progress: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/>',
  diet: '<path d="M9 5h11M9 12h11M9 19h11"/><path d="M3.5 5l1.3 1.3L7 4M3.5 12l1.3 1.3L7 11M3.5 19l1.3 1.3L7 18"/>',
  finance: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16" cy="13.5" r="1.1"/>',
  savings: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

// module: a qué módulo pertenece cada pestaña (sin module = siempre visible).
const TABS = [
  { id: 'today', label: 'Hoy', view: today, module: 'health' },
  { id: 'diet', label: 'Dieta', view: diet, module: 'health' },
  { id: 'finance', label: 'Gastos', view: finance, module: 'finance' },
  { id: 'savings', label: 'Ahorro', view: savings, module: 'finance' },
  { id: 'progress', label: 'Progreso', view: progress, module: 'health' },
  { id: 'settings', label: 'Ajustes', view: settings },
];
const visibleTabs = () => TABS.filter((t) => !t.module || isOn(t.module));

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $tabbar = document.getElementById('tabbar');
const $notice = document.getElementById('notice');

function drawTabbar() {
  $tabbar.innerHTML = visibleTabs()
    .map(
      (t) => `<a href="#${t.id}" data-tab="${t.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t.id]}</svg>
    <span>${t.label}</span></a>`
    )
    .join('');
}

function show() {
  const tabs = visibleTabs();
  const id = location.hash.slice(1);
  const tab = tabs.find((t) => t.id === id) || tabs[0];
  // si la pestaña pedida está en un módulo apagado, mostramos la de inicio
  if (id && id !== tab.id) history.replaceState(null, '', '#' + tab.id);
  $title.textContent = tab.label === 'Gastos' ? 'Gastos y sueldo' : tab.label;
  $tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab.id));
  $view.scrollTop = 0;
  window.scrollTo(0, 0);
  drawNotice(tab === tabs[0]);
  tab.view.mount($view);
}

// Recordatorio semanal de respaldo: arriba de la pestaña de inicio (sea cual sea según los módulos).
function drawNotice(home) {
  if (!home || !backupDue()) return ($notice.innerHTML = '');
  const age = backupAge();
  $notice.innerHTML = `<div class="banner warn"><b>Respalda tus datos</b><br>${age === null ? 'Aún no tienes ningún respaldo.' : `Tu último respaldo fue hace ${age} días.`} Toma 10 segundos y te protege si pierdes o cambias el teléfono.
    <div class="actions"><button class="ghost sm" data-n="snooze">Ahora no</button><button class="primary sm" data-n="backup">Respaldar</button></div></div>`;
}
$notice.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  if (b.dataset.n === 'backup') await backup();
  else snoozeBackup();
  drawNotice(true);
});

window.addEventListener('hashchange', show);
window.addEventListener('modules-changed', () => {
  drawTabbar();
  show();
});

await load();
drawTabbar();
show();
if (!welcome()) whatsNew();

// ---------- bienvenida: elegir módulos la primera vez ----------
function welcome() {
  if (state.settings.setupDone) return false;
  state.settings.setupDone = true;
  save();
  if (hasData()) return false; // quien ya usaba la app sigue con todo activo
  const chosen = new Set(MODULES.map((m) => m.id));
  openSheet(
    `<h3>¡Bienvenido!</h3>
    <p class="muted small" style="margin-top:0">¿Qué quieres usar? Puedes cambiarlo cuando quieras en <b>Ajustes</b>.</p>
    <div id="mods">${MODULES.map(
      (m) => `<label class="mod"><input type="checkbox" class="switch" data-m="${m.id}" checked>
        <span class="grow"><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span></label>`
    ).join('')}</div>
    <div class="actions"><button class="primary" id="go">Empezar</button></div>`,
    (sheet, close) => {
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
  return true;
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
      <li><b>Elige tus módulos:</b> en Ajustes puedes dejar solo Dieta y salud, solo Finanzas, o ambos. Lo que ocultes no se borra.</li>
      <li>De la 2.2: tamaños S / M / L / XL, más alimentos y Manual con gramos.</li>
    </ul>
    <div class="actions"><button class="primary" data-close>¡Entendido!</button></div>`
  );
}

// ---------- actualizaciones ----------
// El service worker nuevo se instala solo en segundo plano; cuando toma el control,
// avisamos para recargar y ver la versión nueva de inmediato.
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

function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = '<span>Hay una versión nueva de la app</span><button class="sm primary">Actualizar</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(bar);
}
