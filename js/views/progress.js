import { state, save } from '../store.js';
import { dayTotals, dayMacros, dietStreak, waterOf } from '../calc.js';
import { barChart, lineChart } from '../charts.js';
import { esc, uid, num, parseQty, openSheet, toast, todayStr, addDays, lastDays, weekdayShort, shortDate, dayLabel } from '../util.js';

let root;
let range = 30; // días del gráfico de peso (0 = todo)

export function mount(el) {
  root = el;
  root.onclick = onClick;
  render();
}

const byDate = () => [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
const kg = (v) => num(v, 1);

function render() {
  const days = lastDays(7);
  const labels = days.map(weekdayShort);
  const totals = days.map(dayTotals);
  const kGoal = state.settings.kcalGoal || 0;
  const wGoal = state.settings.waterGoal || 0;

  const kcalVals = totals.map((t) => (t.hasData ? t.total : null));
  const withData = kcalVals.filter((v) => v != null);
  const avg = withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;
  const waterVals = days.map((d) => waterOf(d) || null);
  const waterHit = wGoal ? days.filter((d) => waterOf(d) >= wGoal).length : 0;
  // solo cuentan los días en que marcaste al menos una comida (así los días sin uso no bajan el promedio)
  const dietVals = totals.map((t) => (t.mealsTotal && t.mealsDone ? Math.round((t.mealsDone / t.mealsTotal) * 100) : null));
  const dietWith = dietVals.filter((v) => v != null);
  const dietAvg = dietWith.length ? Math.round(dietWith.reduce((a, b) => a + b, 0) / dietWith.length) : 0;

  const macDays = days.map(dayMacros).filter((m) => m.any);
  const macAvg = (k) => (macDays.length ? macDays.reduce((a, m) => a + m[k], 0) / macDays.length : 0);
  const streak = dietStreak();

  const all = byDate();
  const cutoff = range ? addDays(todayStr(), -range) : '';
  const pts = all.filter((w) => w.date >= cutoff).map((w) => ({ date: w.date, v: w.kg }));
  const first = all[0];
  const last = all[all.length - 1];
  const goalKg = state.settings.goalKg || 0;
  const diff = first && last ? last.kg - first.kg : 0;

  root.innerHTML = `
    <div class="card"><h2>Peso</h2>
      ${
        last
          ? `<div class="row between"><div><div class="big">${kg(last.kg)}<span class="mid muted"> kg</span></div><div class="small muted">${dayLabel(last.date)}</div></div>
          <div style="text-align:right"><div class="mid ${all.length > 1 ? (diff <= 0 ? 'pos' : 'warn') : ''}">${all.length > 1 ? (diff > 0 ? '+' : diff < 0 ? '−' : '') + kg(Math.abs(diff)) + ' kg' : '—'}</div>
          <div class="small muted">desde el inicio</div></div></div>
          ${goalKg ? `<div class="small muted" style="margin-top:6px">Meta: ${kg(goalKg)} kg · ${Math.abs(last.kg - goalKg) < 0.05 ? '¡lograda!' : `faltan ${kg(Math.abs(last.kg - goalKg))} kg`}</div>` : ''}
          <div class="seg"><button class="${range === 30 ? 'sel' : ''}" data-act="range" data-r="30">30 días</button><button class="${range === 90 ? 'sel' : ''}" data-act="range" data-r="90">90 días</button><button class="${range === 0 ? 'sel' : ''}" data-act="range" data-r="0">Todo</button></div>
          ${
            pts.length
              ? `<div style="margin-top:8px">${lineChart({ points: pts, goal: goalKg || null, goalLabel: goalKg ? `Meta ${kg(goalKg)}` : '', fmt: (v) => kg(v), label: 'Evolución del peso en kilos' })}</div>`
              : '<div class="small muted" style="margin-top:10px">Sin registros en este período.</div>'
          }`
          : '<div class="empty"><b>Aún no registras tu peso</b>Pésate siempre en condiciones parecidas (por ejemplo, en la mañana) para comparar bien.</div>'
      }
      <div class="actions"><button class="primary" data-act="addw">+ Registrar</button><button data-act="goalw">${goalKg ? 'Cambiar meta' : 'Meta de peso'}</button></div>
      ${
        all.length
          ? `<div style="margin-top:8px">${[...all]
              .reverse()
              .slice(0, 8)
              .map((w) => `<div class="item" data-act="editw" data-id="${w.id}"><div class="grow t">${shortDate(w.date)}</div><div class="amount">${kg(w.kg)} kg</div></div>`)
              .join('')}</div>`
          : ''
      }
    </div>

    <div class="card"><h2>Calorías · últimos 7 días</h2>
      ${withData.length ? barChart({ labels, values: kcalVals, goal: kGoal || null, goalLabel: kGoal ? `Meta ${num(kGoal)}` : '', fmt: (v) => num(v), overWarn: true, label: 'Calorías por día, últimos 7 días' }) : '<div class="small muted">Marca tus comidas en Hoy y aparecerán aquí.</div>'}
      ${withData.length ? `<div class="small muted">Promedio: <b>${num(avg)} kcal</b> por día con registro${kGoal ? ' · barras naranjas = sobre la meta' : ''}</div>` : ''}
    </div>

    <div class="card"><h2>Dieta cumplida · últimos 7 días</h2>
      ${dietWith.length ? barChart({ labels, values: dietVals, goal: 100, fmt: (v) => v + '%', label: 'Porcentaje de comidas de la dieta cumplidas por día' }) : '<div class="small muted">Aún no hay un plan de dieta o comidas marcadas.</div>'}
      ${dietWith.length ? `<div class="small muted">Promedio: <b>${dietAvg}%</b> de las comidas del plan, en los días con registro</div>` : ''}
      ${streak ? `<div class="small" style="margin-top:6px">🔥 Racha actual: <b>${streak} ${streak === 1 ? 'día' : 'días'}</b> seguidos con todo el plan cumplido</div>` : ''}
    </div>

    <div class="card"><h2>Proteínas, carbohidratos y grasas · promedio 7 días</h2>
      ${
        macDays.length
          ? `<div class="macros" style="margin-top:0"><div><b>${num(macAvg('p'))} g</b><span>Proteínas</span></div><div><b>${num(macAvg('c'))} g</b><span>Carbohidratos</span></div><div><b>${num(macAvg('f'))} g</b><span>Grasas</span></div></div>
            <div class="small muted" style="margin-top:8px">Promedio de ${macDays.length} ${macDays.length === 1 ? 'día' : 'días'} con registro. Suman los alimentos del buscador y las comidas del plan que tengan sus gramos.</div>`
          : '<div class="small muted">Agrega los gramos a las comidas de tu plan (en Dieta) o registra alimentos del buscador y aparecerán aquí.</div>'
      }
    </div>

    <div class="card"><h2>Agua · últimos 7 días</h2>
      ${waterVals.some(Boolean) ? barChart({ labels, values: waterVals, goal: wGoal || null, goalLabel: wGoal ? `Meta ${num(wGoal / 1000, 1)} L` : '', fmt: (v) => num(v / 1000, 1) + ' L', label: 'Agua tomada por día, últimos 7 días' }) : '<div class="small muted">Registra tu agua en Hoy y aparecerá aquí.</div>'}
      ${wGoal && waterVals.some(Boolean) ? `<div class="small muted">Meta cumplida <b>${waterHit} de 7</b> días</div>` : ''}
    </div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id, r } = t.dataset;
  if (act === 'range') {
    range = +r;
    render();
  } else if (act === 'addw') weightSheet();
  else if (act === 'editw') weightSheet(state.weight.find((w) => w.id === id));
  else if (act === 'goalw') goalSheet();
}

function goalSheet() {
  openSheet(
    `<h3>Meta de peso</h3><p class="muted small" style="margin-top:0">Deja en blanco para quitarla.</p>
    <label class="field">Peso objetivo (kg)<input id="g" inputmode="decimal" value="${state.settings.goalKg || ''}" placeholder="Ej: 68,5"></label>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Guardar</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#ok').onclick = () => {
        state.settings.goalKg = parseQty(sheet.querySelector('#g').value) || 0;
        save();
        close();
        render();
      };
    }
  );
}

