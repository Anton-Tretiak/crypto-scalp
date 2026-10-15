import { mean } from '../../lib/stats.js';
import { findImpulses, impulseStats } from './impulses.js';
import { findLevels, breakStats } from './levels.js';
import { backtest } from './backtest.js';
import { grades } from './grades.js';

/**
 * Recomputes every historical statistic for a coin. Uses closed candles only.
 * Order matters: impulses → levels → breaks/sweeps → backtest → grades.
 */
export function computeStats(d, { T, W, market }) {
  const b = d.bars.slice(0, -1), L = b.length;
  const trs = [];
  for (let i = Math.max(1, L - 60); i < L; i++) {
    const p = b[i - 1].c;
    trs.push(Math.max(b[i].h - b[i].l, Math.abs(b[i].h - p), Math.abs(b[i].l - p)) / b[i].c * 100);
  }
  d.atr1m = mean(trs);
  d.avgQvMin = mean(b.slice(-60).map(x => x.qv));
  d.stats = impulseStats(b, findImpulses(b, T, W));
  d.levels = findLevels(b, d.atr1m);
  d.brk = breakStats(b, T);
  d.bt = backtest(b, d, { T, market });
  d.grades = grades(d, b);
  d.style = null;
}

export { playbook } from './playbook.js';
export { ideas } from './ideas.js';
export { stopAdvice, stopBuffers } from './stops.js';
export { GRADE } from './grades.js';
