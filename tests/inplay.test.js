import { describe, it, expect } from 'vitest';
import { flatBars, plantMove } from './fixtures.js';
import { dayMetrics, scoreInPlay } from '../src/inplay/metrics.js';
import { buildUniverse } from '../src/lib/universe.js';

const M5 = 300000, DAY = 864e5, START = Date.UTC(2026, 0, 1);

/** 5-minute bars: the 1m fixture re-timed to 5m spacing. */
function bars5(n) {
  return flatBars(n, 100, START).map((b, i) => ({ ...b, t: START + i * M5, ct: START + (i + 1) * M5 - 1 }));
}
/** Daily bars ending right before `end`, each with a 4% range and the given turnover. */
function daily(n, end, qv) {
  return Array.from({ length: n }, (_, i) => {
    const t = end - (n - i) * DAY;
    return { t, ct: t + DAY - 1, o: 100, h: 102, l: 98.08, c: 100, qv };
  });
}
const opts = now => ({ T: 1, fee: 0.1, spread: 2, now });

describe('in play: day metrics', () => {
  it('separates last-24h impulses from the baseline', () => {
    let b = bars5(1000);
    [100, 400, 760, 850, 940].forEach((at, i) => { b = plantMove(b, at, 1, i % 2 ? -1.5 : 1.5); });
    const now = b[b.length - 1].ct + 1;
    const m = dayMetrics(b, daily(14, now, 1e7), opts(now));
    expect(m.moves24).toBe(3);                         // bars 760, 850, 940 are inside the last 288
    expect(m.movesBase).toBeCloseTo(2 / (712 / 288), 5);
    expect(m.medImp).toBeGreaterThan(1.4);
    expect(m.newListing).toBe(false);
    expect(m.rvolDay).toBeCloseTo(m.vol24 / 1e7, 9);
    expect(m.adr).toBeCloseTo(4, 1);
    expect(m.costX).toBeCloseTo(m.rng5 / 0.12, 9);
    expect(m.lastImpMin).toBeGreaterThan(0);
  });

  it('treats a coin without daily history as a new listing', () => {
    const b = bars5(400), now = b[b.length - 1].ct + 1;
    const m = dayMetrics(b, daily(3, now, 1e7), opts(now));
    expect(m.newListing).toBe(true);
    expect(m.rvolDay).toBeNull();
    expect(m.toHi7).toBeNull();
    expect(m.movesBase).toBeNull();                    // less than one prior day of 5m candles
  });

  it('ignores the still-open daily candle', () => {
    const b = bars5(400), now = b[b.length - 1].ct + 1;
    const days = daily(14, now, 1e7).concat([{ t: now - 1000, ct: now + DAY, o: 100, h: 200, l: 50, c: 100, qv: 1e12 }]);
    expect(dayMetrics(b, days, opts(now)).adr).toBeCloseTo(4, 1);
  });

  it('needs at least ~25h of 5m candles', () => {
    const b = bars5(200);
    expect(dayMetrics(b, [], opts(b[199].ct + 1))).toBeNull();
  });
});

describe('in play: scoring', () => {
  it('ranks a moving, high-volume coin above a quiet one and explains why', () => {
    let hot = bars5(1000);
    [760, 800, 850, 900, 940, 980].forEach((at, i) => { hot = plantMove(hot, at, 1, i % 2 ? -2 : 2); });
    const quiet = bars5(1000), now = hot[hot.length - 1].ct + 1;
    const rows = [
      { symbol: 'HOTUSDT', spread: 2, ...dayMetrics(hot, daily(14, now, 5e6), opts(now)) },
      { symbol: 'QUIETUSDT', spread: 2, ...dayMetrics(quiet, daily(14, now, 5e7), opts(now)) }
    ];
    scoreInPlay(rows, 1);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
    rows.forEach(r => {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.why.join(' ')).not.toMatch(/NaN|undefined|null/);
    });
    expect(rows[0].why[0]).toMatch(/^6 импульсов от 1%/);
    expect(rows[1].tags.map(t => t[0])).toContain('Мало хода');
  });
});

describe('universe', () => {
  it('keeps USDT pairs, drops stables and leveraged spot tokens', () => {
    const t = (symbol, qv = 1e8) => ({ symbol, lastPrice: '1', count: 10, highPrice: '1.1', lowPrice: '1', quoteVolume: String(qv), priceChangePercent: '0' });
    const tick = [t('SOLUSDT'), t('USDCUSDT'), t('BTCUPUSDT'), t('ETHBTC')];
    expect(buildUniverse(tick, null, false).map(r => r.symbol)).toEqual(['SOLUSDT']);
    const info = { symbols: [{ symbol: 'SOLUSDT', contractType: 'PERPETUAL', quoteAsset: 'USDT', status: 'TRADING' }] };
    expect(buildUniverse([t('SOLUSDT'), t('XRPUSDT')], info, true).map(r => r.symbol)).toEqual(['SOLUSDT']);
  });
});
