import { state, save, saveNow, replaceState, exportPayload, defaults } from '../store.js';
import { esc, toast, todayStr } from '../util.js';

let root;
const APP_VERSION = '1.1';

export function mount(el) {
  root = el;
  root.onclick = onClick;
  root.onchange = onChange;
  render();
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function backupAge() {
  const last = state.settings.lastBackup;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}

function render() {
  const age = backupAge();
  const stale = age === null || age > 14;
  const hasData =
    state.savings.length || state.weight.length || state.finance.expenses.length || Object.keys(state.log).length || Object.values(state.diet.plan).some((d) => d.length);

  root.innerHTML = `
    ${!standalone() && isIOS() ? `<div class="banner"><b>Instálala en tu iPhone</b><br>En Safari toca <b>Compartir</b> (el cuadro con flecha) → <b>Agregar a inicio</b>. Así abre como app y tus datos quedan más seguros.</div>` : ''}
    <div class="card"><h2>Perfil</h2>
      <label class="field" style="margin-top:0">Tu nombre (opcional)<input id="name" maxlength="40" value="${esc(state.settings.name)}" placeholder="Ej: Jason"></label>
      <label class="field">Meta diaria de calorías<input id="kcal" inputmode="numeric" value="${state.settings.kcalGoal || ''}" placeholder="Ej: 1800"></label>
      <label class="field">Meta diaria de agua (ml)<input id="water" inputmode="numeric" value="${state.settings.waterGoal || ''}" placeholder="Ej: 2000"></label>
    </div>

    <div class="card"><h2>Respaldo</h2>
      <p class="small muted" style="margin-top:0">Tus datos viven solo en este teléfono. Guarda un respaldo para no perderlos si cambias de teléfono, borras la app o limpias Safari.</p>
      ${hasData && stale ? `<div class="banner warn">${age === null ? 'Aún no has hecho ningún respaldo.' : `Tu último respaldo fue hace ${age} días.`}</div>` : ''}
      <div class="small muted">Último respaldo: ${state.settings.lastBackup ? new Date(state.settings.lastBackup).toLocaleString('es-CL') : 'nunca'}</div>
      <div class="actions"><button class="primary" data-act="export">Guardar respaldo</button><button data-act="import">Restaurar</button></div>
      <input type="file" id="file" accept=".json,application/json" hidden>
      <p class="small muted" style="margin-bottom:0">Al guardar, elige <b>Guardar en Archivos</b> (o envíatelo por WhatsApp o correo). Para pasarlo a otro teléfono, abre la app allá y toca <b>Restaurar</b>.</p>
    </div>

    <div class="card"><h2>Zona de riesgo</h2>
      <button class="danger block" data-act="reset">Borrar todos mis datos</button></div>
    <p class="small muted" style="text-align:center">Gestión Personal v${APP_VERSION} · Funciona sin internet · Sin cuentas ni servidores</p>`;
}

function onChange(e) {
  if (e.target.id === 'name') state.settings.name = e.target.value.trim();
  else if (e.target.id === 'kcal') state.settings.kcalGoal = parseInt(e.target.value, 10) || 0;
  else if (e.target.id === 'water') state.settings.waterGoal = parseInt(e.target.value, 10) || 0;
  else if (e.target.id === 'file') return restore(e.target.files[0]);
  else return;
  save();
  toast('Guardado');
}

async function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'export') await backup();
  else if (t.dataset.act === 'import') root.querySelector('#file').click();
  else if (t.dataset.act === 'reset') {
    if (!confirm('Se borrarán TODOS tus datos de este teléfono (dieta, calorías, gastos y ahorro). ¿Continuar?')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer, salvo que tengas un respaldo. ¿Borrar todo?')) return;
    await replaceState(defaults());
    toast('Datos borrados');
    render();
  }
}

async function backup() {
  const prev = state.settings.lastBackup;
  state.settings.lastBackup = new Date().toISOString();
  await saveNow();
  const text = JSON.stringify(exportPayload(), null, 2);
  const name = `gestion-personal-${todayStr()}.json`;
  const file = new File([text], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Respaldo Gestión Personal' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    toast('Respaldo listo');
  } catch (err) {
    if (err.name !== 'AbortError') toast('No se pudo guardar el respaldo');
    else {
      // Cancelado por el usuario: no cuenta como respaldo hecho.
      state.settings.lastBackup = prev;
      save();
    }
  }
  render();
}

async function restore(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed?.data;
    if (parsed?.app !== 'gestion-personal' || !data || typeof data !== 'object') throw new Error('formato');
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('es-CL') : 'fecha desconocida';
    if (!confirm(`Se reemplazarán los datos actuales por los del respaldo (${when}). ¿Continuar?`)) return;
    await replaceState(data);
    toast('Respaldo restaurado');
    render();
  } catch {
    toast('Ese archivo no es un respaldo válido');
  } finally {
    root.querySelector('#file') && (root.querySelector('#file').value = '');
  }
}
