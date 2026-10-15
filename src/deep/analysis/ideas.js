import { fmtPrice, fmtVol, pc } from '../../lib/format.js';
import { pl, W } from '../../lib/ru.js';
import { stopBuffers } from './stops.js';

/**
 * Rule-based setups for the current price. Each setup appears only when the coin's
 * history supports it, and never in a direction graded "категорически не рекомендуется".
 */
export function ideas(d, { T }) {
  const price = d.price, st = d.stats, br = d.brk, sb = stopBuffers(d);
  const tgt = Math.min(5, Math.max(0.5, st.medSize || T));
  const lv = d.levels.map(l => ({ p: l.p, touches: l.touches, kind: l.kind, dist: (l.p / price - 1) * 100 }));
  const above = lv.filter(l => l.dist > 0.05).sort((a, c) => a.dist - c.dist);
  const below = lv.filter(l => l.dist < -0.05).sort((a, c) => c.dist - a.dist);
  const withDist = w => ({ ...w, dist: (w.p / price - 1) * 100 });
  const asks = d.dens.ask.map(withDist).filter(w => w.dist > 0.03);
  const bids = d.dens.bid.map(withDist).filter(w => w.dist < -0.03);

  const nearest = (levels, walls, sign) => {
    const c = [];
    levels.forEach(l => { if ((l.touches >= 2 || l.kind) && Math.abs(l.dist) <= 3) c.push({ p: l.p, dist: l.dist, label: l.kind ? `${l.kind} ${fmtPrice(l.p)}` : `уровень ${fmtPrice(l.p)} (${l.touches} ${pl(l.touches, W.touch)})` }); });
    walls.forEach(w => { if (w.eat >= 1 && Math.abs(w.dist) <= 3) c.push({ p: w.p, dist: w.dist, wall: w, label: `плотность ${fmtVol(w.n)} в ${sign > 0 ? 'асках' : 'бидах'} на ${fmtPrice(w.p)}` }); });
    c.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
    return c[0] || null;
  };
  const R = nearest(above, asks, 1), Sp = nearest(below, bids, -1), out = [];
  const mk = (key, name, dir, entry, stop, target, trigger, why) => {
    const g = d.grades[dir].lvl;
    if (g <= -2) return;
    const risk = Math.max(1e-12, Math.abs(entry - stop));
    if (Math.abs(target - entry) < 1.5 * risk) target = entry + dir * 1.5 * risk;
    out.push({ key: key + fmtPrice(entry), name, dir, entry, stop, target, rr: Math.abs(target - entry) / risk,
               trigger, why, grade: g, away: (entry / price - 1) * 100 });
  };
  const nextBeyond = (list, from, dir) => list.find(l => dir > 0 ? l.p > from * 1.003 : l.p < from * 0.997);
  const up = br.up, dn = br.dn, g = br.goal.toFixed(1);
  const impWhy = st.n ? `Медианный импульс ${st.medSize.toFixed(2)}%, примерно ${st.perHour.toFixed(1)} в час.` : 'Импульсов мало, держите цели короткими.';

  if (R && (up.n < 5 || up.rate >= 0.45)) {
    const e = R.p * 1.0005, s = R.p * (1 - sb.long / 100), nx = nextBeyond(above, R.p, 1);
    const t = nx && (nx.p / e - 1) * 100 < tgt ? nx.p * 0.999 : e * (1 + tgt / 100);
    mk('bo', 'Пробой вверх', 1, e, s, t,
      R.wall ? `Разъедают ${R.label}, в ленте преобладают покупки и растёт скорость сделок.` : `Минутная свеча закрывается выше: ${R.label}, на повышенном объёме.`,
      (up.n >= 5 ? `Пробои уровней вверх проходили +${g}% раньше, чем цена возвращалась под уровень, в ${pc(up.rate)} случаев (${up.n} ${pl(up.n, W.brk)}).` : 'Пробоев в истории мало, сетап не подтверждён.') + ' ' + impWhy);
  }
  if (Sp && (dn.n < 5 || dn.rate >= 0.45)) {
    const e = Sp.p * 0.9995, s = Sp.p * (1 + sb.short / 100), nx = nextBeyond(below, Sp.p, -1);
    const t = nx && (1 - nx.p / e) * 100 < tgt ? nx.p * 1.001 : e * (1 - tgt / 100);
    mk('bd', 'Пробой вниз', -1, e, s, t,
      Sp.wall ? `Проедают ${Sp.label}, в ленте преобладают продажи и лента ускоряется.` : `Минутная свеча закрывается ниже: ${Sp.label}, на повышенном объёме.`,
      (dn.n >= 5 ? `Пробои вниз проходили −${g}% раньше возврата над уровень в ${pc(dn.rate)} случаев (${dn.n} ${pl(dn.n, W.brk)}).` : 'Пробоев в истории мало, сетап не подтверждён.') + ' ' + impWhy);
  }
  if (R && up.n >= 5 && up.failRate >= 0.4) {
    const e = R.p * 0.9995, s = R.p * (1 + 1.5 * sb.short / 100);
    const t = Sp && Math.abs(Sp.dist) < tgt ? Sp.p * 1.001 : e * (1 - Math.max(0.4, tgt * 0.6) / 100);
    mk('fbu', 'Ложный пробой вверх', -1, e, s, t,
      `Цена прокалывает ${R.label}, затем минутная свеча закрывается обратно ниже, продолжения в ленте нет.`,
      `Пробои вверх возвращались под уровень в течение 15 мин в ${pc(up.failRate)} случаев (${up.n} ${pl(up.n, W.brk)}).`);
  }
  if (Sp && dn.n >= 5 && dn.failRate >= 0.4) {
    const e = Sp.p * 1.0005, s = Sp.p * (1 - 1.5 * sb.long / 100);
    const t = R && Math.abs(R.dist) < tgt ? R.p * 0.999 : e * (1 + Math.max(0.4, tgt * 0.6) / 100);
    mk('fbd', 'Ложный пробой вниз', 1, e, s, t,
      `Цена прокалывает ${Sp.label}, затем минутная свеча закрывается обратно выше, продажи иссякают.`,
      `Пробои вниз возвращались над уровень в течение 15 мин в ${pc(dn.failRate)} случаев (${dn.n} ${pl(dn.n, W.brk)}).`);
  }
  const wb = bids.filter(w => w.seen >= 3 && w.eat >= 2 && w.dist >= -1.5).sort((a, c) => c.n - a.n)[0];
  if (wb) {
    const e = wb.p * 1.0006, s = wb.p * (1 - Math.max(0.1, 0.3 * d.atr1m, d.brk.sweep.dnMed || 0) / 100);
    mk('wb', 'Отскок от плотности', 1, e, s, e * (1 + Math.max(0.4, tgt * 0.5) / 100),
      `Цена подходит к плотности ${fmtVol(wb.n)} на ${fmtPrice(wb.p)}, плотность стоит и не уменьшается, продажи замедляются. Если плотность снимают или разъедают, сразу выходите.`,
      `Плотность стоит уже ${Math.round((Date.now() - wb.since) / 1000)} с и равна ~${wb.eat.toFixed(1)} мин среднего оборота.`);
  }
  const wa = asks.filter(w => w.seen >= 3 && w.eat >= 2 && w.dist <= 1.5).sort((a, c) => c.n - a.n)[0];
  if (wa) {
    const e = wa.p * 0.9994, s = wa.p * (1 + Math.max(0.1, 0.3 * d.atr1m, d.brk.sweep.upMed || 0) / 100);
    mk('wa', 'Отбой от плотности', -1, e, s, e * (1 - Math.max(0.4, tgt * 0.5) / 100),
      `Цена подходит к плотности ${fmtVol(wa.n)} на ${fmtPrice(wa.p)}, плотность стоит, покупки замедляются. Если плотность снимают, сразу выходите.`,
      `Плотность стоит уже ${Math.round((Date.now() - wa.since) / 1000)} с и равна ~${wa.eat.toFixed(1)} мин среднего оборота.`);
  }
  out.sort((a, b) => (b.grade >= 0) - (a.grade >= 0) || Math.abs(a.away) - Math.abs(b.away));
  return out.slice(0, 4);
}
