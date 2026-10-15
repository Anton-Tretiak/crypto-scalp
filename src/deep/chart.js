import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, LineStyle, CrosshairMode } from 'lightweight-charts';
import { fmtPrice, fmtVol } from '../lib/format.js';
import { resample } from '../lib/candles.js';
import { load, save } from '../lib/storage.js';

const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/** The library shows UTC; shift timestamps so the time axis reads in the user's local time. */
const lt = ms => ms / 1000 - new Date(ms).getTimezoneOffset() * 60;
const alpha = (hex, a) => /^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex;
const sp = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%';
const mins = s => { const m = Math.round(Math.abs(s) / 60); return m < 90 ? m + ' мин' : (m / 60).toFixed(1) + ' ч'; };

const DEFAULTS = { tf: 1, show: { levels: true, walls: true, ideas: true, imp: true, fund: true, vol: true } };

/**
 * Interactive candle chart of the selected coin (TradingView Lightweight Charts).
 * Wheel zooms, drag scrolls, crosshair shows the candle; overlays: levels, order-book walls,
 * entry/stop/target of the nearest idea, impulse and funding markers. Pure view: reads the coin object.
 * @param current () => coin object of the selected coin (see CLAUDE.md "Объект монеты")
 */
export function initChart({ box, legend, tools, current }) {
  const saved = load('deep:chart', {});
  const S = { tf: saved.tf || DEFAULTS.tf, show: { ...DEFAULTS.show, ...(saved.show || {}) } };
  let chart = null, candles, vol, markers, C = {};
  let key = '', coin = null, theme = '', lineSig = '', markSig = '', lines = [];
  let byTime = new Map(), lastRow = null, hovering = false, measuring = false, anchor = null, anchorLine = null, frozen = '';

  function build() {
    chart = createChart(box, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { locale: 'ru-RU', priceFormatter: p => fmtPrice(p) }
    });
    candles = chart.addSeries(CandlestickSeries, { borderVisible: false, priceLineStyle: LineStyle.Dotted });
    vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    markers = createSeriesMarkers(candles, []);
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);
  }

  function applyTheme() {
    C = { up: cssv('--up'), down: cssv('--down'), muted: cssv('--muted'), line: cssv('--line'), ink: cssv('--ink'), hot: cssv('--hot'), accent: cssv('--accent'), surface: cssv('--surface') };
    const sig = Object.values(C).join();
    if (sig === theme) return;
    theme = sig; lineSig = ''; markSig = '';
    chart.applyOptions({
      layout: { background: { color: C.surface }, textColor: C.muted, fontFamily: '"Barlow Semi Condensed", Barlow, sans-serif', fontSize: 12 },
      grid: { vertLines: { color: alpha(C.line, 0.5) }, horzLines: { color: alpha(C.line, 0.5) } },
      crosshair: { vertLine: { color: C.muted, labelBackgroundColor: C.ink }, horzLine: { color: C.muted, labelBackgroundColor: C.ink } }
    });
    candles.applyOptions({ upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceLineColor: C.ink });
    if (coin) setData(coin);
  }

  const volPt = b => ({ time: lt(b.t), value: b.qv, color: alpha(b.c >= b.o ? C.up : C.down, 0.35) });
  const candlePt = b => ({ time: lt(b.t), open: b.o, high: b.h, low: b.l, close: b.c });

  function setData(d) {
    const rows = resample(d.bars, S.tf);
    candles.setData(rows.map(candlePt));
    vol.setData(S.show.vol ? rows.map(volPt) : []);
    byTime = new Map(rows.map(r => [lt(r.t), r]));
    lastRow = rows[rows.length - 1];
  }

  /** Live tick: re-aggregates only the tail and updates the last two candles. */
  function updateTail(d) {
    const tail = resample(d.bars.slice(-S.tf * 3), S.tf).slice(-2);
    tail.forEach(r => {
      candles.update(candlePt(r));
      if (S.show.vol) vol.update(volPt(r));
      byTime.set(lt(r.t), r);
    });
    lastRow = tail[tail.length - 1];
  }

  function priceLines(d) {
    const specs = [], price = d.price;
    if (S.show.levels) d.levels.forEach(l => {
      if (Math.abs(l.p / price - 1) > 0.05) return;
      specs.push({ price: l.p, color: C.muted, lineWidth: l.touches >= 4 || l.kind ? 2 : 1, lineStyle: LineStyle.Dashed, title: l.kind || '×' + l.touches });
    });
    if (S.show.walls) ['bid', 'ask'].forEach(side => d.dens[side].forEach(w => {
      specs.push({ price: w.p, color: side === 'bid' ? C.up : C.down, lineWidth: Math.min(4, Math.max(1, Math.round(1 + Math.log2(Math.max(1, w.x / 8))))), lineStyle: LineStyle.Solid, title: fmtVol(w.n) });
    }));
    const idea = S.show.ideas && d.ideas && d.ideas[0];
    if (idea) {
      specs.push({ price: idea.entry, color: C.hot, lineWidth: 2, lineStyle: LineStyle.Dashed, title: idea.name });
      specs.push({ price: idea.stop, color: C.down, lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'стоп' });
      specs.push({ price: idea.target, color: C.up, lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'цель' });
    }
    const sig = JSON.stringify(specs);
    if (sig === lineSig) return;
    lineSig = sig;
    lines.forEach(l => candles.removePriceLine(l));
    lines = specs.map(s => candles.createPriceLine({ ...s, axisLabelVisible: true }));
  }

  function setMarkers(d) {
    const ms = S.tf * 60000, bucket = t => lt(Math.floor(t / ms) * ms), first = d.bars[0].t, list = [];
    if (S.show.imp && d.stats) {
      const big = d.stats.p75 || Infinity;
      d.stats.impulses.forEach(x => list.push({
        time: bucket(x.t), position: x.dir > 0 ? 'belowBar' : 'aboveBar', color: x.dir > 0 ? C.up : C.down,
        shape: x.dir > 0 ? 'arrowUp' : 'arrowDown', text: x.size >= big ? sp(x.dir * x.size, 1) : ''
      }));
    }
    if (S.show.fund && d.fund && d.fund.events) d.fund.events.forEach(e => {
      if (e.t >= first) list.push({ time: bucket(e.t), position: 'aboveBar', color: C.accent, shape: 'circle', text: 'Ф ' + sp(e.r, 3) });
    });
    list.sort((a, b) => a.time - b.time);
    const sig = JSON.stringify(list);
    if (sig === markSig) return;
    markSig = sig;
    markers.setMarkers(list);
  }

  /** @param live text of a measurement in progress (replaces the hint) */
  function legendHtml(r, live = '') {
    if (!r || !coin) return '';
    const chg = (r.c / r.o - 1) * 100;
    let h = `<b>${coin.base}</b> ${S.tf}м&nbsp;&nbsp;О ${fmtPrice(r.o)} Х ${fmtPrice(r.h)} Л ${fmtPrice(r.l)} З ${fmtPrice(r.c)}` +
      `&nbsp;&nbsp;<span class="${chg >= 0 ? 'up' : 'down'}">${sp(chg)}</span>&nbsp;&nbsp;Об ${fmtVol(r.qv)}`;
    const m = frozen || live || (measuring ? (anchor ? 'Замер: ведите курсор, клик фиксирует результат' : 'Замер: кликните точку начала') : '');
    if (m) h += `<br><span class="cmeasure">${m}</span>`;
    return h;
  }

  const measureText = (price, time) => `Замер: ${sp((price / anchor.price - 1) * 100)}, ${mins(time - anchor.time)}, от ${fmtPrice(anchor.price)} до ${fmtPrice(price)}`;

  function onMove(p) {
    hovering = p.time != null;
    let live = '';
    if (anchor && !frozen && hovering && p.point) {
      const price = candles.coordinateToPrice(p.point.y);
      if (price != null) live = measureText(price, p.time);
    }
    legend.innerHTML = legendHtml((hovering && byTime.get(p.time)) || lastRow, live);
  }

  function clearMeasure() {
    if (anchorLine) candles.removePriceLine(anchorLine);
    anchor = null; anchorLine = null; frozen = '';
  }

  function onClick(p) {
    if (!measuring || !p.point || p.time == null) return;
    const price = candles.coordinateToPrice(p.point.y);
    if (price == null) return;
    if (frozen) { clearMeasure(); }
    else if (!anchor) {
      anchor = { price, time: p.time };
      anchorLine = candles.createPriceLine({ price, color: C.accent, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'замер' });
    } else {
      frozen = measureText(price, p.time) + '. Клик сбрасывает';
    }
    legend.innerHTML = legendHtml(lastRow);
  }

  function render(d) {
    if (!d || !d.bars.length) return;
    if (!chart) build();
    applyTheme();
    const k = d.sym + ':' + S.tf;
    if (k !== key || d !== coin) {
      const newView = k !== key;
      coin = d; key = k;
      setData(d);
      if (newView) {
        clearMeasure();
        const n = byTime.size, show = box.clientWidth < 600 ? 90 : 160;
        chart.timeScale().setVisibleLogicalRange({ from: n - show, to: n + 6 });
      }
    } else updateTail(d);
    priceLines(d);
    setMarkers(d);
    if (!hovering) legend.innerHTML = legendHtml(lastRow);
  }

  function syncTools() {
    tools.querySelectorAll('[data-tf]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.tf === S.tf)));
    tools.querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', String(!!S.show[b.dataset.show])));
    tools.querySelector('[data-act="measure"]').setAttribute('aria-pressed', String(measuring));
  }

  tools.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tf) { S.tf = +b.dataset.tf; key = ''; }
    else if (b.dataset.show) { S.show[b.dataset.show] = !S.show[b.dataset.show]; if (b.dataset.show === 'vol') key = ''; }
    else if (b.dataset.act === 'measure') { measuring = !measuring; if (!measuring) clearMeasure(); }
    else if (b.dataset.act === 'last') { if (chart) chart.timeScale().scrollToRealTime(); return; }
    else if (b.dataset.act === 'full') {
      const panel = box.closest('.panel');
      if (document.fullscreenElement) document.exitFullscreen(); else if (panel.requestFullscreen) panel.requestFullscreen();
      return;
    }
    save('deep:chart', { tf: S.tf, show: S.show });
    syncTools();
    render(current());
  });
  syncTools();

  return { render };
}
