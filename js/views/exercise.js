// Ejercicio: rutinas que se repiten por día de la semana (como el plan de dieta), con ejercicios que se marcan
// como hechos cada día, y actividad extra (caminar, fútbol…) con calorías quemadas estimadas.
import { state, save, routineSnap } from '../store.js';
import { latestWeight } from '../calc.js';
import { esc, uid, num, openSheet, toast, todayStr, addDays, dayLabel, weekdayIndex, shortDate, vibrate, numberPad, DAYS, DAYS_SHORT } from '../util.js';
import { lineChart } from '../charts.js';
import { LIBRARY, MUSCLES, muscleOf, restFor, historyOf, bestBefore, lastSession, records, setsByMuscle, sessionOf, TEMPLATES, startRest, stopRest, SET_TYPES, nextType, startSession, finishSession, cancelSession, streak, monthCount } from '../gym.js';
import { key } from '../merchants.js';

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
export const minsFor = (d) => {
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

const kgTxt = (v) => num(v, 1);
const TYPE_SHORT = { w: 'C ', d: 'D ', f: 'F ' }; // calentamiento, dropset, al fallo
const setTxt = (st) => (TYPE_SHORT[st.k] || '') + (st.r ? `${kgTxt(st.kg)}×${st.r}` : `${kgTxt(st.kg)} kg`);

let root;
let date = todayStr();

let clockInt = null;
export function mount(el) {
  root = el;
  date = todayStr();
  root.onclick = onClick;
  render();
  // cronómetro del entrenamiento: se actualiza cada segundo mientras esta pantalla esté abierta
  clearInterval(clockInt);
  clockInt = setInterval(() => {
    if (!root.isConnected || root !== el) return clearInterval(clockInt);
    const c = document.getElementById('clock');
    if (c) c.textContent = clockTxt(sessionOf(date).start);
  }, 1000);
}
const clockTxt = (start) => {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};
const isToday = () => date === todayStr();
// Al registrar algo hoy, el cronómetro parte solo si no estaba corriendo.
function ensureSession() {
  if (!isToday() || sessionOf(date).active) return;
  const wasFinished = sessionOf(date).finished;
  startSession(date);
  toast(wasFinished ? '⏱ Seguimos con el entrenamiento' : '⏱ Entrenamiento iniciado');
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
  const ses = sessionOf(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(addDays(date, -weekdayIndex(date)), i));
  const muscles = Object.entries(setsByMuscle(weekDays)).sort((a, b) => MUSCLES.indexOf(a[0]) - MUSCLES.indexOf(b[0]));
  const recs = records().slice(0, 6);
  const racha = streak(todayStr());
  const sesBlock = !isToday()
    ? ''
    : ses.active
      ? `<div class="sesbar"><span class="sb-ic">⏱</span><div class="grow"><b id="clock">${clockTxt(ses.start)}</b><div class="small">${ses.exercises} ${ses.exercises === 1 ? 'ejercicio' : 'ejercicios'} · ${ses.sets} series · ${num(ses.vol)} kg</div></div>
        <button class="icon sb-x" data-act="discard" aria-label="Eliminar este entrenamiento">✕</button><button class="primary" data-act="finish">Terminar</button></div>`
      : ses.finished
        ? `<div class="banner sesdone">✅ Entrenamiento terminado: <b>${ses.mins} min</b> · ${ses.exercises} ${ses.exercises === 1 ? 'ejercicio' : 'ejercicios'} · ${ses.sets} ${ses.sets === 1 ? 'serie' : 'series'} · ${num(ses.vol)} kg <div class="row" style="gap:6px;margin-top:6px"><button class="ghost sm" data-act="resume">Seguir entrenando</button><button class="ghost sm danger-t" data-act="discard">Eliminar</button></div></div>`
        : list.length
          ? '<button class="primary block start-btn" data-act="start">▶ Empezar entrenamiento</button>'
          : '';

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Día anterior">‹</button>
      <div class="label" data-act="today">${dayLabel(date)}</div>
      <button class="icon" data-act="next" aria-label="Día siguiente">›</button></div>

    <div class="card">
      <div class="row between"><div><div class="big">${num(burned)}</div><div class="small muted">kcal quemadas ${date === todayStr() ? 'hoy' : 'este día'}</div></div>
        <div style="text-align:right"><div class="mid">${w.active}<span class="muted small"> / 7</span></div><div class="small muted">días activos esta semana</div></div></div>
      <div class="wdots">${w.dots}</div>
      <div class="small muted">Semana: ${num(w.mins)} min · ${num(w.kcal)} kcal${state.weight.length ? '' : ' · registra tu peso en Progreso para estimar mejor'}</div>
      ${ses.sets && !isToday() ? `<div class="small" style="margin-top:6px">💪 Este día: <b>${ses.sets} series</b> · ${num(ses.vol)} kg levantados${ses.mins ? ` · ${ses.mins} min` : ''}</div>` : ''}
      <div class="streak"><span>🔥 Racha: <b>${racha} ${racha === 1 ? 'entrenamiento' : 'entrenamientos'}</b></span><span class="muted">${monthCount(date.slice(0, 7))} este mes</span></div>
    </div>

    ${sesBlock}

    ${
      list.length
        ? list.map((r) => routineCard(r, wd)).join('')
        : `<div class="card empty"><b>${ex().routines.length ? 'Día de descanso' : 'Aún no tienes rutinas'}</b>
          ${ex().routines.length ? 'No hay rutina programada para este día.' : 'Crea tus rutinas (ej: Pierna los lunes, Brazos los miércoles) y se repetirán cada semana.'}
          <div class="actions">${ex().routines.length ? '<button data-act="adhoc">Hacer una rutina este día</button>' : '<button class="primary" data-act="templates">Rutinas listas</button><button data-act="newr">+ Crear la mía</button>'}</div></div>`
    }
    ${list.length && ex().routines.length > list.length ? '<button class="ghost block" data-act="adhoc">+ Hacer otra rutina este día</button>' : ''}

    ${
      muscles.length
        ? `<div class="card"><h2>Series por músculo · esta semana</h2><div class="mchips">${muscles.map(([m, n]) => `<span class="mchip ${n >= 10 ? 'ok' : ''}">${m} <b>${n}</b></span>`).join('')}</div>
          <div class="small muted" style="margin-top:6px">Como referencia, entre 10 y 20 series por músculo a la semana suele funcionar bien para ganar masa muscular.</div></div>`
        : ''
    }

    ${
      recs.length
        ? `<div class="card"><h2>Mis marcas</h2>${recs
            .map((x) => `<div class="item" data-act="hist" data-n="${esc(x.name)}"><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${x.sessions} ${x.sessions === 1 ? 'sesión' : 'sesiones'} · última ${shortDate(x.last)}</div></div>
              <div style="text-align:right"><div class="amount">${kgTxt(x.best)} kg</div><div class="s muted">1RM ~${kgTxt(x.rm)}</div></div></div>`)
            .join('')}</div>`
        : ''
    }

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
      <div class="row between"><h2 style="margin:0">Mis rutinas</h2><div class="row" style="gap:6px"><button class="sm ghost" data-act="templates">Rutinas listas</button><button class="sm" data-act="newr">+ Rutina</button></div></div>
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
      <button class="ghost block sm" data-act="library" style="margin-top:6px">📚 Biblioteca de ejercicios por músculo</button>
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
        const sets = d?.sets || [];
        const sub = sets.length ? `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}: ${sets.map(setTxt).join(' · ')}` : itemTxt({ ...it, kg: d?.kg || it.kg });
        return `<div class="item ${d ? 'done' : ''}">
        <button class="check ${d ? 'on' : ''}" data-act="tick" data-rid="${r.id}" data-id="${it.id}" aria-label="Marcar como hecho" aria-pressed="${!!d}">✓</button>
        <div class="grow" data-act="detail" data-rid="${r.id}" data-id="${it.id}"><div class="t">${esc(it.name)}</div><div class="s">${esc(sub)}${it.note ? ' · ' + esc(it.note) : ''}</div></div>
        <button type="button" class="ghost sm sm-btn" data-act="detail" data-rid="${r.id}" data-id="${it.id}">Registrar ›</button></div>`;
      })
      .join('') || '<div class="small muted">Esta rutina no tiene ejercicios. Edítala en Mis rutinas.</div>'}
    <button class="ghost block sm" data-act="addex" data-rid="${r.id}" style="margin-top:6px">+ Agregar ejercicio de la biblioteca</button>
    ${!scheduled ? `<button class="ghost block sm" data-act="unadhoc" data-rid="${r.id}">Quitar de este día</button>` : ''}
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
      ensureSession();
      map[id] = { n: it.name, ...(it.kg ? { kg: it.kg } : {}) };
      vibrate();
      const { n, total } = routineProgress(date, r);
      if (n === total) toast(`¡${r.name} completa! 💪`);
    }
    save();
  } else if (act === 'all') {
    const r = ex().routines.find((x) => x.id === rid);
    const map = ((ex().done[date] ||= {})[rid] ||= {});
    keepSnap(r);
    ensureSession();
    for (const it of r.items) map[it.id] ||= { n: it.name, ...(it.kg ? { kg: it.kg } : {}) };
    vibrate();
    toast(`¡${r.name} completa! 💪`);
    save();
  } else if (act === 'detail') return logSheet(rid, id);
  else if (act === 'hist') return historySheet(t.dataset.n);
  else if (act === 'templates') return templatesSheet();
  else if (act === 'start') {
    startSession(date);
    vibrate();
    toast('⏱ ¡A entrenar! Registra cada serie con Registrar ›');
  } else if (act === 'resume') ensureSession();
  else if (act === 'finish') return finishSheet();
  else if (act === 'discard') return discardSheet();
  else if (act === 'library') return librarySheet();
  else if (act === 'addex') {
    const r = ex().routines.find((x) => x.id === rid);
    return librarySheet({
      title: `Agregar a ${r.name}`,
      onPick: (name) => {
        r.items.push({ id: uid(), name, sets: muscleOf(name) === 'Cardio' ? 0 : 3, reps: muscleOf(name) === 'Cardio' ? '' : '10', kg: 0, mins: muscleOf(name) === 'Cardio' ? 20 : 0, note: '' });
        save();
        toast(`${name} agregado a ${r.name}`);
        render();
      },
    });
  }
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
  else return;
  render();
}

