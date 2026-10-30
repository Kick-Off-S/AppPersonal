// Plan de dieta por día de la semana. Cada comida puede tener calorías: al marcarla como cumplida
// en "Hoy", esas calorías se suman al día automáticamente.
import { state, save, clean, normalizePlan } from '../store.js';
import { foodPicker, scaled } from '../foodpicker.js';
import { esc, uid, num, openSheet, toast, todayStr, weekdayIndex, shareFile, DAYS, DAYS_SHORT } from '../util.js';
import { mealSnapshot, latestWeight } from '../calc.js';
import { ACTIVITY, GOALS, evaluate, notEligible, generatePlan } from '../nutrition.js';

let root;
let day = 0; // 0 = lunes

// gramos: "12,5", "12.5" o "1.234,5" -> número (vacío = 0)
const gr = (v) => {
  let t = String(v || '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Math.round((parseFloat(t) || 0) * 10) / 10;
};
const meals = (i) => state.diet.plan[i] || (state.diet.plan[i] = []);
const sorted = (i) => [...meals(i)].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

export function mount(el) {
  root = el;
  day = weekdayIndex(todayStr());
  root.onclick = onClick;
  render();
}

function render() {
  const list = sorted(day);
  const today = weekdayIndex(todayStr());
  const total = list.reduce((a, m) => a + (m.kcal || 0), 0);
  const sumOf = (k) => Math.round(list.reduce((a, m) => a + (m[k] || 0), 0) * 10) / 10;
  const P = sumOf('p'), C = sumOf('c'), F = sumOf('f');
  // % de las calorías que aporta cada macro (4 kcal/g proteína y carbohidrato, 9 kcal/g grasa)
  const mk = P * 4 + C * 4 + F * 9;
  const pct = (g, k) => (mk ? Math.round(((g * k) / mk) * 100) : 0);
  const noMacros = list.filter((m) => !hasMacros(m)).length;
  const goal = state.settings.kcalGoal || 0;
  const mg = state.settings.macroGoals;
  const chips = DAYS_SHORT.map(
    (l, i) => `<button class="chip ${i === day ? 'sel' : ''} ${i === today ? 'today' : ''}" data-act="day" data-i="${i}" aria-label="${DAYS[i]}">${l}</button>`
  ).join('');

  let body;
  if (!list.length) {
    const hasAny = Object.values(state.diet.plan).some((d) => d.length);
    body = `<div class="card empty"><b>${hasAny ? 'Sin comidas este día' : 'Aún no tienes un plan'}</b>
      ${hasAny ? 'Agrega las comidas de este día o cópialas desde otro.' : 'Ingresa el plan que te dio tu nutricionista: comidas, horarios, qué incluye cada una y sus calorías.'}
      ${hasAny ? '' : '<div class="actions"><button data-act="example">Cargar ejemplo editable</button></div>'}</div>`;
  } else {
    body = `<div class="card">
      <div class="row between"><div class="mid">${DAYS[day]}</div><div class="amount">${num(total)} <span class="muted small">kcal</span></div></div>
      ${goal ? `<div class="small muted">Meta diaria ${num(goal)} kcal · ${total > goal ? `<span class="warn">${num(total - goal)} sobre la meta</span>` : `faltan ${num(goal - total)}`}</div>` : ''}
      <div class="macros">
        <div><b>${num(P, 1)} g</b><span>Proteínas</span>${mg ? `<em>meta ${num(mg.p)} g</em>` : mk ? `<em>${pct(P, 4)}% de las kcal</em>` : ''}</div>
        <div><b>${num(C, 1)} g</b><span>Carbohidratos</span>${mg ? `<em>meta ${num(mg.c)} g</em>` : mk ? `<em>${pct(C, 4)}% de las kcal</em>` : ''}</div>
        <div><b>${num(F, 1)} g</b><span>Grasas</span>${mg ? `<em>meta ${num(mg.f)} g</em>` : mk ? `<em>${pct(F, 9)}% de las kcal</em>` : ''}</div>
      </div>
      ${
        noMacros
          ? `<div class="banner warn small" style="margin:10px 0 4px">${
              noMacros === 1 ? '1 comida no tiene' : `${noMacros} comidas no tienen`
            } proteínas, carbohidratos ni grasas, así que el total está incompleto. ${noMacros > 1 ? 'Toca cada una' : 'Tócala'} para agregar sus alimentos o escribir los gramos.</div>`
          : ''
      }
      <div class="small muted" style="margin:8px 0 4px">Se suman en <b>Hoy</b> cuando marcas cada comida como cumplida.</div>
      ${list
        .map(
          (m) => `<div class="item" data-act="edit" data-id="${m.id}">
          <div class="grow">
            <div class="t">${m.time ? `<span class="time">${esc(m.time)}</span> · ` : ''}${esc(m.name)}</div>
            ${mealDetail(m) ? `<div class="s pre">${esc(mealDetail(m))}</div>` : ''}
            ${macroChips(m) || '<div class="s warn">Sin proteínas, carbos ni grasas</div>'}
          </div>
          <div class="amount small">${m.kcal ? num(m.kcal) + ' kcal' : '<span class="warn">sin kcal</span>'}</div>
          <button class="ghost icon" data-act="edit" data-id="${m.id}" aria-label="Editar">✎</button></div>`
        )
        .join('')}</div>`;
  }

  const prof = state.settings.profile;
  const evalCard = prof
    ? `<div class="banner small" style="display:flex;align-items:center;gap:8px;justify-content:space-between"><span>🧮 Meta guía: <b>${num(state.settings.kcalGoal)} kcal</b>${mg ? ` · P ${num(mg.p)} · C ${num(mg.c)} · G ${num(mg.f)} g` : ''} · ${esc(GOALS[prof.goal]?.name || '')}</span><button class="ghost sm" data-act="eval" style="flex:none">Actualizar</button></div>`
    : `<div class="card"><b>🧮 ¿No tienes un plan de nutricionista?</b><div class="small muted" style="margin-top:4px">Calcula tus calorías y macros según tu edad, estatura, peso y objetivo, y genera un plan guía de la semana.</div>
        <button class="block" data-act="eval" style="margin-top:10px">Hacer mi evaluación</button></div>`;
  root.innerHTML = `${evalCard}<div class="chips">${chips}</div>${body}
    <div class="actions"><button class="primary wide" data-act="add">+ Agregar comida</button>
    ${list.length ? '<button data-act="copy">Copiar día</button>' : ''}</div>
    <div class="row" style="justify-content:center;gap:18px;margin-top:14px">
      ${Object.values(state.diet.plan).some((d) => d.length) ? '<button class="ghost sm" data-act="share">Compartir plan</button>' : ''}
      <button class="ghost sm" data-act="import">Importar plan</button>
    </div>
    <input type="file" id="planfile" accept=".json,application/json" hidden>`;
  root.querySelector('#planfile').onchange = (e) => importPlan(e.target.files[0], e.target);
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, i, id } = t.dataset;
  if (act === 'day') {
    day = +i;
    render();
  } else if (act === 'add') mealSheet();
  else if (act === 'edit') mealSheet(meals(day).find((m) => m.id === id));
  else if (act === 'copy') copySheet();
  else if (act === 'example') loadExample();
  else if (act === 'share') sharePlan();
  else if (act === 'eval') evalSheet();
  else if (act === 'import') root.querySelector('#planfile').click();
}

