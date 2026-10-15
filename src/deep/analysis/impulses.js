import { mean, median, quant } from '../../lib/stats.js';

/**
 * Finds moves of at least T% within W one-minute candles, extended while price keeps
 * making new extremes. Classifies the next 15 minutes as fade / cont (second leg) / hold.
 */
export function findImpulses(b, T, W) {
  const out = [], L = b.length;
  let i = 1;
  while (i < L - 1) {
    const o = b[i].o;
    let hi = -Infinity, lo = Infinity, hiI = i, loI = i, f = null;
    for (let j = i; j < Math.min(L, i + W); j++) {
      if (b[j].h > hi) { hi = b[j].h; hiI = j; }
      if (b[j].l < lo) { lo = b[j].l; loI = j; }
      const up = (hi / o - 1) * 100, dn = (1 - lo / o) * 100;
      if (up >= T || dn >= T) { f = up >= dn ? { dir: 1, e: hiI, ext: hi } : { dir: -1, e: loI, ext: lo }; break; }
    }
    if (!f) { i++; continue; }
    let e = f.e, ext = f.ext;
    for (let k = e + 1; k < L && k <= e + W; k++) {
      if (f.dir > 0 ? b[k].h > ext : b[k].l < ext) { ext = f.dir > 0 ? b[k].h : b[k].l; e = k; }
    }
    const size = f.dir > 0 ? (ext / o - 1) * 100 : (1 - ext / o) * 100;
    const mv = Math.abs(ext - o) || 1e-12, endK = Math.min(L - 1, e + 15);
    let outcome = 'hold', retr = 0;
    for (let m = e + 1; m <= endK; m++) {
      const back = f.dir > 0 ? (ext - b[m].l) / mv : (b[m].h - ext) / mv;
      const fwd = f.dir > 0 ? (b[m].h - ext) / mv : (ext - b[m].l) / mv;
      if (back > retr) retr = back;
      if (outcome === 'hold') { if (back >= 0.5) outcome = 'fade'; else if (fwd >= 0.3) outcome = 'cont'; }
    }
    const av = mean(b.slice(Math.max(0, i - 30), i).map(x => x.qv));
    out.push({ t: b[i].t, s: i, e, o, ext, dir: f.dir, size, dur: e - i + 1, outcome, retr: Math.min(retr, 1.5),
               vratio: av > 0 ? b[i].qv / av : null, complete: (L - 1 - e) >= 15 });
    i = e + 1;
  }
  return out;
}

export function impulseStats(b, imp) {
  const L = b.length;
  const comp = imp.filter(x => x.complete);
  const hours = Math.max(1, (b[L - 1].t - b[0].t) / 3.6e6);
  const hist = new Array(24).fill(0);
  imp.forEach(x => { hist[new Date(x.t).getHours()]++; });
  const sizes = imp.map(x => x.size);
  const share = (arr, fn) => arr.length ? arr.filter(fn).length / arr.length : null;
  return {
    hours, n: imp.length, perHour: imp.length / hours,
    medSize: median(sizes), p75: quant(sizes, 0.75), maxSize: sizes.length ? Math.max(...sizes) : null,
    medDur: median(imp.map(x => x.dur)),
    upShare: share(imp, x => x.dir > 0),
    fadeRate: share(comp, x => x.outcome === 'fade'),
    contRate: share(comp, x => x.outcome === 'cont'),
    medGive: median(comp.map(x => x.retr)),
    volLed: share(imp, x => x.vratio != null && x.vratio >= 3),
    lastT: imp.length ? imp[imp.length - 1].t : null,
    hist, impulses: imp
  };
}
