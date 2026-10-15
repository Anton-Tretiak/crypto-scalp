/** localStorage with safe fallbacks. All keys are prefixed with "ss:". */
export function load(key, fallback) {
  try { const v = localStorage.getItem('ss:' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem('ss:' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}
