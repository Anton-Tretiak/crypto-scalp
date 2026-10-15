import { CONFIG } from '../config.js';
import { api, pool, toBar } from '../lib/binance.js';
import { esc, fmtPrice } from '../lib/format.js';
import { on } from '../lib/bus.js';
import { state as screener, topSymbols } from '../screener/state.js';
import { D, saveSettings } from './state.js';
import { computeStats, ideas, fundingPlan } from './analysis/index.js';
import { newTape, pushTrade, updateBigThr, tapeLive, detectAlgo } from './live/tape.js';
import { processDepth } from './live/depth.js';
import { openStream } from './live/stream.js';
import { alertOnce, beep } from './live/alerts.js';
import { initChart } from './chart.js';
import { status, renderChips, renderStatic, renderLive, coinCountText } from './view.js';

const $ = id => document.getElementById(id);
const C = CONFIG.deep;
const opts = () => ({ T: D.T, W: D.W, market: D.market });

/* ---------- data ---------- */
async function fetchHistory(A, sym) {
  let all = [], end;
  for (let n = 0; n < C.historyPages; n++) {
    const kl = await A.klines(sym, '1m', 1000, end);
    if (!kl.length) break;
    all = kl.concat(all); end = kl[0][0] - 1;
    if (kl.length < 1000) break;
  }
  return all.map(toBar);
}

async function analyzeCoin(sym) {
  const A = api(D.market);
  const [bars, trades] = await Promise.all([fetchHistory(A, sym), A.aggTrades(sym, 1000)]);
  if (bars.length < 300) throw new Error('недостаточно минутной истории');
  const old = D.data[sym];
  const d = {
    sym, base: sym.replace(/USDT$/, ''), row: screener.rows.find(r => r.symbol === sym) || null,
    bars, price: bars[bars.length - 1].c, loadedAt: Date.now(),
    walls: old ? old.walls : new Map(), wallEvents: old ? old.wallEvents : [], dens: old ? old.dens : { bid: [], ask: [] },
    tape: old ? old.tape : newTape(), fund: old ? old.fund : null
  };
  computeStats(d, opts());
  if (!old) {
    trades.forEach(t => pushTrade(d, t, true));
    updateBigThr(d);
    d.tape.buf.forEach(x => { if (x.n >= d.tape.bigThr) d.tape.big.unshift({ t: x.t, p: x.p, n: x.n, buy: x.buy }); });
    d.tape.big = d.tape.big.slice(0, 12);
  }
  D.data[sym] = d;
  await loadDepth(d).catch(() => {});
  d.ideas = ideas(d, D);
  return d;
}

async function loadDepth(d) {
  processDepth(d, await api(D.market).depth(d.sym, C.depthLimit));
}

/* ---------- funding ---------- */
const F = C.funding;
const planFunding = d => { d.fund.plan = fundingPlan(d.fund, { fee: CONFIG.fees.futures }); };

/** Funding history with 1m candles around each past payment. Loaded only for the selected coin. */
async function loadFunding(d) {
  if (D.market !== 'futures' || d.fundLoading) return;
  d.fundLoading = true;
  const A = api(D.market), win = F.window * 60000;
  try {
    const [hist, pi] = await Promise.all([A.fundingRate(d.sym, F.events), A.premiumIndex(d.sym)]);
    const now = Date.now();
    const events = hist.map(h => ({ t: Math.round(+h.fundingTime / 60000) * 60000, r: +h.fundingRate * 100 })).filter(e => e.t + win < now);
    await pool(events, F.concurrency, async e => { e.bars = (await A.klines(d.sym, '1m', 2 * F.window + 1, e.t + win)).map(toBar); });
    d.fund = { events, rNow: +pi.lastFundingRate * 100, nextT: +pi.nextFundingTime, loadedAt: now };
    planFunding(d);
  } catch (e) {
    d.fund = { error: e.message, loadedAt: Date.now() };
  } finally {
    d.fundLoading = false;
    if (D.sel === d.sym) renderLive(d);
  }
}

/** Every minute: the current (predicted) rate; the full history after reloadMs or after a failed load. */
async function refreshFunding(d) {
  if (D.market !== 'futures' || d.fundLoading) return;
  if (!d.fund || d.fund.error || Date.now() - d.fund.loadedAt > F.reloadMs) return loadFunding(d);
  try {
    const pi = await api(D.market).premiumIndex(d.sym);
    d.fund.rNow = +pi.lastFundingRate * 100; d.fund.nextT = +pi.nextFundingTime;
    planFunding(d);
  } catch (e) { /* keep the previous rate */ }
}

