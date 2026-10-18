// Cálculos que cruzan módulos: la dieta cumplida y las comidas extra suman las calorías del día.
import { state } from './store.js';
import { weekdayIndex, todayStr, addDays } from './util.js';

export const planFor = (d) => state.diet.plan[weekdayIndex(d)] || [];
export const doneFor = (d) => state.diet.done[d] || {};
export const extrasFor = (d) => state.log[d] || [];

const sum = (list, k) => list.reduce((a, x) => a + (x[k] || 0), 0);

export function dayTotals(d) {
  const plan = planFor(d);
  const done = doneFor(d);
  const doneMeals = plan.filter((m) => done[m.id]);
  const extras = extrasFor(d);
  const diet = sum(doneMeals, 'kcal');
  const extra = sum(extras, 'kcal');
  return {
    diet,
    extra,
    total: diet + extra,
    hasData: doneMeals.length > 0 || extras.length > 0,
    mealsTotal: plan.length,
    mealsDone: doneMeals.length,
    missingKcal: plan.filter((m) => !m.kcal).length,
    planKcal: sum(plan, 'kcal'),
  };
}

export const waterOf = (d) => (state.water[d] || []).reduce((a, b) => a + b, 0);

export const latestWeight = () => [...state.weight].sort((a, b) => a.date.localeCompare(b.date)).pop();

// Proteínas, carbohidratos y grasas (g) del día: comidas de la dieta cumplidas que los tengan + comidas extra.
export function dayMacros(d) {
  const done = doneFor(d);
  const list = [...planFor(d).filter((m) => done[m.id]), ...extrasFor(d)];
  const r1 = (v) => Math.round(v * 10) / 10;
  const p = r1(sum(list, 'p')), c = r1(sum(list, 'c')), f = r1(sum(list, 'f'));
  return { p, c, f, any: p + c + f > 0 };
}

const fullDay = (d) => {
  const t = dayTotals(d);
  return t.mealsTotal > 0 && t.mealsDone === t.mealsTotal;
};

// Días seguidos con todas las comidas del plan cumplidas. Hoy cuenta solo si ya está completo
// (si no, la racha llega hasta ayer). Los días sin plan no cortan la racha.
export function dietStreak() {
  let d = todayStr();
  if (!fullDay(d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (!planFor(d).length) {
      if (!Object.values(state.diet.plan).some((x) => x.length)) return 0;
      continue;
    }
    if (!fullDay(d)) break;
    n++;
  }
  return n;
}
