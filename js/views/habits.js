// Hábitos: checks diarios, racha por hábito y calendario del mes.
import { state, save } from '../store.js';
import { esc, uid, openSheet, toast, todayStr, addDays, dayLabel, weekdayIndex, monthKey, addMonths, monthLabel, vibrate, DAYS, DAYS_SHORT } from '../util.js';

const EMOJIS = ['💧', '📚', '🛏️', '🧘', '🚶', '🏃', '💪', '🍎', '🥗', '🍬', '🚭', '🍺', '💊', '🦷', '📵', '✍️', '🙏', '🧹', '🐶', '🌞', '💰', '🎸', '🧠', '❤️'];
const SUGGEST = [
  ['🛏️', 'Dormir 7 horas'],
  ['📚', 'Leer 15 minutos'],
  ['🍬', 'Sin azúcar'],
  ['🚶', 'Caminar 10.000 pasos'],
  ['🧘', 'Meditar 5 minutos'],
  ['💊', 'Tomar vitaminas'],
  ['📵', 'Sin celular antes de dormir'],
  ['🥗', 'Comer verduras'],
];

const hb = () => state.habits;
// Los hábitos con hora van primero, ordenados por hora; los demás quedan en el orden en que se crearon.
const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
export const habitsFor = (d) => hb().list.filter((h) => !h.days || h.days.includes(weekdayIndex(d))).sort(byTime);
export const isDone = (d, id) => !!hb().done[d]?.[id];

export function toggleHabit(d, id) {
  const day = (hb().done[d] ||= {});
  if (day[id]) delete day[id];
  else {
    day[id] = true;
    vibrate();
    const list = habitsFor(d);
    if (list.length > 1 && list.every((h) => isDone(d, h.id))) toast('¡Todos los hábitos del día! 🎉');
  }
  if (!Object.keys(day).length) delete hb().done[d];
  save();
}

// Racha: días programados seguidos cumplidos. Hoy cuenta solo si ya está hecho (si no, llega hasta ayer).
export function streakOf(h, from = todayStr()) {
  const scheduled = (d) => !h.days || h.days.includes(weekdayIndex(d));
  let d = from;
  if (!isDone(d, h.id)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 800; i++, d = addDays(d, -1)) {
    if (!scheduled(d)) continue;
    if (!isDone(d, h.id)) break;
    n++;
  }
  return n;
}

