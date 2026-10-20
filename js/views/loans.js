// Préstamos dentro de Gastos: lo que presté a otros (me lo devuelven en cuotas) y lo que me prestaron
// (lo pago en cuotas). Cada préstamo tiene un calendario de cuotas mensuales.
//   Presté:        el mes del préstamo sale la plata (si "counted"); cada cuota cobrada entra como ingreso.
//   Me prestaron:  el mes del préstamo entra la plata (si "counted"); cada cuota pagada es un gasto
//                  (categoría Deudas / Créditos), y las impagas del mes cuentan como "por pagar".
import { state, save } from '../store.js';
import { esc, uid, money, num, parseMoney, openSheet, toast, todayStr, monthKey, addMonths, monthLabel, monthShort, vibrate } from '../util.js';

const loans = () => state.finance.loans;
const pad = (n) => String(n).padStart(2, '0');

// Calendario: [{ i: 1..n, ym }]
export const scheduleOf = (l) => Array.from({ length: l.n }, (_, k) => ({ i: k + 1, ym: addMonths(l.start, k) }));
const cuotaIn = (l, ym) => scheduleOf(l).find((c) => c.ym === ym);
const paidExpense = (l, ym) => state.finance.expenses.find((e) => e.loanId === l.id && e.cuotaYm === ym);
// Monto de la cuota i. Si el valor se calculó solo (auto), la última absorbe el redondeo para que sumen el monto.
export const cuotaOf = (l, i) => (l.auto && i === l.n ? Math.max(0, l.amount - l.cuota * (l.n - 1)) : l.cuota);
// ¿cuota resuelta? (pagada / cobrada, o marcada como pagada antes de usar la app)
export function isSettled(l, c) {
  if (c.i <= (l.prepaid || 0)) return true;
  return l.dir === 'lent' ? !!l.received?.[c.ym] : !!paidExpense(l, c.ym);
}
export function remainingOf(l) {
  const left = scheduleOf(l).filter((c) => !isSettled(l, c));
  return { count: left.length, amount: left.reduce((a, c) => a + cuotaOf(l, c.i), 0) };
}
const endYm = (l) => addMonths(l.start, l.n - 1);
const who = (l) => (l.dir === 'lent' ? `Le prestaste a ${l.person}` : `Te prestó ${l.person}`);

// Efecto del mes en el resumen de Gastos.
export function loanMonth(ym) {
  let lentOut = 0, borrowedIn = 0, repaidIn = 0, duePending = 0;
  const incomes = []; // filas para "Ingresos del mes"
  for (const l of loans()) {
    if (l.counted && monthKey(l.date) === ym) {
      if (l.dir === 'lent') lentOut += l.amount;
      else (borrowedIn += l.amount), incomes.push({ label: `Préstamo de ${l.person}`, amount: l.amount });
    }
    const c = cuotaIn(l, ym);
    if (!c || c.i <= (l.prepaid || 0)) continue;
    if (l.dir === 'lent' && l.received?.[ym]) (repaidIn += cuotaOf(l, c.i)), incomes.push({ label: `${l.person} te devolvió (cuota ${c.i}/${l.n})`, amount: cuotaOf(l, c.i) });
    if (l.dir === 'borrowed' && !paidExpense(l, ym)) duePending += cuotaOf(l, c.i);
  }
  return { lentOut, borrowedIn, repaidIn, duePending, incomes };
}

