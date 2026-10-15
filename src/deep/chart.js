import { fmtPrice, fmtVol, hm } from '../lib/format.js';

const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Canvas chart: 1m candles, swing levels, order-book walls, nearest idea trigger, price tag. */
export function drawChart(cv, d) {
  if (!cv || !d || cv.offsetParent === null) return;
  const W = cv.parentElement.clientWidth, H = window.innerWidth < 600 ? 300 : 380, dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const C = { up: cssv('--up'), down: cssv('--down'), muted: cssv('--muted'), line: cssv('--line'), ink: cssv('--ink'), hot: cssv('--hot'), surface: cssv('--surface') };
  const bars = d.bars.slice(W < 600 ? -90 : -150);
  let hi = -Infinity, lo = Infinity;
  bars.forEach(b => { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
  const pad = (hi - lo) * 0.12 || hi * 0.002; hi += pad; lo -= pad;
  const axisW = 74, top = 10, bot = 22, plotW = W - axisW, plotH = H - top - bot;
  const y = p => top + (hi - p) / (hi - lo) * plotH;
  ctx.font = '12px "Barlow Semi Condensed", Barlow, sans-serif'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted;
  for (let g = 0; g <= 5; g++) { const gp = lo + (hi - lo) * g / 5, gy = Math.round(y(gp)) + 0.5; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke(); ctx.fillText(fmtPrice(gp), plotW + 6, gy); }
  ctx.setLineDash([5, 4]);
  d.levels.forEach(l => {
    if (l.p < lo || l.p > hi) return;
    const ly = Math.round(y(l.p)) + 0.5;
    ctx.strokeStyle = C.muted; ctx.globalAlpha = l.kind ? 0.9 : Math.min(0.9, 0.35 + l.touches * 0.12); ctx.lineWidth = l.touches >= 4 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = C.muted; ctx.fillText(l.kind || '×' + l.touches, 4, ly - 7);
  });
  ctx.setLineDash([]);
  ['bid', 'ask'].forEach(side => d.dens[side].forEach(w => {
    if (w.p < lo || w.p > hi) return;
    const wy = Math.round(y(w.p)) + 0.5, lw = Math.min(5, 1.5 + Math.log2(Math.max(1, w.x / 8)));
    ctx.strokeStyle = side === 'bid' ? C.up : C.down; ctx.lineWidth = lw; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(plotW * 0.55, wy); ctx.lineTo(plotW, wy); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = side === 'bid' ? C.up : C.down; ctx.textAlign = 'right'; ctx.fillText(fmtVol(w.n), plotW - 4, wy - 8); ctx.textAlign = 'left';
  }));
  const idea = d.ideas && d.ideas[0];
  if (idea && idea.entry > lo && idea.entry < hi) {
    const iy = Math.round(y(idea.entry)) + 0.5;
    ctx.strokeStyle = C.hot; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(0, iy); ctx.lineTo(plotW, iy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.hot; ctx.fillText(idea.name, plotW * 0.3, iy - 8);
  }
  const cw = plotW / bars.length, bw = Math.max(1, Math.floor(cw * 0.65));
  bars.forEach((b, i) => {
    const x = Math.round(i * cw + cw / 2), col = b.c >= b.o ? C.up : C.down;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
    ctx.fillRect(x - Math.floor(bw / 2), y(Math.max(b.o, b.c)), bw, Math.max(1, Math.abs(y(b.o) - y(b.c))));
    if (i % 30 === 0) { ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText(hm(b.t), x, H - 9); ctx.textAlign = 'left'; }
  });
  if (d.price > lo && d.price < hi) {
    const py = Math.round(y(d.price)) + 0.5;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(plotW, py); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.ink; ctx.fillRect(plotW + 2, py - 9, axisW - 4, 18); ctx.fillStyle = C.surface; ctx.fillText(fmtPrice(d.price), plotW + 6, py);
  }
}
