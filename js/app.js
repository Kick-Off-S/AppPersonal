import { load } from './store.js';
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

const TABS = [
  { id: 'today', label: 'Hoy', view: today },
  { id: 'diet', label: 'Dieta', view: diet },
  { id: 'finance', label: 'Gastos', view: finance },
  { id: 'savings', label: 'Ahorro', view: savings },
  { id: 'progress', label: 'Progreso', view: progress },
  { id: 'settings', label: 'Ajustes', view: settings },
];

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $tabbar = document.getElementById('tabbar');

$tabbar.innerHTML = TABS.map(
  (t) => `<a href="#${t.id}" data-tab="${t.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t.id]}</svg>
    <span>${t.label}</span></a>`
).join('');

function show() {
  const id = location.hash.slice(1);
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  $title.textContent = tab.label === 'Gastos' ? 'Gastos y sueldo' : tab.label;
  $tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab.id));
  $view.scrollTop = 0;
  window.scrollTo(0, 0);
  tab.view.mount($view);
}

window.addEventListener('hashchange', show);

await load();
show();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