// Marca la cuota de un mes como pagada / cobrada (o la desmarca).
export function toggleCuota(l, ym) {
  const c = cuotaIn(l, ym);
  if (!c) return;
  if (l.dir === 'lent') {
    l.received ||= {};
    if (l.received[ym]) delete l.received[ym];
    else (l.received[ym] = true), vibrate();
  } else {
    const ex = paidExpense(l, ym);
    if (ex) state.finance.expenses = state.finance.expenses.filter((e) => e !== ex);
    else {
      const date = ym === monthKey(todayStr()) ? todayStr() : `${ym}-${pad(Math.min(+l.date.slice(8, 10) || 1, 28))}`;
      state.finance.expenses.push({ id: uid(), loanId: l.id, cuotaYm: ym, amount: cuotaOf(l, c.i), cat: 'Deudas / Créditos', desc: `Cuota ${c.i}/${l.n} préstamo de ${l.person}`, date });
      vibrate();
    }
  }
  const r = remainingOf(l);
  if (!r.count) toast(l.dir === 'lent' ? `¡${l.person} te devolvió todo! 🎉` : `¡Préstamo de ${l.person} pagado! 🎉`);
  save();
}

// Tarjeta para la pestaña Gastos.
export function loansCard(ym) {
  const list = loans().filter((l) => remainingOf(l).count || endYm(l) >= ym || monthKey(l.date) === ym);
  const owe = loans().filter((l) => l.dir === 'borrowed').reduce((a, l) => a + remainingOf(l).amount, 0);
  const owed = loans().filter((l) => l.dir === 'lent').reduce((a, l) => a + remainingOf(l).amount, 0);
  return `<div class="card">
    <div class="row between"><h2 style="margin:0">Préstamos</h2><button class="sm" data-act="loan-new">+ Préstamo</button></div>
    ${
      loans().length
        ? `<div class="row between small" style="margin:8px 0 2px;flex-wrap:wrap;gap:4px 12px">${owed ? `<span>Te deben <b class="pos">${money(owed)}</b></span>` : ''}${owe ? `<span>Debes <b class="neg">${money(owe)}</b></span>` : ''}</div>` +
          list
            .map((l) => {
              const c = cuotaIn(l, ym);
              const active = c && c.i > (l.prepaid || 0);
              const done = active && isSettled(l, c);
              const r = remainingOf(l);
              return `<div class="item ${done ? 'done' : ''}">
              ${active ? `<button class="check ${done ? 'on' : ''}" data-act="loan-tick" data-id="${l.id}" aria-label="${l.dir === 'lent' ? 'Marcar cuota cobrada' : 'Marcar cuota pagada'}" aria-pressed="${done}">✓</button>` : '<span class="check-sp"></span>'}
              <div class="grow" data-act="loan-open" data-id="${l.id}"><div class="t">${esc(who(l))}</div>
                <div class="s">${active ? `Cuota ${c.i}/${l.n} ${l.dir === 'lent' ? (done ? 'cobrada' : 'por cobrar') : done ? 'pagada' : 'por pagar'}` : 'Sin cuota este mes'} · ${r.count ? `quedan ${money(r.amount)}` : '¡completo!'}</div></div>
              <div class="amount ${l.dir === 'lent' ? 'pos' : 'neg'}">${active ? money(cuotaOf(l, c.i)) : ''}</div></div>`;
            })
            .join('')
        : '<div class="small muted" style="margin-top:8px">Registra lo que prestas ("le presté $100.000 a Juan en 4 cuotas") o lo que te prestan, y marca cada cuota al pagarla o cobrarla.</div>'
    }</div>`;
}

