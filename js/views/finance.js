import { state, save } from '../store.js';
import { barChart } from '../charts.js';
import { esc, uid, money, num, compact, parseMoney, openSheet, toast, todayStr, monthKey, addMonths, monthLabel, monthShort, shortDate, vibrate } from '../util.js';

const DEFAULT_CATS = ['Arriendo / Vivienda', 'Supermercado', 'Comida fuera', 'Transporte', 'Cuentas básicas', 'Salud', 'Educación', 'Ocio', 'Ropa', 'Deudas / Créditos', 'Otros'];

let root;
let ym = monthKey(todayStr());

const expensesOf = (m) => state.finance.expenses.filter((e) => monthKey(e.date) === m);
const movedOf = (m) => state.savings.filter((s) => s.type === 'in' && s.ym === m).reduce((a, s) => a + s.amount, 0);
const fixedFor = (m) => state.finance.fixed.filter((f) => f.from <= m).sort((a, b) => a.day - b.day);
const paidOf = (f, m) => state.finance.expenses.find((e) => e.fixedId === f.id && monthKey(e.date) === m);

// Si el mes no tiene sueldo propio, usa el del último mes anterior que sí lo tenga.
function incomeOf(m) {
  const own = state.finance.income[m];
  if (own !== undefined) return { value: own, inherited: false };
  const prev = Object.keys(state.finance.income).filter((k) => k < m).sort().pop();
  return prev ? { value: state.finance.income[prev], inherited: true } : { value: 0, inherited: false };
}

function summary(m) {
  const { value: income, inherited } = incomeOf(m);
  const spent = expensesOf(m).reduce((a, e) => a + e.amount, 0);
  const moved = movedOf(m);
  const pending = fixedFor(m).filter((f) => !paidOf(f, m)).reduce((a, f) => a + f.amount, 0);
  return { income, inherited, spent, moved, pending, avail: income - spent - moved - pending };
}

const allCats = () => [...new Set([...DEFAULT_CATS, ...state.finance.expenses.map((e) => e.cat), ...state.finance.fixed.map((f) => f.cat)])];
const pad = (n) => String(n).padStart(2, '0');

export function mount(el) {
  root = el;
  ym = monthKey(todayStr());
  root.onclick = onClick;
  render();
}

