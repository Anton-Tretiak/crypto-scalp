import { CONFIG } from '../config.js';

const STABLES = new Set(CONFIG.stables);

/**
 * Tradable USDT pairs from a 24h ticker. Pure: no network.
 * Futures: only TRADING perpetuals from exchangeInfo. Spot: no leveraged UP/DOWN/BULL/BEAR tokens.
 */
export function buildUniverse(tick, info, isFutures) {
  const allowed = info ? new Set(info.symbols.filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING').map(s => s.symbol)) : null;
  return tick.filter(t => {
    const s = t.symbol;
    if (!/USDT$/.test(s)) return false;
    if (allowed && !allowed.has(s)) return false;
    const base = s.slice(0, -4);
    if (STABLES.has(base)) return false;
    if (!isFutures && /(UP|DOWN|BULL|BEAR)$/.test(base)) return false;
    return +t.count > 0 && +t.lastPrice > 0;
  }).map(t => {
    const high = +t.highPrice, low = +t.lowPrice;
    return { symbol: t.symbol, base: t.symbol.slice(0, -4), last: +t.lastPrice, chg24: +t.priceChangePercent,
             high, low, qv: +t.quoteVolume, range24: low > 0 ? (high / low - 1) * 100 : 0 };
  });
}

/** Bid-ask spread in basis points from a bookTicker entry, or null. */
export function spreadBp(b) {
  if (!b) return null;
  const bid = +b.bidPrice, ask = +b.askPrice;
  return bid > 0 && ask > 0 ? (ask - bid) / ((bid + ask) / 2) * 1e4 : null;
}
