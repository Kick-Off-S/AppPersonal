// Ejercicio: rutinas que se repiten por día de la semana (como el plan de dieta), con ejercicios que se marcan
// como hechos cada día, y actividad extra (caminar, fútbol…) con calorías quemadas estimadas.
import { state, save, routineSnap } from '../store.js';
import { latestWeight } from '../calc.js';
import { esc, uid, num, openSheet, toast, todayStr, addDays, dayLabel, weekdayIndex, shortDate, vibrate, DAYS, DAYS_SHORT } from '../util.js';

// MET aproximados (gasto energético) para estimar calorías: kcal = MET × kg × horas.
const INTENSITY = { suave: { label: 'Suave', met: 3.5 }, moderada: { label: 'Moderada', met: 5 }, alta: { label: 'Alta', met: 7 } };
export const ACTIVITIES = [
  ['Caminar', 3.5],
  ['Caminar rápido', 4.5],
  ['Trotar', 7],
  ['Correr', 9.8],
  ['Bicicleta', 7.5],
  ['Spinning', 8.5],
  ['Nadar', 7],
  ['Fútbol', 7],
  ['Básquetbol', 6.5],
  ['Tenis / pádel', 7],
  ['Baile / zumba', 6],
  ['Yoga / pilates', 3],
  ['Pesas', 5],
  ['Crossfit / HIIT', 8],
  ['Subir escaleras', 8],
  ['Otro', 5],
];
const COMMON = [
  'Sentadilla', 'Peso muerto', 'Press banca', 'Press militar', 'Remo con barra', 'Jalón al pecho', 'Dominadas', 'Flexiones', 'Fondos',
  'Zancadas', 'Hip thrust', 'Prensa', 'Curl femoral', 'Extensión de cuádriceps', 'Pantorrillas', 'Curl bíceps', 'Extensión tríceps',
  'Elevaciones laterales', 'Plancha', 'Abdominales', 'Burpees', 'Saltar la cuerda', 'Trote', 'Bicicleta estática', 'Elíptica', 'Remo (máquina)',
];

const ex = () => state.exercise;
const bodyKg = () => latestWeight()?.kg || 70;
// MET − 1: se descuenta el gasto en reposo, que ya está dentro de la meta diaria de calorías.
const kcalFor = (met, mins) => Math.max(0, Math.round((met - 1) * bodyKg() * (mins / 60)));

// Rutinas del día: las programadas para ese día de la semana + las que se agregaron ese día a mano.
export function routinesFor(d) {
  const wd = weekdayIndex(d);
  const extra = Object.keys(ex().done[d] || {});
  return ex().routines.filter((r) => r.days.includes(wd) || extra.includes(r.id));
}
const doneOf = (d, rid) => ex().done[d]?.[rid] || {};
// Datos de la rutina para un día: los días pasados usan la foto guardada al marcarla (así editar la
// rutina no cambia el historial); hoy y días futuros, la rutina actual.
const snapOf = (d, r) => (d < todayStr() && ex().snap?.[d]?.[r.id]) || routineSnap(r, bodyKg());
export function routineProgress(d, r) {
  const done = doneOf(d, r.id);
  if (d < todayStr() && ex().snap?.[d]?.[r.id]) {
    const total = ex().snap[d][r.id].total;
    return { n: Math.min(total, Object.keys(done).length), total };
  }
  return { n: r.items.filter((it) => done[it.id]).length, total: r.items.length };
}
// Al marcar algo de una rutina se guarda su foto para ese día.
const keepSnap = (r) => ((ex().snap ||= {})[date] ||= {})[r.id] = routineSnap(r, bodyKg());
// Calorías quemadas en el día: rutinas (proporcional a lo hecho) + actividades extra.
export function burnedFor(d) {
  let k = 0;
  for (const r of routinesFor(d)) {
    const { n, total } = routineProgress(d, r);
    if (n && total) k += snapOf(d, r).kcal * (n / total);
  }
  for (const a of ex().log[d] || []) k += a.kcal || 0;
  return Math.round(k);
}
const minsFor = (d) => {
  let m = 0;
  for (const r of routinesFor(d)) {
    const { n, total } = routineProgress(d, r);
    if (n && total) m += snapOf(d, r).mins * (n / total);
  }
  for (const a of ex().log[d] || []) m += a.mins || 0;
  return Math.round(m);
};
export const activeOn = (d) => minsFor(d) > 0;

