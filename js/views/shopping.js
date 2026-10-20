// Lista de compras: productos a mano o armados con los alimentos del plan de dieta.
// Al terminar, lo que quedó en el carro se borra y (si Finanzas está activo) se registra el gasto.
import { state, save } from '../store.js';
import { BASE_FOODS } from '../foods.js';
import { amountLabel } from '../foodpicker.js';
import { isOn } from '../modules.js';
import { esc, uid, money, num, parseMoney, openSheet, toast, todayStr, vibrate, DAYS, DAYS_SHORT } from '../util.js';

let root;
const sh = () => state.shopping;

export function mount(el) {
  root = el;
  root.onclick = onClick;
  render();
}

function render() {
  const pending = sh().items.filter((i) => !i.done).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const inCart = sh().items.filter((i) => i.done);
  const names = [...new Set([...state.foods.map((f) => f.name), ...BASE_FOODS.map((f) => f.name)])];

  root.innerHTML = `
    <form class="card addrow" id="add">
      <input id="pname" list="pnames" maxlength="60" placeholder="Producto" autocomplete="off" enterkeyhint="done">
      <input id="pqty" maxlength="20" placeholder="Cant." autocomplete="off" class="qty">
      <button class="primary" aria-label="Agregar">+</button>
      <datalist id="pnames">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </form>
    ${isOn('health') ? '<button class="block" data-act="fromdiet">🥗 Agregar lo de mi dieta</button>' : ''}

    <div class="card"><div class="row between"><h2 style="margin:0">Por comprar${pending.length ? ` (${pending.length})` : ''}</h2>
      ${sh().items.length ? '<button class="ghost sm" data-act="clear">Vaciar</button>' : ''}</div>
      ${
        pending.length
          ? pending.map(row).join('')
          : `<div class="small muted" style="margin-top:8px">${sh().items.length ? '¡Todo en el carro! 🛒' : 'Tu lista está vacía. Agrega productos arriba' + (isOn('health') ? ' o arma la lista con tu plan de dieta.' : '.')}</div>`
      }
    </div>

    ${
      inCart.length
        ? `<div class="card"><h2>En el carro (${inCart.length})</h2>${inCart.map(row).join('')}
          <button class="primary block" data-act="finish" style="margin-top:10px">Terminar compra</button></div>`
        : ''
    }`;

  root.querySelector('#add').onsubmit = (e) => {
    e.preventDefault();
    const name = root.querySelector('#pname').value.trim();
    if (!name) return;
    sh().items.push({ id: uid(), name, qty: root.querySelector('#pqty').value.trim(), done: false });
    save();
    render();
    root.querySelector('#pname').focus();
  };
}

const row = (i) => `<div class="item ${i.done ? 'done' : ''}">
  <button class="check ${i.done ? 'on' : ''}" data-act="tick" data-id="${i.id}" aria-label="En el carro" aria-pressed="${i.done}">✓</button>
  <div class="grow" data-act="tick" data-id="${i.id}"><div class="t">${esc(i.name)}</div>${i.qty ? `<div class="s">${esc(i.qty)}</div>` : ''}</div>
  <button class="ghost icon sm" data-act="del" data-id="${i.id}" aria-label="Quitar">✕</button></div>`;

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'tick') {
    const it = sh().items.find((x) => x.id === id);
    it.done = !it.done;
    if (it.done) vibrate();
  } else if (act === 'del') sh().items = sh().items.filter((x) => x.id !== id);
  else if (act === 'clear') {
    if (!confirm('¿Vaciar toda la lista?')) return;
    sh().items = [];
  } else if (act === 'fromdiet') return dietSheet();
  else if (act === 'finish') return finishSheet();
  else return;
  save();
  render();
}

// Suma los alimentos de las comidas del plan en los días elegidos: "Pollo · 1,05 kg", "Pan integral · 14 rebanadas".
function fromDiet(days) {
  const acc = new Map();
  let noItems = 0;
  for (const d of days)
    for (const m of state.diet.plan[d] || []) {
      if (!m.items?.length) {
        noItems++;
        continue;
      }
      for (const it of m.items) {
        // una preparación armada (sándwich, ensalada…) se desarma en sus ingredientes
        const parts = it.food?.parts?.length ? it.food.parts.map((x) => ({ ...x, amount: (x.amount || 0) * (it.qty || 1) })) : [it];
        for (const x of parts) {
          const key = `${x.name}|${x.mode}|${x.size || ''}`;
          const cur = acc.get(key) || { it: x, amount: 0 };
          cur.amount += x.amount || 0;
          acc.set(key, cur);
        }
      }
    }
  const out = [...acc.values()].map(({ it, amount }) => {
    let qty;
    if (it.mode === 'g') {
      const unit = /\bml\b/.test(it.food?.unit || '') ? 'ml' : 'g';
      qty = amount >= 1000 ? `${num(amount / 1000, 2)} ${unit === 'ml' ? 'L' : 'kg'}` : `${num(amount)} ${unit}`;
    } else qty = it.food ? amountLabel(it.food, 'unit', amount, it.size) : `${num(amount, 2)}`;
    return { name: it.name, qty };
  });
  return { list: out, noItems };
}

