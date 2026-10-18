// Selector de alimentos reutilizable: buscar en la base, usar alimentos propios o ingresar calorías a mano.
// Se usa para registrar comidas fuera de la dieta y para armar los ingredientes de una comida del plan.
// La cantidad se puede indicar en la unidad del alimento (2 rebanadas, ¾ taza) o en gramos (150 g).
import { state, save } from './store.js';
import { BASE_FOODS } from './foods.js';
import { esc, uid, num, toast } from './util.js';

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- cantidades ----------
const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// "3/4", "1 1/2", "1½", "0,75", "150" -> número (0 si no es válido)
export function parseAmount(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/[¼½¾⅓⅔]/g, (c) => ' ' + FRAC[c])
    .replace(/,/g, '.');
  let total = 0;
  for (const part of t.split(/\s+/).filter(Boolean)) {
    const f = part.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    const v = f ? +f[1] / +f[2] : Number(part);
    if (!Number.isFinite(v)) return 0;
    total += v;
  }
  return total > 0 ? total : 0;
}

// 0.75 -> "¾", 1.5 -> "1½", 2 -> "2", 0.6 -> "0,6"
export function fracStr(v) {
  const int = Math.floor(v + 1e-9);
  const rest = v - int;
  if (rest < 0.01) return String(int);
  const sym = Object.entries(FRAC).find(([, x]) => Math.abs(x - rest) < 0.01)?.[0];
  if (sym) return (int || '') + sym;
  return num(v, 2);
}

// Número para escribir en el campo (sin separador de miles para no confundir 1.000 con 1): 150,5
const gStr = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Plural / singular simple de la primera palabra ("unidad" <-> "unidades", "porción" <-> "porciones").
function plural(noun) {
  const [w, ...rest] = noun.split(' ');
  let p = w;
  if (/s$/i.test(w)) p = w;
  else if (/ión$/i.test(w)) p = w.slice(0, -3) + 'iones';
  else if (/[aeiouáéó]$/i.test(w)) p = w + 's';
  else p = w + 'es';
  return [p, ...rest].join(' ');
}
function singular(noun) {
  const [w, ...rest] = noun.split(' ');
  let s = w;
  if (/iones$/i.test(w)) s = w.slice(0, -5) + 'ión';
  else if (/(d|ch|l|n|r)es$/i.test(w)) s = w.slice(0, -2);
  else if (/s$/i.test(w)) s = w.slice(0, -1);
  return [s, ...rest].join(' ');
}

