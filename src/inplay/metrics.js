import { CONFIG } from '../config.js';
import { sum, median, pctRank } from '../lib/stats.js';
import { fmtVol } from '../lib/format.js';
import { pl, W } from '../lib/ru.js';
import { findImpulses } from '../deep/analysis/impulses.js';

const DAY_BARS = 288; // 5m candles in 24h

/**
 * "In play" metrics of one coin: the last 24h compared with the coin's normal day. Pure.
 * @param b5   closed 5m bars ({t,o,h,l,c,qv}), oldest first, ~3.5 days
 * @param days 1d bars ({t,h,l,qv,ct}); the still-open day is ignored
 * @param opts { T: impulse %, fee: round trip %, spread: bp or null, now: ms }
 * @returns metrics object, or null if there is less than ~25h of 5m history
 */
export function dayMetrics(b5, days, { T, fee, spread = null, now }) {
  const C = CONFIG.inplay, L = b5.length;
  if (L < DAY_BARS + 12) return null;
  const cut = L - DAY_BARS, d24 = b5.slice(cut), last = b5[L - 1].c;

  // Impulses: last 24h vs the per-day rate before that.
  const imp = findImpulses(b5, T, C.impulseBars);
  const imp24 = imp.filter(x => x.s >= cut);
  const baseDays = cut / DAY_BARS;
  const movesBase = baseDays >= 1 ? imp.filter(x => x.s < cut).length / baseDays : null;
  const sizes = imp24.map(x => x.size);
  const lastImp = imp.length ? imp[imp.length - 1] : null;

  // Hours of the day (local time) when this coin usually moves.
  const hist = new Array(24).fill(0);
  imp.forEach(x => { hist[new Date(x.t).getHours()]++; });
  const peakHours = imp.length >= 6
    ? hist.map((n, h) => ({ n, h })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.h).sort((a, b) => a - b)
    : [];

  // Typical 5-minute candle (true range) over 24h and how many round-trip costs it holds.
  const tr = [];
  for (let i = cut; i < L; i++) {
    const b = b5[i], p = b5[i - 1].c;
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p)) / b.c * 100);
  }
  const rng5 = median(tr);
  const cost = fee + (spread != null ? spread / 100 : 0);
  const costX = cost > 0 ? rng5 / cost : null;

  // Volume: 24h total, hourly profile, last hour vs average hour.
  const vol24 = sum(d24.map(x => x.qv));
  const hourly = [];
  for (let h = 0; h < 24; h++) hourly.push(sum(d24.slice(h * 12, h * 12 + 12).map(x => x.qv)));
  const rvol1h = vol24 > 0 ? hourly[23] / (vol24 / 24) : null;
  const peakShare = vol24 > 0 ? Math.max(...hourly) / vol24 : null;
  const faded = peakShare != null && rvol1h != null && peakShare >= C.spikeShare && rvol1h < C.deadRvol;

  let hi = -Infinity, lo = Infinity;
  d24.forEach(x => { if (x.h > hi) hi = x.h; if (x.l < lo) lo = x.l; });
  const range24 = (hi / lo - 1) * 100;

  // Normal day from closed daily candles.
  const closed = days.filter(x => x.ct < now).slice(-C.baseDays);
  const newListing = closed.length < C.minBaseDays;
  const adr = newListing ? null : median(closed.map(x => (x.h / x.l - 1) * 100));
  const dayVol = newListing ? null : median(closed.map(x => x.qv));
  const wk = closed.slice(-7);
  const hi7 = Math.max(hi, ...wk.map(x => x.h)), lo7 = Math.min(lo, ...wk.map(x => x.l));

  return {
    moves24: imp24.length, movesBase,
    medImp: median(sizes), maxImp: sizes.length ? Math.max(...sizes) : null,
    lastImpMin: lastImp ? Math.max(0, (now - b5[lastImp.e].t) / 60000) : null,
    peakHours,
    rng5, costX,
    vol24, qvMin: vol24 / 1440, rvol1h, peakShare, faded,
    range24, rangePos: hi > lo ? (last - lo) / (hi - lo) * 100 : null,
    chg24: (last / d24[0].o - 1) * 100,
    newListing, adr, dayVol,
    rvolDay: dayVol > 0 ? vol24 / dayVol : null,
    rangeX: adr > 0 ? range24 / adr : null,
    // Distance from price to the 7-day extremes (24h included); "fresh" = set within the last 24h.
    hi7: newListing ? null : hi7, lo7: newListing ? null : lo7,
    toHi7: newListing ? null : (hi7 / last - 1) * 100, toLo7: newListing ? null : (1 - lo7 / last) * 100,
    hi7Fresh: !newListing && hi >= hi7, lo7Fresh: !newListing && lo <= lo7
  };
}

