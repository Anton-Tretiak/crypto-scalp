import { fmtPrice, f2, pc } from '../../lib/format.js';
import { pl, W } from '../../lib/ru.js';

/** Stop distance (%) beyond a level, per direction, from sweep depth history. */
export function stopBuffers(d) {
  const sw = d.brk.sweep, base = Math.max(0.12, 0.5 * d.atr1m);
  return {
    long: Math.max(base, (sw.dnP80 != null && sw.dn.length >= 5 ? sw.dnP80 : 0) + 0.03),
    short: Math.max(base, (sw.upP80 != null && sw.up.length >= 5 ? sw.upP80 : 0) + 0.03)
  };
}

/** Rows of [title, value, explanation] for the stop-loss panel. */
export function stopAdvice(d) {
  const bt = d.bt, sw = d.brk.sweep, sb = stopBuffers(d), price = d.price, out = [];
  const abs = p => fmtPrice(price * p / 100);
  if (bt.maeN >= 8) {
    out.push(['Стоп при входе по импульсу', `${bt.stopPct.toFixed(2)}% (≈ ${abs(bt.stopPct)} по цене)`,
      `80% входов, которые в итоге дошли до цели +${bt.goal.toFixed(2)}%, не уходили против позиции дальше ${(bt.stopPct - 0.02).toFixed(2)}%` +
      (bt.maeL != null && bt.maeS != null ? ` (в лонгах ${bt.maeL.toFixed(2)}%, в шортах ${bt.maeS.toFixed(2)}%)` : '') + '. Стоп короче выбьет хорошие входы.']);
  } else {
    out.push(['Стоп при входе по импульсу', `${bt.stopPct.toFixed(2)}% (≈ ${abs(bt.stopPct)})`, 'Прибыльных сигналов в истории мало, поэтому стоп взят от волатильности: 0,8 минутного ATR.']);
  }
  if (sw.n >= 8) {
    const side = (arr, med, p80, word) => arr.length >= 5
      ? `Проколы ${word} перед разворотом: медиана ${f2(med)}%, 80% не глубже ${f2(p80)}% (${arr.length} ${pl(arr.length, W.cas)}). Стоп в 0,1% за уровнем выбило бы в ${pc(arr.filter(x => x > 0.1).length / arr.length)} проколов.`
      : 'Проколов в эту сторону в истории мало, используется буфер по волатильности.';
    out.push(['Стоп за уровнем в лонге', `не ближе ${sb.long.toFixed(2)}% под уровнем`, side(sw.dn, sw.dnMed, sw.dnP80, 'минимумов')]);
    out.push(['Стоп за уровнем в шорте', `не ближе ${sb.short.toFixed(2)}% над уровнем`, side(sw.up, sw.upMed, sw.upP80, 'максимумов')]);
    if (sw.dn.length >= 5 && sw.up.length >= 5) {
      if (sw.dnP80 > sw.upP80 * 1.3) out.push(['Асимметрия', '', 'Под минимумами стопы собирают заметно глубже, чем над максимумами. Лонговые стопы держите шире.']);
      else if (sw.upP80 > sw.dnP80 * 1.3) out.push(['Асимметрия', '', 'Над максимумами стопы собирают заметно глубже, чем под минимумами. Шортовые стопы держите шире.']);
    }
  }
  if (bt.ttgMed != null && bt.maeN >= 8) {
    out.push(['Стоп по времени', `выход через ${Math.round(bt.ttgP80)} мин без движения`,
      `Прибыльные входы доходили до цели в среднем за ${Math.round(bt.ttgMed)} мин, 80% за ${Math.round(bt.ttgP80)} мин. Если за это время цена не пошла, вероятность успеха резко падает.`]);
  }
  if (bt.be.reach >= 6) {
    const r = bt.be.back / bt.be.reach;
    out.push(['Безубыток', r >= 0.4 ? 'переносить рано не стоит' : 'переносить после +1R',
      `После прохода +1R цена возвращалась к точке входа в ${pc(r)} случаев (${bt.be.reach}). ` +
      (r >= 0.4 ? 'Ранний безубыток здесь часто выбивает перед продолжением, лучше частично фиксировать прибыль.' : 'Перевод в безубыток здесь почти бесплатен и защищает от разворотов.')]);
  }
  out.push(['Шум', `минутный ATR ${d.atr1m.toFixed(2)}%`, `Стоп короче ${bt.floor.toFixed(2)}% будет выбиваться обычным шумом свечи. Комиссия ${bt.fee.toFixed(2)}% за круг уже учтена в бэктесте.`]);
  return out;
}
