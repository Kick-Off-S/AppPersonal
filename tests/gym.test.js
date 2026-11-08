import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, withDefaults } from '../js/store.js';
import { muscleOf, restFor, e1rm, historyOf, bestBefore, lastSession, records, setsByMuscle, sessionOf, TEMPLATES, LIBRARY } from '../js/gym.js';

const routine = { id: 'r', name: 'Pierna', days: [0], mins: 60, intensity: 'moderada', items: [{ id: 'a', name: 'Sentadilla', sets: 4, reps: '8' }, { id: 'b', name: 'Curl femoral', sets: 3, reps: '12' }] };

test('biblioteca: músculo de cada ejercicio, también con nombres más largos', () => {
  assert.equal(muscleOf('sentadilla'), 'Piernas');
  assert.equal(muscleOf('Sentadilla con barra'), 'Piernas');
  assert.equal(muscleOf('Press banca inclinado'), 'Pecho');
  assert.equal(muscleOf('algo inventado'), '');
  assert.equal(restFor({ name: 'Sentadilla' }), 120);
  assert.equal(restFor({ name: 'Plancha' }), 60);
  assert.equal(restFor({ name: 'Curl martillo', rest: 45 }), 45);
});

test('1RM estimado (Epley) solo con series de hasta 12 repeticiones', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(Math.round(e1rm(100, 10)), 133);
  assert.equal(e1rm(60, 20), 60);
});

test('historial, marcas, series por músculo y resumen de la sesión', () => {
  Object.assign(
    state,
    withDefaults({
      exercise: {
        routines: [routine],
        done: {
          '2026-11-02': { r: { a: { kg: 80 } } }, // registro antiguo: solo peso
          '2026-11-05': { r: { a: { n: 'Sentadilla', kg: 85, sets: [{ r: 8, kg: 80, t: 1000 }, { r: 8, kg: 85, t: 181000 }, { r: 6, kg: 85, t: 361000 }] }, b: { n: 'Curl femoral', kg: 40, sets: [{ r: 12, kg: 40, t: 600000 }] } } },
        },
      },
    })
  );
  const h = historyOf('sentadilla');
  assert.equal(h.length, 2);
  assert.equal(h[1].best, 85);
  assert.equal(h[1].vol, 80 * 8 + 85 * 8 + 85 * 6);
  assert.equal(bestBefore('Sentadilla', '2026-11-05'), 80);
  assert.equal(lastSession('Sentadilla', '2026-11-09').sets.length, 3);
  const rec = records();
  assert.equal(rec[0].name, 'Sentadilla');
  assert.equal(rec[0].best, 85);
  assert.deepEqual(setsByMuscle(['2026-11-02', '2026-11-05']), { Piernas: 4 + 3 + 1 });
  const s = sessionOf('2026-11-05');
  assert.equal(s.sets, 4);
  assert.equal(s.mins, 10);
});

test('series guardadas se validan al cargar', () => {
  const st = withDefaults({ exercise: { routines: [routine], done: { '2026-11-05': { r: { a: { sets: [{ r: '8', kg: '-5' }, 'basura', { r: 10, kg: 60, t: 5 }] } } } } } });
  assert.deepEqual(st.exercise.done['2026-11-05'].r.a.sets, [{ r: 8, kg: 0 }, { r: 10, kg: 60, t: 5 }]);
});

test('rutinas listas: días válidos y ejercicios de la biblioteca', () => {
  const names = new Set(LIBRARY.map((e) => e.name));
  for (const t of TEMPLATES)
    for (const r of t.routines()) {
      assert.ok(r.days.length && r.days.every((d) => d >= 0 && d <= 6), `${t.name}: ${r.name}`);
      for (const it of r.items) assert.ok(names.has(it.name), `${it.name} no está en la biblioteca`);
    }
});
