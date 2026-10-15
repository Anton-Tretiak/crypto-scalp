import { CONFIG } from '../../config.js';
import { median } from '../../lib/stats.js';

/**
 * Detects walls (плотности) in a depth snapshot and tracks them across snapshots:
 * persistence (seen, since) and disappearance (eaten vs pulled).
 */
export function processDepth(d, dep) {
  if (!dep.bids || !dep.bids.length || !dep.asks || !dep.asks.length) return;
  const C = CONFIG.deep.wall;
  const mid = (+dep.bids[0][0] + +dep.asks[0][0]) / 2, rows = [];
  dep.bids.forEach(x => { const p = +x[0]; if ((p / mid - 1) * 100 >= -C.rangePct) rows.push({ side: 'bid', p, n: p * +x[1] }); });
  dep.asks.forEach(x => { const p = +x[0]; if ((p / mid - 1) * 100 <= C.rangePct) rows.push({ side: 'ask', p, n: p * +x[1] }); });
  const med = median(rows.map(r => r.n)) || 1;
  const minAbs = Math.max(d.avgQvMin * C.minEatMin, C.minUsd);
  const big = rows.filter(r => r.n >= Math.max(med * C.multiplier, minAbs));
  const now = Date.now(), prev = d.walls, next = new Map();
  big.forEach(r => {
    const key = r.side + r.p, pr = prev.get(key);
    r.x = r.n / med;
    r.eat = d.avgQvMin > 0 ? r.n / d.avgQvMin : null;
    r.seen = pr ? pr.seen + 1 : 1;
    r.since = pr ? pr.since : now;
    r.peak = pr ? Math.max(pr.peak, r.n) : r.n;
    next.set(key, r);
  });
  prev.forEach((pr, key) => {
    if (next.has(key) || pr.seen < 2) return;
    const crossed = pr.side === 'bid' ? mid < pr.p : mid > pr.p;
    const near = Math.abs(pr.p / mid - 1) * 100 <= 0.1;
    d.wallEvents.unshift({ t: now, side: pr.side, p: pr.p, n: pr.peak, kind: (crossed || near) ? 'eaten' : 'pulled', life: (now - pr.since) / 1000 });
  });
  d.wallEvents = d.wallEvents.slice(0, 8);
  d.walls = next;
  const byN = (a, c) => c.n - a.n;
  d.dens = { bid: big.filter(r => r.side === 'bid').sort(byN).slice(0, 6), ask: big.filter(r => r.side === 'ask').sort(byN).slice(0, 6) };
  d.depthAt = now;
}