// Registro serie a serie: reps y kg de cada serie, precargados con la última vez. Al marcar una serie
// parte el descanso. Todo con botones y el teclado de la app (el del sistema, dentro de una hoja, falla
// en el teléfono).
function logSheet(rid, id) {
  const r = ex().routines.find((x) => x.id === rid);
  const it = r.items.find((x) => x.id === id);
  const prev = lastSession(it.name, date);
  const best = bestBefore(it.name, date);
  const logged = doneOf(date, rid)[id]?.sets || [];
  const planReps = parseInt(it.reps, 10) || (it.mins ? 0 : 10);
  const prefill = (i) => {
    const p = prev?.sets[i] || prev?.sets[prev.sets.length - 1];
    return { r: p?.r || planReps, kg: p?.kg ?? it.kg ?? 0, ...(prev?.sets[i]?.k ? { k: prev.sets[i].k } : {}) };
  };
  let rows = Array.from({ length: Math.max(it.sets || 3, logged.length) }, (_, i) => (logged[i] ? { ...logged[i], done: true } : { ...prefill(i), done: false }));
  let rest = restFor(it);
  const muscle = muscleOf(it.name);
  openSheet(
    `<div class="row between"><h3>${esc(it.name)}</h3>${prev || best ? '<button class="ghost sm" id="hist">Historial</button>' : ''}</div>
    ${
      state.settings.gymTips === false
        ? ''
        : `<div class="gymtip" id="tip"><b>💡 Cómo registrar</b>
      <ul><li>Ajusta las <b>repeticiones</b> y los <b>kilos</b> con − y +, o toca el número para escribirlo.</li>
      <li>Toca <b>✓</b> al terminar cada serie: se guarda y parte el descanso.</li>
      <li>Toca el <b>número de la serie</b> para marcarla como <b>C</b> calentamiento, <b>D</b> dropset o <b>F</b> al fallo.</li></ul>
      <button type="button" class="ghost sm" id="tipok">Entendido, no mostrar más</button></div>`
    }
    <div class="small muted" style="margin-top:-4px">${[itemTxt(it) ? 'Plan: ' + esc(itemTxt(it)) : '', muscle, it.note ? esc(it.note) : ''].filter(Boolean).join(' · ')}</div>
    ${prev ? `<div class="small" style="margin-top:4px">Última vez (${shortDate(prev.d)}): ${prev.sets.map(setTxt).join(' · ')}</div>` : ''}
    ${best ? `<div class="small">Tu mejor marca: <b>${kgTxt(best)} kg</b></div>` : ''}
    <div class="sethead"><span>Serie</span><span>Repeticiones</span><span>Peso (kg)</span><span>Hecha</span></div>
    <div id="rows" class="setrows"></div>
    <button class="ghost block sm" id="addset">+ Agregar serie</button>
    <div id="padwrap" class="padwrap" hidden><div class="row between small"><span id="padlbl"></span><button class="ghost sm" id="padx">Listo</button></div><div id="pad"></div></div>
    <div class="row" style="gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><span class="small muted">Descanso entre series</span>
      <div class="seg" id="rest" style="margin:0;flex:1">${[60, 90, 120, 180].map((v) => `<button type="button" data-v="${v}">${v < 120 ? v + ' s' : v / 60 + ' min'}</button>`).join('')}</div></div>
    <div class="actions">${logged.length ? '<button class="ghost" id="clear">Borrar registro</button>' : ''}<button class="primary" data-close>Listo</button></div>`,
    (sheet, close) => {
      const $ = (q) => sheet.querySelector(q);
      const persist = () => {
        const done = rows.filter((x) => x.done);
        const map = ((ex().done[date] ||= {})[rid] ||= {});
        if (done.length) {
          const work = done.filter((x) => x.k !== 'w');
          map[id] = { n: it.name, kg: Math.max(0, ...(work.length ? work : done).map((x) => x.kg)), sets: done.map(({ r: reps, kg, t, k }) => ({ r: reps, kg, ...(t ? { t } : {}), ...(k ? { k } : {}) })) };
          if (map[id].kg) it.kg = map[id].kg; // la próxima vez parte de aquí
        } else delete map[id];
        keepSnap(r);
        save();
      };
      // número de la serie (contando solo las efectivas) o su tipo: C, D, F
      const label = (i) => SET_TYPES.find((t) => t.k === (rows[i].k || ''))?.short || rows.slice(0, i + 1).filter((x) => !x.k).length;
      const draw = () => {
        $('#rows').innerHTML = rows
          .map(
            (x, i) => `<div class="setrow ${x.done ? 'on' : ''}"><button type="button" class="sn st-${x.k || 'e'}" data-type="${i}" aria-label="Serie ${i + 1}: ${SET_TYPES.find((t) => t.k === (x.k || '')).name}. Tocar para cambiar el tipo">${label(i)}</button>
            <div class="stp"><button type="button" data-f="r" data-i="${i}" data-d="-1" aria-label="Menos repeticiones">−</button><span class="sv" data-f="r" data-i="${i}"><b>${x.r}</b><small>reps</small></span><button type="button" data-f="r" data-i="${i}" data-d="1" aria-label="Más repeticiones">+</button></div>
            <div class="stp"><button type="button" data-f="kg" data-i="${i}" data-d="-1" aria-label="Menos peso">−</button><span class="sv" data-f="kg" data-i="${i}"><b>${kgTxt(x.kg)}</b><small>kg</small></span><button type="button" data-f="kg" data-i="${i}" data-d="1" aria-label="Más peso">+</button></div>
            <button type="button" class="check ${x.done ? 'on' : ''}" data-done="${i}" aria-label="Serie ${i + 1} hecha" aria-pressed="${x.done}">✓</button></div>`
          )
          .join('');
        sheet.querySelectorAll('#rest button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === rest));
      };
      const closePad = () => ($('#padwrap').hidden = true);
      // Cambiar reps o kg de una serie lo copia a las siguientes que aún no se marcan y tenían el
      // mismo valor (así basta con escribir el peso una vez).
      const setVal = (i, f, v) => {
        const old = rows[i][f];
        rows[i][f] = v;
        for (let j = i + 1; j < rows.length; j++)
          if (!rows[j].done && rows[j][f] === old) {
            rows[j][f] = v;
            const el = sheet.querySelector(`.sv[data-f="${f}"][data-i="${j}"] b`);
            if (el) el.textContent = f === 'kg' ? kgTxt(v) : v;
          }
        if (rows[i].done) persist();
      };
      $('#rows').onclick = (e) => {
        const b = e.target.closest('[data-d], .sv, [data-done], [data-type]');
        if (!b) return;
        if (b.dataset.type !== undefined) {
          const x = rows[+b.dataset.type];
          x.k = nextType(x.k || '');
          if (!x.k) delete x.k;
          toast(SET_TYPES.find((t) => t.k === (x.k || '')).name);
          if (x.done) persist();
          return draw();
        }
        if (b.dataset.done !== undefined) {
          const x = rows[+b.dataset.done];
          x.done = !x.done;
          closePad();
          if (x.done) {
            x.t = Date.now();
            vibrate();
            ensureSession();
            const others = Math.max(0, ...rows.filter((y) => y.done && y !== x && y.k !== 'w').map((y) => y.kg));
            if (x.k !== 'w' && x.kg > best && best && x.kg > others) toast(`🏆 ¡Nueva marca! ${kgTxt(x.kg)} kg en ${it.name}`);
            if (rows.every((y) => y.done)) stopRest(), toast(`${it.name} listo 💪`);
            else startRest(rest, it.name);
          } else delete x.t;
          persist();
          return draw();
        }
        const i = +b.dataset.i;
        const f = b.dataset.f;
        if (b.dataset.d) {
          const step = f === 'kg' ? 2.5 : 1;
          setVal(i, f, Math.max(0, Math.round((rows[i][f] + step * +b.dataset.d) * 10) / 10));
          b.parentElement.querySelector('.sv b').textContent = f === 'kg' ? kgTxt(rows[i][f]) : rows[i][f];
          return;
        }
        // tocar el número: escribirlo con el teclado de la app
        sheet.querySelectorAll('.sv.editing').forEach((v) => v.classList.remove('editing'));
        b.classList.add('editing');
        $('#padwrap').hidden = false;
        $('#padlbl').textContent = `Serie ${i + 1} · ${f === 'kg' ? 'kilos' : 'repeticiones'}`;
        numberPad($('#pad'), b.querySelector('b'), {
          value: rows[i][f],
          decimal: f === 'kg',
          max: f === 'kg' ? 500 : 100,
          onChange: (v) => setVal(i, f, v),
        });
        setTimeout(() => $('#padwrap').scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
      };
      $('#padx').onclick = () => (closePad(), draw());
      $('#addset').onclick = () => {
        const last = rows[rows.length - 1] || prefill(0);
        rows.push({ r: last.r, kg: last.kg, done: false, ...(last.k && last.k !== 'w' ? { k: last.k } : {}) });
        closePad();
        draw();
      };
      $('#rest').onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        rest = +b.dataset.v;
        it.rest = rest;
        save();
        draw();
      };
      $('#clear')?.addEventListener('click', () => {
        if (!confirm('¿Borrar las series registradas hoy en este ejercicio?')) return;
        rows = rows.map((x) => ({ ...x, done: false }));
        persist();
        stopRest();
        draw();
      });
      $('#hist')?.addEventListener('click', () => historySheet(it.name));
      $('#tipok')?.addEventListener('click', () => {
        state.settings.gymTips = false;
        save();
        $('#tip').remove();
      });
      draw();
    },
    () => render()
  );
}

// Historial de un ejercicio: mejor peso por sesión (gráfico), marcas y últimas sesiones.
function historySheet(name) {
  const h = historyOf(name);
  const best = Math.max(0, ...h.map((x) => x.best));
  const rm = Math.max(0, ...h.map((x) => x.rm));
  const pts = h.filter((x) => x.best).map((x) => ({ date: x.d, v: x.best }));
  openSheet(
    `<h3>${esc(name)}</h3>
    <div class="macros m3" style="margin-top:4px"><div><b>${kgTxt(best)} kg</b><span>Mejor peso</span></div><div><b>${kgTxt(rm)} kg</b><span>1RM estimado</span></div><div><b>${h.length}</b><span>Sesiones</span></div></div>
    ${pts.length > 1 ? `<div style="margin-top:8px">${lineChart({ points: pts, fmt: (v) => kgTxt(v), label: `Mejor peso por sesión en ${name}` })}</div>` : ''}
    <div style="margin-top:8px">${[...h]
      .reverse()
      .slice(0, 12)
      .map((x) => `<div class="item"><div class="grow"><div class="t">${shortDate(x.d)}</div><div class="s">${x.sets.map(setTxt).join(' · ')}</div></div><div class="amount small">${x.vol ? num(x.vol) + ' kg' : ''}</div></div>`)
      .join('') || '<div class="small muted">Aún no hay series registradas.</div>'}</div>
    <p class="small muted">El 1RM es una estimación del peso máximo para una repetición (fórmula de Epley, con series de hasta 12 repeticiones). No lo pruebes sin supervisión.</p>
    <div class="actions"><button class="primary" data-close>Listo</button></div>`
  );
}

// Terminar el entrenamiento: resumen, marcas nuevas y racha.
function finishSheet() {
  const ses = sessionOf(date);
  const prs = [];
  for (const items of Object.values(ex().done[date] || {}))
    for (const v of Object.values(items || {})) {
      const work = (v?.sets || []).filter((x) => x.k !== 'w');
      if (!v?.n || !work.length) continue;
      const before = bestBefore(v.n, date);
      const top = Math.max(...work.map((x) => x.kg));
      if (before && top > before) prs.push(`${v.n}: ${kgTxt(top)} kg (+${kgTxt(top - before)})`);
    }
  const nothing = !ses.exercises;
  openSheet(
    `<h3>${nothing ? '¿Terminar sin registrar?' : 'Terminar entrenamiento'}</h3>
    ${
      nothing
        ? '<p class="small muted" style="margin-top:0">No registraste ningún ejercicio. Si lo descartas, no cuenta para la racha.</p>'
        : `<div class="macros m4" style="margin-top:4px"><div><b>${clockTxt(ses.start)}</b><span>Duración</span></div><div><b>${ses.exercises}</b><span>Ejercicios</span></div><div><b>${ses.sets}</b><span>Series</span></div><div><b>${num(ses.vol)}</b><span>Kg totales</span></div></div>
        ${ses.warm ? `<div class="small muted" style="margin-top:6px">Más ${ses.warm} ${ses.warm === 1 ? 'serie' : 'series'} de calentamiento.</div>` : ''}
        ${prs.length ? `<div class="banner" style="margin-top:10px">🏆 <b>Marcas nuevas</b><br>${prs.map(esc).join('<br>')}</div>` : ''}`
    }
    <div class="actions">${nothing ? '<button class="danger" id="discard">Descartar</button>' : ''}<button class="ghost" data-close>Seguir entrenando</button>${nothing ? '' : '<button class="primary" id="done">Terminar</button>'}</div>`,
    (sheet, close) => {
      sheet.querySelector('#done')?.addEventListener('click', () => {
        finishSession(date);
        stopRest();
        save();
        close();
        vibrate();
        const n = streak(todayStr());
        toast(`¡Entrenamiento guardado! 🔥 Racha: ${n} ${n === 1 ? 'entrenamiento' : 'entrenamientos'}`);
        render();
      });
      sheet.querySelector('#discard')?.addEventListener('click', () => {
        cancelSession(date);
        stopRest();
        save();
        close();
        render();
      });
    }
  );
}

// Eliminar el entrenamiento del día (si se empezó por error): el cronómetro y, si se quiere, lo registrado.
function discardSheet() {
  const ses = sessionOf(date);
  const logged = ses.exercises;
  openSheet(
    `<h3>¿Eliminar el entrenamiento de ${isToday() ? 'hoy' : 'este día'}?</h3>
    <p class="small muted" style="margin-top:0">${
      logged
        ? `Tiene ${logged} ${logged === 1 ? 'ejercicio registrado' : 'ejercicios registrados'} (${ses.sets + ses.warm} ${ses.sets + ses.warm === 1 ? 'serie' : 'series'}). Puedes borrar todo o solo detener el cronómetro y conservar lo registrado.`
        : 'Se detiene el cronómetro y no cuenta para la racha.'
    }</p>
    <div class="actions" style="flex-wrap:wrap"><button class="ghost" data-close>Cancelar</button>${logged ? '<button id="keep">Solo el cronómetro</button>' : ''}<button class="danger" id="all">${logged ? 'Borrar todo' : 'Eliminar'}</button></div>`,
    (sheet, close) => {
      const end = (msg) => {
        stopRest();
        save();
        close();
        toast(msg);
        render();
      };
      sheet.querySelector('#keep')?.addEventListener('click', () => {
        cancelSession(date);
        end('Cronómetro eliminado; lo registrado se mantiene');
      });
      sheet.querySelector('#all').onclick = () => {
        cancelSession(date);
        // se vacía lo registrado ese día (las rutinas agregadas a mano siguen en el día, vacías)
        for (const rid of Object.keys(ex().done[date] || {})) ex().done[date][rid] = {};
        delete ex().snap?.[date];
        end('Entrenamiento eliminado');
      };
    }
  );
}

// ---------- biblioteca de ejercicios por músculo ----------
// Lista filtrable por músculo y por texto; incluye los ejercicios propios que no están en la biblioteca.
function libraryBrowser(box, onPick) {
  const own = [...new Set(ex().routines.flatMap((r) => r.items.map((it) => it.name)))].filter((n) => !muscleOf(n) || !LIBRARY.some((e) => key(e.name) === key(n)));
  let muscle = '';
  let q = '';
  box.innerHTML = `<input class="lib-q" placeholder="Buscar ejercicio" autocomplete="off" aria-label="Buscar ejercicio">
    <div class="mchips lib-m">${['', ...MUSCLES, ...(own.length ? ['Mis ejercicios'] : [])].map((m) => `<button type="button" class="mchip" data-m="${m}">${m || 'Todos'}</button>`).join('')}</div>
    <div class="lib-list"></div>`;
  const draw = () => {
    box.querySelectorAll('.lib-m .mchip').forEach((b) => b.classList.toggle('ok', b.dataset.m === muscle));
    const groups = (muscle === 'Mis ejercicios' ? [] : muscle ? [muscle] : MUSCLES).map((m) => [m, LIBRARY.filter((e) => e.m === m).map((e) => e.name)]);
    if (own.length && (!muscle || muscle === 'Mis ejercicios')) groups.push(['Mis ejercicios', own]);
    const kq = key(q);
    box.querySelector('.lib-list').innerHTML =
      groups
        .map(([m, names]) => [m, names.filter((n) => !kq || key(n).includes(kq))])
        .filter(([, names]) => names.length)
        .map(([m, names]) => `<div class="lib-g">${m}</div>${names.map((n) => `<button type="button" class="lib-item" data-n="${esc(n)}"><span>${esc(n)}</span><span class="muted">${historyOf(n).length ? `${historyOf(n).length} ses.` : ''} ›</span></button>`).join('')}`)
        .join('') || '<div class="small muted" style="padding:10px 0">No hay ejercicios con ese nombre. Escríbelo tal cual en la rutina para crearlo.</div>';
  };
  box.querySelector('.lib-m').onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (b) (muscle = b.dataset.m), draw();
  };
  box.querySelector('.lib-q').oninput = (e) => ((q = e.target.value), draw());
  box.querySelector('.lib-list').onclick = (e) => {
    const b = e.target.closest('[data-n]');
    if (b) onPick(b.dataset.n);
  };
  draw();
}

