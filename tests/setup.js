// Navegador mínimo para cargar los módulos de la app en Node (sin dependencias).
// Se importa primero en cada prueba: los módulos usan document/window/localStorage al cargarse.
const noop = () => {};
const el = () => ({ addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.dispatchEvent = noop;
globalThis.document = {
  addEventListener: noop,
  documentElement: el(),
  body: el(),
  getElementById: () => el(),
  querySelector: () => null,
  createElement: () => el(),
};
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
// sin indexedDB: store.js cae a localStorage
