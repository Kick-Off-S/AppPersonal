import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, addMonths, monthKey, addDays, esc, compact, weekdayIndex } from '../js/util.js';

test('montos: "1.200.000" y "$ 15.990" se leen como números', () => {
  assert.equal(parseMoney('1.200.000'), 1200000);
  assert.equal(parseMoney('$ 15.990'), 15990);
  assert.equal(parseMoney(''), 0);
});

test('meses: sumar meses cruza el año', () => {
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(monthKey('2026-10-20'), '2026-10');
});

test('días: sumar días y día de la semana (0 = lunes)', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(weekdayIndex('2026-10-19'), 0); // lunes
  assert.equal(weekdayIndex('2026-10-18'), 6); // domingo
});

test('esc escapa HTML', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

test('compact: 1.250.000 -> 1,3M y 350.000 -> 350k', () => {
  assert.equal(compact(1250000), '1,3M');
  assert.equal(compact(350000), '350k');
});
