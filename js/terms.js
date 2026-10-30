// Términos y condiciones de uso. Hay que aceptarlos para usar la app (también quien ya la usaba) y
// de nuevo cada vez que cambian: al modificar el texto en algo importante, sube TERMS_VERSION.
// La aceptación (versión y fecha) queda en los datos del teléfono y viaja en los respaldos.
import { state, save } from './store.js';
import { openSheet } from './util.js';
import { privacySheet, PRIVACY_DATE } from './privacy.js';

export const TERMS_VERSION = '1';
export const TERMS_DATE = '30-10-2026';
// Quién ofrece la app y cómo contactarlo. Mientras estén vacíos, el texto dice "quien administra la app".
const OWNER = '';
const CONTACT = '';
const who = OWNER || 'quien administra la app';

export const accepted = () => state.settings.terms?.v === TERMS_VERSION;

export function termsHTML() {
  return `<div class="privacy">
    <p class="small muted">Versión ${TERMS_VERSION} · ${TERMS_DATE}</p>
    <h4>1. Aceptación</h4>
    <p>Gestión Personal (la "app") la ofrece ${who}. Al tocar "Acepto" y usar la app declaras haber leído y aceptado estos términos y el Aviso de privacidad. Si no estás de acuerdo, no uses la app.</p>

    <h4>2. Qué es la app</h4>
    <p>Una herramienta gratuita para registrar por tu cuenta tu alimentación, peso, ejercicio, hábitos, medicamentos, gastos, ahorro y préstamos. Funciona en tu teléfono y no requiere crear una cuenta.</p>

    <h4>3. No es consejo profesional</h4>
    <p>Las evaluaciones nutricionales, el IMC, los planes de dieta guía, las metas de peso, los cálculos de calorías, de cuotas, de intereses y los informes son <b>estimaciones con fórmulas generales</b>. No reemplazan a un médico, nutricionista, químico farmacéutico ni asesor financiero. Consulta siempre a un profesional antes de tomar decisiones de salud o de dinero. La app no es para emergencias: ante una urgencia, llama al 131 (SAMU) o acude a un servicio de urgencia.</p>

    <h4>4. Medicamentos y recordatorios</h4>
    <p>Los recordatorios y notificaciones pueden llegar tarde o no llegar (dependen de tu teléfono, de Apple o Google, de tu conexión y de la configuración que elijas). <b>No dependas solo de la app para tomar tus medicamentos</b>: sigue las indicaciones de tu médico y usa otros recordatorios si tu tratamiento es importante.</p>

    <h4>5. Tus datos y tu responsabilidad</h4>
    <ul>
      <li>Tus datos se guardan en tu teléfono. Eres responsable de lo que registras y de hacer respaldos: si borras la app, cambias de teléfono o se daña, puedes perderlos.</li>
      <li>Cuida tu teléfono, tu PIN y la contraseña del respaldo en la nube. Esa contraseña no se puede recuperar: sin ella, nadie puede abrir tu respaldo.</li>
      <li>Cómo se tratan tus datos está en el <b>Aviso de privacidad</b> (versión del ${PRIVACY_DATE}), que es parte de estos términos.</li>
    </ul>

    <h4>6. Lo que compartes</h4>
    <p>Si compartes un préstamo, un plan o un informe, tú decides con quién y por qué medio. No compartas datos de otras personas sin su consentimiento. Quien lo recibe es responsable de cómo lo usa.</p>

    <h4>7. Uso adecuado</h4>
    <p>No uses la app para fines ilegales ni intentes dañar, sobrecargar o acceder sin permiso a su servidor o a datos de otras personas.</p>

    <h4>8. Disponibilidad y cambios</h4>
    <p>La app se entrega tal como está y puede cambiar, tener errores o dejar de estar disponible. Las funciones en la nube (notificaciones y respaldo) son opcionales y podrían suspenderse; si eso pasa, se avisará con anticipación para que guardes tus datos. Estos términos pueden actualizarse: cuando cambien, la app te los mostrará y te pedirá aceptarlos de nuevo.</p>

    <h4>9. Responsabilidad</h4>
    <p>En la medida que la ley lo permita, ${who} no responde por daños derivados de decisiones tomadas en base a la app, de errores de cálculo, de recordatorios que no llegaron ni de la pérdida de datos guardados en tu teléfono. Nada de esto limita los derechos que te da la ley chilena, incluida la Ley 19.496 de protección de los derechos de los consumidores.</p>

    <h4>10. Edad</h4>
    <p>La app es para mayores de 18 años. Si eres menor, úsala solo con autorización y acompañamiento de tu madre, padre o tutor. Las funciones de nutrición no generan planes para menores de edad.</p>

    <h4>11. Término</h4>
    <p>Puedes dejar de usar la app cuando quieras y borrar tus datos desde Ajustes. Si desactivas la nube, puedes borrar también tu respaldo en el servidor.</p>

    <h4>12. Ley aplicable y contacto</h4>
    <p>Estos términos se rigen por las leyes de la República de Chile. ${CONTACT ? `Consultas y reclamos: ${CONTACT}.` : 'Para consultas, escribe a quien te compartió la app.'}</p>
  </div>`;
}

