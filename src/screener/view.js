import { esc, fmtPrice, fmtVol, pct } from '../lib/format.js';
import { tradeUrl } from '../lib/binance.js';
import { state } from './state.js';

const $ = id => document.getElementById(id);

function spark(vals) {
  if (!vals || vals.length < 2) return '';
  const w = 84, h = 24, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - mn) / rg * (h - 4)).toFixed(1)).join(' ');
  const col = vals[vals.length - 1] >= vals[0] ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${col}" stroke-width="1.5" points="${pts}"/></svg>`;
}
const heat = (v, a, b) => v >= b ? 'h2' : v >= a ? 'h1' : '';
const tagsHtml = (r, max = 4) => (r.tags || []).slice(0, max).map(t => `<span class="tag ${t[1]}">${t[0]}</span>`).join('');

/** Table columns. Add a column here and it appears everywhere (sorting included). */
export const COLS = [
  { key: 'pin', label: '', l: true, nosort: true, cell: r => { const on = state.pins.has(r.symbol); return `<button class="pin" data-pin="${esc(r.symbol)}" aria-pressed="${on}" aria-label="${on ? 'Unpin' : 'Pin'} ${esc(r.symbol)}">★</button>`; } },
  { key: 'symbol', label: 'Coin', l: true, cell: r => `<a class="symlink" href="${tradeUrl(state.rowsMarket, r.symbol)}" target="_blank" rel="noopener">${esc(r.base)}</a>` },
  { key: 'score', label: 'Score', cell: r => {
      const d = state.prev[r.symbol];
      let dh = '<span class="delta"></span>';
      if (d != null && d !== r.score) dh = `<span class="delta ${r.score > d ? 'up' : 'down'}">${r.score > d ? '+' : ''}${r.score - d}</span>`;
      else if (d == null && Object.keys(state.prev).length) dh = '<span class="delta" style="color:var(--hot)">new</span>';
      return `<div class="score"><span class="bar"><i style="width:${r.score}%"></i></span><b>${r.score}</b>${dh}</div>`; } },
  { key: 'spark', label: 'Last 3h', nosort: true, cell: r => spark(r.spark) },
  { key: 'last', label: 'Price', cell: r => fmtPrice(r.last) },
  { key: 'chg15', label: '15m', cell: r => pct(r.chg15) },
  { key: 'chg1h', label: '1h', cell: r => pct(r.chg1h) },
  { key: 'chg24', label: '24h', cell: r => pct(r.chg24, 1) },
  { key: 'qv', label: '24h volume', cell: r => fmtVol(r.qv) },
  { key: 'rvol1h', label: 'RVOL 1h', cls: r => heat(r.rvol1h, 1.4, 2.2), cell: r => r.rvol1h != null ? r.rvol1h.toFixed(2) + '×' : '–' },
  { key: 'rvol15', label: 'RVOL 15m', cls: r => heat(r.rvol15, 1.6, 3), cell: r => r.rvol15 != null ? r.rvol15.toFixed(2) + '×' : '–' },
  { key: 'atr', label: 'ATR 5m', cls: r => heat(r.atr, 0.35, 0.7), cell: r => r.atr.toFixed(2) + '%' },
  { key: 'tpm', label: 'Trades/min', cell: r => r.tpm >= 1000 ? (r.tpm / 1000).toFixed(1) + 'k' : Math.round(r.tpm) },
  { key: 'spread', label: 'Spread', cell: r => r.spread == null ? '–' : `<span class="${r.spread >= 8 ? 'bad' : ''}">${r.spread.toFixed(r.spread < 10 ? 1 : 0)} bp</span>` },
  { key: 'rangePos', label: '24h range', cell: r => r.rangePos == null ? '–' : `<span class="rng" title="Low ${fmtPrice(r.low)} to high ${fmtPrice(r.high)}"><i style="left:${r.rangePos.toFixed(0)}%"></i></span>${r.rangePos.toFixed(0)}%` },
  { key: 'funding', label: 'Funding', futures: true, cell: r => { if (r.funding == null) return '–'; const c = Math.abs(r.funding) >= 0.05 ? 'bad' : r.funding < 0 ? 'down' : ''; return `<span class="${c}">${r.funding.toFixed(4)}%</span>`; } },
  { key: 'oiChg', label: 'OI 1h', futures: true, cell: r => pct(r.oiChg, 1) },
  { key: 'tags', label: 'Signals', l: true, nosort: true, cell: r => tagsHtml(r) }
];

