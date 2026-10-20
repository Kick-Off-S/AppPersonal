// Ahorro separado por cuentas (cuenta de ahorro, depósito a plazo, fondo mutuo, APV…).
// Movimientos: aporte (in), retiro (out), interés o rentabilidad (int, con signo) y traspaso entre cuentas (move).
// Los intereses no vienen del sueldo: suman al ahorro pero no cuentan como "aportado".
import { state, save } from '../store.js';
import { esc, uid, money, num, parseMoney, openSheet, toast, todayStr, monthKey, monthLabel, shortDate } from '../util.js';
import { allCats } from './finance.js';

export const KINDS = {
  cuenta: 'Cuenta de ahorro',
  deposito: 'Depósito a plazo',
  fondo: 'Fondo mutuo / inversión',
  apv: 'APV / ahorro previsional',
  acciones: 'Acciones / cripto',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

let root;
let accId = null; // cuenta abierta (null = todas)

const accounts = () => state.savingsAccounts;
const accById = (id) => accounts().find((a) => a.id === id);
const accName = (id) => accById(id)?.name || 'Cuenta';

// Efecto de un movimiento en una cuenta (o en el total si acc es null).
function delta(m, acc) {
  if (m.type === 'move') {
    if (!acc) return 0;
    return (m.to === acc ? m.amount : 0) - (m.acc === acc ? m.amount : 0);
  }
  if (acc && m.acc !== acc) return 0;
  return m.type === 'out' ? -m.amount : m.amount; // in y int (int puede ser negativo)
}
export const balanceOf = (acc = null, list = state.savings) => list.reduce((a, m) => a + delta(m, acc), 0);
const sumType = (type, acc) => state.savings.filter((m) => m.type === type && (!acc || m.acc === acc)).reduce((a, m) => a + m.amount, 0);
const touches = (m, acc) => !acc || m.acc === acc || m.to === acc;
const rateTxt = (a) => (a.rate ? `${num(a.rate, 2)}% anual` : '');
// Interés estimado de un mes según la tasa anual (simple, como referencia).
const monthlyEstimate = (a) => (a.rate ? Math.round((balanceOf(a.id) * a.rate) / 100 / 12) : 0);

export function mount(el) {
  root = el;
  if (accId && !accById(accId)) accId = null;
  root.onclick = onClick;
  render();
}

function render() {
  const acc = accId ? accById(accId) : null;
  const bal = balanceOf(accId);
  const goal = state.savingsGoal || 0;
  const totalIn = sumType('in', accId);
  const totalOut = sumType('out', accId);
  const interest = sumType('int', accId);
  const list = state.savings.filter((m) => touches(m, accId)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const groups = {};
  for (const m of list) (groups[monthKey(m.date)] ||= []).push(m);
  const est = acc ? monthlyEstimate(acc) : 0;

  const header = acc
    ? `<div class="nav" style="margin-top:0"><button class="icon" data-act="all" aria-label="Todas las cuentas">‹</button>
        <div class="label">${esc(acc.name)}</div><button class="icon" data-act="editacc" aria-label="Editar cuenta">✎</button></div>
      <div class="card">
        <div class="small muted">${esc(KINDS[acc.kind] || 'Cuenta')}${acc.rate ? ' · ' + rateTxt(acc) : ''}</div>
        <div class="big ${bal < 0 ? 'neg' : ''}">${money(bal)}</div>
        <div class="row between small muted" style="margin-top:10px;flex-wrap:wrap;gap:4px 12px"><span>Aportado ${money(totalIn)}</span><span>Retirado ${money(totalOut)}</span>
          <span class="${interest < 0 ? 'neg' : interest > 0 ? 'pos' : ''}">Intereses ${interest < 0 ? '−' : '+'}${money(Math.abs(interest))}</span></div>
        ${est > 0 ? `<div class="small muted" style="margin-top:6px">Interés estimado: ~${money(est)} al mes</div>` : ''}
        <button class="block" data-act="adjust" style="margin-top:12px">Actualizar saldo según mi banco</button>
      </div>`
    : `<div class="card">
        <div class="small muted">Ahorro total</div>
        <div class="big ${bal < 0 ? 'neg' : ''}">${money(bal)}</div>
        ${
          goal
            ? `<div class="bar" style="margin:12px 0 4px"><i style="width:${Math.max(0, Math.min(100, (bal / goal) * 100))}%"></i></div>
               <div class="row between small muted"><span>Meta: ${money(goal)}</span><span>${num(Math.max(0, (bal / goal) * 100), 0)}%${bal >= goal ? ' · ¡Meta lograda!' : ` · faltan ${money(goal - bal)}`}</span></div>`
            : ''
        }
        <div class="row between small muted" style="margin-top:10px;flex-wrap:wrap;gap:4px 12px"><span>Aportado ${money(totalIn)}</span><span>Retirado ${money(totalOut)}</span>
          <span class="${interest < 0 ? 'neg' : interest > 0 ? 'pos' : ''}">Intereses ${interest < 0 ? '−' : '+'}${money(Math.abs(interest))}</span></div>
        <button class="ghost sm" data-act="goal" style="margin-top:6px;padding:0">${goal ? 'Cambiar meta' : 'Definir una meta (opcional)'}</button>
      </div>
      <div class="card"><div class="row between"><h2 style="margin:0">Mis cuentas</h2><button class="sm" data-act="newacc">+ Cuenta</button></div>
        ${accounts()
          .map((a) => {
            const b = balanceOf(a.id);
            const i = sumType('int', a.id);
            return `<div class="item" data-act="open" data-id="${a.id}"><div class="grow"><div class="t">${esc(a.name)}</div>
              <div class="s">${esc(KINDS[a.kind] || 'Cuenta')}${a.rate ? ' · ' + rateTxt(a) : ''}${i ? ` · <span class="${i < 0 ? 'neg' : 'pos'}" style="white-space:nowrap">${i < 0 ? '−' : '+'}${money(Math.abs(i))} intereses</span>` : ''}</div></div>
              <div class="amount">${money(b)}</div><span class="muted">›</span></div>`;
          })
          .join('')}
      </div>`;

  root.innerHTML = `${header}
    <div class="acts">
      <button class="primary" data-act="in">+ Aportar</button><button data-act="out">− Retirar</button>
      <button data-act="int">% Interés</button>${accounts().length > 1 ? '<button data-act="move">⇄ Mover</button>' : ''}
    </div>
    ${
      list.length
        ? Object.entries(groups)
            .map(([m, items]) => `<div class="card"><h2>${monthLabel(m)}</h2>${items.map(row).join('')}</div>`)
            .join('')
        : `<div class="card empty"><b>Aún no hay movimientos</b>Registra tus aportes, retiros (con su motivo) y los intereses que te paga cada cuenta.</div>`
    }`;
}

function row(m) {
  const multi = accounts().length > 1;
  let title, sub, amt, cls;
  if (m.type === 'move') {
    title = m.note || 'Traspaso entre cuentas';
    sub = `${esc(accName(m.acc))} → ${esc(accName(m.to))}`;
    const d = accId ? delta(m, accId) : 0;
    amt = accId ? `${d < 0 ? '−' : '+'}${money(Math.abs(d))}` : `⇄ ${money(m.amount)}`;
    cls = accId ? (d < 0 ? 'neg' : 'pos') : 'muted';
  } else if (m.type === 'int') {
    title = m.note || (m.amount < 0 ? 'Pérdida' : 'Intereses');
    sub = `${m.amount < 0 ? 'Pérdida' : 'Interés / ganancia'}${multi && !accId ? ' · ' + esc(accName(m.acc)) : ''}`;
    amt = `${m.amount < 0 ? '−' : '+'}${money(Math.abs(m.amount))}`;
    cls = m.amount < 0 ? 'neg' : 'int';
  } else {
    const isIn = m.type === 'in';
    title = m.note || (isIn ? 'Aporte' : 'Retiro');
    sub = multi && !accId ? esc(accName(m.acc)) : '';
    amt = `${isIn ? '+' : '−'}${money(m.amount)}`;
    cls = isIn ? 'pos' : 'neg';
  }
  return `<div class="item" data-act="edit" data-id="${m.id}"><div class="grow"><div class="t">${esc(title)}</div>
    <div class="s">${shortDate(m.date)}${sub ? ' · ' + sub : ''}</div></div>
    <div class="amount ${cls}">${amt}</div></div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'open') {
    accId = id;
    render();
    window.scrollTo(0, 0);
  } else if (act === 'all') {
    accId = null;
    render();
  } else if (act === 'newacc') accountSheet();
  else if (act === 'editacc') accountSheet(accById(accId));
  else if (act === 'in' || act === 'out') moveSheet(act);
  else if (act === 'int') interestSheet();
  else if (act === 'move') transferSheet();
  else if (act === 'adjust') adjustSheet(accById(accId));
  else if (act === 'goal') goalSheet();
  else if (act === 'edit') {
    const m = state.savings.find((x) => x.id === id);
    if (m.type === 'int') interestSheet(m);
    else if (m.type === 'move') transferSheet(m);
    else moveSheet(null, m);
  }
}

// ---------- helpers de formularios ----------
const accSelect = (name, selected, label = 'Cuenta') =>
  accounts().length > 1
    ? `<label class="field">${label}<select name="${name}">${accounts()
        .map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`)
        .join('')}</select></label>`
    : `<input type="hidden" name="${name}" value="${accounts()[0].id}">`;
const defaultAcc = () => accId || accounts()[0].id;

function deleteButton(editing) {
  return editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>';
}

function bindDelete(sheet, item, close) {
  sheet.querySelector('#del')?.addEventListener('click', () => {
    if (!confirm(item.expenseId ? '¿Eliminar este retiro? También se borra el gasto que registraste con él.' : '¿Eliminar este movimiento?')) return;
    if (item.expenseId) state.finance.expenses = state.finance.expenses.filter((e) => e.id !== item.expenseId);
    state.savings = state.savings.filter((s) => s !== item);
    save();
    close();
    render();
  });
}

// ---------- cuentas ----------
function accountSheet(acc) {
  const editing = !!acc;
  openSheet(
    `<h3>${editing ? 'Editar cuenta' : 'Nueva cuenta de ahorro'}</h3>
    <form id="f">
      <label class="field">Nombre<input name="name" required maxlength="40" value="${esc(acc?.name)}" placeholder="Ej: Cuenta RUT, DAP Banco Estado, Fondo Fintual" autocomplete="off"></label>
      <label class="field">Tipo<select name="kind">${Object.entries(KINDS)
        .map(([k, v]) => `<option value="${k}" ${k === (acc?.kind || 'cuenta') ? 'selected' : ''}>${v}</option>`)
        .join('')}</select></label>
      <label class="field">Tasa de interés anual % (opcional)<input name="rate" inputmode="decimal" value="${acc?.rate ? String(acc.rate).replace('.', ',') : ''}" placeholder="Ej: 5,4"></label>
      <p class="small muted" style="margin:6px 0 0">Con la tasa te mostramos el interés estimado de cada mes. Si la rentabilidad varía (fondos, acciones), déjala en blanco y usa <b>Actualizar saldo</b>.</p>
      ${editing ? '' : '<label class="field">Saldo que ya tiene hoy (opcional)<input name="start" inputmode="numeric" placeholder="Ej: 500000"></label>'}
      <div class="actions">${editing ? '<button type="button" class="danger" id="delacc">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}
      <button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const rate = parseFloat(String(f.get('rate') || '').replace(',', '.')) || 0;
        const data = { name: f.get('name').trim(), kind: f.get('kind'), rate };
        if (!data.name) return toast('Ponle un nombre');
        if (editing) Object.assign(acc, data);
        else {
          const id = uid();
          state.savingsAccounts.push({ id, ...data });
          const start = parseMoney(f.get('start'));
          if (start) state.savings.push({ id: uid(), type: 'in', amount: start, note: 'Saldo inicial', date: todayStr(), acc: id });
          accId = id;
        }
        save();
        close();
        render();
      });
      sheet.querySelector('#delacc')?.addEventListener('click', () => {
        if (accounts().length <= 1) return toast('Debe quedar al menos una cuenta');
        const n = state.savings.filter((m) => m.acc === acc.id || m.to === acc.id).length;
        if (!confirm(n ? `Se eliminará "${acc.name}" y sus ${n} movimientos. ¿Continuar?` : `¿Eliminar "${acc.name}"?`)) return;
        const id = acc.id;
        // traspasos con otras cuentas: siguen existiendo como entrada o salida de la otra cuenta
        for (const m of state.savings) {
          if (m.type !== 'move') continue;
          if (m.acc === id && m.to !== id) Object.assign(m, { type: 'in', acc: m.to, note: m.note || `Desde ${acc.name}` }), delete m.to;
          else if (m.to === id && m.acc !== id) Object.assign(m, { type: 'out', note: m.note || `Hacia ${acc.name}` }), delete m.to;
        }
        // los gastos registrados con retiros de esta cuenta se borran junto a ellos
        const linked = new Set(state.savings.filter((m) => m.acc === id && m.expenseId).map((m) => m.expenseId));
        state.finance.expenses = state.finance.expenses.filter((e) => !linked.has(e.id));
        state.savings = state.savings.filter((m) => m.acc !== id);
        state.savingsAccounts = accounts().filter((a) => a !== acc);
        accId = null;
        save();
        close();
        render();
      });
    }
  );
}

// ---------- aporte / retiro ----------
// Aporte / retiro. Se conectan con Gastos:
//   aporte con "sale de mi dinero de este mes" -> se descuenta del disponible (ym)
//   retiro con "usar en el mes" -> suma a los ingresos del mes (ym); opcionalmente crea el gasto que paga (expenseId)
function moveSheet(kind, item) {
  const editing = !!item;
  const type = item?.type || kind;
  const isIn = type === 'in';
  const notes = [...new Set(state.savings.filter((s) => s.type === type && s.note).map((s) => s.note))].slice(0, 12);
  const linked = item?.expenseId ? state.finance.expenses.find((e) => e.id === item.expenseId) : null;
  const useMonth = editing ? !!item.ym : true;
  openSheet(
    `<h3>${editing ? 'Editar movimiento' : isIn ? 'Nuevo aporte' : 'Retiro de ahorro'}</h3>
    <form id="f">
      ${accSelect('acc', item?.acc || defaultAcc())}
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${item?.amount ?? ''}" placeholder="Ej: 50000"></label>
      <label class="field">${isIn ? 'Detalle (opcional)' : '¿Para qué fue?'}<input name="note" list="notes" maxlength="60" ${isIn ? '' : 'required'} value="${esc(item?.note)}" placeholder="${isIn ? 'Ej: Bono, sobrante del mes' : 'Ej: Emergencia, viaje, arreglo auto'}" autocomplete="off"></label>
      <datalist id="notes">${notes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="field">Fecha<input name="date" type="date" required value="${item?.date || todayStr()}"></label>
      ${
        isIn
          ? `<label class="cuotas"><input type="checkbox" name="month" ${useMonth ? 'checked' : ''}> <span>Sale de mi dinero de este mes <small class="muted">(se descuenta del disponible en Gastos)</small></span></label>`
          : `<label class="cuotas"><input type="checkbox" name="month" ${useMonth ? 'checked' : ''}> <span>Usar este dinero en el mes <small class="muted">(suma a tus ingresos en Gastos)</small></span></label>
        <label class="cuotas"><input type="checkbox" name="exp" ${!editing || linked ? 'checked' : ''}> <span>Registrar también el gasto que pagaste</span></label>
        <label class="field" id="cat-w">Categoría del gasto<input name="cat" list="cats" maxlength="40" value="${esc(linked?.cat || '')}" placeholder="Ej: Transporte, Salud, Ocio" autocomplete="off"></label>
        <datalist id="cats">${allCats().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`
      }
      <div class="actions">${deleteButton(editing)}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#f');
      const syncCat = () => {
        if (isIn) return;
        // el gasto solo tiene sentido si el dinero se usa en el mes
        form.elements.exp.disabled = !form.elements.month.checked;
        if (!form.elements.month.checked) form.elements.exp.checked = false;
        sheet.querySelector('#cat-w').hidden = !form.elements.exp.checked;
      };
      form.onchange = syncCat;
      syncCat();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const data = { amount: parseMoney(f.get('amount')), note: f.get('note').trim(), date: f.get('date'), acc: f.get('acc') };
        if (!data.amount) return toast('Ingresa un monto');
        const inMonth = !!f.get('month');
        const withExp = !isIn && inMonth && !!f.get('exp');
        const cat = (f.get('cat') || '').trim();
        if (withExp && !cat) return toast('Elige la categoría del gasto');
        const next = editing ? state.savings.map((s) => (s === item ? { ...s, ...data } : s)) : [...state.savings, { id: uid(), type, ...data }];
        if (!isIn && balanceOf(data.acc, next) < 0 && !confirm(`Ese retiro es mayor que el saldo de ${accName(data.acc)} (${money(balanceOf(data.acc))}). ¿Registrar igual?`)) return;
        // al editar sin cambiar el mes de la fecha se conserva el mes en Gastos (ej: "Sobrante de septiembre"
        // registrado en octubre sigue contando en septiembre)
        const keepYm = editing && item.ym && monthKey(item.date) === monthKey(data.date) ? item.ym : null;
        const mv = editing ? Object.assign(item, data) : next[next.length - 1];
        if (!editing) state.savings.push(mv);
        if (inMonth) mv.ym = keepYm || monthKey(data.date);
        else delete mv.ym;
        // gasto asociado al retiro: crear, actualizar o quitar
        const ex = mv.expenseId ? state.finance.expenses.find((e) => e.id === mv.expenseId) : null;
        if (withExp) {
          const exData = { amount: data.amount, cat, desc: data.note, date: data.date, savingsId: mv.id };
          if (ex) Object.assign(ex, exData);
          else {
            const id = uid();
            state.finance.expenses.push({ id, ...exData });
            mv.expenseId = id;
          }
        } else if (ex) {
          state.finance.expenses = state.finance.expenses.filter((e) => e !== ex);
          delete mv.expenseId;
        }
        save();
        close();
        if (!isIn && inMonth) toast(withExp ? 'Retiro y gasto registrados en Gastos' : 'Retiro sumado a tus ingresos del mes');
        render();
      });
      bindDelete(sheet, item, close);
    }
  );
}

// ---------- intereses / rentabilidad ----------
function interestSheet(item, preset) {
  const editing = !!item;
  let sign = item ? (item.amount < 0 ? -1 : 1) : 1;
  const acc0 = item?.acc || preset?.acc || defaultAcc();
  openSheet(
    `<h3>${editing ? 'Editar interés' : 'Registrar interés o ganancia'}</h3>
    <p class="muted small" style="margin-top:0">Lo que te paga la cuenta o lo que ganó (o perdió) tu inversión. No viene de tu sueldo, por eso no cuenta como aporte.</p>
    <form id="f">
      ${accSelect('acc', acc0)}
      <div class="seg" id="sign"><button type="button" data-s="1">Ganancia</button><button type="button" data-s="-1">Pérdida</button></div>
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${item ? Math.abs(item.amount) : preset?.amount || ''}" placeholder="Ej: 3500"></label>
      <div class="small muted" id="est" style="margin-top:6px"></div>
      <label class="field">Detalle (opcional)<input name="note" maxlength="60" value="${esc(item?.note ?? preset?.note ?? '')}" placeholder="Ej: Intereses de octubre, renovación DAP" autocomplete="off"></label>
      <label class="field">Fecha<input name="date" type="date" required value="${item?.date || todayStr()}"></label>
      <div class="actions">${deleteButton(editing)}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#f');
      const drawSign = () => sheet.querySelectorAll('#sign button').forEach((b) => b.classList.toggle('sel', +b.dataset.s === sign));
      sheet.querySelector('#sign').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) (sign = +b.dataset.s), drawSign();
      };
      // sugerencia según la tasa de la cuenta elegida
      const hint = () => {
        const a = accById(form.elements.acc.value);
        const est = a ? monthlyEstimate(a) : 0;
        sheet.querySelector('#est').innerHTML = est > 0 ? `Estimado del mes con ${rateTxt(a)}: <a href="#" id="use">${money(est)}</a>` : '';
        sheet.querySelector('#use')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          form.elements.amount.value = est;
          sign = 1;
          drawSign();
        });
      };
      form.elements.acc.onchange = hint;
      drawSign();
      hint();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const amount = parseMoney(f.get('amount'));
        if (!amount) return toast('Ingresa un monto');
        const data = { amount: sign * amount, note: f.get('note').trim(), date: f.get('date'), acc: f.get('acc') };
        if (editing) Object.assign(item, data);
        else state.savings.push({ id: uid(), type: 'int', ...data });
        save();
        close();
        toast(sign > 0 ? 'Interés registrado' : 'Pérdida registrada');
        render();
      });
      bindDelete(sheet, item, close);
    }
  );
}

// Para fondos/acciones: el usuario indica el saldo real y la diferencia se registra como rentabilidad.
function adjustSheet(acc) {
  const cur = balanceOf(acc.id);
  openSheet(
    `<h3>Actualizar saldo</h3>
    <p class="muted small" style="margin-top:0">Escribe el saldo que muestra hoy tu banco o app de inversión para <b>${esc(acc.name)}</b>. La diferencia se registra como ganancia o pérdida.</p>
    <form id="f">
      <label class="field">Saldo actual real<input name="v" inputmode="numeric" required placeholder="Hoy en la app: ${money(cur)}"></label>
      <div class="small muted" id="diff" style="margin-top:8px">En la app: ${money(cur)}</div>
      <div class="actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="primary">Actualizar</button></div>
    </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#f');
      form.oninput = () => {
        const v = parseMoney(form.elements.v.value);
        const d = v - cur;
        sheet.querySelector('#diff').innerHTML = v
          ? `En la app: ${money(cur)} → <b class="${d < 0 ? 'neg' : 'pos'}">${d < 0 ? 'Pérdida' : 'Ganancia'} de ${money(Math.abs(d))}</b>`
          : `En la app: ${money(cur)}`;
      };
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const v = parseMoney(form.elements.v.value);
        const d = v - cur;
        if (!d) {
          close();
          return toast('El saldo ya coincide');
        }
        state.savings.push({ id: uid(), type: 'int', amount: d, note: d > 0 ? 'Rentabilidad (actualización de saldo)' : 'Pérdida (actualización de saldo)', date: todayStr(), acc: acc.id });
        save();
        close();
        toast(`${d > 0 ? 'Ganancia' : 'Pérdida'} de ${money(Math.abs(d))} registrada`);
        render();
      });
    }
  );
}

