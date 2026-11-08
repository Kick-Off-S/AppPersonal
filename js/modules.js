// Módulos de la app. Cada persona elige cuáles usar (en la bienvenida o en Ajustes).
// Para agregar un módulo nuevo: sumarlo aquí, crear sus vistas y registrar sus pestañas en js/app.js.
// Desactivar un módulo solo oculta sus pestañas: los datos se conservan.
import { state, save } from './store.js';

export const MODULES = [
  { id: 'health', name: 'Dieta y salud', desc: 'Comidas del plan, calorías, macros, agua, peso y progreso.', tabs: ['Hoy', 'Dieta', 'Progreso'] },
  { id: 'finance', name: 'Finanzas', desc: 'Sueldo, gastos, gastos fijos, cuotas, topes y ahorro.', tabs: ['Gastos', 'Ahorro'] },
  { id: 'exercise', name: 'Ejercicio', desc: 'Rutinas por día que se repiten cada semana, marcar ejercicios hechos y actividad extra con calorías quemadas.', tabs: ['Ejercicio'] },
  { id: 'habits', name: 'Hábitos', desc: 'Hábitos diarios con check, rachas y calendario del mes.', tabs: ['Hábitos'] },
  { id: 'meds', name: 'Medicamentos', desc: 'Horarios de tus medicamentos, marcar tomas, cumplimiento y aviso de stock bajo.', tabs: ['Remedios'] },
  { id: 'shopping', name: 'Lista de compras', desc: 'Lista del súper (se puede armar sola con tu dieta); al terminar registra el gasto.', tabs: ['Compras'] },
];

// id puede ser uno o una lista (la pestaña se ve si alguno está activo)
export const isOn = (id) => (Array.isArray(id) ? id.some(isOn) : state.settings.modules?.[id] !== false);

// Activa/desactiva y avisa a la app para que redibuje las pestañas. Siempre queda al menos uno.
export function setModule(id, on) {
  if (!on && MODULES.filter((m) => isOn(m.id)).length <= 1) return false;
  state.settings.modules = { ...state.settings.modules, [id]: on };
  save();
  window.dispatchEvent(new Event('modules-changed'));
  return true;
}

// ---------- perfiles: grupos de módulos para empezar simple ----------
export const PROFILES = [
  { id: 'gym', emoji: '🏋️', name: 'Solo gimnasio', desc: 'Rutinas, series, descanso, marcas y racha. Lo más simple.', mods: ['exercise'], home: 'exercise' },
  { id: 'fit', emoji: '💪', name: 'Gimnasio y alimentación', desc: 'El gimnasio más calorías, proteína, agua y peso.', mods: ['exercise', 'health'], home: 'today' },
  { id: 'health', emoji: '🥗', name: 'Salud', desc: 'Dieta, peso, ejercicio, hábitos y medicamentos.', mods: ['health', 'exercise', 'habits', 'meds'], home: 'today' },
  { id: 'money', emoji: '💰', name: 'Finanzas', desc: 'Sueldo, gastos, cuotas, tarjetas, préstamos y ahorro.', mods: ['finance'], home: 'finance' },
  { id: 'all', emoji: '✨', name: 'Todo', desc: 'Todos los módulos.', mods: MODULES.map((m) => m.id), home: 'today' },
];
export const activeProfile = () => PROFILES.find((p) => MODULES.every((m) => isOn(m.id) === p.mods.includes(m.id))) || null;

// Aplica un perfil: deja activos solo sus módulos (los datos de los demás se conservan).
export function applyProfile(id) {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) return null;
  state.settings.modules = Object.fromEntries(MODULES.map((m) => [m.id, p.mods.includes(m.id)]));
  delete state.settings.discoverHidden; // vuelve a mostrar qué más se puede activar
  save();
  window.dispatchEvent(new Event('modules-changed'));
  return p;
}

// Tarjeta "Más funciones": lo que está apagado y un botón para activarlo ahí mismo.
const SHORT = {
  health: 'Calorías, proteína, agua, peso e IMC.',
  finance: 'Sueldo, gastos, cuotas, tarjetas y ahorro.',
  exercise: 'Rutinas, series, descanso y marcas.',
  habits: 'Checks diarios con rachas.',
  meds: 'Horarios y recordatorios de tomas.',
  shopping: 'Lista del súper.',
};
export function discoverHTML() {
  const off = MODULES.filter((m) => !isOn(m.id));
  if (!off.length || state.settings.discoverHidden) return '';
  return `<div class="card discover"><div class="row between"><h2 style="margin:0">Más funciones</h2><button class="ghost sm" data-discover="hide">Ocultar</button></div>
    <p class="small muted" style="margin:4px 0 2px">La app también tiene esto. Actívalo cuando quieras, aquí o en <b>Ajustes → Módulos</b>.</p>
    ${off.map((m) => `<div class="item"><div class="grow"><div class="t">${m.name}</div><div class="s">${SHORT[m.id] || ''}</div></div><button class="sm" data-discover="${m.id}">Activar</button></div>`).join('')}</div>`;
}
// Para el onClick de cada pantalla: devuelve true si el toque era de esta tarjeta.
export function handleDiscover(e, toast) {
  const b = e.target.closest('[data-discover]');
  if (!b) return false;
  const id = b.dataset.discover;
  if (id === 'hide') {
    state.settings.discoverHidden = true;
    save();
    toast?.('Puedes activarlas en Ajustes → Módulos');
  } else {
    setModule(id, true);
    toast?.(`${MODULES.find((m) => m.id === id).name} activado: aparece en la barra de abajo`);
    return true; // modules-changed ya redibuja
  }
  window.dispatchEvent(new Event('modules-changed'));
  return true;
}