// ---------- evaluación y plan guía ----------
const GUIDE = 'Esto es solo una guía calculada con fórmulas generales. No reemplaza a un nutricionista: consulta con un profesional, sobre todo si tienes alguna condición de salud.';

function evalSheet() {
  const pr = state.settings.profile || {};
  const w = latestWeight();
  let sex = pr.sex || 'f';
  let goal = pr.goal || 'keep';
  openSheet(
    `<h3>Evaluación nutricional</h3>
    <div class="banner warn small" style="margin-top:4px">${GUIDE}</div>
    <form id="ev">
      <label class="field">Sexo</label>
      <div class="seg" id="sex"><button type="button" data-v="f">Mujer</button><button type="button" data-v="m">Hombre</button></div>
      <div class="three"><label class="field">Edad<input name="age" inputmode="numeric" value="${pr.age || state.settings.body?.age || ''}" placeholder="Años"></label>
        <label class="field">Estatura<input name="height" inputmode="numeric" value="${pr.height || state.settings.body?.height || ''}" placeholder="cm"></label>
        <label class="field">Peso<input name="weight" inputmode="decimal" value="${w?.kg ?? pr.weight ?? ''}" placeholder="kg"></label></div>
      <label class="field">Actividad física<select name="activity">${ACTIVITY.map((a) => `<option value="${a.id}" ${a.id === (pr.activity || 'light') ? 'selected' : ''}>${a.name}: ${a.desc}</option>`).join('')}</select></label>
      <label class="field">Objetivo</label>
      <div class="seg" id="goal">${Object.entries(GOALS).map(([k, g]) => `<button type="button" data-v="${k}">${g.short}</button>`).join('')}</div>
      <label class="cuotas"><input type="checkbox" name="pregnant"> <span>Estoy embarazada o en lactancia</span></label>
      <label class="cuotas"><input type="checkbox" name="condition"> <span>Tengo una enfermedad o condición de salud (diabetes, renal, cardíaca, trastorno alimentario…)</span></label>
      <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Calcular</button></div>
    </form>
    <div id="res"></div>`,
    (sheet, close) => {
      const $ = (q) => sheet.querySelector(q);
      const segs = () => {
        sheet.querySelectorAll('#sex button').forEach((b) => b.classList.toggle('sel', b.dataset.v === sex));
        sheet.querySelectorAll('#goal button').forEach((b) => b.classList.toggle('sel', b.dataset.v === goal));
      };
      $('#sex').onclick = (e) => e.target.closest('[data-v]') && ((sex = e.target.closest('[data-v]').dataset.v), segs());
      $('#goal').onclick = (e) => e.target.closest('[data-v]') && ((goal = e.target.closest('[data-v]').dataset.v), segs());
      segs();
      $('#ev').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const n = (k) => parseFloat(String(f.get(k) || '').replace(',', '.'));
        const data = { sex, goal, age: Math.round(n('age')), height: n('height'), weight: n('weight'), activity: f.get('activity') };
        if (!(data.age > 0 && data.age < 120)) return toast('Escribe tu edad');
        if (!(data.height >= 120 && data.height <= 230)) return toast('Escribe tu estatura en centímetros (ej: 165)');
        if (!(data.weight >= 30 && data.weight <= 300)) return toast('Escribe tu peso en kilos (ej: 68,5)');
        const no = notEligible({ age: data.age, pregnant: !!f.get('pregnant'), condition: !!f.get('condition') });
        if (no) return ($('#res').innerHTML = `<div class="banner warn">${esc(no)}</div>`);
        const r = evaluate(data);
        $('#res').innerHTML = `<div class="card" style="box-shadow:none">
          <div class="row between"><span class="muted small">Tu meta diaria (guía)</span><b class="mid">${num(r.kcal)} kcal</b></div>
          <div class="macros m4" style="margin-top:10px"><div><b>${num(r.p)}</b><span>Proteína g</span></div><div><b>${num(r.c)}</b><span>Carbos g</span></div><div><b>${num(r.f)}</b><span>Grasa g</span></div><div><b>${num(r.bmi, 1)}</b><span>IMC</span></div></div>
          <div class="small muted" style="margin-top:8px">Gasto en reposo ~${num(r.bmr)} kcal · gasto diario estimado ~${num(r.tdee)} kcal · IMC ${num(r.bmi, 1)} (${r.bmiCat}).${r.floored ? ' La meta se dejó en un mínimo seguro: bajar más rápido no es recomendable sin supervisión.' : ''}</div>
          <label class="cuotas"><input type="checkbox" id="logw" ${!w || Math.abs(w.kg - data.weight) >= 0.1 || w.date !== todayStr() ? 'checked' : ''}> <span>Registrar ${num(data.weight, 1)} kg como peso de hoy</span></label>
          <div class="actions"><button type="button" id="goals">Usar solo las metas</button><button type="button" class="primary" id="plan">Metas + plan de la semana</button></div>
          <p class="small muted" style="margin-bottom:0">El plan es un punto de partida editable: cada comida trae sus alimentos y cantidades. ${GUIDE}</p></div>`;
        $('#res').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const apply = (withPlan) => {
          if (withPlan && Object.values(state.diet.plan).some((d) => d.length) && !confirm('Se reemplazará tu plan actual por el plan guía. ¿Continuar? (Si quieres conservarlo, primero usa "Compartir plan").')) return;
          state.settings.profile = { ...data, at: todayStr() };
          state.settings.body = { height: Math.round(data.height), age: data.age };
          state.settings.kcalGoal = r.kcal;
          state.settings.macroGoals = { p: r.p, c: r.c, f: r.f };
          if ($('#logw').checked) {
            state.weight = state.weight.filter((x) => x.date !== todayStr());
            state.weight.push({ id: uid(), date: todayStr(), kg: Math.round(data.weight * 10) / 10 });
          }
          if (withPlan) state.diet.plan = generatePlan(r.kcal, r.p);
          save();
          close();
          toast(withPlan ? 'Plan guía listo: revísalo y ajústalo a tu gusto' : 'Metas guardadas');
          render();
        };
        $('#goals').onclick = () => apply(false);
        $('#plan').onclick = () => apply(true);
      });
    }
  );
}

