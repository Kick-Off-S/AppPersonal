import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_FOODS } from '../js/foods.js';
import { parseAmount, fracStr, portionOf, amountLabel, factorOf, scaled, defaultSize } from '../js/foodpicker.js';

const food = (n) => BASE_FOODS.find((f) => f.name === n);

test('base de alimentos: sin nombres repetidos y con valores válidos', () => {
  const names = BASE_FOODS.map((f) => f.name.toLowerCase());
  assert.deepEqual(names.filter((x, i) => names.indexOf(x) !== i), []);
  for (const f of BASE_FOODS) {
    assert.ok(f.kcal >= 0 && f.p >= 0 && f.c >= 0 && f.f >= 0, f.name);
    assert.ok(f.unit, f.name);
  }
});

test('tamaños: la porción base coincide con uno de los tamaños', () => {
  for (const f of BASE_FOODS.filter((x) => x.sizes)) {
    assert.ok(Object.values(f.sizes).includes(portionOf(f).grams), `${f.name}: ${f.unit}`);
    assert.ok(defaultSize(f), f.name);
  }
});

test('cantidades: fracciones, mixtos y comas', () => {
  assert.equal(parseAmount('3/4'), 0.75);
  assert.equal(parseAmount('1 1/2'), 1.5);
  assert.equal(parseAmount('1½'), 1.5);
  assert.equal(parseAmount('0,75'), 0.75);
  assert.equal(parseAmount('abc'), 0);
  assert.equal(fracStr(0.75), '¾');
  assert.equal(fracStr(1.5), '1½');
});

test('cálculo: 150 g de pollo, ¾ taza de arroz y 2 rebanadas de pan', () => {
  const pollo = food('Pechuga de pollo cocida');
  assert.equal(scaled(pollo, factorOf(pollo, 'g', 150)).kcal, 248);
  const arroz = food('Arroz cocido');
  assert.equal(scaled(arroz, factorOf(arroz, 'unit', 0.75)).kcal, 158);
  assert.equal(amountLabel(arroz, 'unit', 0.75), '¾ taza');
  const pan = food('Pan de molde integral');
  assert.equal(amountLabel(pan, 'unit', 2, 'M'), '2 rebanadas M (56 g)');
});

test('tamaños: 2 tortillas integrales L = 120 g = 360 kcal', () => {
  const t = food('Tortilla integral');
  const q = factorOf(t, 'unit', 2, 'L');
  assert.equal(scaled(t, q).kcal, 360);
  assert.equal(amountLabel(t, 'unit', 2, 'L'), '2 unidades L (120 g)');
});
