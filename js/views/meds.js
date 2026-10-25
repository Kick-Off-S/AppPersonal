// Medicamentos: horarios, marcar cada toma (tomada / omitida), cumplimiento y stock.
// Es un recordatorio personal: no reemplaza las indicaciones médicas.
import { state, save } from '../store.js';
import { esc, uid, num, openSheet, toast, todayStr, addDays, dayLabel, weekdayIndex, vibrate, DAYS, DAYS_SHORT } from '../util.js';

const UNITS = ['comprimido', 'cápsula', 'gota', 'ml', 'inhalación', 'sobre', 'aplicación', 'unidad'];
const PRESETS = [
  ['1 vez al día', ['08:00']],
  ['2 veces', ['08:00', '20:00']],
  ['3 veces', ['08:00', '14:00', '20:00']],
  ['Cada 8 h', ['06:00', '14:00', '22:00']],
  ['Cada 6 h', ['06:00', '12:00', '18:00', '00:00']],
];

const md = () => state.meds;
const plural = (u, n) => (n === 1 || u === 'ml' ? u : /ón$/.test(u) ? u.slice(0, -2) + 'ones' : /[aeiouáéó]$/i.test(u) ? u + 's' : u + 'es');
const qtyTxt = (m) => `${num(m.qty, 2)} ${plural(m.unit || 'unidad', m.qty)}`;

// ¿Toca este medicamento ese día? (fecha de inicio, duración y días de la semana)
export function activeOn(m, d) {
  if (m.start && d < m.start) return false;
  if (m.days_n && m.start && d >= addDays(m.start, m.days_n)) return false;
  return !m.days || m.days.includes(weekdayIndex(d));
}
// Tomas del día, ordenadas por hora: { med, time, status: 'taken' | 'skipped' | null }
export function dosesFor(d) {
  const out = [];
  for (const m of md().list) if (activeOn(m, d)) for (const t of m.times) out.push({ med: m, time: t, status: md().log[d]?.[m.id]?.[t] || null });
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}
const lowStock = (m) => m.stock != null && m.stock <= (m.lowAt || 0);

// Marca una toma. Tomar descuenta del stock; deshacer lo devuelve.
export function setDose(d, m, time, status) {
  const day = (md().log[d] ||= {});
  const marks = (day[m.id] ||= {});
  const prev = marks[time] || null;
  if (prev === status) status = null; // tocar de nuevo deshace
  if (m.stock != null) {
    if (prev !== 'taken' && status === 'taken') m.stock = Math.max(0, m.stock - m.qty);
    if (prev === 'taken' && status !== 'taken') m.stock += m.qty;
  }
  if (status) marks[time] = status;
  else delete marks[time];
  if (!Object.keys(marks).length) delete day[m.id];
  if (!Object.keys(day).length) delete md().log[d];
  if (status === 'taken') {
    vibrate();
    if (lowStock(m)) toast(`Quedan ${num(m.stock, 2)} de ${m.name}: es hora de reponer`);
  }
  save();
}

// Cumplimiento de los últimos 7 días (hoy cuenta solo hasta la hora actual).
function adherence() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayStr(), i - 6));
  let due = 0;
  let taken = 0;
  const per = days.map((d) => {
    const list = dosesFor(d).filter((x) => d < todayStr() || x.time <= hhmm);
    due += list.length;
    const t = list.filter((x) => x.status === 'taken').length;
    taken += t;
    return { d, n: list.length, t };
  });
  return { pct: due ? Math.round((taken / due) * 100) : null, per };
}

let root;
let date = todayStr();

export function mount(el) {
  root = el;
  date = todayStr();
  root.onclick = onClick;
  render();
}

