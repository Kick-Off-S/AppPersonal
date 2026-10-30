// Explicación de una compra o préstamo en cuotas: total a pagar, interés y tasa equivalente.
import { money, num, monthShort, addMonths } from './util.js';

// Tasa mensual con que n cuotas iguales de "cuota" equivalen al precio al contado (cuota fija, como
// cobran los bancos). Se busca por bisección; sin interés es 0.
export function monthlyRate(price, cuota, n) {
  if (!(price > 0 && cuota > 0 && n >= 2) || cuota * n <= price) return 0;
  const pv = (r) => (cuota * (1 - (1 + r) ** -n)) / r;
  let lo = 1e-9;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// price: precio al contado (null si no se conoce) · total: lo que se paga en todas las cuotas
export function breakdown({ price, cuota, n, total = cuota * n, firstYm }) {
  const interest = price ? Math.max(0, total - price) : null;
  const rate = price ? monthlyRate(price, cuota, n) : 0;
  return { price, cuota, n, total, interest, pct: price && interest ? interest / price : 0, rate, annual: rate ? (1 + rate) ** 12 - 1 : 0, firstYm, lastYm: firstYm && addMonths(firstYm, n - 1) };
}

const ymTxt = (ym) => `${monthShort(ym)} ${ym.slice(0, 4)}`;
export function breakdownHTML(b, { priceLabel = 'Precio al contado', totalLabel = 'Total a pagar' } = {}) {
  const row = (k, v, strong) => `<div class="row between"><span class="muted">${k}</span>${strong ? `<b>${v}</b>` : `<span>${v}</span>`}</div>`;
  return `<div class="breakdown">
    ${b.price ? row(priceLabel, money(b.price)) : ''}
    ${row(`${b.n} cuotas de`, money(b.cuota))}
    ${row(totalLabel, money(b.total), true)}
    ${b.interest == null ? '' : row('Interés', b.interest ? `${money(b.interest)} (+${num(b.pct * 100, 1)} %)` : 'Sin interés ✅')}
    ${b.rate ? row('Tasa equivalente', `${num(b.rate * 100, 2)} % mensual · ${num(b.annual * 100, 1)} % anual`) : ''}
    ${b.firstYm ? row('Plazo', b.n > 1 ? `${ymTxt(b.firstYm)} a ${ymTxt(b.lastYm)}` : ymTxt(b.firstYm)) : ''}
    ${b.rate ? '<div class="small muted">La tasa es aproximada: no incluye seguros ni comisiones. Compárala con el CAE que informa tu banco o tienda.</div>' : ''}
  </div>`;
}
