import { CONFIG } from '../../config.js';
import { mean, median, quant } from '../../lib/stats.js';

const sgn = x => x > 0 ? 1 : x < 0 ? -1 : 0;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Bars of one funding event indexed by minute offset from the payment time. */
function byOffset(ev) {
  if (!ev._m) {
    ev._m = new Map();
    ev.bars.forEach(b => ev._m.set(Math.round((b.t - ev.t) / 60000), b));
  }
  return ev._m;
}

/**
 * One trade around a funding payment at ev.t (rate ev.r in %, > 0 means longs pay shorts).
 * Enters at the open of minute mIn relative to the payment, exits at the open of minute mOut.
 * The position earns or pays the funding if it is open at the payment (entered before, exited after).
 * With `stop` (in %), the stop is checked first inside each bar (conservative).
 * @returns {{r, gross, fund, mfe, mae, path: {fav, adv}[], stopped, rate}} or null if bars are missing
 */
export function simTrade(ev, dir, mIn, mOut, { fee, stop = null }) {
  const m = byOffset(ev), e = m.get(mIn);
  if (!e || !m.get(mOut)) return null;
  const entry = e.o, path = [];
  let mfe = 0, mae = 0, exitPx = m.get(mOut).o, exitK = mOut, stopped = false;
  for (let k = mIn; k < mOut; k++) {
    const b = m.get(k);
    if (!b) return null;
    const fav = dir > 0 ? (b.h / entry - 1) * 100 : (1 - b.l / entry) * 100;
    const adv = dir > 0 ? (1 - b.l / entry) * 100 : (b.h / entry - 1) * 100;
    path.push({ fav, adv });
    if (stop != null && adv >= stop) {
      mae = Math.max(mae, stop); stopped = true; exitK = k;
      exitPx = entry * (1 - dir * stop / 100);
      break;
    }
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
  }
  const gross = dir * (exitPx / entry - 1) * 100;
  const fund = mIn < 0 && exitK >= 0 ? -dir * ev.r : 0;
  return { r: gross + fund - fee, gross, fund, mfe, mae, path, stopped, rate: ev.r };
}

/** First profit level after which few trades came back to the entry price. */
function breakeven(trades, F) {
  for (const q of F.beSteps) {
    const hit = [], times = [];
    let back = 0;
    trades.forEach(t => {
      const j = t.path.findIndex(p => p.fav >= q);
      if (j < 0) return;
      hit.push(t); times.push(j + 1);
      if (t.path.slice(j + 1).some(p => p.adv >= 0)) back++;
    });
    if (hit.length < 5) return null;
    if (back / hit.length <= F.beBackMax) return { q, n: hit.length, back, tReach: quant(times, 0.8) };
  }
  return null;
}

function summarize(c, trades) {
  const rs = trades.map(t => t.r), n = rs.length, mu = mean(rs);
  const sd = n > 1 ? Math.sqrt(rs.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1)) : 0;
  return Object.assign(c, { n, mean: mu, se: n ? sd / Math.sqrt(n) : 0, win: n ? rs.filter(x => x > 0).length / n : 0 });
}

/**
 * Funding playbook from history.
 * @param f { events: [{t, r, bars}], rNow (%), nextT (ms) }
 * @returns { status: 'nodata' | 'neutral' | 'noedge' | 'ok', ... } (fields: see CLAUDE.md, "Фандинг")
 */
export function fundingPlan(f, { fee }) {
  const F = CONFIG.deep.funding;
  const evs = (f.events || []).filter(e => sgn(e.r) !== 0 && e.bars && e.bars.length);
  const interval = evs.length > 1 ? median(evs.slice(1).map((e, i) => e.t - evs[i].t)) : null;
  const base = { events: evs.length, interval, rNow: f.rNow, fee };
  if (evs.length < F.minN) return { ...base, status: 'nodata' };
  const s = sgn(f.rNow), a = Math.abs(f.rNow);
  if (!s) return { ...base, status: 'neutral' };

  // The most relevant past payments: same sign and similar size, falling back to wider sets.
  let group = evs.filter(e => sgn(e.r) === s && Math.abs(e.r) >= a * F.similar[0] && Math.abs(e.r) <= a * F.similar[1]), set = 'similar';
  if (group.length < F.minN) { group = evs.filter(e => sgn(e.r) === s); set = 'sign'; }
  if (group.length < F.minN) { group = evs; set = 'all'; }

  // rel = -1: against the paying crowd (short when longs pay), +1: with the crowd.
  const combos = [];
  F.preIn.forEach(mi => F.preOut.forEach(mo => [-1, 1].forEach(rel => combos.push({ kind: 'pre', mIn: -mi, mOut: mo, rel }))));
  F.postOut.forEach(mo => [-1, 1].forEach(rel => combos.push({ kind: 'post', mIn: 0, mOut: mo, rel })));
  const run = (c, list, stop = null) => list.map(e => simTrade(e, c.rel * sgn(e.r), c.mIn, c.mOut, { fee, stop })).filter(Boolean);
  combos.forEach(c => summarize(c, run(c, group)));
  const ranked = combos.filter(c => c.n >= F.minN).sort((x, y) => (y.mean - y.se) - (x.mean - x.se));
  if (!ranked.length) return { ...base, status: 'nodata' };
  const best = { ...ranked[0] };

  // Stop: P80 of the adverse excursion of winning trades (all trades if winners are few).
  const raw = run(best, group);
  const winMae = raw.filter(t => t.r > 0).map(t => t.mae);
  const stop = clamp((winMae.length >= 3 ? quant(winMae, 0.8) : quant(raw.map(t => t.mae), 0.6)) + 0.03, F.stopFloor, F.stopMax);
  const trades = run(best, group, stop);
  summarize(best, trades);
  const mfes = trades.map(t => t.mfe);

  // Condition: the smallest |rate| from which the setup was still profitable on average.
  // Null when every rate in the sample works (no real cut-off) or none does.
  let minAbsR = null;
  const sorted = trades.slice().sort((x, y) => Math.abs(x.rate) - Math.abs(y.rate));
  for (let i = 0; i + 5 <= sorted.length; i++) {
    if (mean(sorted.slice(i).map(t => t.r)) > 0) { if (i > 0) minAbsR = Math.abs(sorted[i].rate); break; }
  }

  const edge = best.mean - best.se > 0 && best.win >= F.minWin;
  return {
    ...base, status: edge ? 'ok' : 'noedge', set, groupN: group.length,
    kind: best.kind, rel: best.rel, dir: best.rel * s, mIn: best.mIn, mOut: best.mOut,
    n: best.n, win: best.win, mean: best.mean, se: best.se, med: median(trades.map(t => t.r)),
    medMfe: median(mfes), p75Mfe: quant(mfes, 0.75), fundAvg: mean(trades.map(t => t.fund)),
    stop, stopHit: trades.filter(t => t.stopped).length / trades.length,
    be: breakeven(trades, F), minAbsR, tried: combos.length
  };
}
