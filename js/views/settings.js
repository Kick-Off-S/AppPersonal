import { state, save, replaceState, defaults, APP_VERSION } from '../store.js';
import { backup, backupAge, hasData as anyData, exportExpensesCSV } from '../backup.js';
import { esc, toast } from '../util.js';
import { MODULES, isOn, setModule } from '../modules.js';
import { PALETTES, MODES, setTheme } from '../theme.js';

let root;

export function mount(el) {
  root = el;
  root.onclick = onClick;
  root.onchange = onChange;
  render();
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function render() {
  const age = backupAge();
  const stale = age === null || age > 14;
  const hasData = anyData();

  root.innerHTML = `
    ${!standalone() && isIOS() ? `<div class="banner"><b>Instálala en tu iPhone</b><br>En Safari toca <b>Compartir</b> (el cuadro con flecha) → <b>Agregar a inicio</b>. Así abre como app y tus datos quedan más seguros.</div>` : ''}
    <div class="card"><h2>Apariencia</h2>
      <div class="small muted">Color</div>
      <div class="swatches">${PALETTES.map(
        (p) => `<button type="button" class="swatch ${(state.settings.theme?.palette || 'teal') === p.id ? 'sel' : ''}" data-act="palette" data-p="${p.id}" style="--sw:${p.light};--swd:${p.dark}" aria-label="${p.name}"><i>${(state.settings.theme?.palette || 'teal') === p.id ? '✓' : ''}</i>${p.name}</button>`
      ).join('')}</div>
      <div class="small muted" style="margin-top:14px">Modo</div>
      <div class="seg">${MODES.map(
        (m) => `<button type="button" class="${(state.settings.theme?.mode || 'auto') === m.id ? 'sel' : ''}" data-act="mode" data-m="${m.id}">${m.name}</button>`
      ).join('')}</div>
      <p class="small muted" style="margin-bottom:0">Automático sigue el modo claro u oscuro de tu teléfono.</p>
    </div>

    <div class="card"><h2>Módulos</h2>
      <p class="small muted" style="margin-top:0">Elige qué quieres ver en la app. Lo que ocultes no se borra: al activarlo de nuevo vuelve todo.</p>
      ${MODULES.map(
        (m) => `<label class="mod"><input type="checkbox" class="switch" data-mod="${m.id}" ${isOn(m.id) ? 'checked' : ''}>
          <span class="grow"><b>${esc(m.name)}</b><small>${esc(m.desc)} Pestañas: ${esc(m.tabs.join(', '))}.</small></span></label>`
      ).join('')}
    </div>

    <div class="card"><h2>Perfil</h2>
      <label class="field" style="margin-top:0">Tu nombre (opcional)<input id="name" maxlength="40" value="${esc(state.settings.name)}" placeholder="Ej: Jason"></label>
      ${
        isOn('health')
          ? `<label class="field">Meta diaria de calorías<input id="kcal" inputmode="numeric" value="${state.settings.kcalGoal || ''}" placeholder="Ej: 1800"></label>
      <label class="field">Meta diaria de agua (ml)<input id="water" inputmode="numeric" value="${state.settings.waterGoal || ''}" placeholder="Ej: 2000"></label>`
          : ''
      }
    </div>

    <div class="card"><h2>Respaldo</h2>
      <p class="small muted" style="margin-top:0">Tus datos viven solo en este teléfono. Guarda un respaldo para no perderlos si cambias de teléfono, borras la app o limpias Safari.</p>
      ${hasData && stale ? `<div class="banner warn">${age === null ? 'Aún no has hecho ningún respaldo.' : `Tu último respaldo fue hace ${age} días.`}</div>` : ''}
      <div class="small muted">Último respaldo: ${state.settings.lastBackup ? new Date(state.settings.lastBackup).toLocaleString('es-CL') : 'nunca'}</div>
      <div class="actions"><button class="primary" data-act="export">Guardar respaldo</button><button data-act="import">Restaurar</button></div>
      <input type="file" id="file" accept=".json,application/json" hidden>
      <p class="small muted" style="margin-bottom:0">Al guardar, elige <b>Guardar en Archivos</b> (o envíatelo por WhatsApp o correo). Para pasarlo a otro teléfono, abre la app allá y toca <b>Restaurar</b>. La app te lo recordará cada 7 días.</p>
    </div>

    ${
      isOn('finance')
        ? `<div class="card"><h2>Planilla de gastos</h2>
      <p class="small muted" style="margin-top:0">Descarga todos tus gastos en un archivo que se abre en Excel o Google Sheets.</p>
      <button class="block" data-act="csv">Exportar gastos a Excel</button></div>`
        : ''
    }

    <div class="card"><h2>Zona de riesgo</h2>
      <button class="danger block" data-act="reset">Borrar todos mis datos</button></div>
    <p class="small muted" style="text-align:center">Gestión Personal v${APP_VERSION} · Funciona sin internet · Sin cuentas ni servidores</p>`;
}

function onChange(e) {
  if (e.target.dataset.mod) {
    if (!setModule(e.target.dataset.mod, e.target.checked)) {
      e.target.checked = true;
      return toast('Debe quedar al menos un módulo activo');
    }
    return toast(e.target.checked ? 'Módulo activado' : 'Módulo oculto (tus datos se conservan)');
  }
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
  if (t.dataset.act === 'palette') return setTheme({ palette: t.dataset.p }), render();
  if (t.dataset.act === 'mode') return setTheme({ mode: t.dataset.m }), render();
  if (t.dataset.act === 'export') {
    await backup();
    render();
  } else if (t.dataset.act === 'csv') exportExpensesCSV();
  else if (t.dataset.act === 'import') root.querySelector('#file').click();
  else if (t.dataset.act === 'reset') {
    if (!confirm('Se borrarán TODOS tus datos de este teléfono (dieta, calorías, gastos y ahorro). ¿Continuar?')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer, salvo que tengas un respaldo. ¿Borrar todo?')) return;
    await replaceState(defaults());
    window.dispatchEvent(new Event('modules-changed'));
    toast('Datos borrados');
    render();
  }
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
    window.dispatchEvent(new Event('modules-changed'));
    toast('Respaldo restaurado');
    render();
  } catch {
    toast('Ese archivo no es un respaldo válido');
  } finally {
    root.querySelector('#file') && (root.querySelector('#file').value = '');
  }
}