// ---------- compartir / importar el plan ----------
// Un archivo con las comidas de la semana (y sus alimentos). Sirve para pasar el plan a otro teléfono,
// a un amigo, o recibirlo del nutricionista. No incluye nada más (ni calorías del día, ni finanzas).
const planSummary = (plan) => {
  const days = Object.values(plan).filter((d) => d?.length);
  const meals = days.reduce((a, d) => a + d.length, 0);
  const kcal = days.length ? Math.round(days.reduce((a, d) => a + d.reduce((x, m) => x + (m.kcal || 0), 0), 0) / days.length) : 0;
  return { days: days.length, meals, kcal };
};

async function sharePlan() {
  const author = state.settings.name || '';
  const payload = { app: 'gestion-personal', kind: 'diet-plan', v: 1, author, exportedAt: new Date().toISOString(), kcalGoal: state.settings.kcalGoal || 0, plan: state.diet.plan };
  try {
    if (await shareFile(`plan-dieta${author ? '-' + author.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}.json`, JSON.stringify(payload), 'application/json', 'Plan de dieta')) toast('Plan listo para compartir');
  } catch {
    toast('No se pudo compartir el plan');
  }
}

async function importPlan(file, input) {
  if (!file) return;
  try {
    const p = JSON.parse(await file.text());
    if (p?.app !== 'gestion-personal' || p.kind !== 'diet-plan' || !p.plan || typeof p.plan !== 'object') throw new Error('formato');
    // mismo limpiado que los respaldos: un archivo ajeno no puede inyectar código
    const plan = normalizePlan(clean(p.plan)); // limpio y con tipos correctos (listas, números)
    const sum = planSummary(plan);
    openSheet(
      `<h3>Importar plan de dieta</h3>
      <div class="card" style="box-shadow:none;margin:8px 0">${p.author ? `<b>Plan de ${esc(p.author)}</b><br>` : ''}
        <span class="small muted">${sum.days} día${sum.days === 1 ? '' : 's'} · ${sum.meals} comidas · ~${num(sum.kcal)} kcal por día${p.kcalGoal ? ` · meta ${num(p.kcalGoal)} kcal` : ''}</span></div>
      <p class="small muted">Reemplaza las comidas de tu plan actual (si quieres conservarlo, compártelo antes como archivo). Lo que ya marcaste como cumplido en días anteriores se mantiene en tu historial.</p>
      ${p.kcalGoal ? `<label class="cuotas"><input type="checkbox" id="goal" checked> <span>Usar también su meta de ${num(p.kcalGoal)} kcal</span></label>` : ''}
      <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Reemplazar mi plan</button></div>`,
      (sheet, close) =>
        (sheet.querySelector('#ok').onclick = () => {
          for (let i = 0; i < 7; i++) state.diet.plan[i] = (plan[i] || []).map((m) => ({ ...m, id: uid() }));
          const goal = Math.max(0, Number(p.kcalGoal) || 0);
          if (goal && sheet.querySelector('#goal')?.checked) state.settings.kcalGoal = goal;
          save();
          close();
          toast('Plan importado');
          render();
        })
    );
  } catch {
    toast('Ese archivo no es un plan de dieta válido');
  } finally {
    input.value = '';
  }
}

