import { state, save } from '../store.js';
import { esc, uid, money, num, parseMoney, openSheet, toast, todayStr, monthKey, monthLabel, shortDate } from '../util.js';

let root;

const balanceOf = (list = state.savings) => list.reduce((a, s) => a + (s.type === 'in' ? s.amount : -s.amount), 0);

export function mount(el) {
  root = el;
  root.onclick = onClick;
  render();
}

function render() {
  const bal = balanceOf();
  const goal = state.savingsGoal || 0;
  const totalIn = state.savings.filter((s) => s.type === 'in').reduce((a, s) => a + s.amount, 0);
  const totalOut = state.savings.filter((s) => s.type === 'out').reduce((a, s) => a + s.amount, 0);
  const sorted = [...state.savings].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const groups = {};
  for (const s of sorted) (groups[monthKey(s.date)] ||= []).push(s);

  root.innerHTML = `
    <div class="card">
      <div class="small muted">Ahorro acumulado</div>
      <div class="big ${bal < 0 ? 'neg' : ''}">${money(bal)}</div>
      ${
        goal
          ? `<div class="bar" style="margin:12px 0 4px"><i style="width:${Math.max(0, Math.min(100, (bal / goal) * 100))}%"></i></div>
             <div class="row between small muted"><span>Meta: ${money(goal)}</span><span>${num(Math.max(0, (bal / goal) * 100), 0)}%${bal >= goal ? ' · ¡Meta lograda!' : ` · faltan ${money(goal - bal)}`}</span></div>`
          : ''
      }
      <div class="row between small muted" style="margin-top:10px"><span>Aportado: ${money(totalIn)}</span><span>Retirado: ${money(totalOut)}</span></div>
      <button class="ghost sm" data-act="goal" style="margin-top:6px;padding:0">${goal ? 'Cambiar meta' : 'Definir una meta (opcional)'}</button>
    </div>
    <div class="actions" style="margin-top:0"><button class="primary" data-act="in">+ Aportar</button><button data-act="out">− Registrar salida</button></div>
    ${
      sorted.length
        ? Object.entries(groups)
            .map(
              ([m, list]) => `<div class="card"><h2>${monthLabel(m)}</h2>${list
                .map(
                  (s) => `<div class="item" data-act="edit" data-id="${s.id}"><div class="grow"><div class="t">${esc(s.note || (s.type === 'in' ? 'Aporte' : 'Salida'))}</div>
                  <div class="s">${shortDate(s.date)}</div></div>
                  <div class="amount ${s.type === 'in' ? 'pos' : 'neg'}">${s.type === 'in' ? '+' : '−'}${money(s.amount)}</div></div>`
                )
                .join('')}</div>`
            )
            .join('')
        : '<div class="card empty"><b>Aún no hay movimientos</b>Registra tus aportes y también cada vez que saques plata del ahorro, con su motivo.</div>'
    }`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'in' || act === 'out') moveSheet(act);
  else if (act === 'edit') moveSheet(null, state.savings.find((s) => s.id === id));
  else if (act === 'goal') goalSheet();
}

function goalSheet() {
  openSheet(
    `<h3>Meta de ahorro</h3><form id="f"><label class="field">Monto objetivo (deja en blanco para quitarla)<input name="v" inputmode="numeric" value="${state.savingsGoal || ''}" placeholder="Ej: 2000000"></label>
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Guardar</button></div></form>`,
    (sheet, close) =>
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        state.savingsGoal = parseMoney(new FormData(ev.target).get('v'));
        save();
        close();
        render();
      })
  );
}

function moveSheet(kind, item) {
  const editing = !!item;
  const type = item?.type || kind;
  const isIn = type === 'in';
  const notes = [...new Set(state.savings.filter((s) => s.type === type && s.note).map((s) => s.note))].slice(0, 12);
  openSheet(
    `<h3>${editing ? 'Editar movimiento' : isIn ? 'Nuevo aporte' : 'Salida de ahorro'}</h3>
    <form id="f">
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${item?.amount ?? ''}" placeholder="Ej: 50000"></label>
      <label class="field">${isIn ? 'Detalle (opcional)' : '¿Para qué fue?'}<input name="note" list="notes" maxlength="60" ${isIn ? '' : 'required'} value="${esc(item?.note)}" placeholder="${isIn ? 'Ej: Bono, sobrante del mes' : 'Ej: Emergencia, viaje, arreglo auto'}" autocomplete="off"></label>
      <datalist id="notes">${notes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="field">Fecha<input name="date" type="date" required value="${item?.date || todayStr()}"></label>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { amount: parseMoney(f.get('amount')), note: f.get('note').trim(), date: f.get('date') };
        if (!data.amount) return toast('Ingresa un monto');
        const next = editing
          ? state.savings.map((s) => (s === item ? { ...s, ...data } : s))
          : [...state.savings, { id: uid(), type, ...data }];
        if (!isIn && balanceOf(next) < 0 && !confirm(`Esa salida es mayor que tu ahorro (${money(balanceOf())}). ¿Registrar igual?`)) return;
        if (editing) Object.assign(item, data);
        else state.savings.push(next[next.length - 1]);
        save();
        close();
        render();
      });
      sheet.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        state.savings = state.savings.filter((s) => s !== item);
        save();
        close();
        render();
      });
    }
  );
}
