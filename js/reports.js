// Informes para compartir: una página que se ve en la app, se imprime o guarda como PDF, y se comparte
// como archivo .html (se abre en cualquier navegador, sin la app). Colores fijos para que se lean igual
// impresos o en otro teléfono.
import { state } from './store.js';
import { esc, num, openSheet, toast, todayStr, lastDays, parseDate, shareFile } from './util.js';
import { dayTotals, dayMacros, waterOf, extrasFor } from './calc.js';
import { burnedFor, minsFor } from './views/exercise.js';
import { dosesFor } from './views/meds.js';
import { bmiInfo, GOALS, ACTIVITY } from './nutrition.js';
import { isOn } from './modules.js';

// ---------- página del informe ----------
const CSS = `
.report { --ink:#1b2422; --muted:#5f6c6a; --line:#dde5e3; --accent:#0f766e; --soft:#e6f2f0; font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color: var(--ink); background:#fff; max-width: 820px; margin: 0 auto; padding: 24px 18px 40px; }
.report h1 { font-size: 22px; margin: 0 0 2px; }
.report h2 { font-size: 15px; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--accent); color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
.report .sub { color: var(--muted); font-size: 13px; }
.report .kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
.report .kv div { background: var(--soft); border-radius: 8px; padding: 8px 10px; }
.report .kv b { display: block; font-size: 17px; }
.report .kv span { font-size: 12px; color: var(--muted); }
.report table { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.report th, .report td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.report td.txt { white-space: normal; }
.report th:first-child, .report td:first-child { text-align: left; }
.report th { font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 600; }
.report tfoot td { font-weight: 700; border-top: 2px solid var(--line); }
.report .wrap { overflow-x: auto; }
.report ul { padding-left: 18px; margin: 6px 0; }
.report .note { white-space: pre-wrap; background: var(--soft); border-radius: 8px; padding: 10px 12px; }
.report .foot { margin-top: 28px; font-size: 11.5px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
.report svg { width: 100%; height: auto; display: block; margin: 6px 0; }
.report .neg { color: #b42318; } .report .pos { color: #15803d; }
@media print { .report { padding: 0; } .report h2 { break-after: avoid; } .report tr { break-inside: avoid; } }
`;

export const reportDoc = (title, body) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#fff}${CSS}</style></head><body><article class="report">${body}</article></body></html>`;

// Muestra el informe a pantalla completa con Compartir e Imprimir / PDF.
export function openReport({ title, body, file }) {
  document.getElementById('report-root')?.remove();
  const root = document.createElement('div');
  root.id = 'report-root';
  root.innerHTML = `<style>${CSS}</style>
    <div class="report-bar"><button class="ghost sm" data-r="close">‹ Volver</button><span class="grow"></span><button class="sm" data-r="print">PDF / Imprimir</button><button class="sm primary" data-r="share">Compartir</button></div>
    <article class="report">${body}</article>`;
  document.body.appendChild(root);
  document.body.classList.add('report-open');
  root.querySelector('.report-bar').onclick = async (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    if (b.dataset.r === 'close') return root.remove(), document.body.classList.remove('report-open');
    if (b.dataset.r === 'print') return window.print();
    try {
      await shareFile(file, reportDoc(title, body), 'text/html', title);
    } catch {
      toast('No se pudo compartir el archivo');
    }
  };
}