const itemTxt = (it) =>
  [it.sets && it.reps ? `${it.sets} × ${it.reps}` : it.sets ? `${it.sets} series` : it.reps ? `${it.reps} reps` : '', it.kg ? `${num(it.kg, 1)} kg` : '', it.mins ? `${num(it.mins)} min` : '']
    .filter(Boolean)
    .join(' · ');
const daysTxt = (days) => (days.length === 7 ? 'Todos los días' : days.length ? [...days].sort().map((i) => DAYS[i].slice(0, 2)).join(' · ') : 'Sin día fijo');

// Último peso usado en un ejercicio antes de la fecha (para intentar superarlo).
function lastKg(rid, itemId, before) {
  const dates = Object.keys(ex().done).filter((d) => d < before).sort().reverse();
  for (const d of dates) {
    const v = ex().done[d]?.[rid]?.[itemId];
    if (v && v.kg) return { kg: v.kg, date: d };
  }
  return null;
}

let root;
let date = todayStr();

export function mount(el) {
  root = el;
  date = todayStr();
  root.onclick = onClick;
  render();
}

function weekSummary() {
  // semana de lunes a domingo que contiene la fecha
  const start = addDays(date, -weekdayIndex(date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return {
    active: days.filter(activeOn).length,
    mins: days.reduce((a, d) => a + minsFor(d), 0),
    kcal: days.reduce((a, d) => a + burnedFor(d), 0),
    dots: days.map((d) => `<span class="wdot ${activeOn(d) ? 'on' : ''} ${d === date ? 'cur' : ''}">${DAYS_SHORT[weekdayIndex(d)]}</span>`).join(''),
  };
}

function render() {
  const list = routinesFor(date);
  const wd = weekdayIndex(date);
  const acts = ex().log[date] || [];
  const w = weekSummary();
  const burned = burnedFor(date);

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Día anterior">‹</button>
      <div class="label" data-act="today">${dayLabel(date)}</div>
      <button class="icon" data-act="next" aria-label="Día siguiente">›</button></div>

    <div class="card">
      <div class="row between"><div><div class="big">${num(burned)}</div><div class="small muted">kcal quemadas ${date === todayStr() ? 'hoy' : 'este día'}</div></div>
        <div style="text-align:right"><div class="mid">${w.active}<span class="muted small"> / 7</span></div><div class="small muted">días activos esta semana</div></div></div>
      <div class="wdots">${w.dots}</div>
      <div class="small muted">Semana: ${num(w.mins)} min · ${num(w.kcal)} kcal${state.weight.length ? '' : ' · registra tu peso en Progreso para estimar mejor'}</div>
    </div>

    ${
      list.length
        ? list.map((r) => routineCard(r, wd)).join('')
        : `<div class="card empty"><b>${ex().routines.length ? 'Día de descanso' : 'Aún no tienes rutinas'}</b>
          ${ex().routines.length ? 'No hay rutina programada para este día.' : 'Crea tus rutinas (ej: Pierna los lunes, Brazos los miércoles) y se repetirán cada semana.'}
          <div class="actions">${ex().routines.length ? '<button data-act="adhoc">Hacer una rutina este día</button>' : '<button class="primary" data-act="newr">+ Crear rutina</button><button data-act="example">Ver ejemplo</button>'}</div></div>`
    }
    ${list.length && ex().routines.length > list.length ? '<button class="ghost block" data-act="adhoc">+ Hacer otra rutina este día</button>' : ''}

    <div class="card">
      <div class="row between"><h2 style="margin:0">Actividad extra</h2><button class="sm" data-act="addact">+ Agregar</button></div>
      ${
        acts.length
          ? acts
              .map(
                (a) => `<div class="item"><div class="grow"><div class="t">${esc(a.type)}</div><div class="s">${num(a.mins)} min${a.note ? ' · ' + esc(a.note) : ''}</div></div>
              <div class="amount">${num(a.kcal)}<span class="muted small"> kcal</span></div>
              <button class="ghost icon sm" data-act="delact" data-id="${a.id}" aria-label="Quitar">✕</button></div>`
              )
              .join('')
          : '<div class="small muted" style="margin-top:8px">Caminatas, fútbol, bici… todo lo que no está en tus rutinas.</div>'
      }
    </div>

    <div class="card">
      <div class="row between"><h2 style="margin:0">Mis rutinas</h2><button class="sm" data-act="newr">+ Rutina</button></div>
      ${
        ex().routines.length
          ? ex()
              .routines.map(
                (r) => `<div class="item" data-act="editr" data-id="${r.id}"><div class="grow"><div class="t">${esc(r.name)}</div>
                <div class="s">${daysTxt(r.days)} · ${r.items.length} ejercicio${r.items.length === 1 ? '' : 's'} · ~${num(r.mins || 45)} min</div></div><span class="muted">✎</span></div>`
              )
              .join('')
          : '<div class="small muted" style="margin-top:8px">Cada rutina tiene sus ejercicios (series, repeticiones, peso o minutos) y los días en que la haces.</div>'
      }
    </div>`;
}

function routineCard(r, wd) {
  const done = doneOf(date, r.id);
  const { n, total } = routineProgress(date, r);
  const scheduled = r.days.includes(wd);
  return `<div class="card">
    <div class="row between"><div><h2 style="margin:0">${esc(r.name)}</h2><div class="small muted">${n} de ${total} hechos · ~${num(r.mins || 45)} min</div></div>
      ${total && n < total ? `<button class="sm" data-act="all" data-rid="${r.id}">Marcar todo</button>` : total ? '<span class="pos small" style="font-weight:700">¡Completa! 💪</span>' : ''}</div>
    <div class="bar" style="margin:10px 0 4px"><i style="width:${total ? (n / total) * 100 : 0}%"></i></div>
    ${r.items
      .map((it) => {
        const d = done[it.id];
        const kgNow = d?.kg || it.kg;
        return `<div class="item ${d ? 'done' : ''}">
        <button class="check ${d ? 'on' : ''}" data-act="tick" data-rid="${r.id}" data-id="${it.id}" aria-label="Marcar como hecho" aria-pressed="${!!d}">✓</button>
        <div class="grow" data-act="detail" data-rid="${r.id}" data-id="${it.id}"><div class="t">${esc(it.name)}</div><div class="s">${esc(itemTxt({ ...it, kg: kgNow }))}${it.note ? ' · ' + esc(it.note) : ''}</div></div>
        ${it.kg ? '<span class="muted small">✎</span>' : ''}</div>`;
      })
      .join('') || '<div class="small muted">Esta rutina no tiene ejercicios. Edítala en Mis rutinas.</div>'}
    ${!scheduled ? `<button class="ghost block sm" data-act="unadhoc" data-rid="${r.id}" style="margin-top:6px">Quitar de este día</button>` : ''}
  </div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id, rid } = t.dataset;
  if (act === 'prev') date = addDays(date, -1);
  else if (act === 'next') date = addDays(date, 1);
  else if (act === 'today') date = todayStr();
  else if (act === 'tick') {
    const r = ex().routines.find((x) => x.id === rid);
    const it = r.items.find((x) => x.id === id);
    const day = (ex().done[date] ||= {});
    const map = (day[rid] ||= {});
    keepSnap(r);
    if (map[id]) delete map[id];
    else {
      map[id] = it.kg ? { kg: it.kg } : {};
      vibrate();
      const { n, total } = routineProgress(date, r);
      if (n === total) toast(`¡${r.name} completa! 💪`);
    }
    save();
  } else if (act === 'all') {
    const r = ex().routines.find((x) => x.id === rid);
    const map = ((ex().done[date] ||= {})[rid] ||= {});
    keepSnap(r);
    for (const it of r.items) map[it.id] ||= it.kg ? { kg: it.kg } : {};
    vibrate();
    toast(`¡${r.name} completa! 💪`);
    save();
  } else if (act === 'detail') return detailSheet(rid, id);
  else if (act === 'adhoc') return adhocSheet();
  else if (act === 'unadhoc') {
    delete ex().done[date]?.[rid];
    if (ex().done[date] && !Object.keys(ex().done[date]).length) delete ex().done[date];
    save();
  } else if (act === 'addact') return activitySheet();
  else if (act === 'delact') {
    ex().log[date] = (ex().log[date] || []).filter((a) => a.id !== id);
    if (!ex().log[date].length) delete ex().log[date];
    save();
  } else if (act === 'newr') return routineSheet();
  else if (act === 'editr') return routineSheet(ex().routines.find((r) => r.id === id));
  else if (act === 'example') return loadExample();
  else return;
  render();
}

// Peso / reps de hoy en un ejercicio: actualiza la rutina (para la próxima vez) y lo marca como hecho.
function detailSheet(rid, id) {
  const r = ex().routines.find((x) => x.id === rid);
  const it = r.items.find((x) => x.id === id);
  const prev = lastKg(rid, id, date);
  const cur = doneOf(date, rid)[id];
  openSheet(
    `<h3>${esc(it.name)}</h3>
    <p class="muted small" style="margin-top:0">${esc(itemTxt(it)) || 'Sin detalle'}${prev ? ` · Última vez: <b>${num(prev.kg, 1)} kg</b> (${shortDate(prev.date)})` : ''}</p>
    <div class="two"><label class="field">Peso usado (kg)<input id="kg" inputmode="decimal" value="${cur?.kg || it.kg ? String(cur?.kg || it.kg).replace('.', ',') : ''}" placeholder="Sin peso"></label>
      <label class="field">Repeticiones<input id="reps" value="${esc(it.reps || '')}" placeholder="Ej: 12"></label></div>
    <p class="small muted">Se guarda en la rutina para la próxima vez.</p>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Guardar y marcar hecho</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#ok').onclick = () => {
        const kg = parseFloat(sheet.querySelector('#kg').value.replace(',', '.')) || 0;
        it.kg = kg;
        it.reps = sheet.querySelector('#reps').value.trim();
        ((ex().done[date] ||= {})[rid] ||= {})[id] = kg ? { kg } : {};
        keepSnap(r);
        if (prev && kg > prev.kg) toast(`¡Nueva marca! +${num(kg - prev.kg, 1)} kg 🏆`);
        save();
        close();
        render();
      };
    }
  );
}

function adhocSheet() {
  const shown = routinesFor(date).map((r) => r.id);
  const options = ex().routines.filter((r) => !shown.includes(r.id));
  openSheet(
    `<h3>Hacer una rutina ${date === todayStr() ? 'hoy' : 'este día'}</h3>
    <p class="muted small" style="margin-top:0">Solo para ${dayLabel(date).toLowerCase()}; no cambia tus días programados.</p>
    ${options.map((r) => `<button class="block" style="margin-top:8px" data-r="${r.id}">${esc(r.name)}</button>`).join('') || '<div class="small muted">Ya están todas tus rutinas en este día.</div>'}
    <div class="actions"><button class="ghost" data-close>Cerrar</button></div>`,
    (sheet, close) =>
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        (ex().done[date] ||= {})[b.dataset.r] ||= {};
        save();
        close();
        render();
      })
  );
}

function activitySheet() {
  openSheet(
    `<h3>Actividad extra</h3>
    <label class="field">Actividad<select id="type">${ACTIVITIES.map(([n]) => `<option>${n}</option>`).join('')}</select></label>
    <div class="two"><label class="field">Minutos<input id="mins" inputmode="numeric" placeholder="Ej: 30"></label>
      <label class="field">Calorías (estimadas)<input id="kcal" inputmode="numeric" placeholder="Se calculan solas"></label></div>
    <label class="field">Detalle (opcional)<input id="note" maxlength="60" placeholder="Ej: 5 km, con amigos" autocomplete="off"></label>
    <div class="small muted" style="margin-top:6px">Estimado con tu peso (${num(bodyKg(), 1)} kg). Puedes cambiarlo si tu reloj marca otra cosa.</div>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Agregar</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      let manual = false;
      const est = () => {
        if (manual) return;
        const met = ACTIVITIES.find(([n]) => n === $('#type').value)[1];
        const m = parseInt($('#mins').value, 10) || 0;
        $('#kcal').value = m ? kcalFor(met, m) : '';
      };
      $('#type').onchange = est;
      $('#mins').oninput = est;
      $('#kcal').oninput = () => (manual = !!$('#kcal').value);
      $('#ok').onclick = () => {
        const mins = parseInt($('#mins').value, 10) || 0;
        if (!mins) return toast('Ingresa los minutos');
        (ex().log[date] ||= []).push({ id: uid(), type: $('#type').value, mins, kcal: parseInt($('#kcal').value, 10) || 0, note: $('#note').value.trim() });
        save();
        vibrate();
        close();
        render();
      };
    }
  );
}

