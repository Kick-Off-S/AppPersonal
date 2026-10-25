// Evaluación nutricional y plan guía automático.
// SOLO ES UNA GUÍA: no reemplaza a un nutricionista. Usa fórmulas estándar y valores conservadores.
//  - Gasto en reposo (TMB): Mifflin-St Jeor. Gasto diario = TMB × factor de actividad.
//  - Objetivo: bajar −20 %, mantener, subir +10 %. Nunca bajo un mínimo seguro (ni bajo la TMB).
//  - Proteína por kg (con IMC ≥ 30 se usa el peso de referencia con IMC 25), grasas 28 %, resto carbohidratos.
import { BASE_FOODS } from './foods.js';
import { factorOf, scaled, amountLabel } from './foodpicker.js';
import { uid } from './util.js';

export const ACTIVITY = [
  { id: 'sed', name: 'Sedentaria', desc: 'Trabajo sentado y casi sin ejercicio', f: 1.2 },
  { id: 'light', name: 'Ligera', desc: 'Ejercicio 1 a 3 días por semana', f: 1.375 },
  { id: 'mod', name: 'Moderada', desc: 'Ejercicio 3 a 5 días por semana', f: 1.55 },
  { id: 'high', name: 'Alta', desc: 'Ejercicio 6 a 7 días por semana', f: 1.725 },
  { id: 'vhigh', name: 'Muy alta', desc: 'Entrenamiento intenso diario o trabajo físico pesado', f: 1.9 },
];
export const GOALS = {
  lose: { name: 'Bajar de peso', short: 'Bajar', adj: -0.2, protein: 2.0 },
  keep: { name: 'Mantener mi peso', short: 'Mantener', adj: 0, protein: 1.6 },
  gain: { name: 'Subir (masa muscular)', short: 'Subir', adj: 0.1, protein: 1.8 },
};

// Casos en que no corresponde una guía automática: deben ver a un profesional.
export function notEligible({ age, pregnant, condition }) {
  if (age < 18) return 'Para menores de 18 años la alimentación debe indicarla un profesional (pediatra o nutricionista).';
  if (pregnant) return 'En el embarazo y la lactancia las necesidades cambian: consulta con tu matrona o nutricionista.';
  if (condition) return 'Con una enfermedad o condición de salud, tu dieta debe indicarla tu médico o nutricionista.';
  return null;
}

const round = (x, step) => Math.round(x / step) * step;

export function evaluate({ sex, age, height, weight, activity, goal }) {
  const h = height / 100;
  const bmi = weight / (h * h);
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'm' ? 5 : -161);
  const act = ACTIVITY.find((a) => a.id === activity) || ACTIVITY[0];
  const tdee = bmr * act.f;
  const g = GOALS[goal] || GOALS.keep;
  const min = Math.max(sex === 'm' ? 1500 : 1200, Math.round(bmr));
  let kcal = tdee * (1 + g.adj);
  const floored = kcal < min;
  if (floored) kcal = min;
  kcal = round(kcal, 50);
  const refW = bmi >= 30 ? 25 * h * h : weight;
  let p = Math.round(refW * g.protein);
  p = Math.min(p, Math.round((kcal * 0.35) / 4)); // la proteína no pasa del 35 % de las calorías
  const f = Math.round((kcal * 0.28) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  const bmiCat = bmi < 18.5 ? 'bajo peso' : bmi < 25 ? 'normal' : bmi < 30 ? 'sobrepeso' : 'obesidad';
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, p, c, f, bmi: Math.round(bmi * 10) / 10, bmiCat, floored, goalName: g.name };
}