// Biblioteca como hoja: sin onPick, tocar un ejercicio abre su historial.
function librarySheet({ title = 'Biblioteca de ejercicios', onPick } = {}) {
  openSheet(
    `<h3>${esc(title)}</h3>
    <p class="small muted" style="margin-top:0">${onPick ? 'Toca un ejercicio para agregarlo.' : 'Ejercicios por músculo. Toca uno para ver tu historial.'}</p>
    <div id="lib"></div>
    <div class="actions"><button class="primary" data-close>Listo</button></div>`,
    (sheet, close) =>
      libraryBrowser(sheet.querySelector('#lib'), (name) => {
        if (!onPick) return historySheet(name);
        close();
        onPick(name);
      })
  );
}

// Rutinas listas para usar (se agregan a las tuyas y se pueden editar).
function templatesSheet() {
  openSheet(
    `<h3>Rutinas listas</h3>
    <p class="small muted" style="margin-top:0">Elige una para empezar: se agrega a tus rutinas con sus días, ejercicios, series y repeticiones. Después la ajustas a tu gusto.${ex().routines.length ? ' Tus rutinas actuales se mantienen.' : ''}</p>
    ${TEMPLATES.map((t) => `<button class="block tpl" data-t="${t.id}"><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}
    <div class="actions"><button class="ghost" data-close>Cancelar</button></div>`,
    (sheet, close) =>
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        const t = TEMPLATES.find((x) => x.id === b.dataset.t);
        for (const rt of t.routines()) ex().routines.push({ id: uid(), intensity: 'moderada', ...rt });
        save();
        close();
        toast(`${t.name} agregada 💪`);
        render();
      })
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
      <button type="button" class="ghost block sm" id="libbtn">📚 Elegir de la biblioteca</button>
      <div id="libpanel" class="libpanel" hidden></div>
      <datalist id="common">${LIBRARY.map((e) => `<option value="${e.name}">${e.m}</option>`).join('')}</datalist>
      <div class="four"><label class="field">Series<input id="isets" inputmode="numeric" placeholder="Ej: 4"></label>
        <label class="field">Reps<input id="ireps" inputmode="numeric" placeholder="Ej: 12"></label>
        <label class="field">Kg<input id="ikg" inputmode="decimal" placeholder="Opc."></label>
        <label class="field">Min<input id="imins" inputmode="numeric" placeholder="Opc."></label></div>
      <p class="small muted" style="margin:6px 0 0">Para pesas usa series, reps y kg; para cardio, los minutos.</p>
      <div class="two"><label class="field">Descanso<select id="irest"><option value="">Automático</option><option value="45">45 s</option><option value="60">60 s</option><option value="90">90 s</option><option value="120">2 min</option><option value="180">3 min</option></select></label>
        <label class="field">Nota (opcional)<input id="inote" maxlength="60" placeholder="Ej: cada pierna, 30 s" autocomplete="off"></label></div>
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
        $('#irest').value = it?.rest ? String(it.rest) : '';
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
      $('#libbtn').onclick = () => {
        const p = $('#libpanel');
        p.hidden = !p.hidden;
        if (!p.hidden)
          libraryBrowser(p, (name) => {
            $('#iname').value = name;
            if (muscleOf(name) === 'Cardio' && !$('#imins').value) $('#imins').value = '20';
            p.hidden = true;
          });
      };
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
          rest: parseInt($('#irest').value, 10) || 0,
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
