import { state, save } from '../store.js';
import { dayTotals, dayMacros, dietStreak, waterOf } from '../calc.js';
import { barChart, lineChart } from '../charts.js';
import { esc, uid, num, parseQty, openSheet, toast, todayStr, addDays, lastDays, weekdayShort, shortDate, dayLabel, parseDate } from '../util.js';
import { bmiInfo, weightAdvice } from '../nutrition.js';
import { nutritionReportSheet } from '../reports.js';

let root;
let range = 30; // días del gráfico de peso (0 = todo)

export function mount(el) {
  root = el;
  root.onclick = onClick;
  render();
}

const byDate = () => [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
const kg = (v) => num(v, 1);
// Estatura y edad: de la meta de peso o de la evaluación nutricional (Dieta)
const body = () => ({ height: state.settings.body?.height || state.settings.profile?.height || 0, age: state.settings.body?.age || state.settings.profile?.age || 0 });
const fmtDate = (s) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(s));

// Ritmo real (kg por semana) con los registros de las últimas 4 semanas; necesita al menos 10 días de diferencia.
function realPace(all) {
  const recent = all.filter((w) => w.date >= addDays(todayStr(), -28));
  if (recent.length < 2) return null;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const days = (parseDate(b.date) - parseDate(a.date)) / 86400000;
  return days >= 10 ? ((b.kg - a.kg) / days) * 7 : null;
}

