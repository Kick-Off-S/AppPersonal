// Respaldo de datos (archivo .json) y exportación de gastos a planilla (.csv).
import { state, save, saveNow, exportPayload } from './store.js';
import { shareFile, toast, todayStr } from './util.js';

export const hasData = () =>
  !!(
    state.savings.length ||
    state.weight.length ||
    state.finance.expenses.length ||
    state.finance.extras.length ||
    state.finance.loans.length ||
    Object.keys(state.log).length ||
    Object.values(state.diet.plan).some((d) => d.length) ||
    state.exercise.routines.length ||
    state.habits.list.length ||
    state.shopping.items.length
  );

// Días desde el último respaldo (null = nunca).
export function backupAge() {
  const last = state.settings.lastBackup;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}

// Recordatorio semanal en "Hoy": si hay datos, pasaron 7 días (o nunca hubo respaldo) y no se pospuso hoy.
export function backupDue() {
  if (!hasData() || state.settings.backupSnooze === todayStr()) return false;
  const age = backupAge();
  return age === null || age >= 7;
}

export function snoozeBackup() {
  state.settings.backupSnooze = todayStr();
  save();
}

export async function backup() {
  const prev = state.settings.lastBackup;
  state.settings.lastBackup = new Date().toISOString();
  const text = JSON.stringify(exportPayload(), null, 2);
  try {
    const ok = await shareFile(`gestion-personal-${todayStr()}.json`, text, 'application/json', 'Respaldo Gestión Personal');
    if (!ok) state.settings.lastBackup = prev; // cancelado: no cuenta como respaldo
    else toast('Respaldo listo');
    await saveNow();
    return ok;
  } catch {
    state.settings.lastBackup = prev;
    toast('No se pudo guardar el respaldo');
    return false;
  }
}

// Planilla de gastos para Excel (separada por ";" y con BOM para que respete los acentos).
export async function exportExpensesCSV() {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [...state.finance.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [...[e.date, e.cat, e.desc || '', e.fixedId ? 'Fijo' : e.cuota ? `Cuota ${e.cuota[0]}/${e.cuota[1]}` : 'Variable'].map(cell), e.amount].join(';'));
  if (!rows.length) return toast('Aún no hay gastos para exportar');
  const text = '﻿' + ['Fecha;Categoría;Detalle;Tipo;Monto', ...rows].join('\r\n');
  try {
    if (await shareFile(`gastos-${todayStr()}.csv`, text, 'text/csv', 'Gastos')) toast('Planilla lista');
  } catch {
    toast('No se pudo exportar');
  }
}
