export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function fmtPrice(p) {
  if (p == null || !isFinite(p) || p <= 0) return '–';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (p >= 1) return p.toFixed(p >= 100 ? 2 : 3);
  const d = Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(p))));
  return p.toFixed(d);
}
export function fmtVol(v) {
  if (v == null || !isFinite(v)) return '–';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'K';
  return '$' + Math.round(v);
}
/** Colored signed percent as HTML. */
export function pct(v, d = 2) {
  if (v == null || !isFinite(v)) return '<span class="mut">–</span>';
  const s = (v > 0 ? '+' : '') + v.toFixed(d) + '%';
  return '<span class="' + (v > 0 ? 'up' : v < 0 ? 'down' : '') + '">' + s + '</span>';
}
/** Fraction 0..1 as "57%". */
export function pc(x) { return x == null ? '–' : Math.round(x * 100) + '%'; }
export function f2(x) { return x == null ? '–' : x.toFixed(2); }
export function sgn(x, d = 2) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d); }
export function hm(t) { return new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
export function hms(t) { return new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