// ---------- traspaso entre cuentas ----------
function transferSheet(item) {
  const editing = !!item;
  const from0 = item?.acc || defaultAcc();
  const to0 = item?.to || accounts().find((a) => a.id !== from0)?.id;
  openSheet(
    `<h3>${editing ? 'Editar traspaso' : 'Mover entre cuentas'}</h3>
    <p class="muted small" style="margin-top:0">Ej: de tu cuenta de ahorro a un depósito a plazo. No cambia tu ahorro total.</p>
    <form id="f">
      ${accSelect('acc', from0, 'Desde')}
      ${accSelect('to', to0, 'Hacia')}
      <label class="field">Monto<input name="amount" inputmode="numeric" required value="${item?.amount ?? ''}" placeholder="Ej: 300000"></label>
      <label class="field">Detalle (opcional)<input name="note" maxlength="60" value="${esc(item?.note)}" placeholder="Ej: Abrir depósito a plazo" autocomplete="off"></label>
      <label class="field">Fecha<input name="date" type="date" required value="${item?.date || todayStr()}"></label>
      <div class="actions">${deleteButton(editing)}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      sheet.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = { amount: parseMoney(f.get('amount')), note: f.get('note').trim(), date: f.get('date'), acc: f.get('acc'), to: f.get('to') };
        if (!data.amount) return toast('Ingresa un monto');
        if (data.acc === data.to) return toast('Elige dos cuentas distintas');
        if (editing) Object.assign(item, data);
        else state.savings.push({ id: uid(), type: 'move', ...data });
        save();
        close();
        render();
      });
      bindDelete(sheet, item, close);
    }
  );
}

function goalSheet() {
  openSheet(
    `<h3>Meta de ahorro</h3><form id="f"><label class="field">Monto objetivo del ahorro total (deja en blanco para quitarla)<input name="v" inputmode="numeric" value="${state.savingsGoal || ''}" placeholder="Ej: 2000000"></label>
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
