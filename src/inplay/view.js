import { CONFIG } from '../config.js';
import { esc, fmtPrice, fmtVol, pct } from '../lib/format.js';
import { tradeUrl } from '../lib/binance.js';
import { P } from './state.js';

const $ = id => document.getElementById(id);
const heat = (v, a, b) => v == null ? '' : v >= b ? 'h2' : v >= a ? 'h1' : '';
const xx = v => v == null ? '–' : v.toFixed(1) + '×';
const ago = m => m == null ? '–' : m < 90 ? Math.round(m) + ' мин' : Math.round(m / 60) + ' ч';
const tagsHtml = (r, max = 5) => (r.tags || []).slice(0, max).map(t => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('');
const openBtn = r => `<button type="button" class="ghost ipopen" data-open="${esc(r.symbol)}">Разобрать</button>`;
const symLink = r => `<a class="symlink" href="${tradeUrl(P.market, r.symbol)}" target="_blank" rel="noopener">${esc(r.base)}</a>`;
const dist = v => v == null ? '–' : v.toFixed(2) + '%';

/** Table columns. Add a column here and it appears in the table with sorting. */
export const COLS = [
  { key: 'symbol', label: 'Монета', l: true, cell: symLink },
  { key: 'score', label: 'Скор', cell: r => `<div class="score"><span class="bar"><i style="width:${r.score}%"></i></span><b>${r.score}</b></div>` },
  { key: 'chg24', label: '24ч', cell: r => pct(r.chg24, 1) },
  { key: 'moves24', label: 'Импульсы 24ч', cls: r => heat(r.moves24, 3, 8), cell: r => r.moves24 + (r.movesBase != null ? ` <span class="mut">/ ${r.movesBase.toFixed(1)}</span>` : '') },
  { key: 'medImp', label: 'Медиана имп.', cell: r => r.medImp != null ? r.medImp.toFixed(2) + '%' : '–' },
  { key: 'rvolDay', label: 'Объём к дню', cls: r => heat(r.rvolDay, 1.5, 2.5), cell: r => xx(r.rvolDay) },
  { key: 'range24', label: 'Диапазон', cell: r => r.range24.toFixed(1) + '%' },
  { key: 'rangeX', label: 'К обычному', cls: r => heat(r.rangeX, 1.4, 2), cell: r => xx(r.rangeX) },
  { key: 'rng5', label: 'Свеча 5м', cell: r => r.rng5.toFixed(2) + '%' },
  { key: 'costX', label: 'Ход / комиссия', cell: r => r.costX == null ? '–' : `<span class="${r.costX < CONFIG.inplay.penalty.minCostX ? 'bad' : ''}">${r.costX.toFixed(1)}×</span>` },
  { key: 'qvMin', label: 'Оборот / мин', cell: r => fmtVol(r.qvMin) },
  { key: 'rvol1h', label: 'Час', cls: r => heat(r.rvol1h, 1.4, 2.2), cell: r => xx(r.rvol1h) },
  { key: 'toHi7', label: 'До хая 7д', cell: r => dist(r.toHi7) },
  { key: 'toLo7', label: 'До лоя 7д', cell: r => dist(r.toLo7) },
  { key: 'lastImpMin', label: 'Посл. импульс', asc: true, cell: r => ago(r.lastImpMin) },
  { key: 'tags', label: 'Сигналы', l: true, nosort: true, cell: r => tagsHtml(r, 4) },
  { key: 'open', label: '', nosort: true, cell: openBtn }
];

function card(r, i) {
  const nums = [
    [`${r.moves24}${r.movesBase != null ? `<small> / ${r.movesBase.toFixed(1)}</small>` : ''}`, `Импульсов от ${P.T}% / обычно`],
    [`${r.range24.toFixed(1)}%${r.rangeX != null ? `<small> ×${r.rangeX.toFixed(1)}</small>` : ''}`, 'Диапазон суток'],
    [xx(r.rvolDay), 'Объём к обычному дню'],
    [`${r.rng5.toFixed(2)}%${r.costX != null ? `<small> ${r.costX.toFixed(1)}×</small>` : ''}`, 'Свеча 5м / комиссия']
  ];
  const foot = [];
  if (r.peakHours.length) foot.push('Чаще двигается в ' + r.peakHours.map(h => String(h).padStart(2, '0')).join(', ') + ' ч');
  if (r.lastImpMin != null) foot.push('последний импульс ' + ago(r.lastImpMin) + ' назад');
  return `<article class="ipcard">` +
    `<div class="iphead"><span class="iprank">${i + 1}</span>${symLink(r)}<span class="mut num">${fmtPrice(r.last)} ${pct(r.chg24, 1)}</span><span class="ipscore" aria-label="Скор">${r.score}</span></div>` +
    `<div class="ipnums">${nums.map(n => `<div><b>${n[0]}</b>${n[1]}</div>`).join('')}</div>` +
    `<ul class="ipwhy">${r.why.slice(0, 3).map(s => `<li>${esc(s)}</li>`).join('')}</ul>` +
    `<div class="tags">${tagsHtml(r, 4)}</div>` +
    `<div class="ipfoot"><span>${esc(foot.join(', '))}</span>${openBtn(r)}</div></article>`;
}

export function render() {
  const top = P.rows.slice().sort((a, b) => b.score - a.score).slice(0, CONFIG.inplay.cards);
  $('ipCards').innerHTML = top.length ? top.map(card).join('')
    : `<div class="empty">${P.scanning ? 'Идёт разбор рынка…' : 'Нажмите «Обновить», чтобы найти монеты в игре.'}</div>`;

  const { key: k, dir } = P.sort;
  const rows = P.rows.slice().sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === 'string') return dir * x.localeCompare(y);
    if (x == null) return 1; if (y == null) return -1;
    return dir * (x - y);
  });
  $('ipTbl').querySelector('thead').innerHTML = '<tr>' + COLS.map(c => {
    const cls = c.l ? ' class="l"' : '';
    if (c.nosort) return `<th${cls}>${c.label}</th>`;
    const sa = P.sort.key === c.key ? ` aria-sort="${P.sort.dir < 0 ? 'descending' : 'ascending'}"` : '';
    return `<th${cls}${sa}><button type="button" data-sort="${c.key}">${c.label}</button></th>`;
  }).join('') + '</tr>';
  $('ipTbl').querySelector('tbody').innerHTML = rows.length ? rows.map(r => '<tr>' + COLS.map(c => {
    const cl = ((c.l ? 'l ' : '') + (c.cls ? c.cls(r) : '')).trim();
    return `<td${cl ? ` class="${cl}"` : ''}>${c.cell(r)}</td>`;
  }).join('') + '</tr>').join('')
    : `<tr><td class="l mut" colspan="${COLS.length}">Таблица заполнится после разбора.</td></tr>`;
  updateStatus();
}

export function setStatus(html) { $('ipStatus').innerHTML = html; }

export function updateStatus() {
  if (P.scanning) return;
  const err = P.error ? `<span class="bad">Не удалось обновить: ${esc(P.error)}</span> Если Binance заблокирован в вашей сети, смените VPN. ` : '';
  if (!P.lastAt) { setStatus(err + 'Рынок и минимальный объём берутся из шапки страницы.'); return; }
  const t = P.lastAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  let s = `Обновлено в <strong>${t}</strong>. Разобрано ${P.rows.length} из ${P.scannedOf} монет с оборотом от ${fmtVol(P.minVol)}, рынок ${P.market === 'futures' ? 'фьючерсы' : 'спот'}.`;
  if (P.active) {
    const left = Math.max(0, Math.ceil((P.lastAt.getTime() + CONFIG.inplay.refreshMin * 60000 - Date.now()) / 60000));
    s += ` Следующее обновление через ${left} мин.`;
  }
  setStatus(err + s);
}