export function loanSheet(l, onDone) {
  const editing = !!l;
  let dir = l?.dir || 'lent';
  const nextMonth = addMonths(monthKey(todayStr()), 1);
  openSheet(
    `<h3>${editing ? 'Editar préstamo' : 'Nuevo préstamo'}</h3>
    <div class="seg" id="dir"><button type="button" data-d="lent">Yo presté</button><button type="button" data-d="borrowed">Me prestaron</button></div>
    <form id="f">
      <label class="field"><span id="who-l">¿A quién?</span><input name="person" required maxlength="40" value="${esc(l?.person)}" placeholder="Ej: Juan, mi hermana, Banco" autocomplete="off"></label>
      <div class="two"><label class="field">Monto prestado<input name="amount" inputmode="numeric" required value="${l?.amount || ''}" placeholder="Ej: 300000"></label>
        <label class="field">Fecha del préstamo<input name="date" type="date" required value="${l?.date || todayStr()}"></label></div>
      <div class="two"><label class="field">N° de cuotas<input name="n" inputmode="numeric" required value="${l?.n || ''}" placeholder="Ej: 6 (1 = un pago)"></label>
        <label class="field">Valor de cada cuota<input name="cuota" inputmode="numeric" value="${l?.cuota || ''}" placeholder="Se calcula solo"></label></div>
      <label class="field">Primera cuota<input name="start" type="month" required value="${l?.start || nextMonth}"></label>
      <div class="small muted" id="calc" style="margin-top:8px"></div>
      <label class="field">Cuotas ya ${'<span id="pp-l">cobradas</span>'} antes de anotarlo (opcional)<input name="prepaid" inputmode="numeric" value="${l?.prepaid || ''}" placeholder="Ej: 0"></label>
      <label class="cuotas"><input type="checkbox" name="counted" ${l ? (l.counted ? 'checked' : '') : 'checked'}> <span id="counted-l">Descontar el monto del disponible del mes del préstamo</span></label>
      <label class="field">Nota (opcional)<input name="note" maxlength="60" value="${esc(l?.note)}" placeholder="Ej: para el auto, sin interés" autocomplete="off"></label>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#f');
      const $ = (s) => sheet.querySelector(s);
      const drawDir = () => {
        sheet.querySelectorAll('#dir button').forEach((b) => b.classList.toggle('sel', b.dataset.d === dir));
        $('#who-l').textContent = dir === 'lent' ? '¿A quién le prestaste?' : '¿Quién te prestó?';
        $('#pp-l').textContent = dir === 'lent' ? 'cobradas' : 'pagadas';
        $('#counted-l').textContent = dir === 'lent' ? 'Descontar el monto del disponible del mes del préstamo' : 'Sumar el monto a los ingresos del mes del préstamo';
        calc();
      };
      const calc = () => {
        const amount = parseMoney(form.elements.amount.value);
        const n = parseInt(form.elements.n.value, 10) || 0;
        const auto = !parseMoney(form.elements.cuota.value);
        const cuota = parseMoney(form.elements.cuota.value) || (amount && n ? Math.round(amount / n) : 0);
        if (!amount || !n) return ($('#calc').textContent = '');
        const total = auto ? amount : cuota * n;
        const extra = total - amount;
        const end = addMonths(form.elements.start.value || nextMonth, n - 1);
        $('#calc').innerHTML = `${n} cuota${n > 1 ? 's' : ''} de <b>${money(cuota)}</b> · total ${money(total)}${extra > 0 ? ` (interés ${money(extra)})` : ''} · ${n > 1 ? `de ${monthShort(form.elements.start.value || nextMonth)} a ${monthShort(end)} ${end.slice(0, 4)}` : monthLabel(end)}`;
      };
      $('#dir').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) (dir = b.dataset.d), drawDir();
      };
      form.oninput = calc;
      drawDir();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const amount = parseMoney(f.get('amount'));
        const n = Math.max(0, Math.min(120, parseInt(f.get('n'), 10) || 0));
        if (!amount || !n) return toast('Completa el monto y el número de cuotas');
        const data = {
          dir,
          person: f.get('person').trim(),
          amount,
          date: f.get('date'),
          n,
          cuota: parseMoney(f.get('cuota')) || Math.round(amount / n),
          auto: !parseMoney(f.get('cuota')),
          start: f.get('start'),
          prepaid: Math.max(0, Math.min(n, parseInt(f.get('prepaid'), 10) || 0)),
          counted: !!f.get('counted'),
          note: f.get('note').trim(),
        };
        if (!data.person) return toast('¿Con quién es el préstamo?');
        if (editing) {
          // si cambió de dirección, las cuotas pagadas como gasto ya no aplican
          if (l.dir !== dir) state.finance.expenses = state.finance.expenses.filter((e) => e.loanId !== l.id);
          Object.assign(l, data);
          for (const e of state.finance.expenses.filter((x) => x.loanId === l.id)) {
            const c = scheduleOf(l).find((x) => x.ym === e.cuotaYm);
            if (c) e.amount = cuotaOf(l, c.i);
          }
          // cuotas pagadas que quedaron fuera del nuevo calendario (o dentro de "ya pagadas")
          const sched = scheduleOf(l);
          const stray = state.finance.expenses.filter((e) => e.loanId === l.id && !sched.some((c) => c.ym === e.cuotaYm && c.i > (l.prepaid || 0)));
          if (stray.length) {
            if (confirm(`${stray.length} cuota${stray.length > 1 ? 's pagadas quedan' : ' pagada queda'} fuera del nuevo calendario. ¿Borrar ${stray.length > 1 ? 'esos gastos' : 'ese gasto'}? (Cancelar = dejarlos como gastos normales)`))
              state.finance.expenses = state.finance.expenses.filter((e) => !stray.includes(e));
            else for (const e of stray) delete e.loanId, delete e.cuotaYm;
          }
        } else loans().push({ id: uid(), received: {}, ...data });
        save();
        close();
        toast('Préstamo guardado');
        onDone();
      });
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar el préstamo con ${l.person}? También se borran sus cuotas pagadas registradas como gasto.`)) return;
        state.finance.loans = loans().filter((x) => x !== l);
        state.finance.expenses = state.finance.expenses.filter((e) => e.loanId !== l.id);
        save();
        close();
        onDone();
      });
    }
  );
}

