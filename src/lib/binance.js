/**
 * Data-access layer. EVERY network call to Binance goes through this file.
 * To switch to your own backend later, change only this module.
 */
const ENDPOINTS = {
  futures: {
    rest: 'https://fapi.binance.com',
    ws: 'wss://fstream.binance.com/stream?streams=',
    exchangeInfo: '/fapi/v1/exchangeInfo',
    ticker24h: '/fapi/v1/ticker/24hr',
    bookTicker: '/fapi/v1/ticker/bookTicker',
    premiumIndex: '/fapi/v1/premiumIndex',
    fundingRate: '/fapi/v1/fundingRate',
    klines: '/fapi/v1/klines',
    depth: '/fapi/v1/depth',
    aggTrades: '/fapi/v1/aggTrades',
    oiHist: '/futures/data/openInterestHist'
  },
  spot: {
    rest: 'https://api.binance.com',
    ws: 'wss://stream.binance.com:9443/stream?streams=',
    exchangeInfo: null,
    ticker24h: '/api/v3/ticker/24hr',
    bookTicker: '/api/v3/ticker/bookTicker',
    premiumIndex: null,
    fundingRate: null,
    klines: '/api/v3/klines',
    depth: '/api/v3/depth',
    aggTrades: '/api/v3/aggTrades',
    oiHist: null
  }
};

export function getJSON(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const path = url.split('?')[0];
  return fetch(url, { signal: ctrl.signal }).then(res => {
    clearTimeout(t);
    if (!res.ok) {
      let msg = `HTTP ${res.status} from ${path}`;
      if (res.status === 451 || res.status === 403) msg += ' (Binance blocks this API from your location or network)';
      if (res.status === 429 || res.status === 418) msg += ' (rate limit hit, wait a few minutes and scan fewer coins)';
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return res.json();
  }, err => {
    clearTimeout(t);
    throw new Error(err.name === 'AbortError' ? `Request timed out: ${path}` : `Network error reaching ${path} (check your connection or VPN)`);
  });
}

/** Run fn over items with at most `limit` in flight. Errors are swallowed per item. */
export function pool(items, limit, fn) {
  let i = 0;
  const next = () => {
    if (i >= items.length) return Promise.resolve();
    const item = items[i++];
    return Promise.resolve().then(() => fn(item)).then(next, next);
  };
  const runners = [];
  for (let k = 0; k < Math.min(limit, items.length); k++) runners.push(next());
  return Promise.all(runners);
}

export function api(market) {
  const e = ENDPOINTS[market];
  const get = (path, params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return getJSON(e.rest + path + (q ? '?' + q : ''));
  };
  return {
    market,
    isFutures: market === 'futures',
    exchangeInfo: () => e.exchangeInfo ? get(e.exchangeInfo) : Promise.resolve(null),
    ticker24h: () => get(e.ticker24h),
    bookTicker: () => get(e.bookTicker),
    /** Without a symbol: array for all pairs. With a symbol: one object (null on spot). */
    premiumIndex: symbol => e.premiumIndex ? get(e.premiumIndex, { symbol }) : Promise.resolve(symbol ? null : []),
    /** Funding history, oldest first. Separate limit: 500 requests per 5 min per IP. */
    fundingRate: (symbol, limit = 30) => e.fundingRate ? get(e.fundingRate, { symbol, limit }) : Promise.resolve([]),
    klines: (symbol, interval, limit, endTime) => get(e.klines, { symbol, interval, limit, endTime }),
    depth: (symbol, limit = 1000) => get(e.depth, { symbol, limit }),
    aggTrades: (symbol, limit = 1000) => get(e.aggTrades, { symbol, limit }),
    oiHist: (symbol, period = '5m', limit = 13) => e.oiHist ? get(e.oiHist, { symbol, period, limit }) : Promise.resolve([]),
    wsUrl: streams => e.ws + streams.join('/')
  };
}

export function tradeUrl(market, symbol) {
  return market === 'futures'
    ? 'https://www.binance.com/en/futures/' + symbol
    : 'https://www.binance.com/en/trade/' + symbol.replace(/USDT$/, '') + '_USDT?type=spot';
}

/** Map a raw kline array to a compact bar object. */
export function toBar(k) {
  return { t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], qv: +k[7], n: +k[8], tb: +k[10], ct: +k[6] };
}
