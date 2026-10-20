import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offToFood } from '../js/scanner.js';
import { portionOf } from '../js/foodpicker.js';

test('Open Food Facts: con porción en la etiqueta, los valores van por porción', () => {
  const f = offToFood('7800000000001', {
    product_name: 'Galletas de avena',
    brands: 'Marca X, Otra',
    quantity: '300 g',
    serving_quantity: '30',
    nutriments: { 'energy-kcal_100g': 450, proteins_100g: 8, carbohydrates_100g: 65, fat_100g: 17 },
  });
  assert.equal(f.name, 'Galletas de avena (Marca X)');
  assert.equal(f.unit, '1 porción (30 g)');
  assert.equal(f.kcal, 135);
  assert.equal(f.p, 2.4);
  assert.equal(f.barcode, '7800000000001');
  assert.equal(portionOf(f).grams, 30, 'se puede ajustar en gramos');
});

test('Open Food Facts: bebida sin porción queda por 100 ml; energía solo en kJ se convierte', () => {
  const f = offToFood('5449000000996', { product_name: 'Bebida', quantity: '1,5 l', nutriments: { energy_100g: 180, carbohydrates_100g: 10.6 } });
  assert.equal(f.unit, '100 ml');
  assert.equal(f.kcal, 43);
});

test('Open Food Facts: sin calorías no se crea el alimento', () => {
  assert.equal(offToFood('1', { product_name: 'X', nutriments: {} }), null);
});
