import { esc, fmtPrice, fmtVol, pct, pc, hms, hm } from '../lib/format.js';
import { pl, W } from '../lib/ru.js';
import { playbook, stopAdvice, GRADE } from './analysis/index.js';
import { D } from './state.js';

const $ = id => document.getElementById(id);

export function status(t) { $('dStatus').innerHTML = t; }

export function renderChips() {
  $('dChips').innerHTML = D.coins.map(sym => {
    const d = D.data[sym];
    let inner = `<b>${esc(sym.replace(/USDT$/, ''))}</b>`;
    if (d) {
      if (!d.style) playbook(d, D);
      const gl = GRADE[d.grades[1].lvl], gs = GRADE[d.grades[-1].lvl];
      inner += `<span class="cs"><span class="style">${esc(d.style)}</span>${d.row ? ', скор ' + d.row.score : ''}${D.manual.has(sym) ? ', вручную' : ''}</span>` +
        `<span class="cs">Лонг <span style="color:${gl.col};font-weight:700">${gl.mark}</span>&nbsp;&nbsp;Шорт <span style="color:${gs.col};font-weight:700">${gs.mark}</span></span>` +
        `<span class="cs">${d.stats.perHour.toFixed(1)} имп./ч, медиана ${d.stats.medSize ? d.stats.medSize.toFixed(1) + '%' : '–'}</span>`;
    } else inner += `<span class="cs">${D.failed[sym] ? 'не удалось загрузить' : 'загрузка…'}</span>`;
    return `<button type="button" class="chip" data-sym="${esc(sym)}" aria-pressed="${sym === D.sel}">${inner}</button>`;
  }).join('');
}

/** Parts that change only when history statistics change. */
export function renderStatic(d) {
  const st = d.stats, pb = playbook(d, D);
  $('dTitle').textContent = d.base + ', 1 минута';
  $('dSpan').textContent = `последние ${Math.round(st.hours)} ч минутных свечей`;
  $('dPlay').innerHTML = `<p class="verdict">${esc(pb.verdict)}</p>` + pb.lines.map(l => `<p>${esc(l)}</p>`).join('');
  $('dGrades').innerHTML = [[1, 'Лонг'], [-1, 'Шорт']].map(([dir, name]) => {
    const g = d.grades[dir], G = GRADE[g.lvl];
    return `<div class="gcard" style="border-left-color:${G.col}"><div class="gtop"><span class="gdir">${name}</span><span class="glabel" style="color:${G.col}">${G.label}</span></div>` +
      g.reasons.map(r => `<p>${esc(r)}</p>`).join('') + '</div>';
  }).join('');
  $('dStops').innerHTML = stopAdvice(d).map(s => `<div class="srow"><div class="sk">${esc(s[0])}${s[1] ? `<b>${esc(s[1])}</b>` : ''}</div><p>${esc(s[2])}</p></div>`).join('');
  const ago = st.lastT ? Math.round((Date.now() - st.lastT) / 60000) : null;
  const kv = [
    ['Импульсов в час', st.perHour.toFixed(2)],
    ['Медианный размер', st.medSize ? st.medSize.toFixed(2) + '%' : '–'],
    ['Верхние 25%', st.p75 ? 'от ' + st.p75.toFixed(2) + '%' : '–'],
    ['Максимальный', st.maxSize ? st.maxSize.toFixed(2) + '%' : '–'],
    ['Медианная длительность', st.medDur ? st.medDur + ' мин' : '–'],
    ['Вверх / вниз', st.upShare != null ? Math.round(st.upShare * 100) + ' / ' + Math.round((1 - st.upShare) * 100) : '–'],
    ['Откат на половину', pc(st.fadeRate)],
    ['Вторая волна', pc(st.contRate)],
    ['Старт с объёма', pc(st.volLed)],
    ['Последний импульс', ago == null ? '–' : ago < 90 ? ago + ' мин назад' : Math.round(ago / 60) + ' ч назад'],
    ['ATR 1m', d.atr1m.toFixed(3) + '%'],
    ['Средний оборот / мин', fmtVol(d.avgQvMin)]
  ];
  $('dStats').innerHTML = kv.map(x => `<div><b>${x[1]}</b>${x[0]}</div>`).join('');
  const mx = Math.max(...st.hist) || 1, cur = new Date().getHours();
  let svg = '';
  st.hist.forEach((c, h) => {
    const bh = Math.round(c / mx * 56), x = h * 20 + 2;
    svg += `<rect x="${x}" y="${62 - bh}" width="16" height="${Math.max(1, bh)}" rx="2" fill="${h === cur ? 'var(--hot)' : 'var(--accent)'}" opacity="${h === cur ? 1 : 0.55}"><title>${String(h).padStart(2, '0')}:00, импульсов: ${c}</title></rect>`;
    if (h % 3 === 0) svg += `<text x="${x + 8}" y="80" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Barlow Semi Condensed, sans-serif">${String(h).padStart(2, '0')}</text>`;
  });
  $('dHist').innerHTML = svg;
}

