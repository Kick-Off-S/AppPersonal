import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptText, decryptText, hashPin, toB64, fromB64 } from '../js/security.js';

test('respaldo cifrado: se abre con la contraseña correcta y el contenido no se ve', async () => {
  const secreto = JSON.stringify({ finance: { income: { '2026-10': 1234567 } }, note: 'Préstamo a Juan' });
  const p = await encryptText(secreto, 'clave-segura', { exportedAt: 'x' });
  assert.equal(p.app, 'gestion-personal');
  assert.equal(p.enc, 'AES-GCM');
  assert.ok(!JSON.stringify(p).includes('1234567') && !JSON.stringify(p).includes('Juan'), 'el archivo no muestra los datos');
  assert.equal(await decryptText(p, 'clave-segura'), secreto);
});

test('respaldo cifrado: contraseña incorrecta o archivo alterado fallan', async () => {
  const p = await encryptText('hola', 'correcta');
  await assert.rejects(decryptText(p, 'incorrecta'));
  const roto = { ...p, data: toB64(fromB64(p.data).map((b, i) => (i === 0 ? b ^ 1 : b))) };
  await assert.rejects(decryptText(roto, 'correcta'));
});

test('PIN: el mismo PIN con la misma sal da la misma huella; otro PIN no', async () => {
  const salt = toB64(new Uint8Array(16).fill(7));
  assert.equal(await hashPin('1234', salt), await hashPin('1234', salt));
  assert.notEqual(await hashPin('1234', salt), await hashPin('4321', salt));
});

test('base64 por partes funciona con archivos grandes', () => {
  const big = new Uint8Array(300000).map((_, i) => i % 256);
  assert.deepEqual(fromB64(toB64(big)), big);
});
