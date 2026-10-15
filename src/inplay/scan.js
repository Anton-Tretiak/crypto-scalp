import { CONFIG } from '../config.js';
import { api, pool, toBar } from '../lib/binance.js';
import { pctRank } from '../lib/stats.js';
import { buildUniverse, spreadBp } from '../lib/universe.js';
import { dayMetrics, scoreInPlay } from './metrics.js';

/**
 * "In play" scan: for every candidate loads 5m candles (~3.5 days) and daily candles (14 days),
 * then compares the last 24h with the coin's normal day. No DOM access.
 * Raw bars stay on each row (_b5, _days) so a new impulse size is recomputed without the network.
 */
export async function runInPlay({ market, minVol, topN, pins, T }, onProgress = () => {}) {
  const A = api(market), isF = A.isFutures, C = CONFIG.inplay;
  const [info, tick, book, prem] = await Promise.all([A.exchangeInfo(), A.ticker24h(), A.bookTicker(), A.premiumIndex()]);
  const bookMap = new Map(book.map(b => [b.symbol, b]));
  const premMap = new Map(prem.map(p => [p.symbol, p]));
  const uni = buildUniverse(tick, info, isF);

  // Pre-rank: the 24h range matters more than raw volume, since we look for coins that move.
  const cand = uni.filter(r => r.qv >= minVol);
  pctRank(cand, 'qv', '_pv'); pctRank(cand, 'range24', '_pr');
  const pre = r => C.preRank.range * r._pr + C.preRank.vol * r._pv;
  cand.sort((a, b) => pre(b) - pre(a));
  const picked = cand.slice(0, topN);
  const have = new Set(picked.map(r => r.symbol));
  uni.forEach(r => { if (pins.has(r.symbol) && !have.has(r.symbol)) picked.push(r); });

  let done = 0;
  await pool(picked, C.concurrency, async r => {
    try {
      const [k5, kd] = await Promise.all([A.klines(r.symbol, '5m', C.klineLimit), A.klines(r.symbol, '1d', C.baseDays + 1)]);
      const now = Date.now();
      r._b5 = k5.map(toBar).filter(b => b.ct < now);
      r._days = kd.map(toBar);
      r._now = now;
      r.spread = spreadBp(bookMap.get(r.symbol));
      const p = premMap.get(r.symbol);
      r.funding = p ? +p.lastFundingRate * 100 : null;
      if (isF) {
        try {
          const oi = await A.oiHist(r.symbol, '1h', 25);
          if (oi && oi.length > 1) {
            const a = +oi[0].sumOpenInterestValue, b = +oi[oi.length - 1].sumOpenInterestValue;
            r.oiChg24 = a > 0 ? (b / a - 1) * 100 : null;
          }
        } catch (e) { r.oiChg24 = null; }
      }
    } catch (e) { r._skip = true; r._err = e; }
    finally { onProgress(++done, picked.length); }
  });

  const loaded = picked.filter(r => !r._skip);
  if (!loaded.length) {
    const firstErr = picked.find(r => r._err);
    throw firstErr ? firstErr._err : new Error('Ни одна монета не прошла фильтры. Уменьшите минимальный объём в шапке.');
  }
  const rows = rescore(loaded, { market, T });
  return { rows, scannedOf: cand.length };
}

/** Recomputes metrics and score from the stored bars, e.g. after the impulse size changes. */
export function rescore(rows, { market, T }) {
  const fee = CONFIG.fees[market];
  const ok = rows.filter(r => {
    const m = dayMetrics(r._b5, r._days, { T, fee, spread: r.spread, now: r._now });
    if (m) Object.assign(r, m);
    return !!m;
  });
  scoreInPlay(ok, T);
  return ok;
}