// ---------- editor de rutinas ----------
function routineSheet(r) {
  const editing = !!r;
  let items = (r?.items || []).map((x) => ({ ...x }));
  const days = [...(r?.days || [weekdayIndex(date)])];
  let intensity = r?.intensity || 'moderada';
  let editId = null;
  openSheet(
    `<h3>${editing ? 'Editar rutina' : 'Nueva rutina'}</h3>
    <label class="field">Nombre<input id="name" maxlength="40" value="${esc(r?.name)}" placeholder="Ej: Pierna, Tren superior, Full body" autocomplete="off"></label>
    <label class="field">Días que la haces</label>
    <div class="chips" id="days">${DAYS_SHORT.map((l, i) => `<button type="button" class="chip ${days.includes(i) ? 'sel' : ''}" data-i="${i}" aria-label="${DAYS[i]}">${l}</button>`).join('')}</div>
    <div class="two"><label class="field">Duración aprox. (min)<input id="mins" inputmode="numeric" value="${r?.mins || 45}"></label><div></div></div>
    <label class="field">Intensidad</label>
    <div class="seg" id="int" style="margin-top:6px">${Object.entries(INTENSITY)
      .map(([k, v]) => `<button type="button" data-k="${k}">${v.label}</button>`)
      .join('')}</div>
    <p class="small muted" style="margin:6px 0 0">Se usan para estimar las calorías quemadas.</p>

    <label class="field">Ejercicios</label>
    <div id="items" class="ing"></div>
    <div id="itemform" class="pk-box" hidden>
      <label class="field">Ejercicio<input id="iname" list="common" maxlength="40" placeholder="Ej: Sentadilla" autocomplete="off"></label>
      <datalist id="common">${COMMON.map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="four"><label class="field">Series<input id="isets" inputmode="numeric" placeholder="Ej: 4"></label>
        <label class="field">Reps<input id="ireps" inputmode="numeric" placeholder="Ej: 12"></label>
        <label class="field">Kg<input id="ikg" inputmode="decimal" placeholder="Opc."></label>
        <label class="field">Min<input id="imins" inputmode="numeric" placeholder="Opc."></label></div>
      <p class="small muted" style="margin:6px 0 0">Para pesas usa series, reps y kg; para cardio, los minutos.</p>
      <label class="field">Nota (opcional)<input id="inote" maxlength="60" placeholder="Ej: 30 s, cada pierna, descanso 60 s" autocomplete="off"></label>
      <div class="actions"><button type="button" class="ghost" id="icancel">Cancelar</button><button type="button" class="primary" id="iok">Agregar</button></div>
    </div>
    <button type="button" class="block" id="additem">+ Agregar ejercicio</button>

    <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button><button type="button" id="dup">Duplicar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary" id="save">Guardar</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const drawInt = () => sheet.querySelectorAll('#int button').forEach((b) => b.classList.toggle('sel', b.dataset.k === intensity));
      $('#int').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) (intensity = b.dataset.k), drawInt();
      };
      drawInt();
      $('#days').onclick = (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const i = +b.dataset.i;
        const at = days.indexOf(i);
        if (at >= 0) days.splice(at, 1);
        else days.push(i);
        b.classList.toggle('sel');
      };
      const drawItems = () => {
        $('#items').innerHTML = items.length
          ? items
              .map(
                (it, i) => `<div class="item"><div class="grow" data-e="${it.id}"><div class="t">${i + 1}. ${esc(it.name)}</div><div class="s">${esc(itemTxt(it)) || 'Sin detalle'}${it.note ? ' · ' + esc(it.note) : ''}</div></div>
                ${i ? `<button type="button" class="ghost icon sm" data-up="${it.id}" aria-label="Subir">↑</button>` : ''}
                <button type="button" class="ghost icon sm" data-rm="${it.id}" aria-label="Quitar">✕</button></div>`
              )
              .join('')
          : '<div class="small muted">Agrega los ejercicios en el orden en que los haces.</div>';
      };
      const fields = ['name', 'sets', 'reps', 'kg', 'mins', 'note'];
      const openForm = (it) => {
        editId = it?.id || null;
        for (const f of fields) $('#i' + f).value = it?.[f] ? String(it[f]).replace(/\./g, ',') : '';
        $('#iok').textContent = it ? 'Actualizar' : 'Agregar';
        $('#itemform').hidden = false;
        $('#additem').hidden = true;
      };
      const closeForm = () => {
        $('#itemform').hidden = true;
        $('#additem').hidden = false;
        editId = null;
      };
      $('#additem').onclick = () => openForm();
      $('#icancel').onclick = closeForm;
      $('#iok').onclick = () => {
        const name = $('#iname').value.trim();
        if (!name) return toast('Escribe el nombre del ejercicio');
        const data = {
          name,
          sets: parseInt($('#isets').value, 10) || 0,
          reps: $('#ireps').value.trim(),
          kg: parseFloat($('#ikg').value.replace(',', '.')) || 0,
          mins: parseInt($('#imins').value, 10) || 0,
          note: $('#inote').value.trim(),
        };
        const wasEdit = !!editId;
        if (editId) items = items.map((x) => (x.id === editId ? { ...x, ...data } : x));
        else items = [...items, { id: uid(), ...data }];
        closeForm();
        drawItems();
        // al agregar, el formulario queda listo para el siguiente ejercicio
        if (!wasEdit) openForm();
      };
      $('#items').onclick = (e) => {
        const rm = e.target.closest('[data-rm]');
        const up = e.target.closest('[data-up]');
        const ed = e.target.closest('[data-e]');
        if (rm) items = items.filter((x) => x.id !== rm.dataset.rm);
        else if (up) {
          const i = items.findIndex((x) => x.id === up.dataset.up);
          [items[i - 1], items[i]] = [items[i], items[i - 1]];
        } else if (ed) return openForm(items.find((x) => x.id === ed.dataset.e));
        drawItems();
      };
      drawItems();

      $('#save').onclick = () => {
        // si quedó un ejercicio escrito sin tocar "Agregar", lo incluimos
        if (!$('#itemform').hidden && $('#iname').value.trim()) $('#iok').click();
        const data = { name: $('#name').value.trim(), days: [...days].sort(), mins: parseInt($('#mins').value, 10) || 45, intensity, items };
        if (!data.name) return toast('Ponle un nombre a la rutina');
        if (editing) Object.assign(r, data);
        else ex().routines.push({ id: uid(), ...data });
        save();
        close();
        toast('Rutina guardada');
        render();
      };
      $('#dup')?.addEventListener('click', () => {
        ex().routines.push({ ...structuredClone(r), id: uid(), name: r.name + ' (copia)', items: r.items.map((x) => ({ ...x, id: uid() })) });
        save();
        close();
        toast('Rutina duplicada');
        render();
      });
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar la rutina "${r.name}"? Lo ya marcado como hecho deja de contar.`)) return;
        ex().routines = ex().routines.filter((x) => x !== r);
        for (const d of Object.keys(ex().done)) {
          delete ex().done[d][r.id];
          if (!Object.keys(ex().done[d]).length) delete ex().done[d];
        }
        save();
        close();
        render();
      });
    }
  );
}

function loadExample() {
  const mk = (name, sets, reps, extra = {}) => ({ id: uid(), name, sets, reps, kg: 0, mins: 0, note: '', ...extra });
  ex().routines.push(
    {
      id: uid(),
      name: 'Tren superior',
      days: [0, 3],
      mins: 50,
      intensity: 'moderada',
      items: [mk('Press banca', 4, '10'), mk('Remo con barra', 4, '10'), mk('Press militar', 3, '12'), mk('Curl bíceps', 3, '12'), mk('Extensión tríceps', 3, '12')],
    },
    {
      id: uid(),
      name: 'Tren inferior y core',
      days: [1, 4],
      mins: 50,
      intensity: 'moderada',
      items: [mk('Sentadilla', 4, '12'), mk('Peso muerto', 4, '8'), mk('Zancadas', 3, '10', { note: 'cada pierna' }), mk('Hip thrust', 3, '12'), mk('Plancha', 3, '', { note: '30 s' })],
    },
    { id: uid(), name: 'Cardio', days: [5], mins: 40, intensity: 'alta', items: [mk('Trote', 0, '', { mins: 30 }), mk('Abdominales', 3, '20')] }
  );
  save();
  toast('Ejemplo cargado: edítalo a tu medida');
  render();
}
