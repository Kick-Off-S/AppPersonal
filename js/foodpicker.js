// Selector de alimentos reutilizable: buscar en la base, usar alimentos propios o ingresar calorías a mano.
// Se usa para registrar comidas fuera de la dieta y para armar los ingredientes de una comida del plan.
// La cantidad se puede indicar en la unidad del alimento (2 rebanadas, ¾ taza) o en gramos (150 g).
import { state, save } from './store.js';
import { BASE_FOODS } from './foods.js';
import { esc, uid, num, toast } from './util.js';
import { scanBarcode, lookupBarcode } from './scanner.js';

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

// Teclas del teclado numérico de la cantidad: [valor, texto]
const KEYS = [
  ['1', '1'], ['2', '2'], ['3', '3'], ['del', '⌫'],
  ['4', '4'], ['5', '5'], ['6', '6'], [',', ','],
  ['7', '7'], ['8', '8'], ['9', '9'], ['/', '/'],
  ['sp', 'espacio'], ['0', '0'], ['clr', 'Borrar'], ['ok', 'Listo'],
];

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

// Tamaño por defecto: el que coincide con la porción base (si no, M).
export function defaultSize(food) {
  if (!food.sizes) return null;
  const g = portionOf(food).grams;
  return Object.keys(food.sizes).find((k) => food.sizes[k] === g) || ('M' in food.sizes ? 'M' : Object.keys(food.sizes)[0]);
}

// Proporción del tamaño elegido respecto a la porción base (ej: tortilla L 60 g / base 40 g = 1,5).
const sizeRatio = (food, size) => (size && food.sizes?.[size] && portionOf(food).grams ? food.sizes[size] / portionOf(food).grams : 1);

// Texto de la cantidad elegida: "2 rebanadas", "¾ taza", "150 g", "2 unidades L (120 g)".
export function amountLabel(food, mode, v, size = null) {
  const pt = portionOf(food);
  if (mode === 'g') return `${num(v, 1)} ${pt.gUnit}`;
  const txt = `${fracStr(v)} ${v <= 1 ? singular(pt.noun) : plural(pt.noun)}`;
  if (!size || !food.sizes?.[size]) return txt;
  return `${txt} ${size} (${num((v / pt.count) * food.sizes[size])} ${pt.gUnit})`;
}

// Multiplicador sobre la porción base (lo que se usa para calorías y macros).
export function factorOf(food, mode, v, size = null) {
  const pt = portionOf(food);
  return mode === 'g' ? v / (pt.grams || 1) : (v / pt.count) * sizeRatio(food, size);
}

// Calorías y macros de un alimento según el multiplicador.
export function scaled(food, qty) {
  const r1 = (x) => Math.round((x || 0) * qty * 10) / 10;
  return { kcal: Math.round((food.kcal || 0) * qty), p: r1(food.p), c: r1(food.c), f: r1(food.f) };
}

function recentFoods() {
  const known = [...state.foods, ...BASE_FOODS];
  const seen = new Set();
  const out = [];
  for (const d of Object.keys(state.log).sort().reverse()) {
    for (const e of [...state.log[d]].reverse()) {
      if (e.per && !seen.has(e.name + e.unit)) {
        seen.add(e.name + e.unit);
        // si sigue existiendo en la base, se usa tal cual (conserva tamaños y valores al día)
        out.push(known.find((f) => f.name === e.name && f.unit === e.unit) || { id: 'r' + out.length, name: e.name, unit: e.unit, ...e.per });
      }
      if (out.length >= 8) return out;
    }
  }
  return out;
}

// host: elemento donde se dibuja.
// onPick({ food, qty, label, mode, amount }) se llama al confirmar. qty = multiplicador de la porción base.
// Devuelve { reset, edit(food, mode, amount) } para volver a la búsqueda o editar una cantidad ya elegida.
// Gramos de un ingrediente según lo elegido (null si el alimento no indica gramos).
function gramsOf(food, mode, amount, qty) {
  if (mode === 'g') return amount;
  const g = portionOf(food).grams;
  return g ? qty * g : null;
}

