import { describe, it, expect } from 'vitest';
import { flatBars, plantMove } from './fixtures.js';
import { findImpulses, impulseStats } from '../src/deep/analysis/impulses.js';
import { findLevels, breakStats } from '../src/deep/analysis/levels.js';
import { computeStats, ideas, stopAdvice } from '../src/deep/analysis/index.js';
import { pctRank, median, quant } from '../src/lib/stats.js';
import { fmtVol, fmtPrice } from '../src/lib/format.js';
import { pl, W } from '../src/lib/ru.js';

describe('stats helpers', () => {
  it('median and quantile', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quant([1, 2, 3, 4, 5], 0.8)).toBe(4);
  });
  it('pctRank gives 0..1 and handles nulls', () => {
    const rows = [{ v: 1 }, { v: 5 }, { v: null }, { v: 3 }];
    pctRank(rows, 'v', 'r');
    expect(rows.map(r => r.r)).toEqual([0, 1, 0.5, 0.5]);
  });
});

describe('formatting', () => {
  it('fmtVol', () => {
    expect(fmtVol(1.5e9)).toBe('$1.50B');
    expect(fmtVol(25e6)).toBe('$25.0M');
    expect(fmtVol(2500)).toBe('$2.5K');
    expect(fmtVol(12)).toBe('$12');
  });
  it('fmtPrice adapts decimals', () => {
    expect(fmtPrice(65000)).toBe('65,000');
    expect(fmtPrice(0.00001234)).toBe('0.00001234');
  });
  it('russian plurals', () => {
    expect(pl(1, W.deal)).toBe('сделка');
    expect(pl(3, W.deal)).toBe('сделки');
    expect(pl(11, W.deal)).toBe('сделок');
    expect(pl(21, W.deal)).toBe('сделка');
  });
});

describe('impulses', () => {
  it('detects a planted 2% move within 3 minutes', () => {
    const bars = plantMove(flatBars(400), 200, 3, 2);
    const imp = findImpulses(bars, 1, 5);
    expect(imp.length).toBe(1);
    expect(imp[0].dir).toBe(1);
    expect(imp[0].size).toBeGreaterThan(1.9);
    expect(imp[0].dur).toBeLessThanOrEqual(8); // start may precede the move by up to W bars, extension adds noise highs
    const st = impulseStats(bars, imp);
    expect(st.n).toBe(1);
    expect(st.hist.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('finds nothing in a quiet market', () => {
    expect(findImpulses(flatBars(400), 1, 5)).toHaveLength(0);
  });
});

describe('levels and breaks', () => {
  it('always includes 24h high and low', () => {
    const lv = findLevels(flatBars(600), 0.05);
    expect(lv.some(l => l.kind === 'хай 24ч')).toBe(true);
    expect(lv.some(l => l.kind === 'лой 24ч')).toBe(true);
  });
  it('break stats are internally consistent', () => {
    const bars = plantMove(plantMove(flatBars(1200), 400, 3, 1.5), 800, 3, -1.5);
    const br = breakStats(bars, 1);
    ['up', 'dn'].forEach(s => {
      expect(br[s].ok + br[s].fail).toBeLessThanOrEqual(br[s].n);
      if (br[s].n) expect(br[s].rate).toBeGreaterThanOrEqual(0);
    });
    expect(br.sweep.up.every(x => x >= 0)).toBe(true);
  });
});

describe('full coin analysis', () => {
  it('computeStats produces grades, stops and ideas without NaN', () => {
    let bars = flatBars(3000);
    [500, 900, 1300, 1700, 2100, 2500].forEach((at, i) => { bars = plantMove(bars, at, 3, i % 2 ? -1.5 : 1.5); });
    const d = { sym: 'TESTUSDT', base: 'TEST', bars, price: bars[bars.length - 1].c, row: null,
                walls: new Map(), wallEvents: [], dens: { bid: [], ask: [] } };
    computeStats(d, { T: 1, W: 5, market: 'futures' });
    expect(Number.isFinite(d.atr1m)).toBe(true);
    expect([-2, -1, 0, 1, 2]).toContain(d.grades[1].lvl);
    expect([-2, -1, 0, 1, 2]).toContain(d.grades[-1].lvl);
    expect(d.bt.stopPct).toBeGreaterThan(0);
    const advice = stopAdvice(d);
    expect(advice.length).toBeGreaterThan(0);
    advice.forEach(row => expect(row.join(' ')).not.toMatch(/NaN|undefined/));
    const list = ideas(d, { T: 1 });
    list.forEach(x => {
      expect(x.rr).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(Math.sign(x.target - x.entry)).toBe(x.dir);
      expect(Math.sign(x.entry - x.stop)).toBe(x.dir);
    });
  });
});

describe('candles', () => {
  it('resamples 1m bars into clock-aligned candles', async () => {
    const { resample } = await import('../src/lib/candles.js');
    const bars = flatBars(12, 100, Date.UTC(2026, 0, 1, 0, 3));   // starts at 00:03
    const r = resample(bars, 5);
    expect(r.map(x => new Date(x.t).getUTCMinutes())).toEqual([0, 5, 10]);
    expect(r[0].o).toBe(bars[0].o);
    expect(r[1].c).toBe(bars[6].c);
    expect(r[1].h).toBe(Math.max(...bars.slice(2, 7).map(b => b.h)));
    expect(r[1].qv).toBe(5e5);
    expect(resample(bars, 1)).toBe(bars);
  });
});
