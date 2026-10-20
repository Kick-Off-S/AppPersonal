import { state, save, replaceState, defaults, APP_VERSION, VERSION, getPrevious } from '../store.js';
import { backup, backupAge, hasData as anyData, exportExpensesCSV } from '../backup.js';
import { esc, toast } from '../util.js';
import { MODULES, isOn, setModule } from '../modules.js';
import { askBackupPassword, lockEnabled, setPin, checkPin, pinPad, biometricAvailable, registerBiometric } from '../security.js';
import { openSheet } from '../util.js';
import { PALETTES, MODES, setTheme } from '../theme.js';

let root;

let bioOk = false; // ¿el teléfono tiene Face ID / huella disponible para apps web?
biometricAvailable().then((v) => (bioOk = v));

let previous = null; // copia guardada antes de la última restauración / borrado

export function mount(el) {
  root = el;
  root.onclick = onClick;
  root.onchange = onChange;
  render();
  getPrevious().then((p) => {
    previous = p;
    if (p && root === el) render();
  });
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function render() {
  const age = backupAge();
  const stale = age === null || age > 14;
  const hasData = anyData();

  root.innerHTML = `
    ${!standalone() && isIOS() ? `<div class="banner"><b>Instálala en tu iPhone</b><br>En Safari toca <b>Compartir</b> (el cuadro con flecha) → <b>Agregar a inicio</b>. Importante: la app instalada no ve lo que guardaste en Safari. Si ya usaste la app aquí, primero toca <b>Guardar respaldo</b> (más abajo) y después <b>Restaurar</b> en la app instalada.</div>` : ''}
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

    <div class="card"><h2>Privacidad</h2>
      <label class="mod"><input type="checkbox" class="switch" data-sec="lock" ${lockEnabled() ? 'checked' : ''}>
        <span class="grow"><b>Bloquear con PIN</b><small>Pide tu PIN al abrir la app. Al salir, el contenido se oculta en la vista de apps abiertas.</small></span></label>
      ${
        lockEnabled()
          ? `${bioOk ? `<label class="mod"><input type="checkbox" class="switch" data-sec="bio" ${state.settings.lock.credId ? 'checked' : ''}>
              <span class="grow"><b>Face ID / huella</b><small>Desbloquea sin escribir el PIN.</small></span></label>` : ''}
            <div class="small muted" style="margin-top:6px">Volver a bloquear</div>
            <div class="seg">${[[0, 'Al salir'], [60, '1 min'], [300, '5 min'], [900, '15 min']]
              .map(([v, l]) => `<button type="button" class="${(state.settings.lock.after ?? 0) === v ? 'sel' : ''}" data-act="lock-after" data-v="${v}">${l}</button>`)
              .join('')}</div>
            <button class="ghost block sm" data-act="pin-change" style="margin-top:8px">Cambiar PIN</button>`
          : ''
      }
    </div>

    <div class="card"><h2>Respaldo</h2>
      <p class="small muted" style="margin-top:0">Tus datos viven solo en este teléfono. Guarda un respaldo para no perderlos si cambias de teléfono, borras la app o limpias Safari.</p>
      ${hasData && stale ? `<div class="banner warn">${age === null ? 'Aún no has hecho ningún respaldo.' : `Tu último respaldo fue hace ${age} días.`}</div>` : ''}
      <div class="small muted">Último respaldo: ${state.settings.lastBackup ? new Date(state.settings.lastBackup).toLocaleString('es-CL') : 'nunca'}</div>
      ${previous ? `<button class="ghost block sm" data-act="undo" style="margin-top:6px">Deshacer: volver a los datos de ${esc(previous.label.toLowerCase())} (${new Date(previous.at).toLocaleString('es-CL')})</button>` : ''}
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

// PIN nuevo (dos veces). Resuelve con el PIN o null.
function newPinSheet(title = 'Crea tu PIN') {
  return new Promise((resolve) => {
    let first = null;
    let len = 4;
    const close = openSheet(
      `<h3 id="pt">${title}</h3><div class="seg" id="len"><button type="button" data-l="4" class="sel">4 dígitos</button><button type="button" data-l="6">6 dígitos</button></div>
      <div id="pp" style="margin-top:10px"></div><p class="small muted">Si lo olvidas no se puede recuperar: tendrías que borrar los datos y restaurar un respaldo.</p>
      <div class="actions"><button type="button" class="ghost" data-close id="cx">Cancelar</button></div>`,
      (sheet) => {
        // (se resuelve en null también al cerrar tocando el fondo: ver onClose abajo)
        const draw = () =>
          pinPad(sheet.querySelector('#pp'), {
            length: len,
            title: first ? 'Repítelo para confirmar' : 'Escribe tu PIN',
            onDone(pin) {
              if (!first) return (first = pin), (sheet.querySelector('#len').hidden = true), draw();
              if (pin !== first) return toast('No coinciden. Vuelve a intentarlo.'), (first = null), (sheet.querySelector('#len').hidden = false), draw();
              resolve(pin); // antes de cerrar: al cerrar, onClose resuelve null (y una promesa solo se resuelve una vez)
              close();
            },
          });
        sheet.querySelector('#len').onclick = (e) => {
          const b = e.target.closest('[data-l]');
          if (!b) return;
          len = +b.dataset.l;
          sheet.querySelectorAll('#len button').forEach((x) => x.classList.toggle('sel', x === b));
          draw();
        };
        draw();
      },
      () => resolve(null)
    );
  });
}

// Pide el PIN actual (para desactivar o cambiar). Resuelve true/false.
function confirmPinSheet(title) {
  return new Promise((resolve) => {
    const close = openSheet(`<h3>${title}</h3><div id="pp" style="margin-top:10px"></div><div class="actions"><button type="button" class="ghost" data-close id="cx">Cancelar</button></div>`, (sheet) => {
      // cancelar o tocar el fondo resuelve false (onClose)
      const pad = pinPad(sheet.querySelector('#pp'), {
        length: state.settings.lock.len || 4,
        title: 'PIN actual',
        async onDone(pin) {
          if (await checkPin(pin)) return resolve(true), close();
          pad.shake();
          toast('PIN incorrecto');
        },
      });
    }, () => resolve(false));
  });
}

async function onSecurity(kind, on, input) {
  input.checked = !on; // se confirma al terminar cada paso
  if (kind === 'lock' && on) {
    const pin = await newPinSheet();
    if (!pin) return;
    await setPin(pin);
    toast('Bloqueo activado');
    if (bioOk) bioOfferSheet(); // botón directo: el iPhone exige un toque reciente para Face ID
  } else if (kind === 'lock') {
    if (!(await confirmPinSheet('Desactivar bloqueo'))) return;
    state.settings.lock = { after: state.settings.lock.after ?? 0 };
    save();
    toast('Bloqueo desactivado');
  } else if (kind === 'bio' && on) await enableBio();
  else if (kind === 'bio') {
    delete state.settings.lock.credId;
    save();
  }
  render();
}

function bioOfferSheet() {
  openSheet(
    `<h3>¿Usar Face ID o huella?</h3><p class="muted small" style="margin-top:0">Desbloquea la app sin escribir el PIN. El PIN sigue sirviendo siempre.</p>
    <div class="actions"><button class="ghost" data-close>Ahora no</button><button class="primary" id="bio">Activar</button></div>`,
    (sheet, close) =>
      (sheet.querySelector('#bio').onclick = async () => {
        await enableBio();
        close();
        render();
      })
  );
}

async function enableBio() {
  try {
    state.settings.lock.credId = await registerBiometric();
    save();
    toast('Face ID / huella activado');
  } catch {
    toast('No se pudo activar. Puedes seguir usando tu PIN.');
  }
}

function onChange(e) {
  if (e.target.dataset.sec) return onSecurity(e.target.dataset.sec, e.target.checked, e.target);
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
  if (t.dataset.act === 'undo') {
    if (!previous || !confirm('Se reemplazarán los datos actuales por la copia guardada. ¿Continuar?')) return;
    await replaceState(previous.data, { label: 'Antes de deshacer', keepLock: true });
    window.dispatchEvent(new Event('modules-changed'));
    toast('Listo: volviste a los datos anteriores');
    previous = await getPrevious();
    return render();
  }
  if (t.dataset.act === 'lock-after') return (state.settings.lock.after = +t.dataset.v), save(), render();
  if (t.dataset.act === 'pin-change') {
    if (!(await confirmPinSheet('Cambiar PIN'))) return;
    const pin = await newPinSheet('Nuevo PIN');
    if (pin) await setPin(pin), toast('PIN cambiado');
    return render();
  }
  if (t.dataset.act === 'palette') return setTheme({ palette: t.dataset.p }), render();
  if (t.dataset.act === 'mode') return setTheme({ mode: t.dataset.m }), render();
  if (t.dataset.act === 'export') {
    backup(render);
  } else if (t.dataset.act === 'csv') exportExpensesCSV();
  else if (t.dataset.act === 'import') root.querySelector('#file').click();
  else if (t.dataset.act === 'reset') {
    if (!confirm('Se borrarán TODOS tus datos de este teléfono (dieta, calorías, gastos y ahorro). ¿Continuar?')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer, salvo que tengas un respaldo. ¿Borrar todo?')) return;
    await replaceState(defaults(), { label: 'Antes de borrar todos los datos' });
    window.dispatchEvent(new Event('modules-changed'));
    toast('Datos borrados (puedes deshacerlo en Respaldo)');
    render();
  }
}

async function restore(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.app !== 'gestion-personal') throw new Error('formato');
    let data = parsed.data;
    if (parsed.enc) {
      // respaldo cifrado: pedir la contraseña
      const text = await askBackupPassword(parsed);
      if (text === null) return;
      data = JSON.parse(text);
    }
    if (!data || typeof data !== 'object') throw new Error('formato');
    if (Number(data.v) > VERSION && !confirm('Este respaldo es de una versión más nueva de la app. Actualiza la app antes de restaurarlo para no perder datos. ¿Restaurar igual?')) return;
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('es-CL') : 'fecha desconocida';
    if (!confirm(`Se reemplazarán los datos actuales por los del respaldo (${when}). ¿Continuar?`)) return;
    await replaceState(data, { label: 'Antes de restaurar un respaldo', keepLock: true });
    window.dispatchEvent(new Event('modules-changed'));
    toast('Respaldo restaurado (puedes deshacerlo en Respaldo)');
    render();
  } catch {
    toast('Ese archivo no es un respaldo válido');
  } finally {
    root.querySelector('#file') && (root.querySelector('#file').value = '');
  }
}
