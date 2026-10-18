# Gestión Personal

App móvil (PWA) para iPhone y Android: dieta, calorías, agua, peso, gastos/sueldo y ahorro.
Sin cuentas ni servidores: cada persona guarda sus datos solo en su teléfono.

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
Al cambiar archivos, subir `VERSION` en `sw.js` (ej. `gp-v3`) para que los teléfonos se actualicen.

## Estructura
- `js/store.js`: estado único (IndexedDB) y respaldo.
- `js/calc.js`: cálculos que cruzan módulos (dieta cumplida + extras = calorías del día).
- `js/charts.js`: gráficos SVG sin librerías.
- `js/foodpicker.js`: buscador de alimentos reutilizable.
- `js/views/*.js`: un archivo por pestaña. Para agregar un módulo: crear la vista, registrarla en `js/app.js` y en `sw.js`.
