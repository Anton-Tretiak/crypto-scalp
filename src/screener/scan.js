import { CONFIG } from '../config.js';
import { api, pool } from '../lib/binance.js';
import { pctRank } from '../lib/stats.js';
import { buildUniverse, spreadBp } from '../lib/universe.js';
import { klineMetrics, scoreRows } from './metrics.js';

/**
 * Full market scan. Pure data function: no DOM access.
 * @returns {Promise<{rows: object[], scannedOf: number}>}
 */
export async function runScan({ market, minVol, topN, pins }, onProgress = () => {}) {
  const A = api(market), isF = A.isFutures, C = CONFIG.screener;
  const [info, tick, book, prem] = await Promise.all([A.exchangeInfo(), A.ticker24h(), A.bookTicker(), A.premiumIndex()]);

  const bookMap = new Map(book.map(b => [b.symbol, b]));
  const premMap = new Map(prem.map(p => [p.symbol, p]));

  const uni = buildUniverse(tick, info, isF);

  // Pre-rank by volume and 24h range together, then deep-scan the top group.
  const cand = uni.filter(r => r.qv >= minVol);
  pctRank(cand, 'qv', '_pv'); pctRank(cand, 'range24', '_pr');
  cand.sort((a, b) => (b._pv + b._pr) - (a._pv + a._pr));
  const picked = cand.slice(0, topN);
  const have = new Set(picked.map(r => r.symbol));
  uni.forEach(r => { if (pins.has(r.symbol) && !have.has(r.symbol)) picked.push(r); });

  let done = 0;
  await pool(picked, C.concurrency, async r => {
    try {
      const kl = await A.klines(r.symbol, C.klineInterval, C.klineLimit);
      const km = klineMetrics(kl, r.last);
      if (!km) { r._skip = true; return; }
      Object.assign(r, km);
      if (isF) {
        try {
          const oi = await A.oiHist(r.symbol);
          if (oi && oi.length > 1) {
            const a = +oi[0].sumOpenInterestValue, b = +oi[oi.length - 1].sumOpenInterestValue;
            r.oi = b; r.oiChg = a > 0 ? (b / a - 1) * 100 : null;
          }
        } catch (e) { r.oiChg = null; }
      }
    } catch (e) { r._skip = true; r._err = e; }
    finally { onProgress(++done, picked.length); }
  });

  const ok = picked.filter(r => !r._skip);
  if (!ok.length) {
    const firstErr = picked.find(r => r._err);
    throw firstErr ? firstErr._err : new Error('No coins passed the filters. Try a lower minimum volume.');
  }
  ok.forEach(r => {
    r.spread = spreadBp(bookMap.get(r.symbol));
    const p = premMap.get(r.symbol);
    r.funding = p ? +p.lastFundingRate * 100 : null;
    r.rangePos = r.high > r.low ? (r.last - r.low) / (r.high - r.low) * 100 : null;
  });
  scoreRows(ok);
  return { rows: ok, scannedOf: cand.length };
}
