import { state, save } from '../store.js';
import { barChart } from '../charts.js';
import { exportExpensesCSV } from '../backup.js';
import { loanMonth, loansCard, loanSheet, loanDetail, toggleCuota, loanById, scheduleOf } from './loans.js';
import { esc, uid, money, num, compact, parseMoney, openSheet, toast, todayStr, monthKey, addMonths, monthLabel, monthShort, shortDate, vibrate } from '../util.js';

const DEFAULT_CATS = ['Arriendo / Vivienda', 'Supermercado', 'Comida fuera', 'Transporte', 'Cuentas básicas', 'Salud', 'Educación', 'Ocio', 'Ropa', 'Deudas / Créditos', 'Otros'];

let root;
let ym = monthKey(todayStr());

const expensesOf = (m) => state.finance.expenses.filter((e) => monthKey(e.date) === m);
const movedOf = (m) => state.savings.filter((s) => s.type === 'in' && s.ym === m).reduce((a, s) => a + s.amount, 0);
// retiros de ahorro usados en el mes: entran como ingreso (así el gasto que pagaron queda cubierto)
const withdrawalsOf = (m) => state.savings.filter((s) => s.type === 'out' && s.ym === m);
const fixedFor = (m) => state.finance.fixed.filter((f) => f.from <= m).sort((a, b) => a.day - b.day);
const paidOf = (f, m) => state.finance.expenses.find((e) => e.fixedId === f.id && monthKey(e.date) === m);

const variable = () => state.finance.salaryMode === 'variable';
const prevSalary = (m) => {
  const prev = Object.keys(state.finance.income).filter((k) => k < m).sort().pop();
  return prev ? state.finance.income[prev] : 0;
};
// Sueldo del mes. Fijo: si el mes no tiene uno propio, usa el del último mes que sí lo tenga.
// Variable: solo cuenta el ingresado para ese mes.
function incomeOf(m) {
  const own = state.finance.income[m];
  if (own !== undefined) return { value: own, inherited: false };
  if (variable()) return { value: 0, inherited: false };
  const prev = prevSalary(m);
  return prev ? { value: prev, inherited: true } : { value: 0, inherited: false };
}
const extrasOf = (m) => state.finance.extras.filter((x) => monthKey(x.date) === m).sort((a, b) => a.date.localeCompare(b.date));

function summary(m) {
  const { value: salary, inherited } = incomeOf(m);
  const extras = extrasOf(m).reduce((a, x) => a + x.amount, 0);
  const lm = loanMonth(m);
  const withdrawn = withdrawalsOf(m).reduce((a, s) => a + s.amount, 0);
  const income = salary + extras + lm.borrowedIn + lm.repaidIn + withdrawn;
  const spent = expensesOf(m).reduce((a, e) => a + e.amount, 0);
  const moved = movedOf(m);
  const pending = fixedFor(m).filter((f) => !paidOf(f, m)).reduce((a, f) => a + f.amount, 0) + lm.duePending;
  const lent = lm.lentOut;
  return { salary, inherited, extras, withdrawn, lm, income, spent, moved, pending, lent, avail: income - spent - moved - pending - lent };
}

// Compras en cuotas con cuota este mes o cuotas pendientes después.
function installmentGroups(m) {
  const groups = {};
  for (const e of state.finance.expenses) if (e.groupId) (groups[e.groupId] ||= []).push(e);
  return Object.values(groups)
    .map((list) => {
      list.sort((a, b) => a.date.localeCompare(b.date));
      const n = list[0].cuota[1];
      const cur = list.find((e) => monthKey(e.date) === m);
      const future = list.filter((e) => monthKey(e.date) > m);
      return { first: list[0], n, cur, left: future.reduce((a, e) => a + e.amount, 0), leftN: future.length, end: monthKey(list[list.length - 1].date) };
    })
    .filter((g) => (g.cur || g.leftN) && monthKey(g.first.date) <= m);
}

export const allCats = () => [...new Set([...DEFAULT_CATS, ...state.finance.expenses.map((e) => e.cat), ...state.finance.fixed.map((f) => f.cat)])];
const pad = (n) => String(n).padStart(2, '0');
const budgets = () => state.finance.budgets;
const spentIn = (cat, m) => expensesOf(m).filter((e) => e.cat === cat).reduce((a, e) => a + e.amount, 0);