function dietSheet() {
  const days = [0, 1, 2, 3, 4, 5, 6];
  openSheet(
    `<h3>Agregar lo de mi dieta</h3>
    <p class="muted small" style="margin-top:0">Sumamos los alimentos de tus comidas del plan en los días que elijas.</p>
    <div class="chips" id="days">${DAYS_SHORT.map((l, i) => `<button type="button" class="chip sel" data-i="${i}" aria-label="${DAYS[i]}">${l}</button>`).join('')}</div>
    <div id="prev" class="ing" style="margin-top:10px"></div>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Agregar a la lista</button></div>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const draw = () => {
        const { list, noItems } = fromDiet(days);
        $('#prev').innerHTML =
          (list.length
            ? list.map((x) => `<div class="item"><div class="grow t">${esc(x.name)}</div><div class="amount small">${esc(x.qty)}</div></div>`).join('')
            : '<div class="small muted">No hay alimentos en las comidas de esos días.</div>') +
          (noItems
            ? `<div class="banner warn" style="margin-bottom:0">${noItems} comida${noItems > 1 ? 's' : ''} no ${noItems > 1 ? 'tienen' : 'tiene'} alimentos cargados (solo texto). Edítalas en Dieta con "+ Agregar alimento" para que entren a la lista.</div>`
            : '');
        $('#ok').disabled = !list.length;
      };
      $('#days').onclick = (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        const i = +b.dataset.i;
        const at = days.indexOf(i);
        if (at >= 0) days.splice(at, 1);
        else days.push(i);
        b.classList.toggle('sel');
        draw();
      };
      $('#ok').onclick = () => {
        const { list } = fromDiet(days);
        // un mismo producto en distintas unidades o tamaños (2 unidades M y 1 unidad L) va en una sola fila
        const merged = new Map();
        for (const x of list) {
          const k = x.name.toLowerCase();
          merged.set(k, merged.has(k) ? { ...merged.get(k), qty: `${merged.get(k).qty} + ${x.qty}` } : x);
        }
        const before = sh().items.filter((i) => !i.done);
        for (const x of merged.values()) {
          // si ya estaba pendiente en la lista, se actualiza la cantidad en vez de duplicar
          const ex = before.find((i) => i.name.toLowerCase() === x.name.toLowerCase());
          if (ex) ex.qty = x.qty;
          else sh().items.push({ id: uid(), name: x.name, qty: x.qty, done: false });
        }
        save();
        close();
        toast(`${merged.size} producto${merged.size === 1 ? '' : 's'} en la lista`);
        render();
      };
      draw();
    }
  );
}

function finishSheet() {
  const inCart = sh().items.filter((i) => i.done);
  const fin = isOn('finance');
  openSheet(
    `<h3>Terminar compra</h3>
    <p class="muted small" style="margin-top:0">${inCart.length} producto${inCart.length === 1 ? '' : 's'} en el carro se quitarán de la lista. Lo que no compraste queda para la próxima.</p>
    ${
      fin
        ? `<label class="field">Total pagado (opcional)<input id="total" inputmode="numeric" placeholder="Ej: 45000"></label>
      <label class="field">Categoría<input id="cat" maxlength="40" value="Supermercado" autocomplete="off"></label>
      <p class="small muted">Si pones el total, se registra como gasto de hoy en Gastos.</p>`
        : ''
    }
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="ok">Terminar</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#ok').onclick = () => {
        const total = fin ? parseMoney(sheet.querySelector('#total').value) : 0;
        if (total) {
          const cat = sheet.querySelector('#cat').value.trim() || 'Supermercado';
          state.finance.expenses.push({ id: uid(), amount: total, cat, desc: `Compra (${inCart.length} productos)`, date: todayStr() });
        }
        sh().items = sh().items.filter((i) => !i.done);
        save();
        close();
        toast(total ? `Compra registrada: ${money(total)}` : 'Compra terminada 🛒');
        render();
      };
    }
  );
}