/* ---------- drawing ---------- */
let chart = null, drawQueued = false, lastDraw = 0;
function queueDraw() {
  if (drawQueued) return;
  drawQueued = true;
  setTimeout(() => requestAnimationFrame(() => { drawQueued = false; lastDraw = Date.now(); if (chart) chart.render(D.data[D.sel]); }), Math.max(0, 250 - (Date.now() - lastDraw)));
}

/* ---------- live ---------- */
function onKline(d, k) {
  const bar = { t: +k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, qv: +k.q, n: +k.n, tb: +k.Q };
  const last = d.bars[d.bars.length - 1];
  if (last && last.t === bar.t) d.bars[d.bars.length - 1] = bar;
  else if (!last || bar.t > last.t) {
    d.bars.push(bar);
    if (d.bars.length > 4500) d.bars.splice(0, d.bars.length - 4500);
    computeStats(d, opts());
    renderStatic(d); renderChips();
  }
}

function checkAlerts(d) {
  (d.ideas || []).forEach(x => {
    if (Math.abs(x.away) <= C.alertNearPct) alertOnce(d.sym + x.key, `${d.base}: цена в ${C.alertNearPct}% от входа «${x.name}» на ${fmtPrice(x.entry)}`, D.alerts);
  });
  const t = d.tape.live;
  if (t && t.forming) alertOnce(d.sym + 'imp' + (t.chg60 > 0 ? 'u' : 'd'), `${d.base}: формируется импульс, ${t.chg60 > 0 ? '+' : ''}${t.chg60.toFixed(2)}% за минуту`, D.alerts);
}

function stopLive() {
  D.timers.forEach(clearInterval); D.timers = [];
  if (D.stream) { D.stream.close(); D.stream = null; }
}

function startLive() {
  stopLive();
  const d = D.data[D.sel];
  if (!d || !D.active) return;
  const sym = d.sym;
  D.stream = openStream(D.market, sym, {
    onTrade: x => { const dd = D.data[sym]; if (dd) { pushTrade(dd, x); queueDraw(); } },
    onKline: k => { const dd = D.data[sym]; if (dd) { onKline(dd, k); queueDraw(); } },
    onState: s => { $('dLive').textContent = { live: 'онлайн', reconnecting: 'переподключение…', error: 'онлайн-поток недоступен' }[s]; }
  });
  let tick = 0;
  D.timers.push(setInterval(() => {
    const dd = D.data[D.sel]; if (!dd) return;
    tick++;
    tapeLive(dd, D.T);
    if (tick % 5 === 0) detectAlgo(dd);
    if (tick % 30 === 0) updateBigThr(dd);
    dd.ideas = ideas(dd, D);
    renderLive(dd); checkAlerts(dd); queueDraw();
  }, 1000));
  D.timers.push(setInterval(() => { const dd = D.data[D.sel]; if (dd) loadDepth(dd).catch(() => {}); }, C.depthRefreshMs));
  D.timers.push(setInterval(() => { const dd = D.data[D.sel]; if (dd) refreshFunding(dd); }, 60000));
  // Keep histories of the other coins fresh without manual reloads.
  D.timers.push(setInterval(refreshStale, 60000));
}

async function refreshStale() {
  const stale = D.coins.filter(s => s !== D.sel && D.data[s] && Date.now() - D.data[s].loadedAt > C.staleMs);
  await pool(stale, 1, s => analyzeCoin(s).catch(() => {}));
  if (stale.length) renderChips();
}

/* ---------- flow ---------- */
function select(sym) {
  const d = D.data[sym];
  if (!d) return;
  D.sel = sym;
  renderChips();
  $('dBody').hidden = false;
  tapeLive(d, D.T); detectAlgo(d);
  d.ideas = ideas(d, D);
  renderStatic(d); renderLive(d); queueDraw();
  if (!d.fund || d.fund.error) loadFunding(d);
  if (D.active) startLive();
}

async function loadCoins(list) {
  D.loading = true; renderChips();
  status(`Анализ: ${coinCountText(list.length)} (около 3 дней минутных свечей на каждую)…`);
  const errs = [];
  await pool(list, C.concurrency, sym => analyzeCoin(sym).then(
    () => { delete D.failed[sym]; renderChips(); if (!D.sel) select(sym); },
    e => { D.failed[sym] = true; errs.push(`${sym}: ${e.message}`); renderChips(); }
  ));
  D.loading = false;
  const ok = D.coins.filter(s => D.data[s]).length;
  status((ok ? `Готово: ${coinCountText(ok)}, рынок ${D.market === 'futures' ? 'фьючерсы' : 'спот'}. ` + (D.autoTop ? 'Топ-5 обновляется автоматически после каждого сканирования.' : 'Автообновление топ-5 выключено.') : 'Ничего не удалось проанализировать.') +
    (errs.length ? ` <span class="bad">${esc(errs.join('; '))}</span>` : ''));
  if (D.sel && D.data[D.sel]) select(D.sel);
  else { const first = D.coins.find(s => D.data[s]); if (first) select(first); }
}