function bestStreak(h) {
  const dates = Object.keys(hb().done).filter((d) => hb().done[d][h.id]).sort();
  if (!dates.length) return 0;
  let best = 0;
  let d = dates[0];
  let n = 0;
  const end = todayStr();
  for (let i = 0; i < 2000 && d <= end; i++, d = addDays(d, 1)) {
    if (h.days && !h.days.includes(weekdayIndex(d))) continue;
    if (isDone(d, h.id)) best = Math.max(best, ++n);
    else n = 0;
  }
  return best;
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
  const list = habitsFor(date);
  const n = list.filter((h) => isDone(date, h.id)).length;
  const others = hb().list.filter((h) => !list.includes(h));

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Día anterior">‹</button>
      <div class="label" data-act="today">${dayLabel(date)}</div>
      <button class="icon" data-act="next" aria-label="Día siguiente">›</button></div>

    ${
      hb().list.length
        ? `<div class="card">
        <div class="row between"><div><div class="big">${n}<span class="mid muted"> / ${list.length}</span></div><div class="small muted">hábitos cumplidos</div></div>
          <button class="sm" data-act="new">+ Hábito</button></div>
        <div class="bar" style="margin:12px 0 6px"><i style="width:${list.length ? (n / list.length) * 100 : 0}%"></i></div>
        ${list.map(habitRow).join('') || '<div class="small muted">No hay hábitos programados para este día.</div>'}
      </div>
      ${
        others.length
          ? `<div class="card"><h2>Otros días</h2>${others
              .map((h) => `<div class="item" data-act="detail" data-id="${h.id}"><span class="emoji">${esc(h.emoji || '✅')}</span><div class="grow"><div class="t">${esc(h.name)}</div><div class="s">${daysTxt(h.days)}${h.time ? ` · ⏰ ${h.time}` : ''}</div></div><span class="muted">›</span></div>`)
              .join('')}</div>`
          : ''
      }
      <p class="small muted" style="text-align:center">Toca un hábito para ver su calendario y rachas.</p>`
        : `<div class="card empty"><b>Crea tu primer hábito</b>Pequeñas cosas que quieres hacer seguido. Márcalas cada día y mantén la racha 🔥
          <div class="sugg">${SUGGEST.map(([e, t], i) => `<button class="chip" data-act="sugg" data-i="${i}">${e} ${t}</button>`).join('')}</div>
          <div class="actions"><button class="primary" data-act="new">+ Hábito propio</button></div></div>`
    }`;
}

const daysTxt = (days) => (!days || days.length === 7 ? 'Todos los días' : days.length ? [...days].sort().map((i) => DAYS[i].slice(0, 2)).join(' · ') : 'Sin días');

function habitRow(h) {
  const d = isDone(date, h.id);
  const st = streakOf(h, date);
  return `<div class="item habit ${d ? 'done' : ''}">
    <span class="emoji">${esc(h.emoji || '✅')}</span>
    <div class="grow" data-act="detail" data-id="${h.id}"><div class="t">${esc(h.name)}</div><div class="s">${[h.time ? `⏰ ${h.time}` : '', st >= 1 ? `🔥 ${st} ${st === 1 ? 'día' : 'días'}` : h.time ? '' : daysTxt(h.days)].filter(Boolean).join(' · ')}</div></div>
    <button class="check big ${d ? 'on' : ''}" data-act="tick" data-id="${h.id}" aria-label="Marcar ${esc(h.name)}" aria-pressed="${d}">✓</button></div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id, i } = t.dataset;
  if (act === 'prev') date = addDays(date, -1);
  else if (act === 'next') date = addDays(date, 1);
  else if (act === 'today') date = todayStr();
  else if (act === 'tick') toggleHabit(date, id);
  else if (act === 'new') return habitSheet();
  else if (act === 'sugg') {
    const [emoji, name] = SUGGEST[+i];
    hb().list.push({ id: uid(), name, emoji, days: [0, 1, 2, 3, 4, 5, 6] });
    save();
    toast(`${emoji} ${name} agregado`);
  } else if (act === 'detail') return detailSheet(hb().list.find((h) => h.id === id));
  else return;
  render();
}

function habitSheet(h) {
  const editing = !!h;
  let emoji = h?.emoji || EMOJIS[0];
  const days = [...(h?.days || [0, 1, 2, 3, 4, 5, 6])];
  openSheet(
    `<h3>${editing ? 'Editar hábito' : 'Nuevo hábito'}</h3>
    <label class="field">Nombre<input id="name" maxlength="40" value="${esc(h?.name)}" placeholder="Ej: Leer 15 minutos" autocomplete="off"></label>
    <label class="field">Ícono</label>
    <div class="emojis" id="emojis">${EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
    <label class="field">Días</label>
    <div class="chips" id="days">${DAYS_SHORT.map((l, i) => `<button type="button" class="chip ${days.includes(i) ? 'sel' : ''}" data-i="${i}" aria-label="${DAYS[i]}">${l}</button>`).join('')}</div>
    <label class="field">Hora (opcional)</label>
    <div class="row"><input id="time" type="time" value="${h?.time || ''}" style="width:auto;margin-top:0"><button type="button" class="ghost sm" id="notime">Sin hora</button></div>
    <div class="small muted" style="margin-top:4px">Si eliges una hora, el hábito se ordena por horario y, con las notificaciones activadas, te avisa a esa hora si no lo has marcado.</div>
    <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary" id="save">Guardar</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const drawE = () => sheet.querySelectorAll('#emojis button').forEach((b) => b.classList.toggle('sel', b.dataset.e === emoji));
      $('#emojis').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) (emoji = b.dataset.e), drawE();
      };
      drawE();
      $('#days').onclick = (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const i = +b.dataset.i;
        const at = days.indexOf(i);
        if (at >= 0) days.splice(at, 1);
        else days.push(i);
        b.classList.toggle('sel');
      };
      $('#notime').onclick = () => ($('#time').value = '');
      $('#save').onclick = () => {
        const name = $('#name').value.trim();
        if (!name) return toast('Ponle un nombre');
        if (!days.length) return toast('Elige al menos un día');
        const time = /^\d{2}:\d{2}$/.test($('#time').value) ? $('#time').value : '';
        const data = { name, emoji, days: [...days].sort() };
        if (editing) {
          Object.assign(h, data);
          if (time) h.time = time;
          else delete h.time;
        } else hb().list.push({ id: uid(), ...data, ...(time ? { time } : {}) });
        save();
        close();
        render();
      };
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${h.name}" y su historial?`)) return;
        hb().list = hb().list.filter((x) => x !== h);
        for (const d of Object.keys(hb().done)) {
          delete hb().done[d][h.id];
          if (!Object.keys(hb().done[d]).length) delete hb().done[d];
        }
        save();
        close();
        render();
      });
    }
  );
}