function dayPicker(selected, exclude) {
  return `<div class="chips" id="days">${DAYS_SHORT.map(
    (l, i) =>
      `<button type="button" class="chip ${selected.includes(i) ? 'sel' : ''}" data-i="${i}" ${i === exclude ? 'disabled style="opacity:.5"' : ''} aria-label="${DAYS[i]}">${l}</button>`
  ).join('')}</div>`;
}

function bindPicker(sheet, selected) {
  sheet.querySelector('#days').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b || b.disabled) return;
    const i = +b.dataset.i;
    const at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1);
    else selected.push(i);
    b.classList.toggle('sel');
  });
}

// Ingredientes de una comida: { id, name, label, qty, mode, amount, kcal, p, c, f, food: { name, unit, kcal, p, c, f } }
const itemsText = (items) => (items || []).map((it) => `${it.name} · ${it.label}`).join('\n');
// "P 30 · C 45 · G 12 g" de una comida (vacío si no tiene macros)
export const hasMacros = (m) => !!(m.p || m.c || m.f);
export const macroChips = (m) =>
  hasMacros(m)
    ? `<div class="mchips"><span class="mc p">P ${num(m.p || 0, 1)}</span><span class="mc c">C ${num(m.c || 0, 1)}</span><span class="mc f">G ${num(m.f || 0, 1)}</span><span class="muted">g</span></div>`
    : '';
