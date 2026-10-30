// Tarjetas de crédito o débito para repartir gastos, compras en cuotas, gastos fijos y préstamos.
// Cada gasto puede llevar cardId. Por tarjeta se ve lo gastado en el mes y, en las de crédito con cupo,
// cuánto queda disponible (aprox.: compras de este mes + cuotas que faltan; los meses pasados se dan por pagados).
import { state, save } from './store.js';
import { esc, uid, money, parseMoney, openSheet, toast, todayStr, monthKey, monthLabel, shortDate } from './util.js';

export const cards = () => state.finance.cards;
export const cardById = (id) => (id ? cards().find((c) => c.id === id) : null);
export const cardName = (id) => cardById(id)?.name || '';
const sum = (list) => list.reduce((a, e) => a + e.amount, 0);

// Campo "Pagado con" para los formularios (no aparece si no hay tarjetas).
export function cardSelect(selected = '', label = 'Pagado con') {
  if (!cards().length) return '';
  return `<label class="field">${label}<select name="cardId"><option value="">Sin tarjeta (efectivo o transferencia)</option>${cards()
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`)
    .join('')}</select></label>`;
}

export function cardMonth(c, ym) {
  const mine = state.finance.expenses.filter((e) => e.cardId === c.id);
  const month = mine.filter((e) => monthKey(e.date) === ym);
  const nowYm = monthKey(todayStr());
  const used = sum(mine.filter((e) => monthKey(e.date) >= nowYm));
  return { month, spent: sum(month), used, avail: c.kind === 'credit' && c.limit ? c.limit - used : null };
}

// Tarjeta "Tarjetas" de la pestaña Gastos.
export function cardsCard(ym) {
  const list = cards();
  const loose = sum(state.finance.expenses.filter((e) => monthKey(e.date) === ym && !cardById(e.cardId)));
  return `<div class="card">
    <div class="row between"><h2 style="margin:0">Tarjetas</h2><button class="sm" data-act="card-new">+ Tarjeta</button></div>
    ${
      list.length
        ? list
            .map((c) => {
              const m = cardMonth(c, ym);
              return `<div class="item" data-act="card-open" data-id="${c.id}"><span class="emoji">💳</span><div class="grow"><div class="t">${esc(c.name)}</div>
                <div class="s">${c.kind === 'credit' ? 'Crédito' : 'Débito'}${c.payDay ? ` · se paga el día ${c.payDay}` : ''} · ${m.month.length} ${m.month.length === 1 ? 'movimiento' : 'movimientos'}</div>
                ${m.avail != null ? `<div class="bar ${m.avail < 0 ? 'over' : m.used / c.limit >= 0.8 ? 'near' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, (m.used / c.limit) * 100)}%"></i></div><div class="s">${m.avail >= 0 ? `Disponible ${money(m.avail)} de ${money(c.limit)}` : `Te pasaste del cupo en ${money(-m.avail)}`}</div>` : ''}</div>
                <div class="amount">${money(m.spent)}</div></div>`;
            })
            .join('') + `<div class="row between small" style="margin-top:8px"><span class="muted">Sin tarjeta este mes</span><b>${money(loose)}</b></div>`
        : '<div class="small muted" style="margin-top:8px">Agrega tus tarjetas de crédito o débito para ver cuánto gastas con cada una y cuánto cupo te queda. Después eliges la tarjeta al anotar un gasto, un gasto fijo o un préstamo.</div>'
    }</div>`;
}

export function cardDetail(c, ym, onDone) {
  const m = cardMonth(c, ym);
  const nowYm = monthKey(todayStr());
  const later = state.finance.expenses.filter((e) => e.cardId === c.id && monthKey(e.date) > ym);
  const fixed = state.finance.fixed.filter((f) => f.cardId === c.id);
  const loans = state.finance.loans.filter((l) => l.cardId === c.id);
  openSheet(
    `<div class="row between"><h3>💳 ${esc(c.name)}</h3><button class="sm" id="edit">Editar</button></div>
    <div class="breakdown">
      <div class="row between"><span class="muted">${monthLabel(ym)}</span><b>${money(m.spent)}</b></div>
      ${later.length ? `<div class="row between"><span class="muted">Cuotas de los meses siguientes</span><span>${money(sum(later))}</span></div>` : ''}
      ${m.avail != null ? `<div class="row between"><span class="muted">Cupo usado (aprox.)</span><span>${money(m.used)} de ${money(c.limit)}</span></div><div class="row between"><span class="muted">Disponible</span><b>${money(m.avail)}</b></div>` : ''}
      ${c.payDay ? `<div class="row between"><span class="muted">Día de pago</span><span>${c.payDay} de cada mes</span></div>` : ''}
    </div>
    ${m.avail != null && ym === nowYm ? '<div class="small muted" style="margin-top:6px">El cupo es aproximado: suma lo comprado este mes y las cuotas que faltan. Tu banco puede mostrar otra cifra según su fecha de facturación.</div>' : ''}
    <h4 style="margin:14px 0 4px">Movimientos del mes</h4>
    ${
      m.month.length
        ? [...m.month]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => `<div class="item"><div class="grow"><div class="t">${esc(e.desc || e.cat)}</div><div class="s">${shortDate(e.date)}${e.cuota ? ` · cuota ${e.cuota[0]} de ${e.cuota[1]}` : ''}${e.fixedId ? ' · fijo' : ''}${e.loanId ? ' · préstamo' : ''}</div></div><div class="amount">${money(e.amount)}</div></div>`)
            .join('')
        : '<div class="small muted">Sin movimientos con esta tarjeta en el mes.</div>'
    }
    ${fixed.length || loans.length ? `<h4 style="margin:14px 0 4px">Cargos que se pagan con esta tarjeta</h4>${[...fixed.map((f) => `<div class="item"><div class="grow t">${esc(f.name)}</div><div class="s">día ${f.day}</div><div class="amount">${money(f.amount)}</div></div>`), ...loans.map((l) => `<div class="item"><div class="grow t">Préstamo de ${esc(l.person)}</div><div class="amount">${money(l.cuota)}/mes</div></div>`)].join('')}` : ''}
    <div class="actions"><button class="primary" data-close>Listo</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#edit').onclick = () => {
        close();
        cardSheet(c, onDone);
      };
    }
  );
}

