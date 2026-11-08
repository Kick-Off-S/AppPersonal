// Gimnasio: biblioteca de ejercicios por músculo, rutinas listas para usar, historial y marcas,
// y el temporizador de descanso entre series.
//
// Registro de un ejercicio en un día: exercise.done[fecha][rutina][ejercicio] =
//   { n: nombre, kg: mejor peso del día, sets: [{ r: reps, kg, t: hora (ms) }] }
// Los registros antiguos (antes de la 4.17) solo tienen { kg } o {}.
import { state } from './store.js';
import { uid } from './util.js';
import { key } from './merchants.js';

export const MUSCLES = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Piernas', 'Glúteos', 'Core', 'Cardio'];
const LIB = {
  Pecho: ['Press banca', 'Press banca inclinado', 'Press con mancuernas', 'Press inclinado con mancuernas', 'Aperturas', 'Cruce de poleas', 'Press en máquina', 'Fondos', 'Flexiones'],
  Espalda: ['Dominadas', 'Jalón al pecho', 'Remo con barra', 'Remo con mancuerna', 'Remo en polea', 'Remo en máquina', 'Peso muerto', 'Pullover', 'Hiperextensiones'],
  Hombros: ['Press militar', 'Press de hombros con mancuernas', 'Elevaciones laterales', 'Elevaciones frontales', 'Pájaros', 'Face pull', 'Encogimientos'],
  Bíceps: ['Curl bíceps', 'Curl con barra', 'Curl martillo', 'Curl concentrado', 'Curl en polea', 'Curl predicador'],
  Tríceps: ['Extensión tríceps', 'Press francés', 'Extensión en polea', 'Patada de tríceps', 'Press cerrado', 'Fondos en banco'],
  Piernas: ['Sentadilla', 'Sentadilla frontal', 'Sentadilla búlgara', 'Prensa', 'Hack squat', 'Zancadas', 'Extensión de cuádriceps', 'Curl femoral', 'Peso muerto rumano', 'Pantorrillas'],
  Glúteos: ['Hip thrust', 'Puente de glúteo', 'Patada de glúteo', 'Abducción de cadera', 'Step up'],
  Core: ['Plancha', 'Plancha lateral', 'Abdominales', 'Crunch en polea', 'Elevación de piernas', 'Rueda abdominal', 'Russian twist'],
  Cardio: ['Trote', 'Cinta', 'Bicicleta estática', 'Elíptica', 'Remo (máquina)', 'Escaladora', 'Saltar la cuerda', 'Burpees'],
};
export const LIBRARY = Object.entries(LIB).flatMap(([m, names]) => names.map((name) => ({ name, m })));
const BY_KEY = new Map(LIBRARY.map((e) => [key(e.name), e]));

// Grupo muscular de un ejercicio (nombre exacto, o que empiece con uno conocido: "Sentadilla con barra").
export function muscleOf(name) {
  const k = key(name);
  if (BY_KEY.has(k)) return BY_KEY.get(k).m;
  const hit = [...BY_KEY.entries()].filter(([lk]) => lk.length >= 4 && k.startsWith(lk)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1].m : '';
}
// Descanso sugerido (segundos): ejercicios grandes 2 min, accesorios 90 s, core 60 s.
const BIG = new Set(['Sentadilla', 'Sentadilla frontal', 'Peso muerto', 'Peso muerto rumano', 'Press banca', 'Press militar', 'Remo con barra', 'Dominadas', 'Prensa', 'Hip thrust', 'Hack squat'].map(key));
export const restFor = (it) => it.rest || (BIG.has(key(it.name)) ? 120 : muscleOf(it.name) === 'Core' ? 60 : 90);

// ---------- historial y marcas ----------
export const setsOf = (v) => (v?.sets?.length ? v.sets : v?.kg ? [{ r: 0, kg: v.kg }] : []);
// 1RM estimado (Epley); con más de 12 repeticiones la estimación es poco confiable y se usa el peso.
export const e1rm = (kg, r) => (!kg ? 0 : !r || r === 1 || r > 12 ? kg : kg * (1 + r / 30));
const ex = () => state.exercise;
const nameIn = (rid, iid, v) => v?.n || ex().routines.find((r) => r.id === rid)?.items.find((x) => x.id === iid)?.name || '';

