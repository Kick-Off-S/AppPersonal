// Gráficos SVG sin librerías (funcionan sin internet). Una sola serie, un solo tono, marcas finas
// ancladas a la línea base y etiquetas solo donde aportan. Cada marca lleva <title> con su valor.
import { esc, shortDate } from './util.js';

const W = 320;

// labels: ['Lun', ...]  values: [número | null]  goal: línea punteada  marks: marca por barra (p. ej. sueldo)
export function barChart({ labels, values, goal = null, goalLabel = '', marks = null, fmt = (v) => v, titles = null, h = 150, overWarn = false, label = 'Gráfico' }) {
  const top = 20, bottom = 22, side = 4;
  const ph = h - top - bottom;
  const all = [...values.filter((v) => v != null), goal || 0, ...(marks || []).filter((v) => v != null)];
  const max = Math.max(...all, 1) * 1.08;
  const slot = (W - side * 2) / values.length;
  const bw = Math.min(26, slot * 0.58);
  const y = (v) => top + ph - (v / max) * ph;
  const base = top + ph;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;
  s += `<line class="base" x1="${side}" x2="${W - side}" y1="${base}" y2="${base}"/>`;
  if (goal) {
    s += `<line class="goal" x1="${side}" x2="${W - side}" y1="${y(goal)}" y2="${y(goal)}"/>`;
    if (goalLabel) s += `<text class="lbl" x="${W - side}" y="${y(goal) - 4}" text-anchor="end">${esc(goalLabel)}</text>`;
  }
  values.forEach((v, i) => {
    const cx = side + slot * i + slot / 2;
    const last = i === values.length - 1;
    s += `<text class="lbl ${last ? 'now' : ''}" x="${cx}" y="${h - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
    if (v != null && v > 0) {
      const bh = Math.max(3, base - y(v));
      const warn = overWarn && goal && v > goal * 1.0;
      // barra con extremo superior redondeado (4px) y base plana
      const r = Math.min(4, bw / 2, bh);
      const x0 = cx - bw / 2, x1 = cx + bw / 2, yt = base - bh;
      s += `<path class="bar ${warn ? 'warn' : ''}" d="M${x0} ${base}V${yt + r}Q${x0} ${yt} ${x0 + r} ${yt}H${x1 - r}Q${x1} ${yt} ${x1} ${yt + r}V${base}Z"><title>${esc(titles ? titles[i] : `${labels[i]}: ${fmt(v)}`)}</title></path>`;
      s += `<text class="val" x="${cx}" y="${yt - 4}" text-anchor="middle">${esc(fmt(v))}</text>`;
    }
    if (marks && marks[i] != null && marks[i] > 0) {
      s += `<line class="mark" x1="${cx - slot * 0.42}" x2="${cx + slot * 0.42}" y1="${y(marks[i])}" y2="${y(marks[i])}"><title>${esc(fmt(marks[i]))}</title></line>`;
    }
  });
  return s + '</svg>';
}

// points: [{ date: 'YYYY-MM-DD', v: número }] ordenados por fecha
export function lineChart({ points, goal = null, goalLabel = '', fmt = (v) => v, h = 170, label = 'Gráfico' }) {
  const left = 38, right = 12, top = 16, bottom = 24;
  const pw = W - left - right, ph = h - top - bottom;
  const vals = [...points.map((p) => p.v), ...(goal ? [goal] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points[points.length - 1].date).getTime();
  const x = (d) => left + (t1 === t0 ? pw / 2 : ((new Date(d).getTime() - t0) / (t1 - t0)) * pw);
  const y = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">`;
  for (const v of [lo + pad, (lo + hi) / 2, hi - pad]) {
    s += `<line class="base" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text class="lbl" x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  if (goal) {
    s += `<line class="goal" x1="${left}" x2="${W - right}" y1="${y(goal)}" y2="${y(goal)}"/>`;
    if (goalLabel) s += `<text class="lbl" x="${W - right}" y="${y(goal) - 4}" text-anchor="end">${esc(goalLabel)}</text>`;
  }
  s += `<text class="lbl" x="${left}" y="${h - 6}" text-anchor="start">${shortDate(points[0].date)}</text>`;
  if (points.length > 1) s += `<text class="lbl" x="${W - right}" y="${h - 6}" text-anchor="end">${shortDate(points[points.length - 1].date)}</text>`;
  if (points.length > 1) s += `<path class="line" d="${points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}"/>`;
  const dots = points.length <= 40;
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    if (dots || last) s += `<circle class="dot" cx="${x(p.date)}" cy="${y(p.v)}" r="${last ? 5 : 3.5}"><title>${shortDate(p.date)}: ${esc(fmt(p.v))}</title></circle>`;
  });
  const lp = points[points.length - 1];
  s += `<text class="val" x="${Math.min(x(lp.date), W - right - 14)}" y="${y(lp.v) - 10}" text-anchor="middle">${esc(fmt(lp.v))}</text>`;
  return s + '</svg>';
}