function weightSheet(item) {
  const editing = !!item;
  const lastKg = byDate().pop()?.kg;
  openSheet(
    `<h3>${editing ? 'Editar peso' : 'Registrar peso'}</h3>
    <label class="field">Peso (kg)<input id="kg" inputmode="decimal" value="${item?.kg ?? lastKg ?? ''}" placeholder="Ej: 72,4" autocomplete="off"></label>
    <label class="field">Fecha<input id="date" type="date" max="${todayStr()}" value="${item?.date || todayStr()}"></label>
    <div class="actions">${editing ? '<button class="danger" id="del">Eliminar</button>' : '<button class="ghost" data-close>Cancelar</button>'}<button class="primary" id="ok">Guardar</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      $('#kg').focus();
      $('#kg').select();
      $('#ok').onclick = () => {
        const v = parseQty($('#kg').value);
        const date = $('#date').value;
        if (!v || v < 20 || v > 400) return toast('Ingresa un peso válido en kg');
        if (!date) return toast('Elige una fecha');
        const value = Math.round(v * 10) / 10;
        // un solo registro por día: si ya existe, se reemplaza
        state.weight = state.weight.filter((w) => w === item || w.date !== date);
        if (editing) Object.assign(item, { kg: value, date });
        else state.weight.push({ id: uid(), date, kg: value });
        save();
        close();
        render();
      };
      $('#del')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este registro de peso?')) return;
        state.weight = state.weight.filter((w) => w !== item);
        save();
        close();
        render();
      });
    }
  );
}
