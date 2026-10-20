import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/store.js';
import { scheduleOf, remainingOf, loanMonth, toggleCuota } from '../js/views/loans.js';

test('préstamo recibido: 12 cuotas de 95.000, entra el monto y la cuota queda por pagar', () => {
  state.finance.expenses = [];
  const l = { id: 'L1', dir: 'borrowed', person: 'Banco', amount: 1000000, date: '2026-10-05', counted: true, n: 12, cuota: 95000, start: '2026-10', prepaid: 0, received: {} };
  state.finance.loans = [l];
  assert.equal(scheduleOf(l).at(-1).ym, '2027-09');
  let m = loanMonth('2026-10');
  assert.equal(m.borrowedIn, 1000000);
  assert.equal(m.duePending, 95000);
  toggleCuota(l, '2026-10'); // pagar
  m = loanMonth('2026-10');
  assert.equal(m.duePending, 0);
  assert.equal(state.finance.expenses.length, 1);
  assert.equal(remainingOf(l).amount, 95000 * 11);
});

test('préstamo dado: lo devuelto entra como ingreso; cuotas ya cobradas no cuentan', () => {
  const l = { id: 'L2', dir: 'lent', person: 'Juan', amount: 300000, date: '2026-10-01', counted: true, n: 3, cuota: 100000, start: '2026-11', prepaid: 1, received: {} };
  state.finance.loans = [l];
  assert.equal(loanMonth('2026-10').lentOut, 300000);
  assert.equal(remainingOf(l).count, 2); // la primera se marcó como cobrada antes
  toggleCuota(l, '2026-12');
  assert.equal(loanMonth('2026-12').repaidIn, 100000);
});