const visibleCols = () => COLS.filter(c => state.rowsMarket === 'futures' || !c.futures);

export function render() {
  const top = state.rows.slice().sort((a, b) => b.score - a.score).slice(0, 6);
  $('tiles').innerHTML = top.length ? top.map(r =>
    `<a class="tile" href="${tradeUrl(state.rowsMarket, r.symbol)}" target="_blank" rel="noopener">` +
    `<div class="sym">${esc(r.base)}<small>${fmtPrice(r.last)}</small></div>` +
    `<div class="sc" aria-label="Score">${r.score}</div>` +
    `<div class="why">RVOL <b>${r.rvol1h.toFixed(1)}×</b>&nbsp;&nbsp;ATR <b>${r.atr.toFixed(2)}%</b>&nbsp;&nbsp;1h ${pct(r.chg1h, 1)}</div>` +
    `<div class="tags">${tagsHtml(r, 3)}</div></a>`).join('')
    : '<div class="empty">The top six coins by score will appear here after the first scan.</div>';

  let rows = state.rows.slice();
  const q = state.search.trim().toUpperCase();
  if (q) rows = rows.filter(r => r.symbol.includes(q));
  if (state.pinnedOnly) rows = rows.filter(r => state.pins.has(r.symbol));
  const { key: k, dir } = state.sort;
  rows.sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === 'string') return dir * x.localeCompare(y);
    if (x == null) return 1; if (y == null) return -1;
    return dir * (x - y);
  });
  const cols = visibleCols();
  $('tbl').querySelector('thead').innerHTML = '<tr>' + cols.map(c => {
    const cls = c.l ? ' class="l"' : '';
    if (c.nosort) return `<th${cls}>${c.label}</th>`;
    const sa = state.sort.key === c.key ? ` aria-sort="${state.sort.dir < 0 ? 'descending' : 'ascending'}"` : '';
    return `<th${cls}${sa}><button type="button" data-sort="${c.key}">${c.label}</button></th>`;
  }).join('') + '</tr>';
  $('tbl').querySelector('tbody').innerHTML = rows.length ? rows.map(r => '<tr>' + cols.map(c => {
    const cl = ((c.l ? 'l ' : '') + (c.cls ? c.cls(r) : '')).trim();
    return `<td${cl ? ` class="${cl}"` : ''}>${c.cell(r)}</td>`;
  }).join('') + '</tr>').join('')
    : `<tr><td class="l mut" colspan="${cols.length}">${state.rows.length ? 'No coins match this filter.' : 'Run a scan to fill this table.'}</td></tr>`;
  updateStatus();
}

export function setStatus(html) { $('status').innerHTML = html; }

export function updateStatus() {
  if (state.scanning) return;
  if (!state.lastAt) { setStatus('Press “Scan now” to load the market.'); return; }
  const t = state.lastAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let s = `Updated <strong>${t}</strong>. Deep-scanned ${state.rows.length} of ${state.scannedOf} coins above ${fmtVol(state.minVol)} daily volume.`;
  if (state.nextAt) {
    const left = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000));
    s += ` Next scan in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.`;
  }
  setStatus(s);
}

export function showError(e) {
  $('err').innerHTML = '<strong>Scan failed.</strong> ' + esc(e.message) +
    '<br><span class="mut">If Binance is blocked on your network, switch VPN location or network. The next automatic scan will retry.</span>';
  $('err').classList.add('show');
}
export function clearError() { $('err').classList.remove('show'); }