// Calendario del mes + rachas de un hábito.
function detailSheet(h) {
  let ym = monthKey(date);
  const cal = () => {
    const [y, m] = ym.split('-').map(Number);
    const first = `${ym}-01`;
    const nDays = new Date(y, m, 0).getDate();
    const lead = weekdayIndex(first);
    let cells = '<span></span>'.repeat(lead);
    let done = 0;
    let sched = 0;
    for (let i = 1; i <= nDays; i++) {
      const d = `${ym}-${String(i).padStart(2, '0')}`;
      const on = h.days.includes(weekdayIndex(d));
      const ok = isDone(d, h.id);
      if (on && d <= todayStr()) sched++;
      if (ok && on) done++; // solo días programados: el % no puede pasar de 100
      cells += `<button type="button" class="cday ${ok ? 'ok' : ''} ${on ? '' : 'off'} ${d === todayStr() ? 'cur' : ''} ${d > todayStr() ? 'fut' : ''}" data-d="${d}">${i}</button>`;
    }
    return { cells, done, sched };
  };
  openSheet(
    `<div class="row between"><h3>${esc(h.emoji || '✅')} ${esc(h.name)}</h3><button class="sm" id="edit">Editar</button></div>
    <div class="hstats"><div><b id="cur"></b><span>Racha actual</span></div><div><b id="best"></b><span>Mejor racha</span></div><div><b id="pct"></b><span>Este mes</span></div></div>
    <div class="nav" style="margin-top:12px"><button class="icon" id="mprev" aria-label="Mes anterior">‹</button><div class="label" id="mlabel"></div><button class="icon" id="mnext" aria-label="Mes siguiente">›</button></div>
    <div class="cal-head">${DAYS_SHORT.map((l) => `<span>${l}</span>`).join('')}</div>
    <div class="cal" id="cal"></div>
    <p class="small muted">Toca un día para marcarlo o desmarcarlo.</p>
    <div class="actions"><button class="primary" data-close>Listo</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const draw = () => {
        const c = cal();
        $('#cal').innerHTML = c.cells;
        $('#mlabel').textContent = monthLabel(ym);
        $('#pct').textContent = c.sched ? Math.round((c.done / c.sched) * 100) + '%' : '—';
        $('#cur').textContent = streakOf(h);
        $('#best').textContent = bestStreak(h);
      };
      $('#mprev').onclick = () => ((ym = addMonths(ym, -1)), draw());
      $('#mnext').onclick = () => ((ym = addMonths(ym, 1)), draw());
      $('#cal').onclick = (e) => {
        const b = e.target.closest('[data-d]');
        if (!b || b.classList.contains('fut')) return;
        toggleHabit(b.dataset.d, h.id);
        draw();
        render();
      };
      $('#edit').onclick = () => {
        close();
        habitSheet(h);
      };
      draw();
    }
  );
}