// build: false oculta la pestaña "Armar" (se usa para el buscador de ingredientes dentro de Armar).
export function foodPicker(host, { onPick, label = 'Agregar', onCancel = null, build = true }) {
  let tab = 'search';
  let picked = null;
  let start = null; // { mode, amount } al editar
  // preparación en curso en "Armar" (se mantiene al cambiar de pestaña)
  let recipe = { id: null, name: '', items: [], keep: false };
  let pendingCode = null; // código escaneado que no estaba en la base (se guarda con el alimento manual)

  const tabs = [['search', 'Buscar'], ...(build ? [['build', 'Armar']] : []), ['manual', 'Manual']];
  const shell = () => {
    host.innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<button type="button" class="${tab === k ? 'sel' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="pk-body"></div>`;
    host.querySelector('.seg').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      tab = b.dataset.tab;
      picked = null;
      shell();
    };
    const body = host.querySelector('.pk-body');
    if (tab === 'manual') manual(body);
    else if (tab === 'build') buildView(body);
    else if (picked) qty(body);
    else search(body);
  };

  function search(body) {
    body.innerHTML = `<div class="searchrow"><input class="pk-q" type="search" placeholder="Buscar alimento (ej: pan, pollo, palta)" autocomplete="off" autocapitalize="off">
      <button type="button" class="pk-scan" aria-label="Escanear código de barras" title="Escanear código de barras">📷</button></div><div class="results"></div>
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
    body.querySelector('.pk-scan').onclick = async () => {
      const code = await scanBarcode();
      if (!code) return;
      toast('Buscando el producto…');
      const r = await lookupBarcode(code);
      if (r.food) {
        if (r.fresh) toast(`${r.food.name}: guardado en tus alimentos ✦`);
        picked = r.food;
        start = null;
        return shell();
      }
      if (r.offline) return toast('Sin conexión: no se pudo buscar el producto');
      // no está en Open Food Facts: se registra a mano y queda asociado al código para la próxima vez
      pendingCode = code;
      tab = 'manual';
      shell();
      const nm = host.querySelector('.mn-name');
      if (nm && r.name) nm.value = r.name;
      toast('No está en la base pública. Regístralo una vez con los datos del envase.');
    };
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
    let size = start?.size && food.sizes?.[start.size] ? start.size : defaultSize(food);
    const custom = state.foods.some((f) => f.id === food.id);
    const editing = !!start && !start.fresh;
    const modeName = (m) => (m === 'g' ? (pt.gUnit === 'ml' ? 'Mililitros' : 'Gramos') : plural(pt.noun).replace(/^./, (c) => c.toUpperCase()));
    const chips = (m) =>
      m === 'g' ? [50, 100, 150, 200, 250] : pt.count === 1 ? [0.25, 0.5, 0.75, 1, 1.5, 2] : [1, 2, 3, 4, 5, 6];

    body.innerHTML = `<div class="pk-food"><b>${esc(food.name)}</b>
        <div class="small muted">${esc(food.unit)} = ${num(food.kcal)} kcal${food.p || food.c || food.f ? ` · P ${num(food.p, 1)} · C ${num(food.c, 1)} · G ${num(food.f, 1)} g` : ''}</div></div>
      ${modes.length > 1 ? `<div class="seg pk-mode">${modes.map((m) => `<button type="button" data-m="${m}">${esc(modeName(m))}</button>`).join('')}</div>` : ''}
      ${
        food.sizes
          ? `<div class="pk-sizes"><span class="small muted">Tamaño</span><div class="seg sizes">${Object.entries(food.sizes)
              .map(([k, g]) => `<button type="button" data-s="${k}"><b>${k}</b><small>${num(g)} ${pt.gUnit}</small></button>`)
              .join('')}</div></div>`
          : ''
      }
      <label class="field" for="pk-qty">Cantidad <span class="pk-unit"></span></label>
      <div class="stepper"><button type="button" class="pk-minus" aria-label="Menos">−</button>
        <input id="pk-qty" class="pk-qty" readonly inputmode="none" autocomplete="off" aria-label="Cantidad: toca para escribir">
        <button type="button" class="pk-plus" aria-label="Más">+</button></div>
      <div class="keypad" hidden>${KEYS.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === 'ok' ? 'primary' : ''}">${l}</button>`).join('')}</div>
      <div class="qchips"></div>
      <div class="pk-tot"></div>
      ${food.parts?.length && build ? `<div class="small muted" style="margin-top:8px">${esc(food.parts.map((x) => x.name).join(', '))} · <a href="#" class="pk-recipe">Editar ingredientes</a></div>` : ''}
      <div class="actions">${custom && !editing ? '<button type="button" class="danger pk-rm">Quitar de mis alimentos</button>' : '<button type="button" class="ghost pk-back">Volver</button>'}
      <button type="button" class="primary pk-ok">${esc(editing ? 'Actualizar' : label)}</button></div>`;

    const input = body.querySelector('.pk-qty');
    const tot = body.querySelector('.pk-tot');
    const qc = body.querySelector('.qchips');
    const draw = () => {
      body.querySelectorAll('.pk-mode button').forEach((b) => b.classList.toggle('sel', b.dataset.m === mode));
      const sz = body.querySelector('.pk-sizes');
      if (sz) {
        sz.hidden = mode === 'g'; // en gramos el tamaño no aplica
        sz.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.s === size));
      }
      body.querySelector('.pk-unit').textContent = `(${mode === 'g' ? pt.gUnit : plural(pt.noun)})`;
      qc.innerHTML = chips(mode)
        .map((c) => `<button type="button" class="chip ${Math.abs(c - v) < 1e-6 ? 'sel' : ''}" data-v="${c}">${mode === 'g' ? c : fracStr(c)}</button>`)
        .join('');
      upd();
    };
    const upd = () => {
      v = parseAmount(input.value);
      if (!v) return (tot.innerHTML = '<span class="muted small">Toca la cantidad para escribirla (ej: 150 · 0,75 · 3/4 · 1 1/2) o usa los botones</span>');
      const s = scaled(food, factorOf(food, mode, v, size));
      tot.innerHTML = `<div class="row between"><span class="muted">${esc(amountLabel(food, mode, v, size))}</span><span class="mid">${num(s.kcal)} kcal</span></div>
        ${s.p || s.c || s.f ? `<div class="small muted" style="text-align:right">Proteínas ${num(s.p, 1)} g · Carbohidratos ${num(s.c, 1)} g · Grasas ${num(s.f, 1)} g</div>` : ''}`;
      qc.querySelectorAll('.chip').forEach((b) => b.classList.toggle('sel', Math.abs(+b.dataset.v - v) < 1e-6));
    };
    const confirm1 = () => {
      const a = parseAmount(input.value);
      if (!a) return toast('Ingresa una cantidad válida');
      picked = null;
      start = null;
      const sz = mode === 'g' ? null : size;
      onPick({ food, qty: factorOf(food, mode, a, sz), label: amountLabel(food, mode, a, sz), mode, amount: a, size: sz });
    };

    input.value = mode === 'g' ? gStr(v) : fracStr(v);
    // Teclado numérico propio: en iPhone el teclado del sistema tapaba la hoja y no dejaba escribir.
    // Al abrirlo, la primera tecla reemplaza el número (no hay que borrar).
    const pad = body.querySelector('.keypad');
    let fresh = false;
    const showPad = (on) => {
      pad.hidden = !on;
      input.classList.toggle('editing', on);
      fresh = on;
      if (on) setTimeout(() => pad.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    };
    input.onclick = () => showPad(pad.hidden);
    pad.onclick = (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k) return;
      if (k === 'ok') return showPad(false);
      let txt = fresh ? '' : input.value;
      if (k === 'del') txt = txt.slice(0, -1);
      else if (k === 'clr') txt = '';
      else txt += k === 'sp' ? ' ' : k;
      fresh = false;
      input.value = txt.replace(/^\s+/, '');
      upd();
    };
    // − / + para ajustar sin teclado: de a 5 g (o ml), de a ¼ en tazas/unidades, o de a 1 si la porción trae varias.
    const step = () => (mode === 'g' ? 5 : pt.count === 1 ? 0.25 : 1);
    const bump = (dir) => {
      const cur = parseAmount(input.value) || 0;
      const nv = Math.max(step(), Math.round((cur + dir * step()) / step()) * step());
      input.value = mode === 'g' ? gStr(nv) : fracStr(nv);
      fresh = !pad.hidden;
      upd();
    };
    body.querySelector('.pk-minus').onclick = () => bump(-1);
    body.querySelector('.pk-plus').onclick = () => bump(1);
    // en computador también se puede escribir con el teclado físico
    input.onkeydown = (e) => {
      if (e.key === 'Enter') return confirm1();
      const map = { Backspace: 'del', ' ': 'sp', '.': ',' };
      const k = map[e.key] || (/^[0-9,/]$/.test(e.key) ? e.key : null);
      if (!k) return;
      e.preventDefault();
      if (pad.hidden) showPad(true);
      pad.querySelector(`[data-k="${k}"]`)?.click();
    };
    qc.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      input.value = mode === 'g' ? b.dataset.v : fracStr(+b.dataset.v);
      fresh = !pad.hidden;
      upd();
    };
    body.querySelector('.pk-mode')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.m === mode) return;
      // convierte la cantidad actual a la otra unidad (ej: 1 taza -> 160 g)
      const factor = factorOf(food, mode, parseAmount(input.value) || base(mode), size);
      mode = b.dataset.m;
      v = Math.round((factor / factorOf(food, mode, 1, size)) * 100) / 100;
      input.value = mode === 'g' ? gStr(v) : fracStr(v);
      draw();
    });
    body.querySelector('.pk-sizes')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      size = b.dataset.s;
      draw();
    });
    draw();
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
    body.querySelector('.pk-recipe')?.addEventListener('click', (e) => {
      e.preventDefault();
      recipe = { id: food.id, name: food.name, items: food.parts.map((x) => ({ ...x })), keep: true };
      picked = null;
      start = null;
      tab = 'build';
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

  // Armar: una preparación (sándwich, ensalada, batido…) con varios ingredientes y su total.
  function buildView(body) {
    const tot = () =>
      recipe.items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, p: a.p + it.p, c: a.c + it.c, f: a.f + it.f }), { kcal: 0, p: 0, c: 0, f: 0 });
    body.innerHTML = `<label class="field">Nombre<input class="bd-name" maxlength="60" value="${esc(recipe.name)}" placeholder="Ej: Sándwich de jamón queso" autocomplete="off"></label>
      <label class="field">Ingredientes</label>
      <div class="ing bd-items"></div>
      <button type="button" class="block bd-add">+ Agregar ingrediente</button>
      <div class="pk-box bd-sub" hidden></div>
      <div class="bd-tot"></div>
      <label class="row" style="margin-top:12px"><input type="checkbox" class="bd-keep" style="width:22px;min-height:22px;margin:0" ${recipe.keep ? 'checked' : ''}> <span>${recipe.id ? 'Actualizar en mis alimentos' : 'Guardar en mis alimentos para repetirlo'}</span></label>
      <div class="actions">${onCancel ? '<button type="button" class="ghost bd-cancel">Cancelar</button>' : '<button type="button" class="ghost bd-clear">Limpiar</button>'}<button type="button" class="primary bd-ok">${esc(label)}</button></div>`;
    const $ = (q) => body.querySelector(q);
    const sub = $('.bd-sub');
    let editId = null;
    const draw = () => {
      $('.bd-items').innerHTML = recipe.items.length
        ? recipe.items
            .map(
              (it) => `<div class="item"><div class="grow" data-e="${it.id}"><div class="t">${esc(it.name)}</div><div class="s">${esc(it.label)}</div></div>
              <div class="amount small">${num(it.kcal)} kcal</div><button type="button" class="ghost icon sm" data-rm="${it.id}" aria-label="Quitar">✕</button></div>`
            )
            .join('')
        : '<div class="small muted">Ej: 1 pan ciabatta, 2 láminas de queso, 2 fetas de jamón, ½ tomate y 1 cdta de aceite de oliva.</div>';
      const t = tot();
      $('.bd-tot').innerHTML = recipe.items.length
        ? `<div class="macros m4"><div><b>${num(t.kcal)}</b><span>kcal</span></div><div><b>${num(t.p, 1)}</b><span>Proteína g</span></div><div><b>${num(t.c, 1)}</b><span>Carbos g</span></div><div><b>${num(t.f, 1)}</b><span>Grasa g</span></div></div>`
        : '';
    };
    const closeSub = () => {
      sub.hidden = true;
      $('.bd-add').hidden = false;
      editId = null;
    };
    const picker = foodPicker(sub, {
      build: false,
      label: 'Agregar ingrediente',
      onCancel: closeSub,
      onPick({ food, qty, label: lbl, mode, amount, size }) {
        const it = {
          id: editId || uid(),
          name: food.name,
          label: lbl,
          qty,
          mode,
          amount,
          size,
          ...scaled(food, qty),
          g: gramsOf(food, mode, amount, qty),
          food: { name: food.name, unit: food.unit, kcal: food.kcal, p: food.p || 0, c: food.c || 0, f: food.f || 0, ...(food.sizes ? { sizes: food.sizes } : {}) },
        };
        recipe.items = editId ? recipe.items.map((x) => (x.id === editId ? it : x)) : [...recipe.items, it];
        closeSub();
        picker.reset();
        draw();
      },
    });
    $('.bd-name').oninput = (e) => (recipe.name = e.target.value);
    $('.bd-keep').onchange = (e) => (recipe.keep = e.target.checked);
    $('.bd-add').onclick = () => {
      editId = null;
      picker.reset();
      sub.hidden = false;
      $('.bd-add').hidden = true;
      sub.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    $('.bd-items').onclick = (e) => {
      const rm = e.target.closest('[data-rm]');
      const ed = e.target.closest('[data-e]');
      if (rm) (recipe.items = recipe.items.filter((x) => x.id !== rm.dataset.rm)), draw();
      else if (ed) {
        const it = recipe.items.find((x) => x.id === ed.dataset.e);
        editId = it.id;
        picker.edit(it.food, it.mode, it.amount, it.size);
        sub.hidden = false;
        $('.bd-add').hidden = true;
        sub.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    $('.bd-cancel')?.addEventListener('click', onCancel);
    $('.bd-clear')?.addEventListener('click', () => {
      recipe = { id: null, name: '', items: [], keep: false };
      shell();
    });
    $('.bd-ok').onclick = () => {
      if (!recipe.items.length) return toast('Agrega al menos un ingrediente');
      const t = tot();
      const r1 = (x) => Math.round(x * 10) / 10;
      const grams = recipe.items.every((x) => x.g) ? Math.round(recipe.items.reduce((a, x) => a + x.g, 0)) : 0;
      const food = {
        id: recipe.id || uid(),
        name: recipe.name.trim() || 'Preparación',
        unit: grams ? `1 porción (${grams} g)` : '1 porción',
        kcal: Math.round(t.kcal),
        p: r1(t.p),
        c: r1(t.c),
        f: r1(t.f),
        parts: recipe.items,
      };
      if (recipe.keep) {
        const at = state.foods.findIndex((x) => x.id === food.id);
        if (at >= 0) state.foods[at] = food;
        else state.foods.unshift(food);
        save();
        toast(at >= 0 ? `${food.name} actualizado en tus alimentos` : `${food.name} guardado en tus alimentos ✦`);
      }
      const summary = recipe.items.map((x) => x.name).join(', ');
      recipe = { id: null, name: '', items: [], keep: false };
      tab = 'search';
      onPick({ food, qty: 1, label: summary.length > 90 ? summary.slice(0, 88) + '…' : summary, mode: 'unit', amount: 1 });
    };
    draw();
  }

  function manual(body) {
    body.innerHTML = `<label class="field">Nombre (opcional)<input class="mn-name" maxlength="60" enterkeyhint="next" placeholder="Ej: Almuerzo en el trabajo" autocomplete="off"></label>
      <label class="field">Gramos de la porción (opcional)<input class="mn-g" inputmode="decimal" placeholder="Ej: 100 (si copias la tabla del envase)"></label>
      <label class="field">Calorías (kcal)<input class="mn-kcal" inputmode="numeric" enterkeyhint="done" placeholder="Ej: 450"></label>
      <div class="three"><label class="field">Proteínas (g)<input class="mn-p" inputmode="decimal" placeholder="Opcional"></label>
        <label class="field">Carbohidr. (g)<input class="mn-c" inputmode="decimal" placeholder="Opcional"></label>
        <label class="field">Grasas (g)<input class="mn-f" inputmode="decimal" placeholder="Opcional"></label></div>
      ${pendingCode ? `<div class="banner small" style="margin:12px 0 0">Código ${esc(pendingCode)}: se guardará con este alimento para que la próxima vez lo encuentres al escanear.</div>` : ''}
      <label class="row" style="margin-top:14px"><input type="checkbox" class="mn-keep" style="width:22px;min-height:22px;margin:0" ${pendingCode ? 'checked' : ''}> <span>Guardar como alimento mío</span></label>
      <div class="actions">${onCancel ? '<button type="button" class="ghost mn-cancel">Cancelar</button>' : ''}<button type="button" class="primary mn-ok">${esc(label)}</button></div>`;
    body.querySelector('.mn-cancel')?.addEventListener('click', onCancel);
    const ok = () => body.querySelector('.mn-ok').click();
    body.querySelectorAll('input:not([type=checkbox])').forEach((i) => (i.onkeydown = (e) => e.key === 'Enter' && (e.preventDefault(), ok())));
    body.querySelector('.mn-ok').onclick = () => {
      const kcal = parseInt(body.querySelector('.mn-kcal').value, 10);
      if (!(kcal >= 0)) return toast('Ingresa las calorías');
      const g = (c) => Math.round(parseAmount(body.querySelector(c).value) * 10) / 10;
      const grams = g('.mn-g');
      // con gramos, después se puede ajustar la cantidad en gramos (ej: tabla "por 100 g" y comí 40 g)
      const unit = grams ? `1 porción (${String(grams).replace('.', ',')} g)` : '1 porción';
      const food = { id: uid(), name: body.querySelector('.mn-name').value.trim() || 'Comida', unit, kcal, p: g('.mn-p'), c: g('.mn-c'), f: g('.mn-f'), ...(pendingCode ? { barcode: pendingCode } : {}) };
      pendingCode = null;
      if (body.querySelector('.mn-keep').checked) {
        state.foods.unshift(food);
        save();
      }
      if (grams) {
        // Pasamos directo a elegir cuánto comiste (en gramos o porciones).
        picked = food;
        start = { mode: 'g', amount: grams, fresh: true };
        tab = 'search';
        return shell();
      }
      onPick({ food, qty: 1, label: '1 porción', mode: 'unit', amount: 1 });
    };
  }

  shell();
  return {
    reset: () => ((picked = null), (start = null), (tab = 'search'), shell()),
    edit: (food, mode, amount, size) => ((tab = 'search'), (picked = food), (start = { mode, amount, size }), shell()),
  };
}