// Sesiones de un ejercicio (por nombre, aunque esté en varias rutinas), de la más antigua a la más nueva.
export function historyOf(name) {
  const k = key(name);
  const out = [];
  for (const [d, byR] of Object.entries(ex().done))
    for (const [rid, items] of Object.entries(byR || {}))
      for (const [iid, v] of Object.entries(items || {})) {
        if (key(nameIn(rid, iid, v)) !== k) continue;
        const sets = setsOf(v);
        if (!sets.length) continue;
        out.push({ d, sets, best: Math.max(...sets.map((s) => s.kg || 0)), rm: Math.max(...sets.map((s) => e1rm(s.kg, s.r))), vol: sets.reduce((a, s) => a + (s.kg || 0) * (s.r || 0), 0) });
      }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
// Mejor peso antes de una fecha (para avisar de una marca nueva).
export const bestBefore = (name, d) => Math.max(0, ...historyOf(name).filter((h) => h.d < d).map((h) => h.best));
// Última sesión antes de una fecha (para precargar series).
export const lastSession = (name, d) => historyOf(name).filter((h) => h.d < d).pop() || null;

// Todas las marcas: un resumen por ejercicio con su mejor peso y 1RM estimado.
export function records() {
  const names = new Map();
  for (const [d, byR] of Object.entries(ex().done))
    for (const [rid, items] of Object.entries(byR || {}))
      for (const [iid, v] of Object.entries(items || {})) {
        const n = nameIn(rid, iid, v);
        if (n && setsOf(v).some((s) => s.kg)) names.set(key(n), { name: n, last: d > (names.get(key(n))?.last || '') ? d : names.get(key(n)).last });
      }
  return [...names.values()]
    .map(({ name, last }) => {
      const h = historyOf(name);
      return { name, last, sessions: h.length, best: Math.max(...h.map((x) => x.best)), rm: Math.max(...h.map((x) => x.rm)) };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
}

// Series hechas por músculo en unos días (las que se registraron serie a serie, o las planificadas si
// el ejercicio solo se marcó como hecho).
export function setsByMuscle(days) {
  const out = {};
  for (const d of days)
    for (const [rid, items] of Object.entries(ex().done[d] || {}))
      for (const [iid, v] of Object.entries(items || {})) {
        const it = ex().routines.find((r) => r.id === rid)?.items.find((x) => x.id === iid);
        const m = muscleOf(nameIn(rid, iid, v));
        if (!m || m === 'Cardio') continue;
        out[m] = (out[m] || 0) + (v?.sets?.length || it?.sets || 1);
      }
  return out;
}

// Resumen del entrenamiento de un día: series, volumen y duración (de la primera a la última serie).
export function sessionOf(d) {
  const times = [];
  let sets = 0;
  let vol = 0;
  for (const items of Object.values(ex().done[d] || {}))
    for (const v of Object.values(items || {}))
      for (const s of v?.sets || []) {
        sets++;
        vol += (s.kg || 0) * (s.r || 0);
        if (s.t) times.push(s.t);
      }
  const mins = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : 0;
  return { sets, vol, mins };
}

// ---------- rutinas listas para usar ----------
const mk = (name, sets, reps, note = '') => ({ id: uid(), name, sets, reps: String(reps), kg: 0, mins: 0, note });
export const TEMPLATES = [
  {
    id: 'full3',
    name: 'Full body · 3 días',
    desc: 'Lunes, miércoles y viernes. Ideal para empezar o volver a entrenar.',
    routines: () => [
      { name: 'Full body A', days: [0, 4], mins: 60, items: [mk('Sentadilla', 3, 10), mk('Press banca', 3, 10), mk('Remo con barra', 3, 10), mk('Press militar', 3, 10), mk('Plancha', 3, '', '30 s')] },
      { name: 'Full body B', days: [2], mins: 60, items: [mk('Peso muerto', 3, 8), mk('Press inclinado con mancuernas', 3, 10), mk('Jalón al pecho', 3, 10), mk('Zancadas', 3, 10, 'cada pierna'), mk('Curl bíceps', 2, 12), mk('Extensión tríceps', 2, 12)] },
    ],
  },
  {
    id: 'ul4',
    name: 'Torso / Pierna · 4 días',
    desc: 'Lunes y jueves torso; martes y viernes pierna.',
    routines: () => [
      { name: 'Torso', days: [0, 3], mins: 65, items: [mk('Press banca', 4, 8), mk('Remo con barra', 4, 8), mk('Press militar', 3, 10), mk('Jalón al pecho', 3, 10), mk('Curl bíceps', 3, 12), mk('Extensión en polea', 3, 12)] },
      { name: 'Pierna', days: [1, 4], mins: 65, items: [mk('Sentadilla', 4, 8), mk('Peso muerto rumano', 3, 10), mk('Prensa', 3, 12), mk('Curl femoral', 3, 12), mk('Pantorrillas', 4, 15), mk('Plancha', 3, '', '45 s')] },
    ],
  },
  {
    id: 'ppl',
    name: 'Push / Pull / Legs · 6 días',
    desc: 'Empuje, tirón y pierna, dos veces por semana. Para quien ya entrena seguido.',
    routines: () => [
      { name: 'Push (empuje)', days: [0, 3], mins: 70, items: [mk('Press banca', 4, 8), mk('Press inclinado con mancuernas', 3, 10), mk('Press militar', 3, 10), mk('Elevaciones laterales', 3, 15), mk('Extensión en polea', 3, 12), mk('Fondos', 3, 10)] },
      { name: 'Pull (tirón)', days: [1, 4], mins: 70, items: [mk('Dominadas', 4, 8), mk('Remo con barra', 4, 8), mk('Remo en polea', 3, 12), mk('Face pull', 3, 15), mk('Curl con barra', 3, 10), mk('Curl martillo', 3, 12)] },
      { name: 'Legs (pierna)', days: [2, 5], mins: 70, items: [mk('Sentadilla', 4, 8), mk('Peso muerto rumano', 3, 10), mk('Prensa', 3, 12), mk('Extensión de cuádriceps', 3, 12), mk('Curl femoral', 3, 12), mk('Pantorrillas', 4, 15)] },
    ],
  },
  {
    id: 'glute3',
    name: 'Glúteo y pierna · 3 días',
    desc: 'Lunes y jueves glúteo y pierna; miércoles tren superior.',
    routines: () => [
      { name: 'Glúteo y pierna', days: [0, 3], mins: 60, items: [mk('Hip thrust', 4, 10), mk('Sentadilla búlgara', 3, 10, 'cada pierna'), mk('Peso muerto rumano', 3, 10), mk('Abducción de cadera', 3, 15), mk('Patada de glúteo', 3, 12, 'cada pierna')] },
      { name: 'Tren superior', days: [2], mins: 50, items: [mk('Jalón al pecho', 3, 10), mk('Press con mancuernas', 3, 10), mk('Remo con mancuerna', 3, 10), mk('Elevaciones laterales', 3, 15), mk('Plancha', 3, '', '30 s')] },
    ],
  },
];

// ---------- temporizador de descanso ----------
// Barra flotante con cuenta regresiva. Usa la hora real: si la app queda en segundo plano y vuelves,
// muestra el tiempo correcto. Al terminar vibra (Android) y suena un pitido (iPhone y Android).
let timer = null;
let audio = null;
const beep = () => {
  try {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.25);
  } catch {
    /* sin audio */
  }
};
export function startRest(secs, label = '') {
  // el audio se prepara dentro del toque (iPhone solo permite sonar después de un gesto)
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {
    audio = null;
  }
  clearInterval(timer?.int);
  let bar = document.getElementById('rest-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'rest-bar';
    bar.innerHTML = `<span class="rb-l"></span><b class="rb-t" aria-live="polite"></b><button class="sm" data-rb="-15">−15</button><button class="sm" data-rb="15">+15</button><button class="sm primary" data-rb="x">Saltar</button>`;
    bar.onclick = (e) => {
      const b = e.target.closest('[data-rb]');
      if (!b) return;
      if (b.dataset.rb === 'x') return stopRest();
      timer.end += +b.dataset.rb * 1000;
      tick();
    };
    document.body.appendChild(bar);
  }
  bar.classList.remove('done');
  bar.querySelector('.rb-l').textContent = label ? `Descanso · ${label}` : 'Descanso';
  timer = { end: Date.now() + secs * 1000, int: setInterval(() => tick(), 250) };
  tick();
}
function tick() {
  const bar = document.getElementById('rest-bar');
  if (!bar || !timer) return;
  const left = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
  bar.querySelector('.rb-t').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (left > 0) return;
  clearInterval(timer.int);
  timer = null;
  navigator.vibrate?.([200, 100, 200]);
  if (audio) beep(), setTimeout(beep, 350);
  bar.classList.add('done');
  bar.querySelector('.rb-t').textContent = '¡A la siguiente serie!';
  setTimeout(() => bar.isConnected && bar.classList.contains('done') && bar.remove(), 4000);
}
export function stopRest() {
  clearInterval(timer?.int);
  timer = null;
  document.getElementById('rest-bar')?.remove();
}