/** Parts that change every second: tape, walls, levels distances, ideas. */
export function renderLive(d) {
  const price = d.price, t = d.tape.live;
  let html = '';
  if (t) {
    const tot = t.buy + t.sell, bs = tot ? t.buy / tot : 0.5;
    html += `<div class="tapebig"><div><b>${fmtPrice(price)}</b>Цена</div><div><b>${t.tps10.toFixed(1)}</b>Сделок/с (10 с)</div><div><b>${t.tps60 > 0 ? (t.tps10 / t.tps60).toFixed(1) + '×' : '–'}</b>Скорость к 1 мин</div></div>`;
    html += `<div style="font-size:13px;color:var(--muted)">За 60 с: покупки ${fmtVol(t.buy)}, продажи ${fmtVol(t.sell)}, цена ${pct(t.chg60)}</div>`;
    html += `<div class="dbarw" aria-label="Доля покупок ${Math.round(bs * 100)}%"><i style="width:${(bs * 100).toFixed(1)}%;background:var(--up)"></i><i style="flex:1;background:var(--down)"></i></div>`;
    if (t.forming) html += `<div class="flash">Формируется импульс ${t.chg60 > 0 ? 'вверх' : 'вниз'}: ${Math.abs(t.chg60).toFixed(2)}% за минуту</div>`;
  }
  const a = d.tape.algo;
  if (a) html += `<p class="note"><b style="color:var(--ink)">Повторяющийся объём ${esc(a.q)}</b> (≈${fmtVol(a.each)}) встретился ${a.count} раз за 5 мин, ${Math.round(a.buyShare * 100)}% из них покупки${a.regular ? `, примерно каждые ${a.every.toFixed(1)} с` : ''}. Часто это алгоритм, который режет крупную заявку на ${a.buyShare >= 0.5 ? 'покупку' : 'продажу'}.</p>`;
  if (d.tape.big.length) {
    html += `<table class="mini" style="margin-top:10px"><thead><tr><th>Крупные сделки от ${fmtVol(d.tape.bigThr)}</th><th>Цена</th><th>Объём</th></tr></thead><tbody>` +
      d.tape.big.slice(0, 8).map(x => `<tr><td>${hms(x.t)}</td><td>${fmtPrice(x.p)}</td><td class="${x.buy ? 'up' : 'down'}">${x.buy ? 'Покупка' : 'Продажа'} ${fmtVol(x.n)}</td></tr>`).join('') + '</tbody></table>';
  }
  $('dTape').innerHTML = html || '<p class="note">Ждём сделки…</p>';
  $('dTapeAge').textContent = d.lastTradeAt ? (Date.now() - d.lastTradeAt < 5000 ? 'онлайн' : `тишина ${Math.round((Date.now() - d.lastTradeAt) / 1000)} с`) : '';

  const row = w => { const dist = (w.p / price - 1) * 100; return `<tr><td class="${w.side === 'bid' ? 'up' : 'down'}">${fmtPrice(w.p)}</td><td>${dist > 0 ? '+' : ''}${dist.toFixed(2)}%</td><td>${fmtVol(w.n)}</td><td>${w.eat != null ? w.eat.toFixed(1) : '–'}</td><td>${Math.round((Date.now() - w.since) / 1000)} с</td></tr>`; };
  const asks = d.dens.ask.slice().sort((a, b) => b.p - a.p), bids = d.dens.bid.slice().sort((a, b) => b.p - a.p);
  let wh = '<table class="mini"><thead><tr><th>Цена</th><th>Дист.</th><th>Объём</th><th>≈ мин</th><th>Стоит</th></tr></thead><tbody>' +
    (asks.length ? asks.map(row).join('') : '<tr><td colspan="5" class="mut">Крупных асков в пределах 3% нет</td></tr>') +
    `<tr class="mid"><td colspan="5">${fmtPrice(price)}</td></tr>` +
    (bids.length ? bids.map(row).join('') : '<tr><td colspan="5" class="mut">Крупных бидов в пределах 3% нет</td></tr>') + '</tbody></table>';
  if (d.wallEvents.length) wh += '<p class="note" style="margin-top:10px">' + d.wallEvents.slice(0, 4).map(e =>
    `${hm(e.t)} ${e.side === 'bid' ? 'бид' : 'аск'} ${fmtVol(e.n)} на ${fmtPrice(e.p)}: ` + (e.kind === 'pulled' ? `<b class="bad">снят</b> через ${Math.round(e.life)} с, цена была далеко` : 'съеден')).join('<br>') + '</p>';
  $('dWalls').innerHTML = wh;

  const lv = d.levels.map(l => ({ ...l, dist: (l.p / price - 1) * 100 })).filter(l => Math.abs(l.dist) <= 4);
  const ab = lv.filter(l => l.dist > 0).sort((a, b) => a.dist - b.dist).slice(0, 4).reverse();
  const be = lv.filter(l => l.dist <= 0).sort((a, b) => b.dist - a.dist).slice(0, 4);
  const lr = l => `<tr><td>${fmtPrice(l.p)}</td><td>${l.dist > 0 ? '+' : ''}${l.dist.toFixed(2)}%</td><td>${l.kind || l.touches + ' ' + pl(l.touches, W.touch)}</td></tr>`;
  $('dLevels').innerHTML = '<table class="mini"><thead><tr><th>Цена</th><th>Дист.</th><th>Сила</th></tr></thead><tbody>' + ab.map(lr).join('') + `<tr class="mid"><td colspan="3">${fmtPrice(price)}</td></tr>` + be.map(lr).join('') + '</tbody></table>';

  $('dIdeas').innerHTML = d.ideas && d.ideas.length ? d.ideas.map(x => {
    const near = Math.abs(x.away) <= 0.3;
    return `<div class="idea${near ? ' near' : ''}"><div class="nm"><span class="${x.dir > 0 ? 'long' : 'short'}">${x.dir > 0 ? 'Лонг' : 'Шорт'}: ${esc(x.name)}</span>` +
      (near ? '<span class="badge">Рядом с входом</span>' : `<span class="mut num" style="font-weight:500">${x.away > 0 ? '+' : ''}${x.away.toFixed(2)}% до входа</span>`) + '</div>' +
      (x.grade < 0 ? '<p class="bad" style="margin:4px 0 0">Против рекомендации по направлению: только с сильным подтверждением.</p>' : '') +
      `<table class="num"><tr><td>Вход</td><td>${fmtPrice(x.entry)}</td><td>Стоп</td><td>${fmtPrice(x.stop)} (${(Math.abs(x.entry - x.stop) / x.entry * 100).toFixed(2)}%)</td></tr>` +
      `<tr><td>Цель</td><td>${fmtPrice(x.target)}</td><td>Прибыль:риск</td><td>${x.rr.toFixed(1)}</td></tr></table>` +
      `<p><b>Триггер.</b> ${esc(x.trigger)}</p><p class="why">${esc(x.why)}</p></div>`;
  }).join('') : '<p class="note">Сейчас нет сетапа с достаточной поддержкой. Цена далеко от сильных уровней и плотностей, либо история монеты не даёт перевеса ни пробоям, ни отскокам.</p>';
}

export function coinCountText(n) { return `${n} ${pl(n, W.coin)}`; }