function render() {
  const doses = dosesFor(date);
  const n = doses.filter((x) => x.status === 'taken').length;
  const low = md().list.filter(lowStock);
  const adh = adherence();

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Día anterior">‹</button>
      <div class="label" data-act="today">${dayLabel(date)}</div>
      <button class="icon" data-act="next" aria-label="Día siguiente">›</button></div>

    ${low.map((m) => `<div class="banner warn small">Quedan <b>${num(m.stock, 2)}</b> de ${esc(m.name)}: recuerda reponer.</div>`).join('')}

    ${
      md().list.length
        ? `<div class="card">
        <div class="row between"><div><div class="big">${n}<span class="mid muted"> / ${doses.length}</span></div><div class="small muted">tomas ${date === todayStr() ? 'de hoy' : 'del día'}</div></div>
          ${adh.pct !== null ? `<div style="text-align:right"><div class="mid">${adh.pct}%</div><div class="small muted">cumplimiento 7 días</div></div>` : ''}</div>
        <div class="bar" style="margin:12px 0 6px"><i style="width:${doses.length ? (n / doses.length) * 100 : 0}%"></i></div>
        ${doses.map(doseRow).join('') || '<div class="small muted">No hay tomas este día.</div>'}
      </div>`
        : `<div class="card empty"><b>Agrega tus medicamentos</b>Con sus horarios, para marcar cada toma y no olvidar ninguna.
          <div class="actions"><button class="primary" data-act="new">+ Medicamento</button></div></div>`
    }

    ${
      md().list.length
        ? `<div class="card"><div class="row between"><h2 style="margin:0">Mis medicamentos</h2><button class="sm" data-act="new">+ Medicamento</button></div>
        ${md()
          .list.map(
            (m) => `<div class="item" data-act="edit" data-id="${m.id}"><div class="grow"><div class="t">${esc(m.name)}${m.dose ? ` <span class="muted small">${esc(m.dose)}</span>` : ''}</div>
            <div class="s">${esc(qtyTxt(m))} · ${m.times.join(' · ') || 'sin horario'} · ${daysTxt(m)}${m.stock != null ? ` · quedan ${num(m.stock, 2)}` : ''}</div></div><span class="muted">✎</span></div>`
          )
          .join('')}</div>`
        : ''
    }
    <p class="small muted" style="text-align:center">Es un recordatorio personal: no reemplaza las indicaciones de tu médico. No cambies dosis ni horarios sin consultar.</p>`;
}

function daysTxt(m) {
  const d = !m.days || m.days.length === 7 ? 'todos los días' : m.days.map((i) => DAYS[i].slice(0, 2)).join(' ');
  if (!m.days_n) return d;
  const end = addDays(m.start || todayStr(), m.days_n);
  return `${d} · hasta ${dayLabel(addDays(end, -1)).toLowerCase()}`;
}

function doseRow({ med, time, status }) {
  return `<div class="item dose ${status ? 'done' : ''}">
    <span class="time" style="min-width:44px">${time}</span>
    <div class="grow"><div class="t">${esc(med.name)}${med.dose ? ` <span class="muted small">${esc(med.dose)}</span>` : ''}</div>
      <div class="s">${esc(qtyTxt(med))}${med.note ? ' · ' + esc(med.note) : ''}${status === 'skipped' ? ' · <b>omitida</b>' : ''}</div></div>
    ${status === 'taken' ? '' : `<button class="ghost sm" data-act="skip" data-id="${med.id}" data-t="${time}">${status === 'skipped' ? 'Deshacer' : 'Omitir'}</button>`}
    <button class="check ${status === 'taken' ? 'on' : ''}" data-act="take" data-id="${med.id}" data-t="${time}" aria-label="Marcar ${esc(med.name)} de las ${time} como tomada" aria-pressed="${status === 'taken'}">✓</button></div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  const m = md().list.find((x) => x.id === id);
  if (act === 'prev') date = addDays(date, -1);
  else if (act === 'next') date = addDays(date, 1);
  else if (act === 'today') date = todayStr();
  else if (act === 'take') setDose(date, m, t.dataset.t, 'taken');
  else if (act === 'skip') setDose(date, m, t.dataset.t, 'skipped');
  else if (act === 'new') return medSheet();
  else if (act === 'edit') return medSheet(m);
  else return;
  render();
}

