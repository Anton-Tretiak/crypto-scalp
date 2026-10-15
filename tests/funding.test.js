import { describe, it, expect } from 'vitest';
import { rng } from './fixtures.js';
import { simTrade, fundingPlan } from '../src/deep/analysis/funding.js';

const H8 = 8 * 3.6e6, START = Date.UTC(2026, 0, 1);

/** 1m bars from -60 to +60 minutes around a payment; shape(m) = price offset in % at minute m. */
function event(i, r, shape, noise = 0.0004) {
  const R = rng(i + 3), t = START + i * H8, bars = [];
  let prev = 100 * (1 + shape(-60) / 100);
  for (let m = -60; m <= 60; m++) {
    const o = prev, c = 100 * (1 + shape(m + 1) / 100) * (1 + (R() - 0.5) * noise);
    bars.push({ t: t + m * 60000, o, h: Math.max(o, c) * 1.0002, l: Math.min(o, c) * 0.9998, c, qv: 1e5 });
    prev = c;
  }
  return { t, r, bars };
}
const flat = () => 0;
// Longs pay: price slides 0.6% in the 15 minutes before the payment, then stays there.
const preDrop = m => m <= -15 ? 0 : m >= 0 ? -0.6 : -0.6 * (m + 15) / 15;

describe('funding: single trade', () => {
  it('a short held through a positive payment receives the funding', () => {
    const t = simTrade(event(0, 0.05, flat, 0), -1, -5, 1, { fee: 0.1 });
    expect(t.fund).toBeCloseTo(0.05, 9);
    expect(t.r).toBeCloseTo(t.gross + 0.05 - 0.1, 9);
  });
  it('a trade entered after the payment does not touch the funding', () => {
    expect(simTrade(event(0, 0.05, flat, 0), -1, 0, 15, { fee: 0.1 }).fund).toBe(0);
  });
  it('the stop exits at the stop price and reports it as MAE', () => {
    const t = simTrade(event(0, 0.05, preDrop, 0), 1, -15, 5, { fee: 0.1, stop: 0.2 });
    expect(t.stopped).toBe(true);
    expect(t.gross).toBeCloseTo(-0.2, 9);
  });
});

describe('funding: plan', () => {
  it('finds the pre-payment short when longs pay and price slides into the payment', () => {
    const events = Array.from({ length: 20 }, (_, i) => event(i, 0.04 + (i % 4) * 0.01, preDrop));
    const p = fundingPlan({ events, rNow: 0.05, nextT: START + 21 * H8 }, { fee: 0.1 });
    expect(p.status).toBe('ok');
    expect(p.dir).toBe(-1);
    expect(p.rel).toBe(-1);
    expect(p.kind).toBe('pre');
    expect(p.mIn).toBeLessThanOrEqual(-15);
    expect(p.mean).toBeGreaterThan(0);
    expect(p.medMfe).toBeGreaterThan(0.4);
    expect(p.stop).toBeGreaterThanOrEqual(0.12);
    expect(p.interval).toBe(H8);
  });
  it('reports no edge on noise with a tiny rate', () => {
    const events = Array.from({ length: 20 }, (_, i) => event(i, 0.01, flat, 0.003));
    expect(fundingPlan({ events, rNow: 0.01, nextT: 0 }, { fee: 0.1 }).status).toBe('noedge');
  });
  it('needs enough history and a non-zero rate', () => {
    const few = Array.from({ length: 3 }, (_, i) => event(i, 0.05, flat));
    expect(fundingPlan({ events: few, rNow: 0.05, nextT: 0 }, { fee: 0.1 }).status).toBe('nodata');
    const many = Array.from({ length: 12 }, (_, i) => event(i, 0.05, flat));
    expect(fundingPlan({ events: many, rNow: 0, nextT: 0 }, { fee: 0.1 }).status).toBe('neutral');
  });
});