// ---------- gráficos simples con colores fijos ----------
function lineSVG(points, goal) {
  if (points.length < 2) return '';
  const W = 600, H = 150, pad = 26;
  const vals = points.map((p) => p.v).concat(goal ? [goal] : []);
  const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const t0 = parseDate(points[0].d).getTime(), t1 = parseDate(points[points.length - 1].d).getTime() || t0 + 1;
  const x = (d) => pad + ((parseDate(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso">
    ${goal ? `<line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="#b45309" stroke-dasharray="4 4"/><text x="${W - pad}" y="${y(goal) - 4}" font-size="11" text-anchor="end" fill="#b45309">Meta ${num(goal, 1)} kg</text>` : ''}
    <path d="${path}" fill="none" stroke="#0f766e" stroke-width="2.5"/>
    ${points.map((p) => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="3" fill="#0f766e"/>`).join('')}
    <text x="${pad}" y="${H - 6}" font-size="11" fill="#5f6c6a">${shortD(points[0].d)}</text><text x="${W - pad}" y="${H - 6}" font-size="11" text-anchor="end" fill="#5f6c6a">${shortD(points[points.length - 1].d)}</text>
    <text x="${x(points[0].d)}" y="${y(points[0].v) - 7}" font-size="11" fill="#1b2422">${num(points[0].v, 1)}</text><text x="${x(points[points.length - 1].d)}" y="${y(points[points.length - 1].v) - 7}" font-size="11" text-anchor="end" fill="#1b2422">${num(points[points.length - 1].v, 1)}</text>
  </svg>`;
}
function barsSVG(rows, key, goal, label) {
  const vals = rows.map((r) => r[key] || 0);
  if (!vals.some(Boolean)) return '';
  const W = 600, H = 140, pad = 22;
  const max = Math.max(...vals, goal || 0) * 1.1;
  const bw = (W - pad * 2) / rows.length;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
    ${rows.map((r, i) => (r[key] ? `<rect x="${(pad + i * bw + bw * 0.15).toFixed(1)}" y="${y(r[key]).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(H - pad - y(r[key])).toFixed(1)}" rx="2" fill="${goal && r[key] > goal * 1.1 ? '#b45309' : '#0f766e'}"/>` : '')).join('')}
    ${goal ? `<line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="#1b2422" stroke-dasharray="4 4"/><text x="${W - pad}" y="${y(goal) - 4}" font-size="11" text-anchor="end" fill="#1b2422">Meta ${num(goal)}</text>` : ''}
    <text x="${pad}" y="${H - 6}" font-size="11" fill="#5f6c6a">${shortD(rows[0].d)}</text><text x="${W - pad}" y="${H - 6}" font-size="11" text-anchor="end" fill="#5f6c6a">${shortD(rows[rows.length - 1].d)}</text>
  </svg>`;
}
const shortD = (d) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(parseDate(d));
const longD = (d) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(d));
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const or = (v, f) => (v == null ? '—' : f(v));

// ---------- informe para el nutricionista ----------
export function nutritionData(n) {
  const days = lastDays(n);
  const rows = days.map((d) => {
    const t = dayTotals(d);
    const m = dayMacros(d);
    return { d, kcal: t.hasData ? t.total : null, extra: t.extra, p: m.any ? m.p : null, c: m.any ? m.c : null, f: m.any ? m.f : null, water: waterOf(d) || null, done: t.mealsDone, total: t.mealsTotal, burned: burnedFor(d), mins: minsFor(d) };
  });
  const withKcal = rows.filter((r) => r.kcal != null);
  const withMac = rows.filter((r) => r.p != null);
  const withPlan = rows.filter((r) => r.total && r.done);
  const weights = [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
  const inRange = weights.filter((w) => w.date >= days[0]);
  const before = weights.filter((w) => w.date < days[0]).pop();
  const first = before || inRange[0];
  const last = weights[weights.length - 1];
  // fuera de la dieta: lo más repetido
  const extras = new Map();
  for (const d of days)
    for (const it of extrasFor(d)) {
      const k = it.name;
      const e = extras.get(k) || { name: k, n: 0, kcal: 0 };
      e.n++;
      e.kcal += it.kcal || 0;
      extras.set(k, e);
    }
  return {
    days,
    rows,
    avg: {
      kcal: avg(withKcal.map((r) => r.kcal)),
      p: avg(withMac.map((r) => r.p)),
      c: avg(withMac.map((r) => r.c)),
      f: avg(withMac.map((r) => r.f)),
      water: avg(rows.filter((r) => r.water).map((r) => r.water)),
      plan: withPlan.length ? avg(withPlan.map((r) => r.done / r.total)) : null,
    },
    logged: withKcal.length,
    weights: inRange,
    change: first && last && last !== first ? last.kg - first.kg : null,
    last,
    extras: [...extras.values()].sort((a, b) => b.n - a.n || b.kcal - a.kcal).slice(0, 12),
    active: rows.filter((r) => r.mins > 0),
  };
}

// Cumplimiento de medicamentos en el período (tomas programadas hasta ahora).
function medsData(days) {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const by = new Map();
  for (const d of days)
    for (const x of dosesFor(d)) {
      if (d > todayStr() || (d === todayStr() && x.time > hhmm)) continue;
      const e = by.get(x.med.id) || { med: x.med, due: 0, taken: 0 };
      e.due++;
      if (x.status === 'taken') e.taken++;
      by.set(x.med.id, e);
    }
  return [...by.values()];
}

export function nutritionReportHTML(n, opts) {
  const s = state.settings;
  const prof = s.profile || {};
  const height = s.body?.height || prof.height || 0;
  const age = s.body?.age || prof.age || 0;
  const r = nutritionData(n);
  const bmi = height && r.last ? bmiInfo(r.last.kg, height, age) : null;
  const mg = s.macroGoals;
  const pct = (v) => `${Math.round(v * 100)} %`;
  const parts = [];
  parts.push(`<h1>Informe de alimentación y peso</h1>
    <div class="sub">${s.name ? `<b>${esc(s.name)}</b> · ` : ''}${[age ? `${age} años` : '', prof.sex ? (prof.sex === 'm' ? 'hombre' : 'mujer') : '', height ? `${num(height)} cm` : ''].filter(Boolean).join(' · ')}</div>
    <div class="sub">Período: ${longD(r.days[0])} al ${longD(r.days[r.days.length - 1])} (${n} días) · días con registro: ${r.logged} de ${n}</div>
    ${prof.goal ? `<div class="sub">Objetivo: ${esc(GOALS[prof.goal]?.name || '')} · actividad ${esc((ACTIVITY.find((a) => a.id === prof.activity)?.name || '').toLowerCase())}</div>` : ''}
    <div class="kv">
      ${r.last ? `<div><b>${num(r.last.kg, 1)} kg</b><span>Peso (${shortD(r.last.date)})${r.change != null ? ` · <span class="${r.change <= 0 ? 'pos' : 'neg'}">${r.change > 0 ? '+' : r.change < 0 ? '−' : ''}${num(Math.abs(r.change), 1)} kg</span> en el período` : ''}</span></div>` : ''}
      ${bmi ? `<div><b>${num(bmi.bmi, 1)}</b><span>IMC · ${bmi.cat}</span></div>` : ''}
      ${s.goalKg ? `<div><b>${num(s.goalKg, 1)} kg</b><span>Meta de peso${s.goalDate ? ` al ${shortD(s.goalDate)}` : ''}</span></div>` : ''}
      <div><b>${r.logged ? num(r.avg.kcal) : '—'} kcal</b><span>Promedio diario · meta ${num(s.kcalGoal)}</span></div>
      ${r.avg.p ? `<div><b>${num(r.avg.p)} / ${num(r.avg.c)} / ${num(r.avg.f)} g</b><span>Proteína / carbos / grasa${mg ? ` · meta ${num(mg.p)}/${num(mg.c)}/${num(mg.f)}` : ''}</span></div>` : ''}
      ${r.avg.plan != null ? `<div><b>${pct(r.avg.plan)}</b><span>Comidas del plan cumplidas</span></div>` : ''}
      ${r.avg.water ? `<div><b>${num(r.avg.water / 1000, 1)} L</b><span>Agua promedio · meta ${num((s.waterGoal || 0) / 1000, 1)} L</span></div>` : ''}
    </div>`);

  if (opts.weight && r.weights.length) {
    parts.push(`<h2>Peso</h2>${lineSVG(r.weights.map((w) => ({ d: w.date, v: w.kg })), s.goalKg || null)}
      <div class="wrap"><table><thead><tr><th>Fecha</th><th>Peso</th>${height ? '<th>IMC</th>' : ''}</tr></thead><tbody>${r.weights
        .map((w) => `<tr><td>${shortD(w.date)}</td><td>${num(w.kg, 1)} kg</td>${height ? `<td>${num(bmiInfo(w.kg, height, age).bmi, 1)}</td>` : ''}</tr>`)
        .join('')}</tbody></table></div>`);
  }

  if (opts.food) {
    parts.push(`<h2>Alimentación por día</h2>${barsSVG(r.rows, 'kcal', s.kcalGoal, 'Calorías por día')}
      <div class="wrap"><table><thead><tr><th>Día</th><th>kcal</th><th>Prot.</th><th>Carbos</th><th>Grasa</th><th>Fuera</th><th>Plan</th><th>Agua</th>${opts.exercise ? '<th>Ejerc.</th>' : ''}</tr></thead><tbody>${r.rows
        .map(
          (x) =>
            `<tr><td>${shortD(x.d)}</td><td>${or(x.kcal, num)}</td><td>${or(x.p, (v) => num(v) + ' g')}</td><td>${or(x.c, (v) => num(v) + ' g')}</td><td>${or(x.f, (v) => num(v) + ' g')}</td><td>${x.extra ? num(x.extra) : '—'}</td><td>${x.total ? `${x.done}/${x.total}` : '—'}</td><td>${x.water ? num(x.water / 1000, 1) + ' L' : '—'}</td>${opts.exercise ? `<td>${x.burned ? num(x.burned) : '—'}</td>` : ''}</tr>`
        )
        .join('')}</tbody>
        <tfoot><tr><td>Promedio</td><td>${r.logged ? num(r.avg.kcal) : '—'}</td><td>${r.avg.p ? num(r.avg.p) + ' g' : '—'}</td><td>${r.avg.c ? num(r.avg.c) + ' g' : '—'}</td><td>${r.avg.f ? num(r.avg.f) + ' g' : '—'}</td><td></td><td>${r.avg.plan != null ? pct(r.avg.plan) : '—'}</td><td>${r.avg.water ? num(r.avg.water / 1000, 1) + ' L' : '—'}</td>${opts.exercise ? '<td></td>' : ''}</tr></tfoot></table></div>
      <div class="sub">Las calorías y macros son estimaciones según lo registrado (comidas del plan marcadas y alimentos fuera de la dieta). Los días sin registro aparecen con "—". "Fuera" y "Ejerc." en kcal.</div>`);
  }

  if (opts.extras && r.extras.length)
    parts.push(`<h2>Fuera de la dieta (lo más frecuente)</h2><div class="wrap"><table><thead><tr><th>Alimento</th><th>Veces</th><th>kcal en total</th></tr></thead><tbody>${r.extras
      .map((e) => `<tr><td>${esc(e.name)}</td><td>${e.n}</td><td>${num(e.kcal)}</td></tr>`)
      .join('')}</tbody></table></div>`);

  if (opts.plan) {
    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const days = DAYS.map((name, i) => ({ name, meals: state.diet.plan[i] || [] })).filter((d) => d.meals.length);
    if (days.length)
      parts.push(`<h2>Plan de comidas actual</h2>${days
        .map(
          (d) => `<p style="margin:10px 0 2px"><b>${d.name}</b> · ${num(d.meals.reduce((a, m) => a + (m.kcal || 0), 0))} kcal</p><ul>${d.meals
            .map((m) => `<li>${m.time ? `${esc(m.time)} · ` : ''}<b>${esc(m.name)}</b>${m.desc ? `: ${esc(m.desc)}` : ''}${m.kcal ? ` (${num(m.kcal)} kcal)` : ''}</li>`)
            .join('')}</ul>`
        )
        .join('')}`);
  }

  if (opts.exercise && r.active.length)
    parts.push(`<h2>Actividad física</h2><p>${r.active.length} de ${n} días con actividad · ${num(r.active.reduce((a, x) => a + x.mins, 0))} minutos · ~${num(r.active.reduce((a, x) => a + x.burned, 0))} kcal estimadas.</p>`);

  if (opts.meds) {
    const meds = medsData(r.days);
    if (meds.length)
      parts.push(`<h2>Medicamentos</h2><div class="wrap"><table><thead><tr><th>Medicamento</th><th>Dosis</th><th>Horarios</th><th>Tomas</th></tr></thead><tbody>${meds
        .map((m) => `<tr><td>${esc(m.med.name)}</td><td>${esc(m.med.dose || '')}</td><td>${m.med.times.map(esc).join(', ')}</td><td>${m.taken} de ${m.due} (${Math.round((m.taken / m.due) * 100)} %)</td></tr>`)
        .join('')}</tbody></table></div>`);
  }

  if (opts.note?.trim()) parts.push(`<h2>Comentarios</h2><div class="note">${esc(opts.note.trim())}</div>`);

  parts.push(`<div class="foot">Generado el ${longD(todayStr())} con Gestión Personal a partir de lo que registró la persona. Las calorías y macros son estimaciones; el IMC sigue la referencia de la OMS (desde los 65 años, MINSAL).</div>`);
  return parts.join('');
}

export function nutritionReportSheet() {
  const has = (k) => (k === 'meds' ? isOn('meds') && state.meds.list.length : k === 'exercise' ? isOn('exercise') : true);
  let n = 14;
  openSheet(
    `<h3>Informe para tu nutricionista</h3>
    <p class="small muted" style="margin-top:0">Un resumen de tu peso y alimentación para llevar a tu control. Tú eliges qué incluir; se comparte como archivo o PDF.</p>
    <label class="field">Período</label>
    <div class="seg" id="per">${[7, 14, 30].map((d) => `<button type="button" data-n="${d}">${d} días</button>`).join('')}</div>
    <div id="secs" style="margin-top:8px">
      ${[
        ['weight', 'Peso e IMC', true],
        ['food', 'Calorías, macros, agua y plan cumplido por día', true],
        ['extras', 'Lo que comí fuera de la dieta', true],
        ['plan', 'Mi plan de comidas actual', true],
        ['exercise', 'Actividad física', true],
        ['meds', 'Medicamentos y cumplimiento', false],
      ]
        .filter(([k]) => has(k))
        .map(([k, t, on]) => `<label class="cuotas"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}> <span>${t}</span></label>`)
        .join('')}
    </div>
    <label class="field">Comentarios para tu nutricionista (opcional)<textarea id="note" rows="3" maxlength="800" placeholder="Ej: esta semana tuve más hambre en la tarde"></textarea></label>
    <div class="actions"><button class="ghost" data-close>Cancelar</button><button class="primary" id="go">Ver informe</button></div>`,
    (sheet, close) => {
      const seg = () => sheet.querySelectorAll('#per button').forEach((b) => b.classList.toggle('sel', +b.dataset.n === n));
      sheet.querySelector('#per').onclick = (e) => e.target.closest('[data-n]') && ((n = +e.target.closest('[data-n]').dataset.n), seg());
      seg();
      sheet.querySelector('#go').onclick = () => {
        const opts = { note: sheet.querySelector('#note').value };
        sheet.querySelectorAll('#secs [data-k]').forEach((c) => (opts[c.dataset.k] = c.checked));
        close();
        const title = `Informe nutricional ${state.settings.name || ''}`.trim();
        openReport({ title, body: nutritionReportHTML(n, opts), file: `informe-nutricional-${todayStr()}.html` });
      };
    }
  );
}

