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

test('tipos de serie: el calentamiento no cuenta para marcas, volumen ni series por músculo', async () => {
  const { nextType } = await import('../js/gym.js');
  assert.deepEqual([nextType(''), nextType('w'), nextType('d'), nextType('f')], ['w', 'd', 'f', '']);
  Object.assign(
    state,
    withDefaults({
      exercise: {
        routines: [routine],
        done: { '2026-11-06': { r: { a: { n: 'Sentadilla', sets: [{ r: 10, kg: 100, k: 'w' }, { r: 8, kg: 80 }, { r: 6, kg: 70, k: 'd' }, { r: 5, kg: 80, k: 'f' }, { r: 1, kg: 5, k: 'x' }] } } } },
      },
    })
  );
  const h = historyOf('Sentadilla')[0];
  assert.equal(h.best, 80, 'los 100 kg de calentamiento no son marca');
  assert.equal(h.vol, 80 * 8 + 70 * 6 + 80 * 5 + 5 * 1);
  assert.deepEqual(setsByMuscle(['2026-11-06']), { Piernas: 4 });
  assert.equal(state.exercise.done['2026-11-06'].r.a.sets[4].k, undefined, 'tipo desconocido se descarta');
  const s = sessionOf('2026-11-06');
  assert.equal(s.sets, 4);
  assert.equal(s.warm, 1);
});

test('entrenamiento: cronómetro, terminar y racha (los días de descanso no la cortan)', async () => {
  const { startSession, finishSession, streak, monthCount, trainedOn } = await import('../js/gym.js');
  // rutina lunes (0) y jueves (3); 2 y 5 de noviembre de 2026 son lunes y jueves
  Object.assign(state, withDefaults({ exercise: { routines: [{ ...routine, days: [0, 3] }], done: {} } }));
  startSession('2026-11-02', 1_000_000);
  finishSession('2026-11-02', 1_000_000 + 55 * 60000);
  assert.equal(sessionOf('2026-11-02').mins, 55);
  assert.ok(trainedOn('2026-11-02'));
  state.exercise.done['2026-11-05'] = { r: { a: { n: 'Sentadilla', kg: 80 } } }; // jueves: solo marcó
  assert.equal(streak('2026-11-08'), 2, 'domingo: martes, miércoles, viernes y sábado eran descanso');
  assert.equal(streak('2026-11-09'), 2, 'lunes de hoy aún no corta la racha');
  assert.equal(streak('2026-11-10'), 0, 'se saltó el lunes 9');
  assert.equal(monthCount('2026-11'), 2);
  // seguir después de terminar reabre el cronómetro
  startSession('2026-11-02');
  assert.equal(sessionOf('2026-11-02').active, true);
  // se valida al cargar
  const st = withDefaults({ exercise: { sessions: { '2026-11-02': { start: 5, end: 'x' }, malo: 'y' } } });
  assert.deepEqual(st.exercise.sessions, { '2026-11-02': { start: 5 } });
});

test('notas por ejercicio: se guardan por día y la próxima vez se recuerda la última', async () => {
  const { setNote, noteOf, lastNote, historyOf: hist } = await import('../js/gym.js');
  Object.assign(state, withDefaults({ exercise: { routines: [routine], done: { '2026-11-03': { r: { a: { n: 'Sentadilla', sets: [{ r: 8, kg: 80 }] } } } } } }));
  setNote('Sentadilla', '2026-11-03', '  quedé con RIR 1, podía sacar 4 reps más  ');
  setNote('Sentadilla', '2026-10-27', 'subir peso');
  assert.equal(noteOf('sentadilla', '2026-11-03'), 'quedé con RIR 1, podía sacar 4 reps más');
  assert.deepEqual(lastNote('Sentadilla', '2026-11-10'), { d: '2026-11-03', note: 'quedé con RIR 1, podía sacar 4 reps más' });
  assert.deepEqual(lastNote('Sentadilla', '2026-11-03'), { d: '2026-10-27', note: 'subir peso' }, 'el mismo día no cuenta como "la última vez"');
  assert.equal(hist('Sentadilla')[0].note, 'quedé con RIR 1, podía sacar 4 reps más');
  setNote('Sentadilla', '2026-10-27', '   ');
  assert.equal(lastNote('Sentadilla', '2026-11-03'), null, 'borrar la nota la quita');
  // se valida al cargar: texto con comillas se conserva; basura se descarta
  const st = withDefaults({ exercise: { notes: { '2026-11-03': { sentadilla: { note: 'me costó la "bajada"' }, x: 5 }, malo: 'y' } } });
  assert.deepEqual(st.exercise.notes, { '2026-11-03': { sentadilla: { note: 'me costó la "bajada"' } } });
});
