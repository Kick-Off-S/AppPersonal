# Gestión Personal

App móvil (PWA) para iPhone y Android: dieta, calorías, agua, peso, gastos/sueldo y ahorro.
Sin cuentas: cada persona guarda sus datos en su teléfono. Un servidor opcional (Cloudflare, gratis) envía
notificaciones y guarda respaldos automáticos cifrados, sin poder leer los datos.

## Módulos
- **Hoy**: el día completo en una pantalla. Marcas las comidas de tu dieta al comerlas (suman sus calorías), agregas solo lo que comes *fuera de la dieta*, y registras el agua.
- **Dieta**: cada usuario carga el plan de su nutricionista (comidas por día, hora, qué incluye y calorías; hay un estimador con alimentos si no las tiene).
- **Gastos**: sueldo líquido mensual, gastos por categoría, **gastos fijos** que se repiten cada mes (se marcan como pagados), gráfico de 6 meses y distribución del sueldo. El sobrante se envía a Ahorro.
- **Ahorro**: módulo separado con aportes y salidas (con motivo), saldo y meta opcional.
- **Progreso**: **registro de peso** con gráfico y meta, más gráficos de 7 días de calorías, dieta cumplida y agua.
- **Ajustes**: metas de calorías y agua, respaldo y restauración en un archivo `.json` (sirve para cambiar de teléfono).

## Probar en el computador
```bash
python3 -m http.server 8080
```
Abrir http://localhost:8080 (en Chrome, modo móvil).

## Compartir con amigos (gratis)
1. Subir este repo a GitHub.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Compartir el link `https://<usuario>.github.io/<repo>/`.
4. En iPhone: abrir el link en **Safari** → Compartir → **Agregar a inicio**.

Los datos personales nunca se suben: viven en el teléfono de cada uno.

## Actualizar la app
1. Al cambiar archivos, subir `VERSION` en `sw.js` (ej. `gp-v4`) para que los teléfonos se actualicen.
2. Si hay novedades que mostrar, subir `APP_VERSION` en `js/store.js` y editar la lista en `whatsNew()` de `js/app.js`.
3. Al abrir la app, los teléfonos descargan la versión nueva en segundo plano y muestran **"Hay una versión nueva · Actualizar"**.

## Novedades 3.3
Sueldo fijo o variable, otros ingresos del mes, préstamos (dados y recibidos) con calendario de cuotas,
resumen de compras en cuotas (valor cuota con interés y cuotas ya pagadas) y bebidas/energéticas/tragos.
Préstamos en `js/views/loans.js`.

## Novedades 3.0
Módulos nuevos (se activan en Ajustes): **Ejercicio** (rutinas por día que se repiten, marcar ejercicios hechos, peso usado y
nuevas marcas, actividad extra con calorías), **Hábitos** (checks diarios, rachas y calendario) y **Lista de compras**
(se arma con el plan de dieta y al terminar registra el gasto). Hoy muestra hábitos, rutina y calorías netas.
Con más de 5 secciones, la barra muestra 4 + "Más".

## Novedades 2.0
Racha de dieta, proteínas/carbohidratos/grasas, topes por categoría, compras en cuotas, exportar gastos a Excel,
recordatorio semanal de respaldo, aviso de versión nueva y más comida chilena en el buscador.

## Novedades 4.0
- **Código de barras**: `js/scanner.js` usa ZXing (`js/vendor/zxing.min.js`, Apache-2.0, se carga solo al escanear) y
  consulta Open Food Facts (solo se envía el número del código). El producto queda en "mis alimentos" con su `barcode`.
- **Plan de dieta** exportable/importable como archivo (`kind: "diet-plan"`), limpiado igual que los respaldos.
- **Migraciones**: `VERSION` (esquema) y `MIGRATIONS` en `js/store.js`. Para cambiar la forma de los datos, sube
  `VERSION` y agrega un paso `{ to, what, run(d) }`. La v2 guarda una foto de cada comida cumplida.

## Pruebas
```bash
npm test
```
Corren sin instalar nada (Node 20+). También se ejecutan solas en GitHub en cada push (pestaña Actions).
Revisan cálculos (cantidades, tamaños, préstamos), la limpieza de respaldos, que todo el JS esté en `sw.js`
y que la huella de la CSP coincida con el script de `index.html`.

## Seguridad
- Los respaldos se limpian al cargarse (`clean()` en `js/store.js`): un archivo manipulado no puede inyectar código.
- Respaldo opcional cifrado con contraseña (AES-GCM 256 + PBKDF2) y bloqueo con PIN / Face ID (WebAuthn) en `js/security.js`.
  El bloqueo protege la pantalla; los datos guardados en el teléfono no se cifran con el PIN.
- `index.html` tiene una Content-Security-Policy que solo permite el código propio de la app.
  Si cambias el `<script>` de `index.html`, actualiza su huella `sha256-…` en la CSP (la prueba te dice cuál).

## Servidor (notificaciones y respaldo automático)
Carpeta `server/`: un Cloudflare Worker (plan gratuito) con una base D1. El cliente está en `js/cloud.js` y los avisos
se arman en `sw.js` (`compose()`).
- **Notificaciones**: el teléfono envía solo su dirección de push, zona horaria y las *horas* de aviso. Cada minuto el
  Worker manda un aviso vacío a quien le toque; el teléfono lee sus datos y arma el mensaje.
- **Respaldo**: se cifra en el teléfono (AES-GCM + PBKDF2) con la contraseña del usuario. El servidor guarda el texto
  cifrado bajo el código de recuperación y solo acepta cambios con un token secreto del teléfono.

Publicar cambios del servidor:
```bash
cd server && npx wrangler deploy
```
La clave privada VAPID está como secreto (`npx wrangler secret put VAPID_PRIVATE_JWK`) y **nunca va al repo**.
Si cambias la URL del Worker, actualízala en `js/cloud.js` y en `connect-src` de la CSP de `index.html`.

## Importante: no publicar otros sitios en esta cuenta
GitHub Pages sirve todos los repos de la cuenta bajo el mismo origen (`kick-off-s.github.io`). Un navegador comparte el
almacenamiento (IndexedDB/localStorage) entre todo lo que esté en ese origen: **no actives Pages en otros repos de esta
cuenta**, o usa un dominio propio para la app.

## Estructura
- `js/store.js`: estado único (IndexedDB) y respaldo.
- `js/calc.js`: cálculos que cruzan módulos (dieta cumplida + extras = calorías del día).
- `js/charts.js`: gráficos SVG sin librerías.
- `js/foodpicker.js`: buscador de alimentos reutilizable.
- `js/backup.js`: respaldo `.json`, recordatorio semanal y exportación de gastos `.csv`.
- `js/theme.js`: paletas de colores y modo claro/oscuro (Ajustes → Apariencia). Los colores viven en `styles.css` (`--p` / `--pd` por paleta).
- `js/modules.js`: módulos que cada persona activa en Ajustes (Dieta y salud, Finanzas, Ejercicio, Hábitos, Compras).
- `js/views/*.js`: un archivo por pestaña. Para agregar un módulo: sumarlo en `js/modules.js`, crear sus vistas, registrar sus pestañas (con `module`) en `js/app.js` y sus archivos en `sw.js`.
