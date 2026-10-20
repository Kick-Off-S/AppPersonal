// Respaldo de datos (archivo .json) y exportación de gastos a planilla (.csv).
import { state, save, saveNow, exportPayload } from './store.js';
import { shareFile, toast, todayStr, openSheet } from './util.js';
import { encryptText } from './security.js';

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

// Entrega el archivo. Debe llamarse directo desde un toque (Safari exige un gesto para Compartir).
async function deliver(text, close, onDone) {
  const prev = state.settings.lastBackup;
  state.settings.lastBackup = new Date().toISOString();
  try {
    const ok = await shareFile(`gestion-personal-${todayStr()}.json`, text, 'application/json', 'Respaldo Gestión Personal');
    if (!ok) state.settings.lastBackup = prev; // cancelado: no cuenta como respaldo
    else toast('Respaldo listo'), close();
    await saveNow();
  } catch {
    state.settings.lastBackup = prev;
    toast('No se pudo guardar el respaldo');
  }
  onDone?.();
}

// Respaldo: con contraseña (cifrado AES-256, recomendado) o sin ella.
// Cifrar toma un momento, así que primero se prepara y luego un segundo toque lo guarda/comparte.
export function backup(onDone) {
  let usePw = state.settings.backupPw !== false;
  let ready = null; // texto listo para guardar
  openSheet(
    `<h3>Guardar respaldo</h3>
    <div class="seg" id="bmode"><button type="button" data-m="pw">Con contraseña</button><button type="button" data-m="plain">Sin contraseña</button></div>
    <div id="pwbox">
      <p class="small muted" style="margin:8px 0 0">El archivo queda cifrado: nadie puede leer tus datos sin la contraseña, aunque lo envíes por WhatsApp o correo. <b>Si la olvidas, el respaldo no se puede abrir.</b></p>
      <label class="field">Contraseña (mínimo 10 caracteres; mejor una frase)<input id="p1" type="password" autocomplete="new-password" placeholder="Ej: mi perro come sandia"></label>
      <label class="field">Repetir contraseña<input id="p2" type="password" autocomplete="new-password"></label>
    </div>
    <p class="small muted" id="plainnote" hidden style="margin:8px 0 0">Cualquiera que tenga el archivo podrá leer tus finanzas y tu salud.</p>
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button type="button" class="primary" id="go"></button></div>`,
    (sheet, close) => {
      const $ = (q) => sheet.querySelector(q);
      const draw = () => {
        sheet.querySelectorAll('#bmode button').forEach((b) => b.classList.toggle('sel', (b.dataset.m === 'pw') === usePw));
        $('#pwbox').hidden = !usePw;
        $('#plainnote').hidden = usePw;
        $('#go').textContent = ready ? 'Guardar archivo' : usePw ? 'Cifrar respaldo' : 'Guardar archivo';
      };
      $('#bmode').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        usePw = b.dataset.m === 'pw';
        ready = null;
        draw();
      };
      sheet.oninput = () => ((ready = null), draw());
      $('#go').onclick = async () => {
        if (ready) return deliver(ready, close, onDone);
        const payload = exportPayload();
        if (!usePw) {
          state.settings.backupPw = false;
          return deliver(JSON.stringify(payload, null, 2), close, onDone);
        }
        const p1 = $('#p1').value;
        if (p1.length < 10) return toast('Usa al menos 10 caracteres (por ejemplo, una frase corta)');
        if (p1 !== $('#p2').value) return toast('Las contraseñas no coinciden');
        $('#go').disabled = true;
        $('#go').textContent = 'Cifrando…';
        const { data, ...meta } = payload;
        ready = JSON.stringify(await encryptText(JSON.stringify(data), p1, { version: meta.version, exportedAt: meta.exportedAt }));
        state.settings.backupPw = true;
        $('#go').disabled = false;
        draw();
        toast('Listo: toca "Guardar archivo"');
      };
      draw();
    }
  );
}

// Celda de CSV. Un texto que empieza con = + - @ Excel lo ejecutaría como fórmula: se antepone ' para que sea texto.
export const csvCell = (v) => `"${String(v ?? '').replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`;

// Planilla de gastos para Excel (separada por ";" y con BOM para que respete los acentos).
export async function exportExpensesCSV() {
  const cell = csvCell;
  const rows = [...state.finance.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [...[e.date, e.cat, e.desc || '', e.fixedId ? 'Fijo' : e.loanId ? 'Cuota de préstamo' : e.cuota ? `Cuota ${e.cuota[0]}/${e.cuota[1]}` : e.savingsId ? 'Pagado con ahorro' : 'Variable'].map(cell), e.amount].join(';'));
  if (!rows.length) return toast('Aún no hay gastos para exportar');
  const text = '﻿' + ['Fecha;Categoría;Detalle;Tipo;Monto', ...rows].join('\r\n');
  try {
    if (await shareFile(`gastos-${todayStr()}.csv`, text, 'text/csv', 'Gastos')) toast('Planilla lista');
  } catch {
    toast('No se pudo exportar');
  }
}
