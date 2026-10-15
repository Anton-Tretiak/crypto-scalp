import { CONFIG } from '../../config.js';
import { median, quant } from '../../lib/stats.js';

const acc = () => ({ n: 0, w: 0, sum: 0 });
const addR = (a, r) => { a.n++; if (r > 0) a.w++; a.sum += r; };

/**
 * Mini backtest per direction on 1m candles:
 *  - momentum: |move over 3 bars| >= T/2 on volume >= volMult × 30-bar average
 *  - fade: first candle against a finished impulse, stop beyond the extreme + sweep buffer
 * Target = targetR × risk, max hold = horizon minutes, fees subtracted in R.
 */
export function backtest(b, d, { T, market }) {
  const C = CONFIG.deep.backtest, L = b.length, st = d.stats;
  const fee = CONFIG.fees[market];
  const goal = Math.max(0.4, (st.medSize || T) * 0.5);
  const sigs = [];
  let cool = -1;
  for (let k = 33; k < L - C.horizon - 1; k++) {
    if (k <= cool) continue;
    const mv = (b[k].c / b[k - 3].c - 1) * 100;
    if (Math.abs(mv) < T * 0.5) continue;
    let av = 0; for (let j = k - 30; j < k; j++) av += b[j].qv; av /= 30;
    if (!(b[k].qv >= C.volMult * av)) continue;
    sigs.push({ k, dir: mv > 0 ? 1 : -1, E: b[k].c }); cool = k + C.cooldown;
  }
  const path = s => {
    const out = [];
    for (let m = s.k + 1; m <= s.k + C.horizon && m < L; m++) {
      const x = b[m];
      out.push(s.dir > 0 ? { fav: (x.h / s.E - 1) * 100, adv: (1 - x.l / s.E) * 100, cl: (x.c / s.E - 1) * 100 }
                         : { fav: (1 - x.l / s.E) * 100, adv: (x.h / s.E - 1) * 100, cl: (1 - x.c / s.E) * 100 });
    }
    return out;
  };
  const maes = { 1: [], '-1': [] }, ttg = [];
  sigs.forEach(s => {
    s.path = path(s);
    let mae = 0;
    for (let i = 0; i < s.path.length; i++) {
      mae = Math.max(mae, s.path[i].adv);
      if (s.path[i].fav >= goal) { maes[s.dir].push(mae); ttg.push(i + 1); return; }
    }
  });
  const allMae = maes[1].concat(maes[-1]);
  const floor = Math.max(0.12, 0.5 * d.atr1m);
  const stopPct = allMae.length >= C.minSamples ? Math.min(3, Math.max(floor, quant(allMae, 0.8) + 0.02)) : Math.max(floor, 0.8 * d.atr1m);
  const sim = (p, stop, tgt) => {
    let reached = false, back = false;
    for (let i = 0; i < p.length; i++) {
      const x = p[i];
      if (x.adv >= stop) return { r: -1, reached, back: reached };
      if (reached && x.adv >= 0) back = true;
      if (x.fav >= tgt) return { r: tgt / stop, reached: true, back };
      if (x.fav >= stop) reached = true;
    }
    const last = p[p.length - 1];
    return { r: last ? last.cl / stop : 0, reached, back };
  };
  const mom = { 1: acc(), '-1': acc() }, be = { reach: 0, back: 0 };
  sigs.forEach(s => {
    const r = sim(s.path, stopPct, C.targetR * stopPct);
    addR(mom[s.dir], r.r - fee / stopPct);
    if (r.reached) { be.reach++; if (r.back) be.back++; }
  });
  const fade = { 1: acc(), '-1': acc() }, sw = d.brk.sweep;
  st.impulses.forEach(im => {
    const k = im.e + 1;
    if (k >= L - C.horizon - 1) return;
    const x = b[k], against = im.dir > 0 ? x.c < x.o : x.c > x.o;
    if (!against) return;
    const dir = -im.dir, E = x.c, buf = (dir > 0 ? sw.dnP80 : sw.upP80) || 0.1;
    const stopPrice = dir > 0 ? im.ext * (1 - buf / 100) : im.ext * (1 + buf / 100);
    const risk = Math.abs(E - stopPrice) / E * 100;
    if (!(risk > 0) || risk > 3 * stopPct) return;
    const r = sim(path({ k, dir, E }), risk, C.targetR * risk);
    addR(fade[dir], r.r - fee / risk);
  });
  return { stopPct, maeL: quant(maes[1], 0.8), maeS: quant(maes[-1], 0.8), maeN: allMae.length,
           ttgMed: median(ttg), ttgP80: quant(ttg, 0.8), be, mom, fade, fee, goal, floor };
}
