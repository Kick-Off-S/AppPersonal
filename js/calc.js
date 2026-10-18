// Cálculos que cruzan módulos: la dieta cumplida y las comidas extra suman las calorías del día.
import { state } from './store.js';
import { weekdayIndex } from './util.js';

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
