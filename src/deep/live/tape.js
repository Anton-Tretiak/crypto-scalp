import { mean, median, quant } from '../../lib/stats.js';

export function newTape() { return { buf: [], big: [], bigThr: 20000, algo: null, live: null }; }

/** Adds one aggregated trade. `seed` = from REST history (no price/big-print update). */
export function pushTrade(d, t, seed = false) {
  const p = +t.p, n = p * +t.q, buy = !t.m;
  d.tape.buf.push({ t: +t.T, p, q: String(t.q), n, buy });
  if (!seed) {
    if (n >= d.tape.bigThr) { d.tape.big.unshift({ t: +t.T, p, n, buy }); if (d.tape.big.length > 12) d.tape.big.pop(); }
    d.price = p; d.lastTradeAt = Date.now();
  }
}

/** Large-print threshold = 99th percentile of recent trade notional, at least $10k. */
export function updateBigThr(d) {
  const ns = d.tape.buf.map(x => x.n);
  if (ns.length > 50) d.tape.bigThr = Math.max(10000, quant(ns, 0.99));
}

/** Rolling 60 s tape metrics; keeps the last 5 minutes in the buffer. */
export function tapeLive(d, T) {
  const now = Date.now(), buf = d.tape.buf, cut = now - 300000;
  let i = 0;
  while (i < buf.length && buf[i].t < cut) i++;
  if (i) buf.splice(0, i);
  let b60 = 0, s60 = 0, n60 = 0, n10 = 0, pFirst = null;
  for (let j = buf.length - 1; j >= 0; j--) {
    const x = buf[j], age = now - x.t;
    if (age > 60000) break;
    n60++; if (age <= 10000) n10++;
    if (x.buy) b60 += x.n; else s60 += x.n;
    pFirst = x.p;
  }
  const chg = pFirst && d.price ? (d.price / pFirst - 1) * 100 : 0;
  d.tape.live = { tps10: n10 / 10, tps60: n60 / 60, buy: b60, sell: s60, chg60: chg, forming: Math.abs(chg) >= T * 0.5 };
}

/** Finds an order size that repeats unusually often (execution-algo fingerprint). */
export function detectAlgo(d) {
  const buf = d.tape.buf;
  if (buf.length < 60) { d.tape.algo = null; return; }
  const med = median(buf.map(x => x.n)), counts = new Map();
  buf.forEach(x => {
    if (x.n < med) return;
    let c = counts.get(x.q);
    if (!c) { c = { q: x.q, c: 0, buy: 0, n: 0, ts: [] }; counts.set(x.q, c); }
    c.c++; if (x.buy) c.buy++; c.n += x.n; c.ts.push(x.t);
  });
  let best = null;
  counts.forEach(c => { if (c.c >= 12 && c.c / buf.length >= 0.02 && (!best || c.c > best.c)) best = c; });
  if (!best) { d.tape.algo = null; return; }
  const gaps = [];
  for (let k = 1; k < best.ts.length; k++) gaps.push((best.ts[k] - best.ts[k - 1]) / 1000);
  const mg = mean(gaps), sd = Math.sqrt(mean(gaps.map(g => (g - mg) * (g - mg))));
  d.tape.algo = { q: best.q, count: best.c, buyShare: best.buy / best.c, each: best.n / best.c,
                  regular: gaps.length >= 8 && mg > 0.3 && sd / mg < 0.6, every: mg };
}
