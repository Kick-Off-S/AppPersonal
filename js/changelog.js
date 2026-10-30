// Historial de versiones que ve el usuario (Más → Historial de versiones). La primera entrada es la
// versión actual: su lista es la que aparece en "Novedades" al actualizar.
// Al publicar una versión con novedades: subir APP_VERSION en store.js y agregar su entrada ARRIBA.
// Texto pensado para usuarios (qué cambia para ellos), no detalles técnicos.
import { openSheet } from './util.js';

export const CHANGELOG = [
  {
    v: '4.14',
    date: '2026-10-30',
    title: 'Términos y condiciones',
    items: [
      '<b>📜 Términos y condiciones:</b> para seguir usando la app hay que leerlos y aceptarlos (una sola vez, y de nuevo solo si cambian).',
      'Explican qué es la app, que sus cálculos y recordatorios son una guía y no reemplazan a un profesional, y cómo cuidar tus datos.',
      'Puedes volver a leerlos en Más → Términos y condiciones o en Ajustes → Privacidad, donde también ves cuándo los aceptaste.',
    ],
  },
  {
    v: '4.13',
    date: '2026-10-30',
    title: 'Informes e historial de versiones',
    items: [
      '<b>📄 Informe para tu nutricionista</b> (Progreso → Informe): peso, IMC, calorías, proteínas, carbohidratos, grasas, agua, cumplimiento del plan, ejercicio y tus notas. Eliges qué incluir y el período, y lo compartes o guardas como PDF.',
      '<b>📊 Informe del mes</b> (Gastos → Informe del mes): ingresos, gastos por categoría, gastos fijos, cuotas, tarjetas y préstamos en una página.',
      '<b>🗂️ Historial de versiones</b> (Más → Historial de versiones): todos los cambios de la app, versión por versión.',
    ],
  },
  {
    v: '4.12',
    date: '2026-10-30',
    title: 'Préstamos compartidos',
    items: [
      'En el detalle de un préstamo toca <b>Compartir con…</b> y envíale el enlace a esa persona: al abrirlo, el préstamo se anota en su app al revés ("Te prestó Ana"), con las cuotas ya pagadas y sus recordatorios.',
      'Si lo vuelves a compartir, se actualiza en vez de duplicarse.',
      'En iPhone, si el enlace se abre en Safari, copias el código y lo pegas en la app (Gastos → Préstamos → Pegar…).',
    ],
  },
  {
    v: '4.11',
    date: '2026-10-30',
    title: 'Tarjetas, cuotas explicadas y comercios',
    items: [
      '<b>Tarjetas de crédito o débito:</b> eliges con cuál pagaste cada gasto, gasto fijo o préstamo y ves cuánto llevas y el cupo disponible.',
      '<b>Cuotas explicadas:</b> precio al contado, total a pagar, interés y tasa mensual y anual; cada compra en cuotas muestra su calendario.',
      '<b>Comercios conocidos:</b> escribe "Lider", "Copec" o "Netflix" y la categoría se pone sola. Más categorías de gasto.',
    ],
  },
  {
    v: '4.10',
    date: '2026-10-30',
    title: 'Meta de peso realista y avisos de comidas',
    items: [
      '<b>Meta de peso:</b> IMC, rango saludable para tu estatura, meta sugerida, semanas a ritmo sano y si la fecha que elegiste es realista.',
      '<b>Avisos de comidas</b> a la hora de cada comida de tu plan, si no la has marcado.',
      'Privacidad a mano: resumen en la bienvenida y en Más → Privacidad y tus datos.',
    ],
  },
  {
    v: '4.9',
    date: '2026-10-25',
    title: 'Datos más protegidos',
    items: [
      'La app guarda una segunda copia de tus datos en el teléfono: si al abrirla el iPhone entrega la base vacía, se recuperan solos.',
      'El respaldo en la nube nunca se reemplaza por una app vacía.',
      'Diagnóstico de datos en Ajustes → Respaldo.',
    ],
  },
  {
    v: '4.8',
    date: '2026-10-25',
    title: 'Hábitos con horario',
    items: [
      'Los hábitos pueden tener hora: se ordenan por horario y te avisan a esa hora si no los marcaste.',
      'Si abres la app sin datos, puedes recuperarlos desde la nube o desde un archivo.',
      'Aviso: en iPhone, eliminar el ícono de la app borra sus datos.',
    ],
  },
  {
    v: '4.7',
    date: '2026-10-25',
    title: 'Aviso de privacidad',
    items: [
      'Aviso de privacidad: qué se guarda, dónde, por cuánto tiempo y cómo borrarlo.',
      'Antes de activar la nube, la app te explica qué se guarda y te pide aceptar.',
      'Los datos en la nube que no se usan se borran solos.',
    ],
  },
  {
    v: '4.6',
    date: '2026-10-25',
    title: 'Notificaciones y respaldo automático',
    items: [
      '<b>Notificaciones</b> aunque la app esté cerrada: medicamentos, hábitos, rutina, agua y pagos.',
      '<b>Respaldo automático</b> cifrado con tu contraseña, con código de recuperación para otro teléfono.',
      'El servidor nunca ve tus datos: los avisos se arman en tu teléfono.',
    ],
  },
  {
    v: '4.5',
    date: '2026-10-25',
    title: 'Evaluación nutricional',
    items: ['Calcula tus calorías y macros según edad, estatura, peso, actividad y objetivo.', 'Genera un plan guía de la semana, editable. Es solo una guía: no reemplaza a un nutricionista.'],
  },
  {
    v: '4.4',
    date: '2026-10-25',
    title: 'Medicamentos',
    items: ['Módulo de medicamentos: horarios, dosis, días y duración.', 'Marcar tomas, stock con aviso de reposición y cumplimiento de 7 días.'],
  },
  {
    v: '4.3',
    date: '2026-10-20',
    title: 'Detalles',
    items: ['Compras: productos iguales se juntan en una fila.', 'Cuotas de préstamos que suman exacto, recetas que no se duplican y mejores plurales.'],
  },
  {
    v: '4.2',
    date: '2026-10-20',
    title: 'Cálculos más exactos',
    items: ['El historial (calorías, % cumplido, rachas) ya no cambia al editar el plan o las rutinas.', 'Revisión de datos al cargar y finanzas que cuadran.'],
  },
  {
    v: '4.1',
    date: '2026-10-20',
    title: 'Guardado más seguro',
    items: ['Guardado más robusto y opción de deshacer al restaurar o borrar.', 'PIN más seguro y respaldos con contraseña más fuertes.'],
  },
  {
    v: '4.0',
    date: '2026-10-20',
    title: 'Código de barras',
    items: ['Escanea el código de barras de un producto para registrarlo.', 'Compartir e importar el plan de dieta como archivo.'],
  },
  {
    v: '3.6',
    date: '2026-10-20',
    title: 'Respaldo cifrado y bloqueo',
    items: ['Respaldo con contraseña.', 'Bloqueo de la app con PIN o Face ID.'],
  },
  {
    v: '3.5',
    date: '2026-10-20',
    title: 'Ahorro conectado con Gastos',
    items: ['Los retiros y aportes de ahorro se reflejan en los gastos del mes.'],
  },
  {
    v: '3.4',
    date: '2026-10-20',
    title: 'Armar preparaciones',
    items: ['Arma un plato o sándwich con varios ingredientes y guárdalo.', 'Más tipos de pan, quesos y cecinas.'],
  },
  {
    v: '3.3',
    date: '2026-10-20',
    title: 'Préstamos y sueldo variable',
    items: ['Sueldo fijo o variable y otros ingresos del mes.', 'Préstamos dados y recibidos con calendario de cuotas.', '70 bebidas nuevas: energéticas, jugos, cafés, cervezas y tragos.'],
  },
  {
    v: '3.2',
    date: '2026-10-18',
    title: 'Colores',
    items: ['10 paletas de colores y modo claro u oscuro.'],
  },
  {
    v: '3.1',
    date: '2026-10-18',
    title: 'Logo nuevo',
    items: ['Ícono nuevo de la app.'],
  },
  {
    v: '3.0',
    date: '2026-10-18',
    title: 'Ejercicio, hábitos y compras',
    items: ['Módulos de Ejercicio (rutinas por día), Hábitos (rachas y calendario) y Lista de compras.'],
  },
  {
    v: '2.4',
    date: '2026-10-18',
    title: 'Cuentas de ahorro',
    items: ['Ahorro por cuentas con intereses, rentabilidad y traspasos.'],
  },
  {
    v: '2.3',
    date: '2026-10-18',
    title: 'Módulos',
    items: ['Elige qué módulos usar; ocultarlos no borra sus datos.'],
  },
  {
    v: '2.2',
    date: '2026-10-18',
    title: 'Tamaños de alimentos',
    items: ['Tamaños S, M, L y XL y más alimentos.'],
  },
  {
    v: '2.1',
    date: '2026-10-18',
    title: 'Cantidades flexibles',
    items: ['Cantidades en unidades, fracciones o gramos; las comidas del plan se arman con alimentos.'],
  },
  {
    v: '2.0',
    date: '2026-10-18',
    title: 'Macros y cuotas',
    items: ['Proteínas, carbohidratos y grasas; racha de dieta; topes por categoría; compras en cuotas; exportar a Excel.'],
  },
  {
    v: '1.0',
    date: '2026-10-18',
    title: 'Primera versión',
    items: ['Dieta, calorías, agua, peso, gastos y ahorro, todo en el teléfono.'],
  },
];

const fmt = (s) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s + 'T12:00'));
const list = (e) => `<ul class="news">${e.items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

export function newsHTML(e) {
  return `<h3>Novedades de la versión ${e.v}</h3>${list(e)}`;
}

// Todas las versiones: la actual abierta y las anteriores plegadas.
export function historySheet(current) {
  openSheet(
    `<h3>Historial de versiones</h3>
    <p class="small muted" style="margin-top:0">Estás usando la versión <b>${current}</b>. La app se actualiza sola: cuando hay una nueva, aparece el aviso "Hay una versión nueva".</p>
    <div class="history">${CHANGELOG.map(
      (e, i) => `<details ${i === 0 ? 'open' : ''}><summary><b>${e.v}</b> · ${e.title}<span class="small muted">${fmt(e.date)}</span></summary>${list(e)}</details>`
    ).join('')}</div>
    <div class="actions"><button class="primary" data-close>Listo</button></div>`
  );
}
