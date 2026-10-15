import { CONFIG } from '../config.js';
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
  $('dTitle').textContent = d.base + ', график';
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
  $('dFund').innerHTML = fundingHtml(d);

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

const SET_NAME = { similar: 'того же знака и похожего размера', sign: 'того же знака', all: 'все подряд, похожих слишком мало' };
const mins = m => m < 90 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
const sp = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%';
const srow = (k, v, text) => `<div class="srow"><div class="sk">${esc(k)}${v ? `<b>${v}</b>` : ''}</div><p>${text}</p></div>`;

/** "Как торговать фандинг": plan from fundingPlan(), times relative to the next payment. */
function fundingHtml(d) {
  const note = t => `<p class="note">${t}</p>`;
  if (D.market !== 'futures') return note('Фандинг есть только на бессрочных фьючерсах. Переключите рынок в шапке на Perpetuals.');
  const f = d.fund;
  if (!f) return note(d.fundLoading ? 'Загружаем историю фандинга и минутные свечи вокруг каждой выплаты…' : 'История фандинга ещё не загружена.');
  if (f.error) return note(`<span class="bad">Не удалось загрузить фандинг: ${esc(f.error)}</span>`);
  const p = f.plan, now = Date.now(), a = Math.abs(f.rNow);
  const ih = p.interval ? Math.round(p.interval / 3.6e6) : null;
  const crowd = f.rNow > 0 ? 'лонги платят шортам' : f.rNow < 0 ? 'шорты платят лонгам' : 'никто не платит';
  let h = srow('Сейчас', esc(sp(f.rNow, 4)),
    `Прогноз на выплату в ${hm(f.nextT)} (через ${mins(Math.max(0, Math.round((f.nextT - now) / 60000)))})${ih ? `, выплаты каждые ${ih} ч` : ''}: ${crowd}. ` +
    `Комиссия за круг ${p.fee}%, фандинг ${a >= p.fee ? 'больше неё' : 'меньше неё и сам по себе её не окупает'}.`);
  if (p.status === 'nodata') return h + note(`Мало истории для расчёта: ${p.events} ${pl(p.events, W.pay)} с полными свечами, нужно от ${CONFIG.deep.funding.minN}.`);
  if (p.status === 'neutral') return h + note('Фандинг нулевой: толпа не перекошена, торговать выплату нечего.');

  const dirName = p.dir > 0 ? 'Лонг' : 'Шорт';
  let entryAt = f.nextT + p.mIn * 60000;
  const missed = entryAt < now - 60000 && p.interval;
  if (missed) entryAt += p.interval;
  const payAt = entryAt - p.mIn * 60000, exitAt = payAt + p.mOut * 60000;

  if (p.status === 'noedge') h += srow('Вердикт', '<span class="bad">Не торговать</span>',
    `Лучший из ${p.tried} вариантов дал в среднем ${esc(sp(p.mean))} на сделку после комиссии, прибыльных ${Math.round(p.win * 100)}% из ${p.n}. ` +
    'Это не отличить от случайности. Ниже этот вариант для справки.');

  h += srow('Когда заходить', hm(entryAt),
    (p.kind === 'pre'
      ? `За ${-p.mIn} мин до выплаты в ${hm(payAt)}, выход в ${hm(exitAt)}, через ${p.mOut} мин после неё. Позиция держится через выплату, поэтому фандинг вы ${p.rel < 0 ? 'получаете' : 'платите'}.`
      : `Сразу после выплаты в ${hm(payAt)}, выход в ${hm(exitAt)}, через ${p.mOut} мин. Через выплату позиция не держится, фандинг не участвует.`) +
    (missed ? ' Окно на ближайшую выплату уже прошло, время указано для следующей.' : ''));

  h += srow('Куда заходить', `<span class="${p.dir > 0 ? 'up' : 'down'}">${dirName}</span>`,
    `${p.rel < 0 ? 'Против толпы, которая платит фандинг' : p.kind === 'post' ? 'Вместе с толпой: после выплаты её давление возвращается' : 'Вместе с толпой, несмотря на оплату фандинга'}. ` +
    `Стоп ${p.stop.toFixed(2)}% от входа: так глубоко уходили против позиции 80% прибыльных сделок, выбивало ${Math.round(p.stopHit * 100)}% сделок. ` +
    `Цель +${p.medMfe.toFixed(2)}%: столько давала половина сделок. Если цель не взята, выход по времени в ${hm(exitAt)}.`);

  const be = p.be;
  h += srow('Выход в ноль', be ? `после +${be.q}%` : 'не переносить',
    (be ? `Из ${be.n} сделок, дошедших до +${be.q}%, к цене входа вернулись ${be.back}: после этого уровня стоп в безубыток почти не выбивает. ` +
          `Если за ${be.tReach} мин после входа цена не дала +${be.q}%, закрывайте в ноль.`
        : 'После любого плюса цена часто возвращалась к входу, ранний безубыток выбьет хорошие сделки. Держите до стопа или выхода по времени.') +
    (p.minAbsR != null ? ` Сетап работал при фандинге от ${p.minAbsR.toFixed(4)}% по модулю: если перед входом прогноз ниже, не входите, а если упал уже в сделке, выходите в ноль. Сейчас ${a.toFixed(4)}%, ${a >= p.minAbsR ? 'условие выполнено' : '<b class="bad">условие не выполнено</b>'}.` : ''));

  h += srow('Потенциал', `+${p.medMfe.toFixed(2)}% / +${p.p75Mfe.toFixed(2)}%`,
    `Медианный ход в вашу сторону +${p.medMfe.toFixed(2)}%, у лучшей четверти сделок от +${p.p75Mfe.toFixed(2)}%. ` +
    `Средний итог сделки ${esc(sp(p.mean))} после комиссии ${p.fee}%, из них фандинг ${esc(sp(p.fundAvg, 3))}. Прибыльных ${Math.round(p.win * 100)}% из ${p.n}.` +
    (p.med < 0 ? ` <b class="bad">Медианная сделка ${esc(sp(p.med))}: плюс держится на нескольких крупных ходах, объём держите небольшим.</b>` : ''));

  return h + note(`Расчёт по ${p.groupN} из ${p.events} последних выплат (${SET_NAME[p.set]}), по минутным свечам ±60 мин вокруг каждой. ` +
    `Выбран лучший из ${p.tried} вариантов входа и выхода, поэтому вживую результат обычно скромнее.`);
}

export function coinCountText(n) { return `${n} ${pl(n, W.coin)}`; }
