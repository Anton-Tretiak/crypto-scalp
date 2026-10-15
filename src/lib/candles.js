/**
 * Aggregates 1m bars into `minutes`-long candles aligned to the clock (5m candle = :00, :05, ...).
 * Pure. The last candle may be partial (the forming one).
 */
export function resample(bars, minutes) {
  if (minutes <= 1) return bars;
  const ms = minutes * 60000, out = [];
  let cur = null;
  for (const b of bars) {
    const t = Math.floor(b.t / ms) * ms;
    if (!cur || cur.t !== t) {
      cur = { t, o: b.o, h: b.h, l: b.l, c: b.c, qv: b.qv, n: b.n, tb: b.tb };
      out.push(cur);
    } else {
      if (b.h > cur.h) cur.h = b.h;
      if (b.l < cur.l) cur.l = b.l;
      cur.c = b.c; cur.qv += b.qv; cur.n += b.n; cur.tb += b.tb;
    }
  }
  return out;
}