export function cardSheet(c, onDone) {
  const editing = !!c;
  let kind = c?.kind || 'credit';
  openSheet(
    `<h3>${editing ? 'Editar tarjeta' : 'Nueva tarjeta'}</h3>
    <form id="f">
      <label class="field">Nombre<input name="name" required maxlength="30" value="${esc(c?.name)}" placeholder="Ej: Visa BancoEstado, CMR Falabella" autocomplete="off"></label>
      <div class="seg" id="kind" style="margin-top:10px"><button type="button" data-k="credit">Crédito</button><button type="button" data-k="debit">Débito</button></div>
      <div id="credit"><div class="two"><label class="field">Cupo total (opcional)<input name="limit" inputmode="numeric" value="${c?.limit || ''}" placeholder="Ej: 800000"></label>
        <label class="field">Día de pago (opcional)<input name="payDay" inputmode="numeric" maxlength="2" value="${c?.payDay || ''}" placeholder="Ej: 5"></label></div></div>
      <p class="small muted">No escribas el número de la tarjeta: solo un nombre para reconocerla.</p>
      <div class="actions">${editing ? '<button type="button" class="danger" id="del">Eliminar</button>' : '<button type="button" class="ghost" data-close>Cancelar</button>'}<button class="primary">Guardar</button></div>
    </form>`,
    (sheet, close) => {
      const $ = (s) => sheet.querySelector(s);
      const drawKind = () => {
        sheet.querySelectorAll('#kind button').forEach((b) => b.classList.toggle('sel', b.dataset.k === kind));
        $('#credit').hidden = kind !== 'credit';
      };
      $('#kind').onclick = (e) => {
        const b = e.target.closest('[data-k]');
        if (b) (kind = b.dataset.k), drawKind();
      };
      drawKind();
      $('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const name = f.get('name').trim();
        if (!name) return toast('Ponle un nombre a la tarjeta');
        if (/\d{6,}/.test(name.replace(/\s/g, ''))) return toast('No escribas el número de la tarjeta, solo un nombre');
        const data = { name, kind, limit: kind === 'credit' ? parseMoney(f.get('limit')) : 0, payDay: kind === 'credit' ? Math.min(31, Math.max(0, parseInt(f.get('payDay'), 10) || 0)) : 0 };
        if (editing) Object.assign(c, data);
        else cards().push({ id: uid(), ...data });
        save();
        close();
        toast('Tarjeta guardada');
        onDone();
      });
      $('#del')?.addEventListener('click', () => {
        if (!confirm(`¿Eliminar la tarjeta "${c.name}"? Los gastos se conservan, pero quedan sin tarjeta.`)) return;
        state.finance.cards = cards().filter((x) => x !== c);
        for (const x of [...state.finance.expenses, ...state.finance.fixed, ...state.finance.loans]) if (x.cardId === c.id) delete x.cardId;
        save();
        close();
        onDone();
      });
    }
  );
}
