export function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
export function mean(a) { return a.length ? sum(a) / a.length : 0; }
export function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quant(a, q) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}
/** Writes percentile rank (0..1) of row[key] into row[out]; null values get 0.5. */
export function pctRank(rows, key, out, invert = false) {
  const vals = rows.filter(r => r[key] != null && isFinite(r[key])).map(r => r[key]).sort((a, b) => a - b);
  const n = vals.length;
  rows.forEach(r => {
    const v = r[key];
    if (v == null || !isFinite(v) || n === 0) { r[out] = 0.5; return; }
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] < v) lo = mid + 1; else hi = mid; }
    const p = Math.min(1, n > 1 ? lo / (n - 1) : 1);
    r[out] = invert ? 1 - p : p;
  });
}
