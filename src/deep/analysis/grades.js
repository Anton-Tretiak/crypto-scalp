import { CONFIG } from '../../config.js';
import { sgn } from '../../lib/format.js';
import { pl, W } from '../../lib/ru.js';

export const GRADE = {
  2:  { label: 'Сильно рекомендуется', mark: '✓✓', col: 'var(--up)' },
  1:  { label: 'Рекомендуется', mark: '✓', col: 'var(--up)' },
  0:  { label: 'Нейтрально', mark: '–', col: 'var(--muted)' },
  '-1': { label: 'Не рекомендуется', mark: '✗', col: 'var(--hot)' },
  '-2': { label: 'Категорически не рекомендуется', mark: '✗✗', col: 'var(--down)' }
};

/** Long/short grade = best backtest expectancy (R) + context adjustments (trend, funding, flow). */
export function grades(d, b) {
  const G = CONFIG.deep.grade, minN = CONFIG.deep.backtest.minSamples;
  const L = b.length, bt = d.bt, last = b[L - 1].c;
  const ch24 = L > 1441 ? (last / b[L - 1441].c - 1) * 100 : null, ch3d = (last / b[0].c - 1) * 100;
  let q = 0, tb = 0; b.slice(-240).forEach(x => { q += x.qv; tb += x.tb; });
  const buy4h = q ? tb / q : 0.5;
  const fund = d.row && d.row.funding != null ? d.row.funding : null;
  const days = Math.round((b[L - 1].t - b[0].t) / 3.6e6 / 24 * 10) / 10;
  const line = (a, name) => {
    if (a.n < minN) return { txt: `${name}: ${a.n} ${pl(a.n, W.deal)} в истории, слишком мало для вывода.`, avg: null };
    const avg = a.sum / a.n;
    return { txt: `${name}: ${a.n} ${pl(a.n, W.deal)}, прибыльных ${Math.round(a.w / a.n * 100)}%, матожидание ${sgn(avg)}R с учётом комиссии.`, avg };
  };
  const one = dir => {
    const reasons = [];
    let adj = 0;
    const m = line(bt.mom[dir], dir > 0 ? 'Вход по импульсу вверх' : 'Вход по импульсу вниз');
    const f = line(bt.fade[dir], dir > 0 ? 'Откуп после пролива' : 'Шорт после выноса вверх');
    reasons.push(m.txt, f.txt);
    const avgs = [m.avg, f.avg].filter(x => x != null);
    const best = avgs.length ? Math.max(...avgs) : null;
    if (ch24 != null) {
      const a1 = dir * ch24, a2 = dir * ch3d, tr = `за 24 ч ${sgn(ch24, 1)}%, за ${days} дн. ${sgn(ch3d, 1)}%`;
      if (a1 >= 0.5 && a2 >= 0.5) { adj += 0.1; reasons.push(`Тренд по направлению: ${tr}.`); }
      else if (a1 <= -0.5 && a2 <= -0.5) { adj -= 0.1; reasons.push(`Тренд против направления: ${tr}.`); }
      else reasons.push(`Тренд смешанный: ${tr}.`);
    }
    if (fund != null && Math.abs(fund) >= 0.05) {
      const crowded = (fund > 0 && dir > 0) || (fund < 0 && dir < 0);
      adj += crowded ? -0.1 : 0.05;
      reasons.push(`Фандинг ${sgn(fund, 3)}%: ` + (crowded ? (dir > 0 ? 'лонги перегружены, возможен сквиз вниз.' : 'шорты перегружены, возможен сквиз вверх.') : 'толпа стоит против этого направления, это в плюс.'));
    }
    const flow = dir > 0 ? buy4h : 1 - buy4h;
    if (flow >= 0.55) { adj += 0.05; reasons.push(`${dir > 0 ? 'Покупатели' : 'Продавцы'} агрессивнее последние 4 ч: ${Math.round(flow * 100)}% рыночного объёма.`); }
    else if (flow <= 0.45) { adj -= 0.05; reasons.push(`${dir > 0 ? 'Продавцы' : 'Покупатели'} агрессивнее последние 4 ч: ${Math.round((1 - flow) * 100)}% рыночного объёма.`); }
    let lvl;
    if (best == null) {
      lvl = adj >= 0.1 ? 1 : adj <= -0.1 ? -1 : 0;
      reasons.push('Оценка только по контексту: в истории мало сигналов.');
    } else {
      const s = best + adj;
      lvl = s >= G.strong ? 2 : s >= G.ok ? 1 : s > -G.ok ? 0 : s > -G.strong ? -1 : -2;
    }
    return { lvl, best, adj, reasons };
  };
  return { 1: one(1), '-1': one(-1), ch24, ch3d, buy4h };
}
