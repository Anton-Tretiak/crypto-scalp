import { CONFIG } from '../config.js';
import { sum, pctRank } from '../lib/stats.js';

/** Activity metrics from 5-minute klines (Binance raw arrays). */
export function klineMetrics(kl, last) {
  const now = Date.now();
  const bars = kl.map(k => ({ h: +k[2], l: +k[3], c: +k[4], qv: +k[7], n: +k[8], ct: +k[6] }));
  if (bars.length && bars[bars.length - 1].ct > now) bars.pop();
  const L = bars.length;
  if (L < 30) return null;
  const qvs = bars.map(b => b.qv), tot = sum(qvs);
  const trs = [];
  for (let i = L - 14; i < L; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
  }
  const c13 = bars[L - 13].c, c4 = bars[L - 4].c;
  let path = 0;
  for (let j = L - 12; j < L; j++) path += Math.abs(bars[j].c - bars[j - 1].c);
  return {
    rvol1h: tot > 0 ? sum(qvs.slice(-12)) / (tot * 12 / L) : null,
    rvol15: tot > 0 ? sum(qvs.slice(-3)) / (tot * 3 / L) : null,
    atr: sum(trs) / 14 / bars[L - 1].c * 100,
    chg1h: (last / c13 - 1) * 100,
    chg15: (last / c4 - 1) * 100,
    tpm: sum(bars.slice(-12).map(b => b.n)) / 60,
    eff: path > 0 ? Math.abs(bars[L - 1].c - c13) / path : 0,
    spark: bars.slice(-36).map(b => b.c).concat([last])
  };
}

export function addTags(r) {
  const T = CONFIG.screener.tags, t = [];
  if (r.rvol15 >= T.spikeRvol15) t.push(['Volume spike', 'hot']);
  else if (r.rvol1h >= T.activeRvol1h) t.push(['Active hour', 'hot']);
  if (r.rangePos != null && r.rangePos >= 100 - T.nearEdgePct) t.push(['At 24h high', 'hot']);
  if (r.rangePos != null && r.rangePos <= T.nearEdgePct) t.push(['At 24h low', 'hot']);
  if (r.oiChg != null && r.oiChg >= T.oiPct) t.push(['OI building', '']);
  if (r.oiChg != null && r.oiChg <= -T.oiPct) t.push(['OI flushing', '']);
  if (r.funding != null && Math.abs(r.funding) >= T.fundingPct) t.push(['Funding hot', '']);
  if (r.eff >= T.trendingEff) t.push(['Trending', '']);
  else if (r.eff <= T.choppyEff) t.push(['Choppy', '']);
  if (r.spread != null && r.spread >= T.wideSpreadBp) t.push(['Wide spread', 'bad']);
  r.tags = t;
}

/** Relative 0-100 score within the scanned set. */
export function scoreRows(rows) {
  const w = CONFIG.screener.weights;
  pctRank(rows, 'rvol1h', '_s1'); pctRank(rows, 'atr', '_s2'); pctRank(rows, 'tpm', '_s3');
  pctRank(rows, 'qv', '_s4'); pctRank(rows, 'spread', '_s5', true);
  rows.forEach(r => {
    r.score = Math.round(100 * (w.rvol1h * r._s1 + w.atr * r._s2 + w.tpm * r._s3 + w.qv * r._s4 + w.spread * r._s5));
    addTags(r);
  });
}
