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