// La misma fecha n meses después (el 31 pasa a ser el último día si el mes es más corto).
function shiftDate(date, n) {
  const target = addMonths(monthKey(date), n);
  const [y, mo] = target.split('-').map(Number);
  return `${target}-${pad(Math.min(+date.slice(8, 10), new Date(y, mo, 0).getDate()))}`;
}

// Avisa si la categoría se acerca (80%) o pasa su tope en ese mes.
function budgetAlert(cat, m) {
  const b = budgets()[cat];
  if (!b) return;
  const spent = spentIn(cat, m);
  if (spent > b) toast(`Te pasaste del tope de ${cat}: ${money(spent)} de ${money(b)}`);
  else if (spent >= b * 0.8) toast(`Llevas ${Math.round((spent / b) * 100)}% del tope de ${cat}`);
}

export function mount(el) {
  root = el;
  ym = monthKey(todayStr());
  root.onclick = onClick;
  render();
}

function render() {
  const list = expensesOf(ym).sort((a, b) => b.date.localeCompare(a.date));
  const { salary, inherited, extras, withdrawn, lm, income, spent, moved, pending, lent, avail } = summary(ym);
  const extraList = extrasOf(ym);
  const groups = installmentGroups(ym);
  const missingSalary = variable() && state.finance.income[ym] === undefined;
  const fixed = fixedFor(ym);

  const byCat = {};
  for (const e of list) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  for (const c of Object.keys(budgets())) byCat[c] ||= 0;
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
      ${pending ? `<div class="small muted">Ya descuenta ${money(pending)} por pagar este mes</div>` : ''}
      <div class="bar ${spent + moved + pending + lent > income ? 'over' : ''}" style="margin:12px 0 4px"><i style="width:${income ? Math.min(100, ((spent + moved + pending + lent) / income) * 100) : 0}%"></i></div>
      ${missingSalary ? `<div class="banner warn small" style="margin:10px 0 0">Tu sueldo es variable: ingresa el de ${monthLabel(ym)}. <a href="#" data-act="income">Ingresar sueldo</a></div>` : ''}
      <div class="item" style="border:0;padding-bottom:0"><div class="grow t">Ingresos</div><div class="amount pos">${money(income)}</div></div>
      <div class="item"><div class="grow t">Gastado</div><div class="amount">${money(spent)}</div></div>
      <div class="item"><div class="grow t">Por pagar (fijos y cuotas)</div><div class="amount">${money(pending)}</div></div>
      ${lent ? `<div class="item"><div class="grow t">Prestado</div><div class="amount">${money(lent)}</div></div>` : ''}
      <div class="item"><div class="grow t">Enviado a ahorro</div><div class="amount">${money(moved)}</div></div>
      ${avail > 0 && income ? '<button class="block" style="margin-top:6px" data-act="save">Enviar sobrante a ahorro</button>' : ''}
    </div>

    <div class="card"><div class="row between"><h2 style="margin:0">Ingresos del mes</h2><button class="sm" data-act="extra-new">+ Ingreso</button></div>
      <div class="item" data-act="income" style="border:0"><div class="grow"><div class="t">Sueldo líquido</div>
        <div class="s">${variable() ? 'Variable' : 'Fijo'} · ${inherited ? 'el mismo del mes anterior' : salary ? 'ingresado para este mes' : 'aún no lo ingresas'}</div></div>
        <div class="amount">${money(salary)}</div><span class="muted">✎</span></div>
      ${extraList
        .map(
          (x) => `<div class="item" data-act="extra-edit" data-id="${x.id}"><div class="grow"><div class="t">${esc(x.note || 'Otro ingreso')}</div><div class="s">${shortDate(x.date)} · solo este mes</div></div>
          <div class="amount pos">+${money(x.amount)}</div></div>`
        )
        .join('')}
      ${lm.incomes.map((r) => `<div class="item"><div class="grow"><div class="t">${esc(r.label)}</div><div class="s">Préstamo</div></div><div class="amount pos">+${money(r.amount)}</div></div>`).join('')}
      ${withdrawalsOf(ym)
        .map(
          (s) => `<a class="item" href="#savings" style="color:inherit;text-decoration:none;font-weight:inherit"><div class="grow"><div class="t">Retiro de ahorro${s.note ? ': ' + esc(s.note) : ''}</div><div class="s">${shortDate(s.date)} · desde Ahorro</div></div>
          <div class="amount pos">+${money(s.amount)}</div></a>`
        )
        .join('')}
      ${extras || withdrawn || lm.incomes.length ? `<div class="row between" style="margin-top:8px"><span class="muted small">Total</span><b>${money(income)}</b></div>` : '<div class="small muted">Bonos, ventas, honorarios, devoluciones… todo lo que entra solo este mes, aparte del sueldo.</div>'}
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

    ${loansCard(ym)}

    ${
      groups.length
        ? `<div class="card"><h2>Compras en cuotas</h2>
          ${groups
            .map((g) => {
              const label = g.first.desc || g.first.cat;
              const i = g.cur ? g.cur.cuota[0] : g.n - g.leftN;
              return `<div class="item" data-act="edit" data-id="${(g.cur || g.first).id}"><div class="grow"><div class="t">${esc(label)}</div>
                <div class="s">${g.cur ? `Cuota ${i}/${g.n} este mes` : `${g.leftN} cuotas por venir`} · ${g.leftN ? `quedan ${money(g.left)} hasta ${monthShort(g.end)} ${g.end.slice(0, 4)}` : 'última cuota'}</div>
                <div class="bar" style="margin-top:6px"><i style="width:${(i / g.n) * 100}%"></i></div></div>
                <div class="amount">${g.cur ? money(g.cur.amount) : ''}</div></div>`;
            })
            .join('')}
          <div class="row between small" style="margin-top:8px"><span class="muted">Deuda en cuotas (meses siguientes)</span><b>${money(groups.reduce((a, g) => a + g.left, 0))}</b></div></div>`
        : ''
    }

    ${
      hasHistory
        ? `<div class="card"><h2>Últimos 6 meses</h2>
          ${barChart({
            labels: months.map(monthShort),
            values: months.map((m) => expensesOf(m).reduce((a, e) => a + e.amount, 0) || null),
            marks: months.map((m) => summary(m).income || null),
            fmt: (v) => '$' + compact(v),
            titles: months.map((m) => `${monthLabel(m)}: gastado ${money(expensesOf(m).reduce((a, e) => a + e.amount, 0))} · ingresos ${money(summary(m).income)}`),
            label: 'Gastado por mes comparado con los ingresos',
            h: 170,
          })}
          <div class="legend"><span><i class="sw bar"></i>Gastado</span><span><i class="sw mark"></i>Ingresos</span></div></div>`
        : ''
    }

    <div class="card"><div class="row between"><h2 style="margin:0">¿En qué se va el sueldo?</h2><button class="sm" data-act="budgets">Topes</button></div>
      ${
        cats.length
          ? cats
              .map(([c, v]) => {
                const b = budgets()[c];
                if (b) {
                  const r = v / b;
                  return `<div class="dist"><div class="row between"><span>${esc(c)}</span><span><b>${money(v)}</b> <span class="muted small">de ${money(b)}</span></span></div>
                  <div class="bar ${r > 1 ? 'over' : r >= 0.8 ? 'near' : ''}"><i style="width:${Math.min(100, r * 100)}%"></i></div>
                  ${r > 1 ? `<div class="small neg" style="margin-top:4px">Te pasaste en ${money(v - b)}</div>` : r >= 0.8 ? `<div class="small warn" style="margin-top:4px">Quedan ${money(b - v)} para este mes</div>` : ''}</div>`;
                }
                return `<div class="dist"><div class="row between"><span>${esc(c)}</span><span><b>${money(v)}</b> <span class="muted small">${num((v / base) * 100, 1)}%</span></span></div>
                <div class="bar"><i style="width:${Math.min(100, (v / base) * 100)}%"></i></div></div>`;
              })
              .join('') + `<div class="small muted">Las categorías con tope muestran cuánto llevas de él; el resto, el porcentaje sobre ${income ? 'tus ingresos del mes' : 'el total gastado'}.</div>`
          : '<div class="small muted" style="margin-top:8px">Registra gastos para ver en qué se va tu sueldo. Con <b>Topes</b> defines cuánto quieres gastar como máximo por categoría.</div>'
      }</div>

    <div class="card"><h2>Gastos del mes</h2>${
      list.length
        ? list
            .map(
              (e) => `<div class="item" data-act="edit" data-id="${e.id}"><div class="grow"><div class="t">${esc(e.desc || e.cat)}${e.fixedId ? ' <span class="muted small">· fijo</span>' : ''}${e.loanId ? ' <span class="muted small">· préstamo</span>' : ''}${e.savingsId ? ' <span class="muted small">· con ahorro</span>' : ''}</div>
                <div class="s">${e.desc ? `${esc(e.cat)} · ` : ''}${shortDate(e.date)}${e.cuota ? ` · cuota ${e.cuota[0]}/${e.cuota[1]}` : ''}</div></div><div class="amount">${money(e.amount)}</div></div>`
            )
            .join('')
        : '<div class="empty"><b>Sin gastos</b>Registra tus gastos para ver cómo se reparte tu sueldo.</div>'
    }</div>
    ${state.finance.expenses.length ? '<button class="ghost block" data-act="csv">Exportar gastos a Excel</button>' : ''}`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'prev') ym = addMonths(ym, -1);
  else if (act === 'next') ym = addMonths(ym, 1);
  else if (act === 'now') ym = monthKey(todayStr());
  else if (act === 'income') return e.preventDefault(), incomeSheet();
  else if (act === 'extra-new') return extraSheet();
  else if (act === 'extra-edit') return extraSheet(state.finance.extras.find((x) => x.id === id));
  else if (act === 'loan-new') return loanSheet(null, render);
  else if (act === 'loan-open') return loanDetail(loanById(id), render);
  else if (act === 'loan-tick') toggleCuota(loanById(id), ym);
  else if (act === 'save') return toSavingsSheet();
  else if (act === 'add') return expenseSheet();
  else if (act === 'edit') {
    const ex = state.finance.expenses.find((x) => x.id === id);
    // las cuotas de préstamos se manejan desde el préstamo
    if (ex?.loanId && loanById(ex.loanId) && scheduleOf(loanById(ex.loanId)).some((c) => c.ym === ex.cuotaYm)) return loanDetail(loanById(ex.loanId), render);
    return expenseSheet(ex);
  }
  else if (act === 'addfixed') return fixedSheet();
  else if (act === 'editfixed') return fixedSheet(state.finance.fixed.find((x) => x.id === id));
  else if (act === 'paid') togglePaid(state.finance.fixed.find((x) => x.id === id));
  else if (act === 'budgets') return budgetSheet();
  else if (act === 'csv') return exportExpensesCSV();
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
    budgetAlert(f.cat, ym);
  }
  vibrate();
  save();
}

function incomeSheet() {
  let mode = state.finance.salaryMode || 'fixed';
  const prev = prevSalary(ym);
  openSheet(
    `<h3>Sueldo líquido de ${monthLabel(ym)}</h3><p class="muted small" style="margin-top:0">Lo que efectivamente recibes, después de descuentos.</p>
    <div class="seg" id="mode"><button type="button" data-m="fixed">Fijo</button><button type="button" data-m="variable">Variable</button></div>
    <p class="small muted" id="mode-h" style="margin:6px 0 0"></p>
    <form id="f"><label class="field">Monto de ${monthLabel(ym).toLowerCase()}<input name="v" inputmode="numeric" value="${state.finance.income[ym] ?? (mode === 'fixed' ? incomeOf(ym).value || '' : '')}" placeholder="Ej: 1200000"></label>
    ${prev ? `<button type="button" class="ghost sm" id="prev" style="padding:0;margin-top:6px">Usar el del mes anterior (${money(prev)})</button>` : ''}
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Guardar</button></div></form>`,
    (sheet, close) => {
      const $ = (q) => sheet.querySelector(q);
      const draw = () => {
        sheet.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('sel', b.dataset.m === mode));
        $('#mode-h').textContent =
          mode === 'fixed'
            ? 'Se repite cada mes hasta que lo cambies.'
            : 'Cambia cada mes (comisiones, turnos, honorarios): lo ingresas mes a mes.';
      };
      $('#mode').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) (mode = b.dataset.m), draw();
      };
      $('#prev')?.addEventListener('click', () => ($('#f').elements.v.value = prev));
      draw();
      $('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        // Fijo → Variable: los meses anteriores que heredaban el sueldo lo guardan como propio
        // (si no, quedarían con ingresos $0)
        if (!variable() && mode === 'variable') {
          const keys = Object.keys(state.finance.income).sort();
          for (let k = keys[0]; k && k < ym; k = addMonths(k, 1)) if (state.finance.income[k] === undefined) state.finance.income[k] = incomeOf(k).value;
        }
        state.finance.salaryMode = mode;
        const raw = new FormData(ev.target).get('v');
        if (String(raw).trim() === '') delete state.finance.income[ym];
        else state.finance.income[ym] = parseMoney(raw);
        save();
        close();
        render();
      });
    }
  );
}

// Otro ingreso, solo de este mes (bono, venta, honorarios…).
function extraSheet(x) {
  const editing = !!x;
  const defDate = ym === monthKey(todayStr()) ? todayStr() : `${ym}-01`;
  const notes = [...new Set(['Bono', 'Aguinaldo', 'Honorarios / freelance', 'Venta', 'Devolución de impuestos', 'Arriendo recibido', 'Regalo', ...state.finance.extras.map((e) => e.note).filter(Boolean)])];
  openSheet(
    `<h3>${editing ? 'Editar ingreso' : 'Otro ingreso del mes'}</h3>
    <p class="muted small" style="margin-top:0">Algo que entra solo este mes, aparte del sueldo.</p>
    <form id="f">
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${x?.amount ?? ''}" placeholder="Ej: 150000"></label>
      <label class="field">Concepto<input name="note" list="inotes" maxlength="60" value="${esc(x?.note)}" placeholder="Ej: Bono, venta de bicicleta" autocomplete="off"></label>
      <datalist id="inotes">${notes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="field">Fecha<input name="date" type="date" required value="${x?.date || defDate}"></label>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { amount: parseMoney(f.get('amount')), note: f.get('note').trim(), date: f.get('date') };
        if (!data.amount) return toast('Ingresa el monto');
        if (editing) Object.assign(x, data);
        else state.finance.extras.push({ id: uid(), ...data });
        save();
        close();
        toast('Ingreso guardado');
        ym = monthKey(data.date);
        render();
      });
      sheet.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este ingreso?')) return;
        state.finance.extras = state.finance.extras.filter((e) => e !== x);
        save();
        close();
        render();
      });
    }
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
      ${exp?.cuota ? `<div class="banner" style="margin:4px 0 0">Cuota ${exp.cuota[0]} de ${exp.cuota[1]} de una compra en cuotas. Los cambios aplican solo a esta cuota.</div>` : ''}
      <label class="field"><span id="amt-l">Monto</span><input name="amount" inputmode="numeric" required value="${exp?.amount ?? ''}" placeholder="Ej: 15000"></label>
      <label class="field">Categoría<input name="cat" list="cats" required maxlength="40" value="${esc(exp?.cat)}" placeholder="Elige o escribe una nueva" autocomplete="off"></label>
      <datalist id="cats">${allCats().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="field">Detalle (opcional)<input name="desc" maxlength="60" value="${esc(exp?.desc)}" placeholder="Ej: Feria, bencina, Netflix"></label>
      <label class="field"><span id="date-l">Fecha</span><input name="date" type="date" required value="${exp?.date || defDate}"></label>
      ${
        editing
          ? ''
          : `<label class="cuotas"><input type="checkbox" name="split"> <span>Compra en cuotas</span></label>
        <div id="n-wrap" hidden>
          <div class="two"><label class="field">N° de cuotas<input name="n" inputmode="numeric" maxlength="2" placeholder="Ej: 6"></label>
            <label class="field">Valor cuota (opcional)<input name="cv" inputmode="numeric" placeholder="Si tiene interés"></label></div>
          <label class="field">Cuotas ya pagadas (opcional)<input name="paid" inputmode="numeric" maxlength="2" placeholder="Ej: 2, si es una compra antigua"></label>
        </div>
        <div class="small muted" id="n-hint" hidden style="margin-top:6px"></div>`
      }
      <div class="actions">${editing ? `<button type="button" class="danger" id="del">${exp.groupId ? 'Eliminar compra' : 'Eliminar'}</button>` : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#f');
      const split = form.elements.split;
      const cuotas = () => (split?.checked ? Math.min(60, Math.max(0, parseInt(form.elements.n.value, 10) || 0)) : 0);
      const plan = () => {
        const n = cuotas();
        const total = parseMoney(form.elements.amount.value);
        const cv = parseMoney(form.elements.cv?.value) || (n ? Math.floor(total / n) : 0);
        const paid = Math.min(Math.max(0, n - 1), parseInt(form.elements.paid?.value, 10) || 0);
        return { n, total, cv, paid, custom: !!parseMoney(form.elements.cv?.value) };
      };
      const hint = () => {
        const { n, total, cv, paid } = plan();
        sheet.querySelector('#n-hint').hidden = !(n >= 2 && total);
        const extra = cv * n - total;
        sheet.querySelector('#n-hint').textContent = `${n} cuotas de ${money(cv)} · total ${money(cv * n)}${extra > 0 ? ` (interés ${money(extra)})` : ''}${
          paid ? ` · se anotan de la cuota ${paid + 1} a la ${n}` : ''
        } desde ${monthLabel(monthKey(form.elements.date.value || defDate))}`;
      };
      if (split) {
        split.onchange = () => {
          sheet.querySelector('#n-wrap').hidden = !split.checked;
          sheet.querySelector('#amt-l').textContent = split.checked ? 'Monto total de la compra' : 'Monto';
          sheet.querySelector('#date-l').textContent = split.checked ? 'Fecha de la primera cuota a anotar' : 'Fecha';
          if (split.checked) form.elements.n.focus();
          hint();
        };
        form.oninput = hint;
      }
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { amount: parseMoney(f.get('amount')), cat: f.get('cat').trim(), desc: f.get('desc').trim(), date: f.get('date') };
        if (!data.amount || !data.cat) return toast('Falta el monto o la categoría');
        const n = cuotas();
        if (split?.checked && n < 2) return toast('Indica de 2 a 60 cuotas');
        const pl = plan();
        if (editing) Object.assign(exp, data);
        else if (n >= 2) {
          const groupId = uid();
          // sin valor de cuota: la diferencia por redondeo va en la primera cuota
          for (let i = pl.paid; i < n; i++) {
            const amount = !pl.custom && i === 0 ? data.amount - pl.cv * (n - 1) : pl.cv;
            state.finance.expenses.push({ id: uid(), ...data, amount, date: shiftDate(data.date, i - pl.paid), groupId, cuota: [i + 1, n], total: pl.cv * n });
          }
        } else state.finance.expenses.push({ id: uid(), ...data });
        save();
        close();
        if (n >= 2) toast(`Compra en ${n} cuotas de ${money(pl.cv)}`);
        else budgetAlert(data.cat, monthKey(data.date));
        // Si el gasto cae en otro mes, nos movemos a ese mes para que se vea.
        ym = monthKey(data.date);
        render();
      });
      sheet.querySelector('#del')?.addEventListener('click', () => {
        if (exp.groupId) {
          if (!confirm(`¿Eliminar la compra completa (las ${exp.cuota[1]} cuotas)?`)) return;
          state.finance.expenses = state.finance.expenses.filter((x) => x.groupId !== exp.groupId);
        } else {
          if (!confirm('¿Eliminar este gasto?')) return;
          state.finance.expenses = state.finance.expenses.filter((x) => x.id !== exp.id);
        }
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
    <form id="f">${
      state.savingsAccounts.length > 1
        ? `<label class="field">Cuenta<select name="acc">${state.savingsAccounts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>`
        : ''
    }<label class="field">Monto (disponible: ${money(avail)})<input name="v" inputmode="numeric" required value="${Math.max(0, avail)}"></label>
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Enviar</button></div></form>`,
    (sheet, close) =>
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const v = parseMoney(fd.get('v'));
        const acc = fd.get('acc') || state.savingsAccounts[0].id;
        if (!v) return;
        if (v > avail && !confirm('Es más de lo que te queda disponible este mes. ¿Enviar igual?')) return;
        state.savings.push({ id: uid(), date: todayStr(), type: 'in', amount: v, note: `Sobrante ${monthLabel(ym)}`, ym, acc });
        save();
        close();
        toast('Enviado a ahorro');
        render();
      })
  );
}

function budgetSheet() {
  const cats = [...new Set([...allCats(), ...Object.keys(budgets())])];
  openSheet(
    `<h3>Topes por categoría</h3>
    <p class="muted small" style="margin-top:0">Lo máximo que quieres gastar al mes en cada categoría. Te avisaremos al llegar al 80% y si te pasas. Deja en blanco las que no quieras controlar.</p>
    <form id="f">${cats
      .map((c, i) => `<label class="field">${esc(c)}<input name="b${i}" inputmode="numeric" value="${budgets()[c] || ''}" placeholder="Sin tope"></label>`)
      .join('')}
    <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Guardar</button></div></form>`,
    (sheet, close) =>
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const out = {};
        cats.forEach((c, i) => {
          const v = parseMoney(f.get('b' + i));
          if (v) out[c] = v;
        });
        state.finance.budgets = out;
        save();
        close();
        toast('Topes guardados');
        render();
      })
  );
}