function medSheet(m) {
  const editing = !!m;
  let times = [...(m?.times || ['08:00'])];
  const days = [...(m?.days || [0, 1, 2, 3, 4, 5, 6])];
  openSheet(
    `<h3>${editing ? 'Editar medicamento' : 'Nuevo medicamento'}</h3>
    <form id="f">
      <div class="two"><label class="field">Nombre<input name="name" required maxlength="40" value="${esc(m?.name)}" placeholder="Ej: Losartán" autocomplete="off"></label>
        <label class="field">Dosis (opcional)<input name="dose" maxlength="20" value="${esc(m?.dose)}" placeholder="Ej: 50 mg" autocomplete="off"></label></div>
      <div class="two"><label class="field">Cantidad por toma<input name="qty" inputmode="decimal" value="${m?.qty ? String(m.qty).replace('.', ',') : '1'}"></label>
        <label class="field">Unidad<select name="unit">${UNITS.map((u) => `<option ${u === (m?.unit || 'comprimido') ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>

      <label class="field">Horarios</label>
      <div class="sugg" id="presets" style="justify-content:flex-start;margin-top:6px">${PRESETS.map(([l], i) => `<button type="button" class="chip" data-p="${i}">${l}</button>`).join('')}</div>
      <div id="times" class="timechips"></div>
      <div class="row" style="margin-top:8px;gap:8px"><input type="time" id="newtime" value="12:00" style="margin-top:0"><button type="button" class="sm" id="addtime" style="flex:none">+ Horario</button></div>

      <label class="field">Días</label>
      <div class="chips" id="days">${DAYS_SHORT.map((l, i) => `<button type="button" class="chip ${days.includes(i) ? 'sel' : ''}" data-i="${i}" aria-label="${DAYS[i]}">${l}</button>`).join('')}</div>
      <div class="two"><label class="field">Desde<input name="start" type="date" value="${m?.start || todayStr()}"></label>
        <label class="field">Duración (días)<input name="days_n" inputmode="numeric" value="${m?.days_n || ''}" placeholder="Vacío = permanente"></label></div>
      <div class="two"><label class="field">Tengo en stock (opcional)<input name="stock" inputmode="decimal" value="${m?.stock ?? ''}" placeholder="Ej: 30"></label>
        <label class="field">Avisar cuando queden<input name="lowAt" inputmode="numeric" value="${m?.lowAt ?? ''}" placeholder="Ej: 5"></label></div>
      <label class="field">Nota (opcional)<input name="note" maxlength="60" value="${esc(m?.note)}" placeholder="Ej: con comida, en ayunas" autocomplete="off"></label>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const $ = (q) => sheet.querySelector(q);
      const drawTimes = () =>
        ($('#times').innerHTML = times.length
          ? times.map((t) => `<span class="tchip">${t}<button type="button" data-rm="${t}" aria-label="Quitar ${t}">✕</button></span>`).join('')
          : '<span class="small muted">Agrega al menos un horario.</span>');
      $('#presets').onclick = (e) => {
        const b = e.target.closest('[data-p]');
        if (b) (times = [...PRESETS[+b.dataset.p][1]]), drawTimes();
      };
      $('#addtime').onclick = () => {
        const v = $('#newtime').value;
        if (v && !times.includes(v)) times = [...times, v].sort();
        drawTimes();
      };
      $('#times').onclick = (e) => {
        const b = e.target.closest('[data-rm]');
        if (b) (times = times.filter((t) => t !== b.dataset.rm)), drawTimes();
      };
      $('#days').onclick = (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const i = +b.dataset.i;
        const at = days.indexOf(i);
        if (at >= 0) days.splice(at, 1);
        else days.push(i);
        b.classList.toggle('sel');
      };
      drawTimes();
      $('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const n = (v) => parseFloat(String(v || '').replace(',', '.'));
        const stockRaw = String(f.get('stock') || '').trim();
        const data = {
          name: f.get('name').trim(),
          dose: f.get('dose').trim(),
          qty: n(f.get('qty')) > 0 ? n(f.get('qty')) : 1,
          unit: f.get('unit'),
          times: [...times].sort(),
          days: days.length === 7 ? null : [...days].sort(),
          start: f.get('start') || todayStr(),
          days_n: Math.max(0, parseInt(f.get('days_n'), 10) || 0),
          stock: stockRaw === '' ? null : Math.max(0, n(stockRaw) || 0),
          lowAt: Math.max(0, parseInt(f.get('lowAt'), 10) || 0),
          note: f.get('note').trim(),
        };
        if (!data.name) return toast('Escribe el nombre');
        if (!data.times.length) return toast('Agrega al menos un horario');
        if (!days.length) return toast('Elige al menos un día');
        if (editing) Object.assign(m, data);
        else md().list.push({ id: uid(), ...data });
        save();
        close();
        toast('Medicamento guardado');
        render();
      });
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar ${m.name}? Su historial de tomas también se borra.`)) return;
        md().list = md().list.filter((x) => x !== m);
        for (const d of Object.keys(md().log)) {
          delete md().log[d][m.id];
          if (!Object.keys(md().log[d]).length) delete md().log[d];
        }
        save();
        close();
        render();
      });
    }
  );
}
