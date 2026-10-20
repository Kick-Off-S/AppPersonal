// Revisiones de la app completa: archivos del modo sin internet y política de seguridad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('sw.js: todos los archivos del caché existen y todo el JS está en el caché', () => {
  const sw = read('sw.js');
  const shell = [...sw.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => /\.(js|css|html|png|svg|webmanifest)$/.test(p));
  for (const p of shell) assert.ok(existsSync(new URL(p, root)), `falta ${p}`);
  const js = [...readdirSync(new URL('js', root)).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f), ...readdirSync(new URL('js/views', root)).map((f) => 'js/views/' + f)];
  for (const f of js) assert.ok(shell.includes(f), `${f} no está en sw.js (no funcionaría sin internet)`);
});

test('manifest: íconos existen', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), i.src);
});

test('CSP: la huella del script de index.html coincide (si cambias ese script, actualiza la huella)', () => {
  const html = read('index.html');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`'sha256-${hash}'`), `la CSP debe incluir 'sha256-${hash}'`);
  assert.ok(/script-src 'self'/.test(html));
});

test('plantillas: el emoji de los hábitos siempre se muestra escapado', () => {
  const files = ['js/views/habits.js', 'js/views/today.js'];
  for (const f of files) assert.ok(!/\$\{\s*h\.emoji/.test(read(f)), `${f} muestra h.emoji sin esc()`);
});
