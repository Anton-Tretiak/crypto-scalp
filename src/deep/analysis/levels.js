import { CONFIG } from '../../config.js';
import { mean, median, quant } from '../../lib/stats.js';

export function pivotFlags(b, i, K) {
  let isH = true, isL = true;
  for (let j = i - K; j <= i + K; j++) {
    if (j === i) continue;
    if (b[j].h > b[i].h || (j < i && b[j].h === b[i].h)) isH = false;
    if (b[j].l < b[i].l || (j < i && b[j].l === b[i].l)) isL = false;
    if (!isH && !isL) break;
  }
  return [isH, isL];
}

/** Swing highs/lows clustered into levels, plus the 24h high and low. */
export function findLevels(b, atr) {
  const K = CONFIG.deep.pivotK, L = b.length, piv = [];
  for (let i = K; i < L - K; i++) {
    const f = pivotFlags(b, i, K);
    if (f[0]) piv.push({ p: b[i].h, t: b[i].t });
    if (f[1]) piv.push({ p: b[i].l, t: b[i].t });
  }
  const tol = Math.max(0.12, 0.6 * atr) / 100;
  piv.sort((a, c) => a.p - c.p);
  const groups = [];
  let g = null;
  piv.forEach(p => {
    if (g && p.p <= g.mean * (1 + tol)) { g.items.push(p); g.mean = mean(g.items.map(x => x.p)); }
    else { g = { items: [p], mean: p.p }; groups.push(g); }
  });
  const price = b[L - 1].c, now = b[L - 1].t;
  let lv = groups.map(gr => ({ p: gr.mean, touches: gr.items.length, last: Math.max(...gr.items.map(x => x.t)), kind: null }))
    .filter(x => Math.abs(x.p / price - 1) <= 0.06 && (x.touches >= 2 || (now - x.last) <= 6 * 3.6e6));
  let hi = -Infinity, lo = Infinity;
  b.slice(-1440).forEach(x => { if (x.h > hi) hi = x.h; if (x.l < lo) lo = x.l; });
  lv = lv.filter(x => Math.abs(x.p / hi - 1) > tol && Math.abs(x.p / lo - 1) > tol);
  lv.push({ p: hi, touches: 0, kind: 'хай 24ч', last: now });
  lv.push({ p: lo, touches: 0, kind: 'лой 24ч', last: now });
  return lv;
}

/**
 * Replays every close beyond a swing level: did price travel `goal` further before closing back?
 * Also measures sweep depth (how far wicks pierce levels before reversing) for stop placement.
 */
export function breakStats(b, T) {
  const K = CONFIG.deep.pivotK, LA = CONFIG.deep.breakLookahead, L = b.length;
  const goal = Math.max(0.4, T / 2) / 100, used = [];
  const res = { up: { n: 0, ok: 0, fail: 0 }, dn: { n: 0, ok: 0, fail: 0 }, goal: goal * 100 };
  const sw = { up: [], dn: [] };
  for (let i = K; i < L - K; i++) {
    const f = pivotFlags(b, i, K);
    [[f[0], 1, b[i].h], [f[1], -1, b[i].l]].forEach(([isPivot, dir, P]) => {
      if (!isPivot) return;
      let swept = false;
      for (let k = i + K + 1; k < Math.min(L, i + K + 721); k++) {
        const c = b[k].c;
        const wick = dir > 0 ? b[k].h > P : b[k].l < P;
        const close = dir > 0 ? c > P * 1.0005 : c < P * 0.9995;
        if (wick && !close && !swept) {
          swept = true;
          let held = true;
          for (let q = k + 1; q <= Math.min(L - 1, k + 3); q++) if (dir > 0 ? b[q].c > P * 1.0005 : b[q].c < P * 0.9995) { held = false; break; }
          if (held) (dir > 0 ? sw.up : sw.dn).push(dir > 0 ? (b[k].h / P - 1) * 100 : (1 - b[k].l / P) * 100);
        }
        if (close) {
          if (used.some(u => Math.abs(u.k - k) <= 3 && Math.abs(u.p / P - 1) < 0.002)) return;
          used.push({ k, p: P });
          const r = dir > 0 ? res.up : res.dn;
          let out = 'to', over = dir > 0 ? (b[k].h / P - 1) * 100 : (1 - b[k].l / P) * 100;
          for (let m = k + 1; m < Math.min(L, k + LA + 1); m++) {
            over = Math.max(over, dir > 0 ? (b[m].h / P - 1) * 100 : (1 - b[m].l / P) * 100);
            if (dir > 0 ? b[m].c < P : b[m].c > P) { out = 'fail'; break; }
            if (dir > 0 ? b[m].h >= c * (1 + goal) : b[m].l <= c * (1 - goal)) { out = 'ok'; break; }
          }
          r.n++;
          if (out === 'ok') r.ok++;
          else if (out === 'fail') { r.fail++; (dir > 0 ? sw.up : sw.dn).push(over); }
          return;
        }
      }
    });
  }
  ['up', 'dn'].forEach(s => { const r = res[s]; r.rate = r.n ? r.ok / r.n : null; r.failRate = r.n ? r.fail / r.n : null; });
  const all = sw.up.concat(sw.dn);
  res.sweep = { up: sw.up, dn: sw.dn, n: all.length, upP80: quant(sw.up, 0.8), dnP80: quant(sw.dn, 0.8),
                upMed: median(sw.up), dnMed: median(sw.dn), p80: quant(all, 0.8), med: median(all) };
  return res;
}
