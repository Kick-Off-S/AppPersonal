import { state, save } from '../store.js';
import { dayTotals, planFor, doneFor, extrasFor, waterOf, latestWeight } from '../calc.js';
import { foodPicker } from '../foodpicker.js';
import { esc, uid, num, parseMoney, openSheet, toast, todayStr, addDays, dayLabel, vibrate } from '../util.js';

let root;
let date = todayStr();

const sortedPlan = (d) => [...planFor(d)].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

export function mount(el) {
  root = el;
  date = todayStr();
  root.onclick = onClick;
  render();
}

function render() {
  const t = dayTotals(date);
  const goal = state.settings.kcalGoal || 0;
  const left = goal - t.total;
  const plan = sortedPlan(date);
  const done = doneFor(date);
  const extras = extrasFor(date);
  const ml = waterOf(date);
  const wGoal = state.settings.waterGoal || 0;
  const w = latestWeight();
  const weekAgo = addDays(todayStr(), -7);
  const needWeight = date === todayStr() && (!w || w.date < weekAgo);

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Día anterior">‹</button>
      <div class="label" data-act="today">${dayLabel(date)}</div>
      <button class="icon" data-act="next" aria-label="Día siguiente">›</button></div>

    <div class="card">
      <div class="row between"><div><div class="big">${num(t.total)}</div><div class="small muted">kcal de hoy</div></div>
        <div style="text-align:right"><div class="mid ${goal && left < 0 ? 'warn' : 'pos'}">${goal ? num(Math.abs(left)) : '—'}</div>
          <div class="small muted">${goal ? (left < 0 ? 'sobre la meta' : 'restantes') : 'sin meta'}</div></div></div>
      <div class="bar ${goal && left < 0 ? 'over' : ''}" style="margin-top:12px"><i style="width:${goal ? Math.min(100, (t.total / goal) * 100) : 0}%"></i></div>
      <div class="row between small muted" style="margin-top:6px"><span>Dieta ${num(t.diet)} · Fuera de la dieta ${num(t.extra)}</span><span>Meta ${goal ? num(goal) : '—'}</span></div>
      ${t.missingKcal ? `<div class="banner warn" style="margin-bottom:0">${t.missingKcal} comida${t.missingKcal > 1 ? 's' : ''} de tu plan no ${t.missingKcal > 1 ? 'tienen' : 'tiene'} calorías, así que no suma${t.missingKcal > 1 ? 'n' : ''}. Agrégalas en <a href="#diet">Dieta</a>.</div>` : ''}
    </div>

    <div class="card"><h2>Mi dieta</h2>
      ${
        plan.length
          ? `<div class="small muted" style="margin:-4px 0 6px">${t.mealsDone} de ${t.mealsTotal} comidas cumplidas · marca cada una al comerla</div>` +
            plan
              .map(
                (m) => `<div class="item ${done[m.id] ? 'done' : ''}">
              <button class="check ${done[m.id] ? 'on' : ''}" data-act="toggle" data-id="${m.id}" aria-label="Marcar como cumplida" aria-pressed="${!!done[m.id]}">✓</button>
              <div class="grow"><div class="t">${m.time ? `<span class="time">${esc(m.time)}</span> · ` : ''}${esc(m.name)}</div>
                ${m.desc ? `<div class="s pre">${esc(m.desc)}</div>` : ''}</div>
              <div class="amount small">${m.kcal ? num(m.kcal) + ' kcal' : '<span class="muted">sin kcal</span>'}</div></div>`
              )
              .join('')
          : `<div class="empty"><b>Sin plan para este día</b>Carga el plan de tu nutricionista en la pestaña Dieta.<div class="actions"><a class="btn" href="#diet" style="display:flex;align-items:center;justify-content:center;text-decoration:none">Ir a Dieta</a></div></div>`
      }</div>

    <div class="card">
      <div class="row between"><h2 style="margin:0">Fuera de la dieta</h2><button class="sm" data-act="extra">+ Agregar</button></div>
      ${
        extras.length
          ? extras
              .map(
                (e) => `<div class="item"><div class="grow"><div class="t">${esc(e.name)}</div><div class="s">${num(e.qty, 2)} × ${esc(e.unit)}</div></div>
              <div class="amount">${num(e.kcal)}<span class="muted small"> kcal</span></div>
              <button class="ghost icon sm" data-act="delextra" data-id="${e.id}" aria-label="Quitar">✕</button></div>`
              )
              .join('')
          : '<div class="small muted" style="margin-top:8px">Agrega aquí solo lo que comas que no está en tu plan (un antojo, una salida, un cambio).</div>'
      }</div>

    <div class="card">
      <div class="row between"><h2 style="margin:0">Agua</h2><span class="small muted">${wGoal ? 'Meta ' + num(wGoal) + ' ml' : 'Sin meta'}</span></div>
      <div class="row between" style="margin-top:6px"><div class="big">${num(ml)}<span class="mid muted"> ml</span></div>
        <div class="mid ${wGoal && ml >= wGoal ? 'pos' : 'muted'}">${wGoal ? Math.round((ml / wGoal) * 100) + '%' : ''}</div></div>
      <div class="bar" style="margin:10px 0 12px"><i style="width:${wGoal ? Math.min(100, (ml / wGoal) * 100) : 0}%"></i></div>
      <div class="actions" style="margin-top:0"><button data-act="water" data-ml="250">+250</button><button data-act="water" data-ml="500">+500</button><button data-act="waterother">Otro</button></div>
      ${(state.water[date] || []).length ? '<button class="ghost block" style="margin-top:6px" data-act="waterundo">Deshacer último</button>' : ''}
    </div>

    ${needWeight ? `<div class="banner">${w ? 'Hace más de una semana que no registras tu peso.' : 'Aún no registras tu peso.'} <a href="#progress">Registrar peso</a></div>` : ''}`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id, ml } = t.dataset;
  if (act === 'prev') date = addDays(date, -1);
  else if (act === 'next') date = addDays(date, 1);
  else if (act === 'today') date = todayStr();
  else if (act === 'toggle') {
    const d = (state.diet.done[date] ||= {});
    if (d[id]) delete d[id];
    else d[id] = true;
    if (!Object.keys(d).length) delete state.diet.done[date];
    vibrate();
    save();
  } else if (act === 'extra') return extraSheet();
  else if (act === 'delextra') {
    state.log[date] = extrasFor(date).filter((x) => x.id !== id);
    if (!state.log[date].length) delete state.log[date];
    save();
  } else if (act === 'water') addWater(+ml);
  else if (act === 'waterother') return waterSheet();
  else if (act === 'waterundo') {
    state.water[date].pop();
    if (!state.water[date].length) delete state.water[date];
    save();
  } else return;
  render();
}

function addWater(ml) {
  const before = waterOf(date);
  (state.water[date] ||= []).push(ml);
  save();
  vibrate();
  const goal = state.settings.waterGoal;
  if (goal && before < goal && before + ml >= goal) toast('¡Meta de agua cumplida! 💧');
}

function waterSheet() {
  openSheet(
    `<h3>Agregar agua</h3><label class="field">Cantidad (ml)<input id="ml" inputmode="numeric" placeholder="Ej: 330"></label>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Agregar</button></div>`,
    (sheet, close) => {
      const input = sheet.querySelector('#ml');
      const ok = () => {
        const v = parseMoney(input.value);
        if (!v) return toast('Ingresa una cantidad');
        addWater(v);
        close();
        render();
      };
      sheet.querySelector('#ok').onclick = ok;
      input.onkeydown = (e) => e.key === 'Enter' && ok();
      input.focus();
    }
  );
}

function extraSheet() {
  openSheet(
    `<h3>Fuera de la dieta</h3><p class="muted small" style="margin-top:0">Registra solo lo que comiste y no está en tu plan de hoy.</p><div id="pk"></div>`,
    (sheet, close) =>
      foodPicker(sheet.querySelector('#pk'), {
        onPick(food, qty) {
          (state.log[date] ||= []).push({
            id: uid(),
            name: food.name,
            unit: food.unit,
            qty,
            kcal: Math.round(food.kcal * qty),
            p: Math.round(food.p * qty * 10) / 10,
            c: Math.round(food.c * qty * 10) / 10,
            f: Math.round(food.f * qty * 10) / 10,
            per: { kcal: food.kcal, p: food.p, c: food.c, f: food.f },
          });
          save();
          vibrate();
          close();
          toast(`${food.name} agregado`);
          render();
        },
      })
  );
}