// ---------- plan guía ----------
// Plantillas por comida: [alimento, modo ('unit' | 'g'), cantidad base, paso de redondeo | 'fijo'].
// Lo "fijo" (verduras, té, aceite) no se escala; el resto se ajusta a las calorías de cada comida.
const SLOTS = [
  {
    name: 'Desayuno', time: '08:00', share: 0.25,
    options: [
      [['Pan de molde integral', 'unit', 2, 1], ['Huevo', 'unit', 2, 1], ['Palta', 'unit', 0.25, 0.25], ['Café o té sin azúcar', 'unit', 1, 'fijo']],
      [['Avena en hojuelas', 'unit', 3, 1], ['Leche descremada', 'unit', 1, 0.5], ['Plátano', 'unit', 1, 0.5]],
      [['Yogurt griego natural', 'unit', 1, 0.5], ['Granola', 'unit', 4, 1], ['Frutillas', 'unit', 1, 'fijo']],
      [['Pan pita integral', 'unit', 1, 0.5], ['Quesillo', 'unit', 2, 1], ['Jamón de pavo', 'unit', 2, 1], ['Tomate', 'unit', 0.5, 'fijo']],
    ],
  },
  {
    name: 'Colación', time: '11:00', share: 0.1,
    options: [
      [['Manzana', 'unit', 1, 0.5], ['Almendras', 'unit', 0.5, 0.25]],
      [['Yogurt natural', 'unit', 1, 0.5], ['Kiwi', 'unit', 1, 1]],
      [['Plátano', 'unit', 1, 0.5], ['Maní', 'unit', 0.5, 0.25]],
      [['Galletas de arroz', 'unit', 2, 1], ['Quesillo', 'unit', 1, 1]],
    ],
  },
  {
    name: 'Almuerzo', time: '13:30', share: 0.35,
    options: [
      [['Pechuga de pollo cocida', 'g', 150, 10], ['Arroz cocido', 'unit', 1, 0.25], ['Ensalada lechuga y tomate', 'unit', 1, 'fijo'], ['Aceite de oliva (cucharadita)', 'unit', 1, 'fijo']],
      [['Merluza', 'g', 150, 10], ['Papa cocida', 'unit', 1, 0.5], ['Brócoli cocido', 'unit', 1, 'fijo'], ['Aceite de oliva (cucharadita)', 'unit', 1, 'fijo']],
      [['Carne de vacuno (posta/lomo)', 'g', 120, 10], ['Quinoa cocida', 'unit', 1, 0.25], ['Ensalada chilena', 'unit', 1, 'fijo']],
      [['Lentejas cocidas', 'unit', 1, 0.25], ['Arroz cocido', 'unit', 0.5, 0.25], ['Ensalada lechuga y tomate', 'unit', 1, 'fijo']],
      [['Pechuga de pavo', 'g', 150, 10], ['Fideos integrales cocidos', 'unit', 1, 0.25], ['Zapallo italiano cocido', 'unit', 1, 'fijo']],
      [['Salmón', 'g', 150, 10], ['Camote cocido', 'unit', 1, 0.5], ['Espárragos', 'unit', 6, 'fijo']],
      [['Atún en agua', 'unit', 1, 0.5], ['Arroz integral cocido', 'unit', 1, 0.25], ['Palta', 'unit', 0.25, 0.25], ['Ensalada lechuga y tomate', 'unit', 1, 'fijo']],
    ],
  },
  {
    name: 'Once', time: '17:30', share: 0.15,
    options: [
      [['Pan de molde integral', 'unit', 2, 1], ['Queso fresco', 'g', 50, 10], ['Café o té sin azúcar', 'unit', 1, 'fijo']],
      [['Tortilla integral', 'unit', 1, 1], ['Pollo desmenuzado', 'g', 80, 10], ['Tomate', 'unit', 0.5, 'fijo']],
      [['Yogurt proteico', 'unit', 1, 1], ['Arándanos', 'unit', 0.5, 0.25]],
      [['Pan pita integral', 'unit', 1, 0.5], ['Hummus', 'unit', 2, 1], ['Pepino', 'unit', 1, 'fijo']],
    ],
  },
  {
    name: 'Cena', time: '20:30', share: 0.15,
    options: [
      [['Huevo', 'unit', 2, 1], ['Espinaca cocida', 'unit', 1, 'fijo'], ['Pan de molde integral', 'unit', 1, 1]],
      [['Pechuga de pollo cocida', 'g', 120, 10], ['Verduras cocidas', 'unit', 1, 'fijo'], ['Aceite de oliva (cucharadita)', 'unit', 1, 'fijo']],
      [['Merluza', 'g', 120, 10], ['Papa cocida', 'unit', 0.5, 0.5], ['Ensalada chilena', 'unit', 1, 'fijo']],
      [['Tofu', 'g', 150, 10], ['Arroz integral cocido', 'unit', 0.5, 0.25], ['Verduras cocidas', 'unit', 1, 'fijo']],
    ],
  },
];
export const TEMPLATE_FOODS = [...new Set(SLOTS.flatMap((s) => s.options.flat().map(([n]) => n)))];

const foodByName = (n) => BASE_FOODS.find((f) => f.name === n);
const snapshot = (f) => ({ id: f.id, name: f.name, unit: f.unit, kcal: f.kcal, p: f.p, c: f.c, f: f.f, ...(f.sizes ? { sizes: f.sizes } : {}) });

function item(food, mode, amount) {
  const qty = factorOf(food, mode, amount);
  const s = scaled(food, qty);
  return { id: uid(), name: food.name, label: amountLabel(food, mode, amount), qty, mode, amount, ...s, food: snapshot(food) };
}