// Detalle: calendario completo con cada cuota para marcar.
export function loanDetail(l, onDone) {
  openSheet(
    `<div class="row between"><h3>${esc(who(l))}</h3><button class="sm" id="edit">Editar</button></div>
    <p class="muted small" style="margin-top:0">${money(l.amount)} el ${l.date.split('-').reverse().join('-')} · ${l.n} cuota${l.n > 1 ? 's' : ''} de ${money(l.cuota)}${l.note ? ' · ' + esc(l.note) : ''}</p>
    <div id="sum"></div>
    <div id="sched" class="ing"></div>
    <div class="actions"><button class="primary" data-close>Listo</button></div>`,
    (sheet, close) => {
      const draw = () => {
        const r = remainingOf(l);
        const done = l.n - r.count;
        sheet.querySelector('#sum').innerHTML = `<div class="bar" style="margin:4px 0 6px"><i style="width:${(done / l.n) * 100}%"></i></div>
          <div class="row between small"><span>${done} de ${l.n} ${l.dir === 'lent' ? 'cobradas' : 'pagadas'}</span><span>Quedan <b>${money(r.amount)}</b></span></div>`;
        sheet.querySelector('#sched').innerHTML = scheduleOf(l)
          .map((c) => {
            const pre = c.i <= (l.prepaid || 0);
            const ok = isSettled(l, c);
            return `<div class="item ${ok ? 'done' : ''}">${
              pre ? '<span class="check on" style="opacity:.5">✓</span>' : `<button class="check ${ok ? 'on' : ''}" data-ym="${c.ym}" aria-pressed="${ok}" aria-label="Cuota ${c.i}">✓</button>`
            }<div class="grow"><div class="t">Cuota ${c.i}</div><div class="s">${monthLabel(c.ym)}${pre ? ' · antes de anotarlo' : ''}</div></div><div class="amount">${money(cuotaOf(l, c.i))}</div></div>`;
          })
          .join('');
      };
      sheet.querySelector('#sched').onclick = (e) => {
        const b = e.target.closest('[data-ym]');
        if (!b) return;
        toggleCuota(l, b.dataset.ym);
        draw();
        onDone();
      };
      sheet.querySelector('#edit').onclick = () => {
        close();
        loanSheet(l, onDone);
      };
      draw();
    }
  );
}

export const loanById = (id) => loans().find((l) => l.id === id);
