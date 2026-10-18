// Plan de dieta por día de la semana. Cada comida puede tener calorías: al marcarla como cumplida
// en "Hoy", esas calorías se suman al día automáticamente.
import { state, save } from '../store.js';
import { foodPicker, scaled } from '../foodpicker.js';
import { esc, uid, num, openSheet, toast, todayStr, weekdayIndex, DAYS, DAYS_SHORT } from '../util.js';

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
      <div class="small muted" style="margin-bottom:4px">Las calorías se suman en <b>Hoy</b> cuando marcas cada comida como cumplida.</div>
      ${list
        .map(
          (m) => `<div class="item" data-act="edit" data-id="${m.id}">
          <div class="grow">
            <div class="t">${m.time ? `<span class="time">${esc(m.time)}</span> · ` : ''}${esc(m.name)}</div>
            ${mealDetail(m) ? `<div class="s pre">${esc(mealDetail(m))}</div>` : ''}
          </div>
          <div class="amount small">${m.kcal ? num(m.kcal) + ' kcal' : '<span class="warn">sin kcal</span>'}</div>
          <button class="ghost icon" data-act="edit" data-id="${m.id}" aria-label="Editar">✎</button></div>`
        )
        .join('')}</div>`;
  }

  root.innerHTML = `<div class="chips">${chips}</div>${body}
    <div class="actions"><button class="primary wide" data-act="add">+ Agregar comida</button>
    ${list.length ? '<button data-act="copy">Copiar día</button>' : ''}</div>`;
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
            food: { name: food.name, unit: food.unit, kcal: food.kcal, p: food.p || 0, c: food.c || 0, f: food.f || 0, ...(food.sizes ? { sizes: food.sizes } : {}) },
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
        if (editing) Object.assign(meal, data);
        else for (const i of selected.length ? selected : [day]) meals(i).push({ id: uid(), ...structuredClone(data) });
        save();
        close();
        render();
      };
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${meal.name}" de ${DAYS[day]}?`)) return;
        state.diet.plan[day] = meals(day).filter((m) => m.id !== meal.id);
        for (const d of Object.values(state.diet.done)) delete d[meal.id];
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