// Solo lectura (Ajustes / Más).
export function termsSheet() {
  const t = state.settings.terms;
  openSheet(
    `<h3>Términos y condiciones</h3>
    ${t?.at ? `<div class="banner small">Los aceptaste el ${new Date(t.at).toLocaleDateString('es-CL')} (versión ${t.v}).</div>` : ''}
    ${termsHTML()}
    <div class="actions"><button class="ghost" id="priv">Aviso de privacidad</button><button class="primary" data-close>Listo</button></div>`,
    (sheet) => (sheet.querySelector('#priv').onclick = () => privacySheet())
  );
}

// Pantalla obligatoria: tapa la app hasta aceptar. Se resuelve al aceptar.
export function termsGate() {
  if (accepted()) return Promise.resolve();
  const updated = !!state.settings.terms?.v;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'terms-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="tg-box">
      <h2>${updated ? 'Actualizamos los términos' : 'Antes de empezar'}</h2>
      <p class="small muted" style="margin-top:0">${updated ? 'Cambiaron los términos y condiciones. Para seguir usando la app, revísalos y acéptalos.' : 'Para usar Gestión Personal necesitas leer y aceptar los términos y condiciones y el aviso de privacidad.'}</p>
      <div class="tg-text">${termsHTML()}</div>
      <button class="ghost block sm" id="tg-priv">Leer el aviso de privacidad</button>
      <label class="mod consent"><input type="checkbox" class="switch" id="tg-ok"><span class="grow"><small>Tengo 18 años o más (o uso la app con autorización de mi madre, padre o tutor), leí y <strong>acepto los Términos y condiciones</strong> y el <strong>Aviso de privacidad</strong>.</small></span></label>
      <div class="actions"><button class="ghost" id="tg-no">No acepto</button><button class="primary" id="tg-yes" disabled>Aceptar y continuar</button></div>
      <div id="tg-msg"></div>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('modal-open');
    const $ = (s) => el.querySelector(s);
    $('#tg-ok').onchange = () => ($('#tg-yes').disabled = !$('#tg-ok').checked);
    $('#tg-priv').onclick = () => privacySheet();
    $('#tg-no').onclick = () =>
      ($('#tg-msg').innerHTML = '<div class="banner warn small" style="margin-top:10px">Sin aceptar los términos no puedes usar la app. Tus datos siguen guardados en este teléfono: si cambias de opinión, vuelve a abrirla. Si quieres borrarlos, elimina la app de tu teléfono.</div>');
    $('#tg-yes').onclick = () => {
      if (!$('#tg-ok').checked) return;
      state.settings.terms = { v: TERMS_VERSION, privacy: PRIVACY_DATE, at: new Date().toISOString() };
      save();
      el.remove();
      document.body.classList.remove('modal-open');
      resolve();
    };
  });
}
