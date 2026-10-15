import { api } from '../../lib/binance.js';

/**
 * One combined WebSocket (aggTrade + kline_1m) with exponential-backoff reconnect.
 * Returns { close() }. Handlers: onTrade(msg), onKline(k), onState('live'|'reconnecting'|'error').
 */
export function openStream(market, symbol, { onTrade, onKline, onState }) {
  const s = symbol.toLowerCase();
  const url = api(market).wsUrl([s + '@aggTrade', s + '@kline_1m']);
  let ws = null, closed = false, retry = 0, timer = null;
  const connect = () => {
    try { ws = new WebSocket(url); } catch (e) { onState('error'); return; }
    ws.onopen = () => { retry = 0; onState('live'); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      const x = m.data; if (!x) return;
      if (x.e === 'aggTrade') onTrade(x); else if (x.e === 'kline') onKline(x.k);
    };
    ws.onclose = () => {
      if (closed) return;
      onState('reconnecting');
      timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  };
  connect();
  return { close() { closed = true; clearTimeout(timer); try { ws && ws.close(); } catch (e) { /* ignore */ } } };
}