export const mealDetail = (m) => [itemsText(m.items), m.desc].filter(Boolean).join('\n');

function mealSheet(meal) {
  const editing = !!meal;
  const selected = [day];
  let items = (meal?.items || []).map((it) => ({ ...it }));
  openSheet(
    `<h3>${editing ? 'Editar comida' : 'Nueva comida'}</h3>
      <div class="two">
        <label class="field">Comida<input id="name" list="mealnames" maxlength="40" value="${esc(meal?.name)}" placeholder="Ej: Desayuno" autocomplete="off"></label>
        <label class="field">Hora<input id="time" type="time" value="${esc(meal?.time)}"></label>
      </div>
      <datalist id="mealnames"><option>Desayuno</option><option>Colación</option><option>Almuerzo</option><option>Once</option><option>Cena</option></datalist>

      <label class="field">Alimentos</label>
      <div class="ing" id="ing"></div>
      <button type="button" class="block" id="add-ing">+ Agregar alimento</button>
      <div id="pk" hidden class="pk-box"></div>

      <label class="field">Notas (opcional)<textarea id="desc" maxlength="500" placeholder="Ej: té sin azúcar, ensalada libre">${esc(meal?.desc)}</textarea></label>
      <label class="field">Calorías de esta comida<input id="kcal" inputmode="numeric" value="${meal?.kcal || ''}" placeholder="Se calculan con los alimentos"></label>
      <div class="three"><label class="field">Proteínas (g)<input id="p" inputmode="decimal" value="${meal?.p || ''}" placeholder="—"></label>
        <label class="field">Carbohidr. (g)<input id="c" inputmode="decimal" value="${meal?.c || ''}" placeholder="—"></label>
        <label class="field">Grasas (g)<input id="f" inputmode="decimal" value="${meal?.f || ''}" placeholder="—"></label></div>
      <div class="small muted" id="auto-hint" style="margin-top:6px"></div>
      ${editing ? '' : `<label class="field">Repetir en estos días</label>${dayPicker(selected)}`}
      <div class="actions">
        ${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
        <button class="primary" id="save">Guardar</button>
      </div>`,
    (sheet, close) => {
      if (!editing) bindPicker(sheet, selected);
      const $ = (s) => sheet.querySelector(s);
      const pk = $('#pk');
      const addBtn = $('#add-ing');
      let editId = null; // ingrediente que se está editando
      const fmtG = (v) => (v ? String(Math.round(v * 10) / 10).replace('.', ',') : '');

      // Con alimentos, las calorías y macros se calculan solas (se pueden ajustar a mano después).
      const recalc = () => {
        if (!items.length) return;
        const t = items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.p, c: a.c + it.c, f: a.f + it.f }), { kcal: 0, p: 0, c: 0, f: 0 });
        $('#kcal').value = Math.round(t.kcal);
        $('#p').value = fmtG(t.p);
        $('#c').value = fmtG(t.c);
        $('#f').value = fmtG(t.f);
      };
      const drawItems = () => {
        $('#ing').innerHTML = items.length
          ? items
              .map(
                (it) => `<div class="item" data-id="${it.id}"><div class="grow" data-edit="${it.id}"><div class="t">${esc(it.name)}</div><div class="s">${esc(it.label)}${it.p || it.c || it.f ? ` · P ${num(it.p, 1)} · C ${num(it.c, 1)} · G ${num(it.f, 1)}` : ''}</div></div>
                <div class="amount small">${num(it.kcal)} kcal</div><button type="button" class="ghost icon sm" data-rm="${it.id}" aria-label="Quitar">✕</button></div>`
              )
              .join('')
          : '<div class="small muted">Agrega lo que incluye la comida (ej: 2 rebanadas de pan integral, 150 g de pollo) y las calorías, proteínas, carbohidratos y grasas se calculan solas.</div>';
        $('#auto-hint').textContent = items.length ? 'Calculado con los alimentos. Puedes ajustarlo a mano.' : '';
      };
      const closePicker = () => {
        pk.hidden = true;
        addBtn.hidden = false;
        editId = null;
      };
      const picker = foodPicker(pk, {
        label: 'Agregar a la comida',
        onCancel: closePicker,
        onPick({ food, qty, label, mode, amount, size }) {
          const it = {
            id: editId || uid(),
            name: food.name,
            label,
            qty,
            mode,
            amount,
            size,
            ...scaled(food, qty),
            food: { id: food.id, name: food.name, unit: food.unit, kcal: food.kcal, p: food.p || 0, c: food.c || 0, f: food.f || 0, ...(food.sizes ? { sizes: food.sizes } : {}), ...(food.parts ? { parts: food.parts } : {}) },
          };
          if (editId) items = items.map((x) => (x.id === editId ? it : x));
          else items = [...items, it];
          closePicker();
          picker.reset();
          drawItems();
          recalc();
          toast(`${food.name}: ${num(it.kcal)} kcal`);
        },
      });
      addBtn.onclick = () => {
        editId = null;
        picker.reset();
        pk.hidden = false;
        addBtn.hidden = true;
        pk.querySelector('.pk-q')?.focus({ preventScroll: true });
        pk.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      $('#ing').onclick = (e) => {
        const rm = e.target.closest('[data-rm]');
        const ed = e.target.closest('[data-edit]');
        if (rm) {
          items = items.filter((x) => x.id !== rm.dataset.rm);
          drawItems();
          recalc();
          if (!items.length) for (const k of ['#kcal', '#p', '#c', '#f']) $(k).value = '';
        } else if (ed) {
          const it = items.find((x) => x.id === ed.dataset.edit);
          editId = it.id;
          picker.edit(it.food, it.mode, it.amount, it.size);
          pk.hidden = false;
          addBtn.hidden = true;
          pk.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };
      drawItems();

      $('#save').onclick = () => {
        const data = {
          name: $('#name').value.trim(),
          time: $('#time').value,
          desc: $('#desc').value.trim(),
          kcal: parseInt($('#kcal').value, 10) || 0,
          p: gr($('#p').value),
          c: gr($('#c').value),
          f: gr($('#f').value),
          items,
        };
        if (!data.name) return toast('Ponle un nombre a la comida');
        if (editing) {
          Object.assign(meal, data);
          // si ya estaba marcada hoy (o en días futuros), su foto se actualiza con los valores nuevos
          for (const [d, marks] of Object.entries(state.diet.done)) if (d >= todayStr() && marks[meal.id]) marks[meal.id] = mealSnapshot(meal);
        }
        else for (const i of selected.length ? selected : [day]) meals(i).push({ id: uid(), ...structuredClone(data) });
        save();
        close();
        render();
      };
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${meal.name}" de ${DAYS[day]}?`)) return;
        state.diet.plan[day] = meals(day).filter((m) => m.id !== meal.id);
        // solo hoy en adelante: los días pasados conservan lo que se comió (foto guardada)
        for (const [d, marks] of Object.entries(state.diet.done)) if (d >= todayStr()) delete marks[meal.id];
        save();
        close();
        render();
      });
    }
  );
}

