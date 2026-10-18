// Apariencia: paleta de colores y modo claro/oscuro. Se aplica con atributos en <html> (ver styles.css).
// Se copia también en localStorage para aplicarla antes de dibujar la app (sin parpadeo del color por defecto).
import { state, save } from './store.js';

export const PALETTES = [
  { id: 'teal', name: 'Turquesa', light: '#0f766e', dark: '#2dd4bf' },
  { id: 'blue', name: 'Azul', light: '#1d4ed8', dark: '#60a5fa' },
  { id: 'indigo', name: 'Índigo', light: '#4338ca', dark: '#818cf8' },
  { id: 'violet', name: 'Morado', light: '#7c3aed', dark: '#a78bfa' },
  { id: 'pink', name: 'Rosa', light: '#be185d', dark: '#f472b6' },
  { id: 'coral', name: 'Coral', light: '#e11d48', dark: '#fb7185' },
  { id: 'orange', name: 'Naranja', light: '#c2410c', dark: '#fb923c' },
  { id: 'green', name: 'Verde', light: '#15803d', dark: '#4ade80' },
  { id: 'brown', name: 'Café', light: '#7c4a1e', dark: '#d4a373' },
  { id: 'graphite', name: 'Grafito', light: '#334155', dark: '#94a3b8' },
];
export const MODES = [
  { id: 'auto', name: 'Automático' },
  { id: 'light', name: 'Claro' },
  { id: 'dark', name: 'Oscuro' },
];

const LS = 'gp-theme';
const html = document.documentElement;

export function applyTheme() {
  const t = state.settings.theme || {};
  html.dataset.palette = PALETTES.some((p) => p.id === t.palette) ? t.palette : 'teal';
  html.dataset.mode = MODES.some((m) => m.id === t.mode) ? t.mode : 'auto';
  try {
    localStorage.setItem(LS, JSON.stringify({ p: html.dataset.palette, m: html.dataset.mode }));
  } catch {
    /* sin almacenamiento: se aplica igual al cargar */
  }
  // color de la barra del navegador / estado = fondo actual (calculado igual que --bg en styles.css)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const p = PALETTES.find((x) => x.id === html.dataset.palette);
    const dark = html.dataset.mode === 'dark' || (html.dataset.mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.content = dark ? mix(p.dark, '#0b100f', 0.06) : mix(p.light, '#f5f6f6', 0.05);
  }
}

// Mezcla dos colores hex: a en proporción t sobre b.
function mix(a, b, t) {
  const ch = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16));
  const [x, y] = [ch(a), ch(b)];
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

export function setTheme(patch) {
  state.settings.theme = { ...state.settings.theme, ...patch };
  save();
  applyTheme();
}

// En modo automático, si el teléfono cambia entre claro y oscuro, actualizamos el color de la barra.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
