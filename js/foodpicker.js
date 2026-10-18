// Selector de alimentos reutilizable: buscar en la base, usar alimentos propios o ingresar calorías a mano.
// Se usa para registrar comidas fuera de la dieta y para estimar las calorías de una comida del plan.
import { state, save } from './store.js';
import { BASE_FOODS } from './foods.js';
import { esc, uid, num, parseQty, toast } from './util.js';

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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

// host: elemento donde se dibuja. onPick(food, qty) se llama al confirmar.
export function foodPicker(host, { onPick, label = 'Agregar' }) {
  let tab = 'search';
  let picked = null;

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
    body.innerHTML = `<input class="pk-q" type="search" placeholder="Buscar alimento (ej: pan, pollo, palta)" autocomplete="off" autocapitalize="off"><div class="results"></div>`;
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
      shell();
    };
    show();
  }

  function qty(body) {
    const custom = state.foods.some((f) => f.id === picked.id);
    body.innerHTML = `<div class="card" style="box-shadow:none;margin:10px 0"><b>${esc(picked.name)}</b>
        <div class="small muted">1 porción = ${esc(picked.unit)} · ${num(picked.kcal)} kcal</div></div>
      <label class="field">Cantidad de porciones<input class="pk-qty" inputmode="decimal" value="1" autocomplete="off"></label>
      <div class="row between" style="margin-top:12px"><span class="muted">Total</span><span class="mid pk-tot"></span></div>
      <div class="actions">${custom ? '<button type="button" class="danger pk-rm">Quitar de mis alimentos</button>' : '<button type="button" class="ghost pk-back">Volver</button>'}
      <button type="button" class="primary pk-ok">${esc(label)}</button></div>`;
    const input = body.querySelector('.pk-qty');
    const tot = body.querySelector('.pk-tot');
    const upd = () => (tot.textContent = `${num(picked.kcal * parseQty(input.value))} kcal`);
    const confirm1 = () => {
      const q = parseQty(input.value);
      if (!q) return toast('Ingresa una cantidad válida');
      const food = picked;
      picked = null;
      onPick(food, q);
    };
    input.oninput = upd;
    input.onkeydown = (e) => e.key === 'Enter' && confirm1();
    upd();
    input.focus();
    input.select();
    body.querySelector('.pk-ok').onclick = confirm1;
    const back = body.querySelector('.pk-back');
    if (back) back.onclick = () => ((picked = null), shell());
    const rm = body.querySelector('.pk-rm');
    if (rm)
      rm.onclick = () => {
        if (!confirm(`¿Quitar "${picked.name}" de tus alimentos?`)) return;
        state.foods = state.foods.filter((x) => x.id !== picked.id);
        save();
        picked = null;
        shell();
      };
  }

  function manual(body) {
    body.innerHTML = `<label class="field">Nombre (opcional)<input class="mn-name" maxlength="60" placeholder="Ej: Almuerzo en el trabajo" autocomplete="off"></label>
      <label class="field">Calorías (kcal)<input class="mn-kcal" inputmode="numeric" placeholder="Ej: 450"></label>
      <label class="row" style="margin-top:14px"><input type="checkbox" class="mn-keep" style="width:22px;min-height:22px;margin:0"> <span>Guardar como alimento mío</span></label>
      <div class="actions"><button type="button" class="primary mn-ok">${esc(label)}</button></div>`;
    body.querySelector('.mn-ok').onclick = () => {
      const kcal = parseInt(body.querySelector('.mn-kcal').value, 10);
      if (!(kcal >= 0)) return toast('Ingresa las calorías');
      const food = { id: uid(), name: body.querySelector('.mn-name').value.trim() || 'Comida', unit: '1 porción', kcal, p: 0, c: 0, f: 0 };
      if (body.querySelector('.mn-keep').checked) {
        state.foods.unshift(food);
        save();
      }
      onPick(food, 1);
    };
  }

  shell();
  return { reset: () => ((picked = null), shell()) };
}