// Cómo se mide la porción de un alimento a partir de su texto ("1 taza (160 g)", "100 g", "3 cdas (30 g)").
export function portionOf(food) {
  const u = String(food.unit || '');
  const gm = u.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  const grams = gm ? parseFloat(gm[1].replace(',', '.')) : 0;
  const gUnit = gm ? gm[2].toLowerCase() : 'g';
  const lead = u.match(/^(\d+(?:[.,]\d+)?)\s+(.+?)\s*(?:\(.*)?$/);
  let count = 1;
  let noun = '';
  if (lead && !/^(g|ml)\b/i.test(lead[2])) {
    count = parseFloat(lead[1].replace(',', '.')) || 1;
    noun = lead[2].trim();
  } else if (!gm) noun = u.trim() || 'porción';
  return { grams, gUnit, count, noun };
}

// Texto de la cantidad elegida: "2 rebanadas", "¾ taza", "150 g".
export function amountLabel(food, mode, v) {
  const pt = portionOf(food);
  if (mode === 'g') return `${num(v, 1)} ${pt.gUnit}`;
  return `${fracStr(v)} ${v <= 1 ? singular(pt.noun) : plural(pt.noun)}`;
}

// Multiplicador sobre la porción base (lo que se usa para calorías y macros).
export function factorOf(food, mode, v) {
  const pt = portionOf(food);
  return mode === 'g' ? v / (pt.grams || 1) : v / pt.count;
}

// Calorías y macros de un alimento según el multiplicador.
export function scaled(food, qty) {
  const r1 = (x) => Math.round((x || 0) * qty * 10) / 10;
  return { kcal: Math.round((food.kcal || 0) * qty), p: r1(food.p), c: r1(food.c), f: r1(food.f) };
}

function recentFoods() {
  const seen = new Set();
  const out = [];
  for (const d of Object.keys(state.log).sort().reverse()) {
    for (const e of [...state.log[d]].reverse()) {
      if (e.per && !seen.has(e.name + e.unit)) {
        seen.add(e.name + e.unit);
        out.push({ id: 'r' + out.length, name: e.name, unit: e.unit, ...e.per });
      }
      if (out.length >= 8) return out;
    }
  }
  return out;
}

// host: elemento donde se dibuja.
// onPick({ food, qty, label, mode, amount }) se llama al confirmar. qty = multiplicador de la porción base.
// Devuelve { reset, edit(food, mode, amount) } para volver a la búsqueda o editar una cantidad ya elegida.
export function foodPicker(host, { onPick, label = 'Agregar', onCancel = null }) {
  let tab = 'search';
  let picked = null;
  let start = null; // { mode, amount } al editar

  const shell = () => {
    host.innerHTML = `<div class="seg"><button type="button" class="${tab === 'search' ? 'sel' : ''}" data-tab="search">Buscar</button><button type="button" class="${tab === 'manual' ? 'sel' : ''}" data-tab="manual">Manual</button></div><div class="pk-body"></div>`;
    host.querySelector('.seg').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      tab = b.dataset.tab;
      picked = null;
      shell();
    };
    const body = host.querySelector('.pk-body');
    if (tab === 'manual') manual(body);
    else if (picked) qty(body);
    else search(body);
  };

  function search(body) {
    body.innerHTML = `<input class="pk-q" type="search" placeholder="Buscar alimento (ej: pan, pollo, palta)" autocomplete="off" autocapitalize="off"><div class="results"></div>
      ${onCancel ? '<button type="button" class="ghost block pk-cancel">Cancelar</button>' : ''}`;
    const q = body.querySelector('.pk-q');
    const res = body.querySelector('.results');
    const all = [...state.foods, ...BASE_FOODS];
    let items = [];
    const show = () => {
      const term = plain(q.value.trim());
      let head = '';
      if (!term) {
        items = recentFoods();
        head = items.length ? '<div class="small muted" style="margin:4px 0">Recientes</div>' : '';
        if (!items.length) items = all.slice(0, 30);
      } else items = all.filter((f) => plain(f.name).includes(term)).slice(0, 40);
      res.innerHTML =
        head +
        (items
          .map(
            (f, i) => `<button type="button" class="result" data-i="${i}"><span>${esc(f.name)}${state.foods.some((x) => x.id === f.id) ? ' ✦' : ''}<small>${esc(f.unit)}</small></span><span class="k">${num(f.kcal)} kcal</span></button>`
          )
          .join('') || '<div class="empty">Sin resultados. Prueba en la pestaña Manual.</div>');
    };
    q.oninput = show;
    res.onclick = (e) => {
      const b = e.target.closest('.result');
      if (!b) return;
      picked = items[+b.dataset.i];
      start = null;
      shell();
    };
    body.querySelector('.pk-cancel')?.addEventListener('click', onCancel);
    show();
  }

  function qty(body) {
    const food = picked;
    const pt = portionOf(food);
    const modes = [];
    if (pt.noun) modes.push('unit');
    if (pt.grams) modes.push('g');
    let mode = start?.mode && modes.includes(start.mode) ? start.mode : modes[0];
    const base = (m) => (m === 'g' ? pt.grams : pt.count);
    let v = start?.amount ?? base(mode);
    const custom = state.foods.some((f) => f.id === food.id);
    const editing = !!start;
    const modeName = (m) => (m === 'g' ? (pt.gUnit === 'ml' ? 'Mililitros' : 'Gramos') : plural(pt.noun).replace(/^./, (c) => c.toUpperCase()));
    const chips = (m) =>
      m === 'g' ? [50, 100, 150, 200, 250] : pt.count === 1 ? [0.25, 0.5, 0.75, 1, 1.5, 2, 3] : [1, 2, 3, 4, 5, 6];

    body.innerHTML = `<div class="pk-food"><b>${esc(food.name)}</b>
        <div class="small muted">${esc(food.unit)} = ${num(food.kcal)} kcal${food.p || food.c || food.f ? ` · P ${num(food.p, 1)} · C ${num(food.c, 1)} · G ${num(food.f, 1)} g` : ''}</div></div>
      ${modes.length > 1 ? `<div class="seg pk-mode">${modes.map((m) => `<button type="button" data-m="${m}">${modeName(m)}</button>`).join('')}</div>` : ''}
      <label class="field">Cantidad <span class="pk-unit"></span><input class="pk-qty" inputmode="decimal" autocomplete="off"></label>
      <div class="qchips"></div>
      <div class="pk-tot"></div>
      <div class="actions">${custom && !editing ? '<button type="button" class="danger pk-rm">Quitar de mis alimentos</button>' : '<button type="button" class="ghost pk-back">Volver</button>'}
      <button type="button" class="primary pk-ok">${esc(editing ? 'Actualizar' : label)}</button></div>`;

    const input = body.querySelector('.pk-qty');
    const tot = body.querySelector('.pk-tot');
    const qc = body.querySelector('.qchips');
    const draw = () => {
      body.querySelectorAll('.pk-mode button').forEach((b) => b.classList.toggle('sel', b.dataset.m === mode));
      body.querySelector('.pk-unit').textContent = `(${mode === 'g' ? pt.gUnit : plural(pt.noun)})`;
      qc.innerHTML = chips(mode)
        .map((c) => `<button type="button" class="chip ${Math.abs(c - v) < 1e-6 ? 'sel' : ''}" data-v="${c}">${mode === 'g' ? c : fracStr(c)}</button>`)
        .join('');
      upd();
    };
    const upd = () => {
      v = parseAmount(input.value);
      if (!v) return (tot.innerHTML = '<span class="muted small">Escribe una cantidad (ej: 2, 0,75, 3/4 o 150)</span>');
      const s = scaled(food, factorOf(food, mode, v));
      tot.innerHTML = `<div class="row between"><span class="muted">${esc(amountLabel(food, mode, v))}</span><span class="mid">${num(s.kcal)} kcal</span></div>
        ${s.p || s.c || s.f ? `<div class="small muted" style="text-align:right">Proteínas ${num(s.p, 1)} g · Carbohidratos ${num(s.c, 1)} g · Grasas ${num(s.f, 1)} g</div>` : ''}`;
      qc.querySelectorAll('.chip').forEach((b) => b.classList.toggle('sel', Math.abs(+b.dataset.v - v) < 1e-6));
    };
    const confirm1 = () => {
      const a = parseAmount(input.value);
      if (!a) return toast('Ingresa una cantidad válida');
      picked = null;
      start = null;
      onPick({ food, qty: factorOf(food, mode, a), label: amountLabel(food, mode, a), mode, amount: a });
    };

    input.value = mode === 'g' ? gStr(v) : fracStr(v);
    input.oninput = upd;
    input.onkeydown = (e) => e.key === 'Enter' && confirm1();
    qc.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      input.value = mode === 'g' ? b.dataset.v : fracStr(+b.dataset.v);
      upd();
    };
    body.querySelector('.pk-mode')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.m === mode) return;
      // convierte la cantidad actual a la otra unidad (ej: 1 taza -> 160 g)
      const factor = factorOf(food, mode, parseAmount(input.value) || base(mode));
      mode = b.dataset.m;
      v = Math.round(factor * base(mode) * 100) / 100;
      input.value = mode === 'g' ? gStr(v) : fracStr(v);
      draw();
    });
    draw();
    input.focus({ preventScroll: true });
    body.querySelector('.pk-ok').onclick = confirm1;
    body.querySelector('.pk-back')?.addEventListener('click', () => {
      picked = null;
      if (editing && onCancel) {
        start = null;
        return onCancel();
      }
      start = null;
      shell();
    });
    const rm = body.querySelector('.pk-rm');
    if (rm)
      rm.onclick = () => {
        if (!confirm(`¿Quitar "${food.name}" de tus alimentos?`)) return;
        state.foods = state.foods.filter((x) => x.id !== food.id);
        save();
        picked = null;
        shell();
      };
  }

  function manual(body) {
    body.innerHTML = `<label class="field">Nombre (opcional)<input class="mn-name" maxlength="60" placeholder="Ej: Almuerzo en el trabajo" autocomplete="off"></label>
      <label class="field">Calorías (kcal)<input class="mn-kcal" inputmode="numeric" placeholder="Ej: 450"></label>
      <div class="three"><label class="field">Proteínas (g)<input class="mn-p" inputmode="decimal" placeholder="Opcional"></label>
        <label class="field">Carbohidr. (g)<input class="mn-c" inputmode="decimal" placeholder="Opcional"></label>
        <label class="field">Grasas (g)<input class="mn-f" inputmode="decimal" placeholder="Opcional"></label></div>
      <label class="row" style="margin-top:14px"><input type="checkbox" class="mn-keep" style="width:22px;min-height:22px;margin:0"> <span>Guardar como alimento mío</span></label>
      <div class="actions">${onCancel ? '<button type="button" class="ghost mn-cancel">Cancelar</button>' : ''}<button type="button" class="primary mn-ok">${esc(label)}</button></div>`;
    body.querySelector('.mn-cancel')?.addEventListener('click', onCancel);
    body.querySelector('.mn-ok').onclick = () => {
      const kcal = parseInt(body.querySelector('.mn-kcal').value, 10);
      if (!(kcal >= 0)) return toast('Ingresa las calorías');
      const g = (c) => Math.round(parseAmount(body.querySelector(c).value) * 10) / 10;
      const food = { id: uid(), name: body.querySelector('.mn-name').value.trim() || 'Comida', unit: '1 porción', kcal, p: g('.mn-p'), c: g('.mn-c'), f: g('.mn-f') };
      if (body.querySelector('.mn-keep').checked) {
        state.foods.unshift(food);
        save();
      }
      onPick({ food, qty: 1, label: '1 porción', mode: 'unit', amount: 1 });
    };
  }

  shell();
  return {
    reset: () => ((picked = null), (start = null), (tab = 'search'), shell()),
    edit: (food, mode, amount) => ((tab = 'search'), (picked = food), (start = { mode, amount }), shell()),
  };
}