/** Relative 0-100 score within the scanned set, then penalties, tags and reasons. */
export function scoreInPlay(rows, T) {
  const C = CONFIG.inplay, w = C.weights, P = C.penalty;
  pctRank(rows, 'moves24', '_m'); pctRank(rows, 'rvolDay', '_v'); pctRank(rows, 'rangeX', '_r');
  pctRank(rows, 'costX', '_c'); pctRank(rows, 'rvol1h', '_n'); pctRank(rows, 'qvMin', '_l');
  rows.forEach(r => {
    let s = w.moves * r._m + w.rvolDay * r._v + w.rangeX * r._r + w.costX * r._c + w.now * r._n + w.liq * r._l;
    if (r.costX != null && r.costX < P.minCostX) s *= P.lowCost;
    if (r.spread != null && r.spread >= P.wideSpreadBp) s *= P.wideSpread;
    if (r.faded) s *= P.faded;
    r.score = Math.round(100 * s);
    r.tags = inPlayTags(r);
    r.why = inPlayReasons(r, T);
  });
}

const x1 = v => v.toFixed(1);
const near = (v, lim) => v != null && v <= lim;

export function inPlayTags(r) {
  const C = CONFIG.inplay, G = C.tags, t = [];
  if (r.newListing) t.push(['Новый листинг', 'hot']);
  if (r.rvolDay != null && r.rvolDay >= G.rvolDay) t.push([`Объём ×${x1(r.rvolDay)}`, 'hot']);
  if (r.rangeX != null && r.rangeX >= G.rangeX) t.push(['Широкий день', 'hot']);
  if (r.rvol1h != null && r.rvol1h >= G.rvol1h) t.push(['Разгоняется сейчас', 'hot']);
  if (near(r.toHi7, C.nearPct)) t.push(['У хая 7 дней', 'hot']);
  if (near(r.toLo7, C.nearPct)) t.push(['У лоя 7 дней', 'hot']);
  if (r.faded) t.push(['Всплеск выдохся', '']);
  if (r.funding != null && Math.abs(r.funding) >= G.funding) t.push(['Фандинг перегрет', '']);
  if (r.oiChg24 != null && r.oiChg24 >= G.oiPct) t.push(['OI растёт', '']);
  if (r.oiChg24 != null && r.oiChg24 <= -G.oiPct) t.push(['OI сбрасывается', '']);
  if (r.costX != null && r.costX < C.penalty.minCostX) t.push(['Мало хода', 'bad']);
  if (r.spread != null && r.spread >= C.penalty.wideSpreadBp) t.push(['Широкий спред', 'bad']);
  return t;
}

/** Short Russian sentences explaining why the coin is (or is not) in play, most important first. */
export function inPlayReasons(r, T) {
  const C = CONFIG.inplay, out = [];
  const n = r.moves24;
  if (n > 0) {
    let s = `${n} ${pl(n, W.imp)} от ${T}% за сутки`;
    if (r.medImp != null) s += `, медиана ${r.medImp.toFixed(1)}%`;
    if (r.movesBase != null) s += `, обычно ${r.movesBase < 1 ? 'меньше одного' : Math.round(r.movesBase)} в сутки`;
    out.push(s);
  } else out.push(`За сутки не было импульсов от ${T}%`);
  if (r.rvolDay != null && r.rvolDay >= 1.3) out.push(`Оборот за сутки ${fmtVol(r.vol24)}, в ${x1(r.rvolDay)} раза выше обычного дня`);
  else if (r.rvolDay != null && r.rvolDay <= 0.7) out.push(`Оборот ниже обычного: ${x1(r.rvolDay)}× от медианного дня`);
  if (r.rangeX != null && r.rangeX >= 1.3) out.push(`Диапазон суток ${x1(r.range24)}% при обычном ${x1(r.adr)}%`);
  if (near(r.toHi7, C.nearPct)) out.push(`Цена в ${r.toHi7.toFixed(2)}% от хая 7 дней${r.hi7Fresh ? ', хай обновлён за сутки' : ''}`);
  if (near(r.toLo7, C.nearPct)) out.push(`Цена в ${r.toLo7.toFixed(2)}% от лоя 7 дней${r.lo7Fresh ? ', лой обновлён за сутки' : ''}`);
  if (r.faded) out.push(`Основной объём прошёл за один час, сейчас тихо: ${x1(r.rvol1h)}× от среднего часа`);
  else if (r.rvol1h != null && r.rvol1h >= 2) out.push(`Последний час в ${x1(r.rvol1h)} раза активнее среднего`);
  if (r.costX != null && r.costX < C.penalty.minCostX) out.push(`Мало хода: 5-минутная свеча ${r.rng5.toFixed(2)}%, это ${x1(r.costX)}× комиссии со спредом`);
  if (r.newListing) out.push('Мало дневной истории: сравнение с обычным днём недоступно');
  return out;
}