function copySheet() {
  const selected = [];
  openSheet(
    `<h3>Copiar ${DAYS[day]}</h3>
    <p class="muted small">Elige los días que tendrán estas mismas comidas. Reemplaza lo que ya tengan.</p>
    ${dayPicker(selected, day)}
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Copiar</button></div>`,
    (sheet, close) => {
      bindPicker(sheet, selected);
      sheet.querySelector('#ok').addEventListener('click', () => {
        if (!selected.length) return toast('Elige al menos un día');
        for (const i of selected) state.diet.plan[i] = meals(day).map((m) => ({ ...structuredClone(m), id: uid() }));
        save();
        close();
        toast('Comidas copiadas');
        render();
      });
    }
  );
}

function loadExample() {
  const ex = [
    { name: 'Desayuno', time: '08:00', kcal: 350, desc: 'Ejemplo: pan integral con palta + 1 huevo + té sin azúcar' },
    { name: 'Colación', time: '11:00', kcal: 150, desc: 'Ejemplo: 1 fruta + 1 yogurt natural' },
    { name: 'Almuerzo', time: '13:30', kcal: 600, desc: 'Ejemplo: pollo o pescado + arroz o papas + ensalada' },
    { name: 'Once', time: '17:30', kcal: 300, desc: 'Ejemplo: 1 pan con queso fresco + té' },
    { name: 'Cena', time: '20:30', kcal: 400, desc: 'Ejemplo: tortilla de verduras + ensalada' },
  ];
  for (let i = 0; i < 7; i++) state.diet.plan[i] = ex.map((m) => ({ ...m, id: uid() }));
  save();
  toast('Ejemplo cargado: edítalo con tu plan');
  render();
}