// Una comida ajustada a "target" kcal a partir de una plantilla.
export function buildMeal(slot, template, target) {
  const rows = template.map(([n, mode, amount, step]) => ({ food: foodByName(n), mode, amount, step }));
  const kcalOf = (r, a) => scaled(r.food, factorOf(r.food, r.mode, a)).kcal;
  const fixed = rows.filter((r) => r.step === 'fijo').reduce((a, r) => a + kcalOf(r, r.amount), 0);
  const scal = rows.filter((r) => r.step !== 'fijo').reduce((a, r) => a + kcalOf(r, r.amount), 0);
  const k = Math.min(2.5, Math.max(0.5, scal ? (target - fixed) / scal : 1));
  const items = rows.map((r) => (r.step === 'fijo' ? item(r.food, r.mode, r.amount) : item(r.food, r.mode, Math.max(r.step, round(r.amount * k, r.step)))));
  const sum = (key) => Math.round(items.reduce((a, it) => a + it[key], 0) * 10) / 10;
  return { id: uid(), name: slot.name, time: slot.time, desc: '', kcal: Math.round(sum('kcal')), p: sum('p'), c: sum('c'), f: sum('f'), items };
}

// Alimentos que se pueden ajustar para acercar la proteína a la meta sin cambiar mucho las calorías:
// se sube la porción de la proteína (en gramos) y se baja un paso del carbohidrato más grande.
const PROTEIN = new Set(['Pechuga de pollo cocida', 'Pechuga de pavo', 'Merluza', 'Salmón', 'Carne de vacuno (posta/lomo)', 'Pollo desmenuzado', 'Tofu', 'Queso fresco']);
const CARB = new Set(['Arroz cocido', 'Arroz integral cocido', 'Papa cocida', 'Camote cocido', 'Quinoa cocida', 'Fideos integrales cocidos', 'Pan de molde integral', 'Pan pita integral', 'Plátano', 'Granola', 'Avena en hojuelas']);
const STEP = { g: 10, unit: 0.25 };
const resum = (m) => {
  const sum = (k) => Math.round(m.items.reduce((a, it) => a + it[k], 0) * 10) / 10;
  Object.assign(m, { kcal: Math.round(sum('kcal')), p: sum('p'), c: sum('c'), f: sum('f') });
};
function balanceProtein(meals, pTarget, kcal) {
  const P = () => meals.reduce((a, m) => a + m.p, 0);
  const K = () => meals.reduce((a, m) => a + m.kcal, 0);
  // sobra proteína (planes grandes): bajar la porción de proteína y subir un paso de carbohidrato
  for (let guard = 0; guard < 20 && P() > pTarget * 1.2; guard++) {
    const anchors = meals.flatMap((m) => m.items.filter((it) => PROTEIN.has(it.name) && it.mode === 'g' && it.amount > 80).map((it) => [m, it]));
    if (!anchors.length) break;
    const [m, it] = anchors.sort((a, b) => b[1].amount - a[1].amount)[0];
    m.items[m.items.indexOf(it)] = item(foodByName(it.name), 'g', it.amount - 20);
    const carbs = meals.flatMap((mm) => mm.items.filter((x) => CARB.has(x.name)).map((x) => [mm, x]));
    if (carbs.length && K() < kcal * 1.02) {
      const [cm, cx] = carbs.sort((a, b) => a[1].kcal - b[1].kcal)[0];
      cm.items[cm.items.indexOf(cx)] = item(foodByName(cx.name), cx.mode, cx.amount + STEP[cx.mode]);
      resum(cm);
    }
    resum(m);
  }
  // falta proteína: subir la porción de proteína y bajar un paso del carbohidrato más grande
  for (let guard = 0; guard < 12 && P() < pTarget * 0.92 && K() < kcal * 1.08; guard++) {
    const anchors = meals.flatMap((m) => m.items.filter((it) => PROTEIN.has(it.name) && it.mode === 'g' && it.amount < 200).map((it) => [m, it]));
    if (!anchors.length) return;
    const [m, it] = anchors.sort((a, b) => a[1].amount - b[1].amount)[0];
    const food = foodByName(it.name);
    m.items[m.items.indexOf(it)] = item(food, 'g', it.amount + 20);
    // compensar calorías con el carbohidrato más grande del día (si se puede bajar un paso)
    const carbs = meals.flatMap((mm) => mm.items.filter((x) => CARB.has(x.name) && x.amount > STEP[x.mode]).map((x) => [mm, x]));
    if (carbs.length) {
      const [cm, cx] = carbs.sort((a, b) => b[1].kcal - a[1].kcal)[0];
      cm.items[cm.items.indexOf(cx)] = item(foodByName(cx.name), cx.mode, cx.amount - STEP[cx.mode]);
      resum(cm);
    }
    resum(m);
  }
}

// Plan de lunes a domingo (0..6) para la meta diaria de calorías, variando las comidas cada día.
// Con meta de proteína (g), cada día se ajusta para acercarse a ella.
export function generatePlan(kcal, pTarget = 0) {
  const plan = {};
  for (let d = 0; d < 7; d++) {
    plan[d] = SLOTS.map((slot, si) => buildMeal(slot, slot.options[(d + si) % slot.options.length], kcal * slot.share));
    if (pTarget) balanceProtein(plan[d], pTarget, kcal);
  }
  return plan;
}