function render() {
  const list = expensesOf(ym).sort((a, b) => b.date.localeCompare(a.date));
  const { income, inherited, spent, moved, pending, avail } = summary(ym);
  const fixed = fixedFor(ym);

  const byCat = {};
  for (const e of list) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const base = income || spent || 1;

  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(ym, n));
  const hasHistory = months.some((m) => expensesOf(m).length);

  root.innerHTML = `
    <div class="nav"><button class="icon" data-act="prev" aria-label="Mes anterior">‹</button>
      <div class="label" data-act="now">${monthLabel(ym)}</div>
      <button class="icon" data-act="next" aria-label="Mes siguiente">›</button></div>

    <div class="card">
      <div class="small muted">Disponible este mes</div>
      <div class="big ${avail < 0 ? 'neg' : ''}">${money(avail)}</div>
      ${pending ? `<div class="small muted">Ya descuenta ${money(pending)} de gastos fijos por pagar</div>` : ''}
      <div class="bar ${spent + moved + pending > income ? 'over' : ''}" style="margin:12px 0 4px"><i style="width:${income ? Math.min(100, ((spent + moved + pending) / income) * 100) : 0}%"></i></div>
      <div class="item" style="border:0;padding-bottom:0"><div class="grow"><div class="t">Sueldo líquido</div>
        <div class="s">${inherited ? 'Tomado del mes anterior' : income ? 'Ingresado' : 'Aún no lo ingresas'}</div></div>
        <div class="amount">${money(income)}</div><button class="sm" data-act="income">${income ? 'Editar' : 'Ingresar'}</button></div>
      <div class="item"><div class="grow t">Gastado</div><div class="amount">${money(spent)}</div></div>
      <div class="item"><div class="grow t">Fijos por pagar</div><div class="amount">${money(pending)}</div></div>
      <div class="item"><div class="grow t">Enviado a ahorro</div><div class="amount">${money(moved)}</div></div>
      ${avail > 0 && income ? '<button class="block" style="margin-top:6px" data-act="save">Enviar sobrante a ahorro</button>' : ''}
    </div>

    <button class="primary block" data-act="add">+ Agregar gasto</button>

    <div class="card">
      <div class="row between"><h2 style="margin:0">Gastos fijos</h2><button class="sm" data-act="addfixed">+ Fijo</button></div>
      ${
        fixed.length
          ? fixed
              .map((f) => {
                const paid = paidOf(f, ym);
                return `<div class="item ${paid ? 'done' : ''}">
              <button class="check ${paid ? 'on' : ''}" data-act="paid" data-id="${f.id}" aria-label="Marcar como pagado" aria-pressed="${!!paid}">✓</button>
              <div class="grow" data-act="editfixed" data-id="${f.id}"><div class="t">${esc(f.name)}</div><div class="s">Día ${f.day} · ${esc(f.cat)}</div></div>
              <div class="amount">${money(f.amount)}</div></div>`;
              })
              .join('')
          : '<div class="small muted" style="margin-top:8px">Arriendo, internet, créditos, suscripciones… Regístralos una vez y aparecen cada mes para marcarlos como pagados.</div>'
      }
    </div>

    ${
      hasHistory
        ? `<div class="card"><h2>Últimos 6 meses</h2>
          ${barChart({
            labels: months.map(monthShort),
            values: months.map((m) => expensesOf(m).reduce((a, e) => a + e.amount, 0) || null),
            marks: months.map((m) => incomeOf(m).value || null),
            fmt: (v) => '$' + compact(v),
            titles: months.map((m) => `${monthLabel(m)}: gastado ${money(expensesOf(m).reduce((a, e) => a + e.amount, 0))} · sueldo ${money(incomeOf(m).value)}`),
            label: 'Gastado por mes comparado con el sueldo',
            h: 170,
          })}
          <div class="legend"><span><i class="sw bar"></i>Gastado</span><span><i class="sw mark"></i>Sueldo</span></div></div>`
        : ''
    }

    ${
      cats.length
        ? `<div class="card"><h2>¿En qué se va el sueldo?</h2>${cats
            .map(
              ([c, v]) => `<div class="dist"><div class="row between"><span>${esc(c)}</span><span><b>${money(v)}</b> <span class="muted small">${num((v / base) * 100, 1)}%</span></span></div>
              <div class="bar"><i style="width:${Math.min(100, (v / base) * 100)}%"></i></div></div>`
            )
            .join('')}
          <div class="small muted">Porcentaje sobre ${income ? 'tu sueldo líquido' : 'el total gastado'}.</div></div>`
        : ''
    }

    <div class="card"><h2>Gastos del mes</h2>${
      list.length
        ? list
            .map(
              (e) => `<div class="item" data-act="edit" data-id="${e.id}"><div class="grow"><div class="t">${esc(e.desc || e.cat)}${e.fixedId ? ' <span class="muted small">· fijo</span>' : ''}</div>
                <div class="s">${e.desc ? `${esc(e.cat)} · ` : ''}${shortDate(e.date)}</div></div><div class="amount">${money(e.amount)}</div></div>`
            )
            .join('')
        : '<div class="empty"><b>Sin gastos</b>Registra tus gastos para ver cómo se reparte tu sueldo.</div>'
    }</div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'prev') ym = addMonths(ym, -1);
  else if (act === 'next') ym = addMonths(ym, 1);
  else if (act === 'now') ym = monthKey(todayStr());
  else if (act === 'income') return incomeSheet();
  else if (act === 'save') return toSavingsSheet();
  else if (act === 'add') return expenseSheet();
  else if (act === 'edit') return expenseSheet(state.finance.expenses.find((x) => x.id === id));
  else if (act === 'addfixed') return fixedSheet();
  else if (act === 'editfixed') return fixedSheet(state.finance.fixed.find((x) => x.id === id));
  else if (act === 'paid') togglePaid(state.finance.fixed.find((x) => x.id === id));
  render();
}

function togglePaid(f) {
  const paid = paidOf(f, ym);
  if (paid) state.finance.expenses = state.finance.expenses.filter((e) => e !== paid);
  else {
    const [y, mo] = ym.split('-').map(Number);
    const day = Math.min(f.day, new Date(y, mo, 0).getDate());
    const date = ym === monthKey(todayStr()) ? todayStr() : `${ym}-${pad(day)}`;
    state.finance.expenses.push({ id: uid(), fixedId: f.id, amount: f.amount, cat: f.cat, desc: f.name, date });
  }
  vibrate();
  save();
}

function incomeSheet() {
  openSheet(
    `<h3>Sueldo líquido de ${monthLabel(ym)}</h3><p class="muted small">Lo que efectivamente recibes, después de descuentos.</p>
    <form id="f"><label class="field">Monto<input name="v" inputmode="numeric" required value="${incomeOf(ym).value || ''}" placeholder="Ej: 1200000"></label>
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Guardar</button></div></form>`,
    (sheet, close) =>
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        state.finance.income[ym] = parseMoney(new FormData(ev.target).get('v'));
        save();
        close();
        render();
      })
  );
}

function fixedSheet(fx) {
  const editing = !!fx;
  openSheet(
    `<h3>${editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h3>
    <p class="muted small" style="margin-top:0">${editing ? 'Los cambios aplican a los meses que aún no has marcado como pagados.' : `Se repetirá todos los meses desde ${monthLabel(ym)}.`}</p>
    <form id="f">
      <label class="field">Nombre<input name="name" required maxlength="40" value="${esc(fx?.name)}" placeholder="Ej: Arriendo, Internet, Netflix" autocomplete="off"></label>
      <div class="two"><label class="field">Monto<input name="amount" inputmode="numeric" required value="${fx?.amount ?? ''}" placeholder="Ej: 350000"></label>
      <label class="field">Día del mes<input name="day" inputmode="numeric" required maxlength="2" value="${fx?.day ?? ''}" placeholder="Ej: 5"></label></div>
      <label class="field">Categoría<input name="cat" list="cats" required maxlength="40" value="${esc(fx?.cat)}" placeholder="Elige o escribe una nueva" autocomplete="off"></label>
      <datalist id="cats">${allCats().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { name: f.get('name').trim(), amount: parseMoney(f.get('amount')), day: Math.min(31, Math.max(1, parseInt(f.get('day'), 10) || 1)), cat: f.get('cat').trim() };
        if (!data.name || !data.amount || !data.cat) return toast('Completa nombre, monto y categoría');
        if (editing) Object.assign(fx, data);
        else state.finance.fixed.push({ id: uid(), from: ym, ...data });
        save();
        close();
        render();
      });
      sheet.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar el gasto fijo "${fx.name}"? Los pagos ya registrados se mantienen.`)) return;
        state.finance.fixed = state.finance.fixed.filter((x) => x !== fx);
        save();
        close();
        render();
      });
    }
  );
}

function expenseSheet(exp) {
  const editing = !!exp;
  const defDate = ym === monthKey(todayStr()) ? todayStr() : `${ym}-01`;
  openSheet(
    `<h3>${editing ? 'Editar gasto' : 'Nuevo gasto'}</h3>
    <form id="f">
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${exp?.amount ?? ''}" placeholder="Ej: 15000"></label>
      <label class="field">Categoría<input name="cat" list="cats" required maxlength="40" value="${esc(exp?.cat)}" placeholder="Elige o escribe una nueva" autocomplete="off"></label>
      <datalist id="cats">${allCats().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="field">Detalle (opcional)<input name="desc" maxlength="60" value="${esc(exp?.desc)}" placeholder="Ej: Feria, bencina, Netflix"></label>
      <label class="field">Fecha<input name="date" type="date" required value="${exp?.date || defDate}"></label>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { amount: parseMoney(f.get('amount')), cat: f.get('cat').trim(), desc: f.get('desc').trim(), date: f.get('date') };
        if (!data.amount || !data.cat) return toast('Falta el monto o la categoría');
        if (editing) Object.assign(exp, data);
        else state.finance.expenses.push({ id: uid(), ...data });
        save();
        close();
        // Si el gasto cae en otro mes, nos movemos a ese mes para que se vea.
        ym = monthKey(data.date);
        render();
      });
      sheet.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este gasto?')) return;
        state.finance.expenses = state.finance.expenses.filter((x) => x.id !== exp.id);
        save();
        close();
        render();
      });
    }
  );
}

function toSavingsSheet() {
  const { avail } = summary(ym);
  openSheet(
    `<h3>Enviar a ahorro</h3><p class="muted small">Se registra como aporte en el módulo Ahorro y descuenta de lo disponible de ${monthLabel(ym)}.</p>
    <form id="f"><label class="field">Monto (disponible: ${money(avail)})<input name="v" inputmode="numeric" required value="${Math.max(0, avail)}"></label>
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Enviar</button></div></form>`,
    (sheet, close) =>
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const v = parseMoney(new FormData(ev.target).get('v'));
        if (!v) return;
        if (v > avail && !confirm('Es más de lo que te queda disponible este mes. ¿Enviar igual?')) return;
        state.savings.push({ id: uid(), date: todayStr(), type: 'in', amount: v, note: `Sobrante ${monthLabel(ym)}`, ym });
        save();
        close();
        toast('Enviado a ahorro');
        render();
      })
  );
}
