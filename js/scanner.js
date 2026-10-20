// Lector de código de barras: cámara (ZXing, cargado solo al usarlo) + búsqueda en Open Food Facts.
// Los productos encontrados se guardan en "mis alimentos" con su código: la próxima vez se encuentran
// sin internet. A Open Food Facts solo se envía el número del código de barras.
import { state, save } from './store.js';
import { uid, toast } from './util.js';

let loading = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  return (loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/zxing.min.js';
    s.onload = resolve;
    s.onerror = () => ((loading = null), reject(new Error('zxing')));
    document.head.appendChild(s);
  }));
}

const validCode = (c) => /^\d{8,14}$/.test(c);

// Pantalla de cámara. Resuelve con el código leído o escrito a mano (o null si se cancela).
export function scanBarcode() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'scanner';
    el.innerHTML = `<video playsinline muted autoplay></video>
      <div class="scan-frame"></div>
      <div class="scan-top"><b>Apunta al código de barras</b><span class="small" id="sc-msg">Abriendo la cámara…</span></div>
      <div class="scan-bottom">
        <form id="sc-man" hidden><input id="sc-code" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Ej: 7802800716005" autocomplete="off"><button class="primary">Buscar</button></form>
        <div class="actions"><button type="button" id="sc-type">Escribir código</button><button type="button" class="primary" id="sc-cancel">Cancelar</button></div>
      </div>`;
    document.body.appendChild(el);
    let reader = null;
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      try {
        reader?.reset();
      } catch {
        /* cámara ya cerrada */
      }
      el.remove();
      resolve(code);
    };
    el.querySelector('#sc-cancel').onclick = () => finish(null);
    el.querySelector('#sc-type').onclick = () => {
      el.querySelector('#sc-man').hidden = false;
      el.querySelector('#sc-code').focus();
    };
    el.querySelector('#sc-man').onsubmit = (e) => {
      e.preventDefault();
      const c = el.querySelector('#sc-code').value.replace(/\D/g, '');
      if (!validCode(c)) return toast('El código tiene entre 8 y 14 números');
      finish(c);
    };
    const msg = (t) => (el.querySelector('#sc-msg').textContent = t);
    loadZXing()
      .then(async () => {
        if (finished) return;
        const Z = window.ZXing;
        const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]]]);
        reader = new Z.BrowserMultiFormatReader(hints, 250);
        msg('Buscando el código…');
        await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, el.querySelector('video'), (result) => {
          const c = result?.getText?.();
          if (c && validCode(c)) {
            navigator.vibrate?.(30);
            finish(c);
          }
        });
      })
      .catch(() => {
        if (finished) return;
        msg('No se pudo abrir la cámara. Revisa el permiso o escribe el número.');
        el.querySelector('#sc-man').hidden = false;
      });
  });
}

const r1 = (x) => Math.round((x || 0) * 10) / 10;

// Producto de Open Food Facts -> alimento de la app (por porción si la etiqueta la trae, si no por 100 g/ml).
export function offToFood(code, p) {
  const n = p.nutriments || {};
  let kcal100 = n['energy-kcal_100g'];
  if (kcal100 == null && n.energy_100g != null) kcal100 = n.energy_100g / 4.184; // kJ -> kcal
  if (kcal100 == null) return null;
  const u = /\d\s*(ml|cl|l)\b/i.test(p.quantity || '') ? 'ml' : 'g';
  const sq = parseFloat(p.serving_quantity);
  const per = sq > 0 && sq < 2000 ? sq : 100;
  const k = per / 100;
  const brand = (p.brands || '').split(',')[0].trim();
  const name = (p.product_name_es || p.product_name || 'Producto').trim();
  return {
    id: uid(),
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    unit: per === 100 ? `100 ${u}` : `1 porción (${r1(per)} ${u})`,
    kcal: Math.round(kcal100 * k),
    p: r1((n.proteins_100g || 0) * k),
    c: r1((n.carbohydrates_100g || 0) * k),
    f: r1((n.fat_100g || 0) * k),
    barcode: code,
  };
}

// Busca primero en mis alimentos (sin internet) y luego en Open Food Facts.
// Resuelve { food } si lo encontró, { notFound: true } si no está o no tiene calorías, { offline: true } sin conexión.
export async function lookupBarcode(code) {
  const mine = state.foods.find((f) => f.barcode === code);
  if (mine) return { food: mine };
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity,quantity`);
    if (!r.ok) return { notFound: true };
    const j = await r.json();
    const food = j.status === 1 && j.product ? offToFood(code, j.product) : null;
    if (!food) return { notFound: true, name: j.product?.product_name || '' };
    state.foods.unshift(food);
    save();
    return { food, fresh: true };
  } catch {
    return { offline: true };
  }
}