/** Brings the chip list in line with the screener top-N (+ manual coins), loading only what changed. */
function syncTop({ force = false } = {}) {
  if (!screener.rows.length) {
    status(screener.scanning ? 'Ждём окончания сканирования…' : 'Сначала запустите сканирование или добавьте монету вручную.');
    return;
  }
  const marketChanged = D.market !== screener.rowsMarket;
  if (marketChanged || force) { stopLive(); D.data = {}; D.failed = {}; D.sel = null; D.manual.clear(); }
  D.market = screener.rowsMarket;
  const target = topSymbols(C.topCount);
  D.manual.forEach(s => { if (!target.includes(s)) target.push(s); });
  if (D.sel && !target.includes(D.sel) && D.data[D.sel]) target.push(D.sel); // never pull the coin you are looking at
  Object.keys(D.data).forEach(s => { if (!target.includes(s)) delete D.data[s]; });
  Object.values(D.data).forEach(d => { d.row = screener.rows.find(r => r.symbol === d.sym) || d.row; });
  D.coins = target;
  const missing = target.filter(s => !D.data[s]);
  if (missing.length) loadCoins(missing); else renderChips();
}

function recomputeAll() {
  Object.values(D.data).forEach(d => { computeStats(d, opts()); d.ideas = ideas(d, D); });
  renderChips();
  const d = D.data[D.sel];
  if (d) { renderStatic(d); renderLive(d); queueDraw(); }
}

function addCoin() {
  let v = $('dAdd').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!v) return;
  if (!/USDT$/.test(v)) v += 'USDT';
  $('dAdd').value = '';
  openCoin(v);
}

/** Adds a coin as manual (kept when the top-5 changes) and selects it once loaded. */
function openCoin(v) {
  if (!D.market) D.market = screener.rowsMarket || screener.market;
  D.manual.add(v);
  if (D.coins.includes(v)) { if (D.data[v]) select(v); return; }
  D.coins.push(v);
  loadCoins([v]).then(() => { if (D.data[v]) select(v); });
}

function syncControls() {
  $('dT').value = String(D.T);
  $('dW').value = String(D.W);
  $('dAlerts').setAttribute('aria-pressed', String(D.alerts));
  $('dAlerts').textContent = D.alerts ? 'Звук вкл.' : 'Звук выкл.';
  $('dAuto').setAttribute('aria-pressed', String(D.autoTop));
  $('dAuto').textContent = D.autoTop ? 'Авто топ-5 вкл.' : 'Авто топ-5 выкл.';
}

export function initDeep() {
  syncControls();
  $('dChips').addEventListener('click', e => { const b = e.target.closest('[data-sym]'); if (b) select(b.dataset.sym); });
  $('dReload').addEventListener('click', () => { if (!D.loading) syncTop({ force: true }); });
  $('dAlerts').addEventListener('click', () => { D.alerts = !D.alerts; saveSettings(); syncControls(); if (D.alerts) beep(); });
  $('dAuto').addEventListener('click', () => { D.autoTop = !D.autoTop; saveSettings(); syncControls(); if (D.autoTop && D.active) syncTop(); });
  $('dT').addEventListener('change', e => { D.T = +e.target.value; saveSettings(); recomputeAll(); });
  $('dW').addEventListener('change', e => { D.W = +e.target.value; saveSettings(); recomputeAll(); });
  $('dAddBtn').addEventListener('click', addCoin);
  $('dAdd').addEventListener('keydown', e => { if (e.key === 'Enter') addCoin(); });
  chart = initChart({ box: $('dChartBox'), legend: $('dLegend'), tools: $('dChartTools'), current: () => D.data[D.sel] });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', queueDraw);

  on('scan:done', ({ market }) => {
    if (!D.active || D.loading) return;
    if (!D.coins.length || market !== D.market) { syncTop(); return; }
    if (D.autoTop) syncTop();
    else {
      const fresh = topSymbols(C.topCount).filter(s => !D.coins.includes(s));
      if (fresh.length) status(`В топ-5 скринера появились: ${esc(fresh.map(s => s.replace(/USDT$/, '')).join(', '))}. Нажмите «Обновить топ-5», чтобы их разобрать.`);
    }
  });

  return {
    activate() {
      D.active = true;
      if (!D.coins.length || D.market !== screener.rowsMarket) { if (!D.loading) syncTop(); }
      else { if (D.autoTop) syncTop(); if (D.sel) select(D.sel); }
    },
    deactivate() { D.active = false; stopLive(); },
    open: openCoin
  };
}
