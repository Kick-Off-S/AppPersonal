// Aviso de privacidad: qué se guarda, dónde, cuánto tiempo y cómo borrarlo.
// Si cambias lo que se envía al servidor o los plazos de borrado (server/src/index.js), actualiza este texto.
import { openSheet } from './util.js';

export const PRIVACY_DATE = '25-10-2026';
export const BACKUP_DAYS = 365; // respaldo en la nube sin actualizar → se borra
export const PUSH_DAYS = 90; // avisos de un teléfono que no abre la app → se borran

export function privacySheet() {
  openSheet(
    `<h3>Aviso de privacidad</h3>
    <div class="small muted">Actualizado el ${PRIVACY_DATE}</div>
    <div class="privacy">
      <h4>En tu teléfono</h4>
      <p>Todo lo que registras (dieta, peso, medicamentos, ejercicio, hábitos, gastos y ahorro) se guarda <b>solo en este teléfono</b>. La app no tiene cuentas, publicidad ni analítica, y no vende ni comparte datos.</p>

      <h4>Lo que sale del teléfono, solo si tú lo activas</h4>
      <p><b>Notificaciones:</b> la dirección de avisos que entrega Apple o Google, tu zona horaria y las <i>horas</i> de aviso (por ejemplo, 08:00 los lunes). No se envían nombres de medicamentos, montos ni otros datos: el mensaje se arma en tu teléfono.</p>
      <p><b>Respaldo en la nube:</b> una copia de tus datos <b>cifrada en tu teléfono</b> con tu contraseña (AES-256). Nadie puede leerla sin tu contraseña, ni siquiera quien administra la app.</p>
      <p><b>Código de barras:</b> al escanear, solo el número del código se consulta en Open Food Facts.</p>

      <h4>Dónde se guarda</h4>
      <p>En servidores de <b>Cloudflare</b> (empresa de Estados Unidos, con centros de datos en varios países, también fuera de Chile). El servidor de la app no guarda registros de visitas; Cloudflare puede procesar datos técnicos, como la dirección IP, para entregar el servicio.</p>

      <h4>Cuánto tiempo</h4>
      <p>El respaldo se actualiza solo cada vez que usas la app. Si pasa <b>${Math.round(BACKUP_DAYS / 30.4)} meses</b> sin actualizarse, se borra del servidor. Los avisos de un teléfono que no abre la app en <b>${PUSH_DAYS} días</b> se borran (se reactivan solos al volver a abrirla).</p>

      <h4>Datos de salud</h4>
      <p>Medicamentos, peso y dieta son datos sensibles. Por eso nunca salen del teléfono sin cifrar y te pedimos tu consentimiento antes de activar la nube. Puedes retirarlo cuando quieras desactivándola.</p>

      <h4>Tus derechos</h4>
      <p>Puedes ver, llevarte, corregir o borrar tus datos desde la app, sin pedirle nada a nadie:</p>
      <ul>
        <li><b>Ver y llevártelos:</b> Ajustes → Respaldo → Guardar respaldo (un archivo con todo).</li>
        <li><b>Borrarlos de la nube:</b> Desactivar el respaldo automático (elige borrar la copia) y desactivar las notificaciones.</li>
        <li><b>Borrarlos del teléfono:</b> Ajustes → Zona de riesgo → Borrar todos mis datos, o eliminar la app.</li>
      </ul>
      <p>Si tienes dudas, escribe a quien te compartió la app.</p>

      <h4>No es consejo médico</h4>
      <p>Las evaluaciones, planes de dieta y recordatorios de medicamentos son una guía. Consulta siempre a tu médico o nutricionista.</p>
    </div>
    <div class="actions"><button class="primary" data-close>Entendido</button></div>`
  );
}