function bodyLine(last, goalKg, all) {
  const { height, age } = body();
  if (!height) return `<div class="small" style="margin-top:6px"><a href="#" data-act="goalw">Calcula tu IMC y una meta realista</a></div>`;
  if (age && age < 18) return '';
  const a = weightAdvice({ weight: last.kg, height, age, goalKg, goalDate: state.settings.goalDate, today: todayStr() });
  const pace = realPace(all);
  const g = a.goal;
  return `<div class="small" style="margin-top:6px">IMC <b>${num(a.bmi, 1)}</b> · ${a.cat} · saludable para tu estatura: ${kg(a.healthy[0])} a ${kg(a.healthy[1])} kg</div>
    ${
      g
        ? `<div class="small muted">Meta ${kg(goalKg)} kg · ${g.reached ? '¡lograda! 🎉' : `faltan ${kg(Math.abs(g.diff))} kg · a ritmo sano, cerca del ${fmtDate(g.eta)}`}${g.byDate && !g.reached ? ` · para el ${fmtDate(g.byDate.date)}: ${num(g.byDate.need, 2)} kg/sem (${g.byDate.verdict})` : ''}</div>`
        : ''
    }
    ${pace != null ? `<div class="small muted">Tu ritmo en las últimas semanas: ${pace > 0 ? '+' : pace < 0 ? '−' : ''}${num(Math.abs(pace), 2)} kg por semana</div>` : ''}`;
}

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
    <button class="block" data-act="report" style="margin-bottom:12px">📄 Informe para tu nutricionista</button>
    <div class="card"><h2>Peso</h2>
      ${
        last
          ? `<div class="row between"><div><div class="big">${kg(last.kg)}<span class="mid muted"> kg</span></div><div class="small muted">${dayLabel(last.date)}</div></div>
          <div style="text-align:right"><div class="mid ${all.length > 1 ? (diff <= 0 ? 'pos' : 'warn') : ''}">${all.length > 1 ? (diff > 0 ? '+' : diff < 0 ? '−' : '') + kg(Math.abs(diff)) + ' kg' : '—'}</div>
          <div class="small muted">desde el inicio</div></div></div>
          ${bodyLine(last, goalKg, all)}
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
  else if (act === 'goalw') (e.preventDefault(), goalSheet());
  else if (act === 'report') nutritionReportSheet();
}

const GUIDE = 'Es una guía con fórmulas generales (IMC de la OMS; desde los 65 años, la referencia del MINSAL). No reemplaza a tu médico o nutricionista.';

function goalSheet() {
  const { height, age } = body();
  const last = byDate().pop();
  openSheet(
    `<h3>Meta de peso</h3>
    <div class="banner warn small" style="margin-top:4px">${GUIDE}</div>
    <div class="three"><label class="field">Estatura<input id="h" inputmode="numeric" value="${height || ''}" placeholder="cm"></label>
      <label class="field">Edad<input id="age" inputmode="numeric" value="${age || ''}" placeholder="años"></label>
      <label class="field">Peso hoy<input id="w" inputmode="decimal" value="${last ? num(last.kg, 1) : ''}" placeholder="kg"></label></div>
    <div class="two"><label class="field">Meta (kg)<input id="g" inputmode="decimal" value="${state.settings.goalKg ? num(state.settings.goalKg, 1) : ''}" placeholder="Ej: 68,5"></label>
      <label class="field">Para cuándo (opcional)<input id="d" type="date" min="${addDays(todayStr(), 7)}" value="${state.settings.goalDate || ''}"></label></div>
    <div id="adv"></div>
    <div class="actions">${state.settings.goalKg ? '<button class="ghost" id="clear">Quitar meta</button>' : '<button class="ghost" data-close>Cancelar</button>'}<button class="primary" id="ok">Guardar</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const read = () => ({ height: parseQty($('#h').value), age: Math.round(parseQty($('#age').value)) || 0, weight: parseQty($('#w').value), goalKg: parseQty($('#g').value) || 0, goalDate: $('#d').value || '' });
      let advice = null;
      const draw = () => {
        const v = read();
        advice = null;
        if (!(v.height >= 120 && v.height <= 230) || !(v.weight >= 30 && v.weight <= 300))
          return ($('#adv').innerHTML = '<div class="small muted" style="margin-top:10px">Escribe tu estatura (cm) y tu peso de hoy para ver tu IMC y una meta recomendada.</div>');
        advice = weightAdvice({ ...v, today: todayStr() });
        if (advice.minor) return ($('#adv').innerHTML = '<div class="banner warn" style="margin-top:10px">En menores de 18 años el peso se evalúa con tablas por edad: consulta con tu pediatra o nutricionista para fijar una meta.</div>');
        const a = advice;
        const pos = Math.min(100, Math.max(0, ((a.bmi - 15) / (40 - 15)) * 100));
        const seg = (from, to) => (((to - from) / 25) * 100).toFixed(1) + '%';
        const g = a.goal;
        $('#adv').innerHTML = `<div class="advice">
          <div class="row between"><span>Tu IMC: <b>${num(a.bmi, 1)}</b></span><span class="pill-${a.cat === 'normal' ? 'ok' : a.cat === 'sobrepeso' ? 'warn' : 'bad'}">${a.cat}</span></div>
          <div class="bmibar" aria-hidden="true"><i style="width:${seg(15, a.lo)}"></i><i style="width:${seg(a.lo, a.hi)}"></i><i style="width:${seg(a.hi, a.ob)}"></i><i style="width:${seg(a.ob, 40)}"></i><b style="left:${pos}%"></b></div>
          <div class="small muted">Rango saludable para ${num(v.height)} cm${a.older ? ' (desde los 65 años)' : ''}: <b>${kg(a.healthy[0])} a ${kg(a.healthy[1])} kg</b></div>
          <div class="sugg-goal"><div class="grow"><b>Meta sugerida: ${kg(a.suggest)} kg</b><div class="small muted">${a.why}</div></div>
            ${Math.abs(a.suggest - v.goalKg) >= 0.1 ? `<button type="button" class="sm" id="use">Usar</button>` : ''}</div>
          ${
            g
              ? `<div class="goal-eval lv-${g.level}">${
                  g.reached
                    ? '<b>¡Ya estás en tu meta! 🎉</b>'
                    : `<div><b>${g.lose ? 'Bajar' : 'Subir'} ${kg(Math.abs(g.diff))} kg</b> · IMC final ${num(g.goalBmi, 1)}</div>
                  <div class="small">A un ritmo sano (${num(g.pace, 2)} kg por semana) son unas <b>${g.weeks} semanas</b>: cerca del ${fmtDate(g.eta)}.</div>
                  ${g.byDate ? `<div class="small">Para el ${fmtDate(g.byDate.date)} necesitas ${num(g.byDate.need, 2)} kg por semana: <b>${g.byDate.verdict}</b>.</div>` : ''}`
                }
                ${g.notes.map((n) => `<div class="small">• ${n}</div>`).join('')}</div>`
              : ''
          }</div>`;
        $('#use')?.addEventListener('click', () => (($('#g').value = num(a.suggest, 1)), draw()));
      };
      sheet.addEventListener('input', draw);
      draw();
      $('#clear')?.addEventListener('click', () => {
        state.settings.goalKg = 0;
        state.settings.goalDate = '';
        save();
        close();
        render();
      });
      $('#ok').onclick = () => {
        const v = read();
        if (!(v.height >= 120 && v.height <= 230)) return toast('Escribe tu estatura en centímetros (ej: 165)');
        if (!(v.weight >= 30 && v.weight <= 300)) return toast('Escribe tu peso de hoy en kilos');
        if (!v.goalKg) return toast('Escribe tu meta en kilos (o usa la sugerida)');
        if (advice?.goal?.level === 'bad') return toast(`Elige una meta de al menos ${kg(advice.healthy[0])} kg`);
        state.settings.body = { height: Math.round(v.height), age: v.age || 0 };
        state.settings.goalKg = Math.round(v.goalKg * 10) / 10;
        state.settings.goalDate = v.goalDate;
        const value = Math.round(v.weight * 10) / 10;
        if (!last || Math.abs(last.kg - value) >= 0.05) {
          state.weight = state.weight.filter((w) => w.date !== todayStr());
          state.weight.push({ id: uid(), date: todayStr(), kg: value });
        }
        save();
        close();
        toast('Meta guardada');
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
