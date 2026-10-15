import { pc } from '../../lib/format.js';

/** Plain-language verdict about the coin's character. Sets d.style. */
export function playbook(d, { T, W }) {
  const st = d.stats, br = d.brk, lines = [];
  const bo = [br.up, br.dn].filter(r => r.n >= 5);
  const tot = bo.reduce((s, r) => s + r.n, 0);
  const boRate = tot ? bo.reduce((s, r) => s + r.ok, 0) / tot : null;
  const fbRate = tot ? bo.reduce((s, r) => s + r.fail, 0) / tot : null;
  let verdict;
  if (st.n < 4) { verdict = `Мало импульсов от ${T}% за последнее время. Уменьшите размер импульса или выберите более активную монету.`; d.style = 'Мало данных'; }
  else if (boRate != null && boRate >= 0.55 && (st.fadeRate == null || st.fadeRate < 0.6)) { verdict = 'Импульсная монета: пробои уровней обычно отрабатывают, приоритет у входов на пробой после разъедания плотности.'; d.style = 'Импульсная'; }
  else if ((fbRate != null && fbRate >= 0.45) || (st.fadeRate != null && st.fadeRate >= 0.6)) { verdict = 'Возвратная монета: пробои часто ложные, а импульсы откатывают. Приоритет у ложных пробоев и отскоков от плотностей.'; d.style = 'Возвратная'; }
  else { verdict = 'Смешанное поведение: явного перевеса нет ни у пробоев, ни у отскоков. Берите только самые чистые сетапы у сильных уровней.'; d.style = 'Смешанная'; }
  if (st.n) {
    lines.push(`За последние ${Math.round(st.hours)} ч было ${st.n} движений от ${T}% за ${W} мин, примерно ${st.perHour.toFixed(1)} в час. Медианный импульс прошёл ${st.medSize.toFixed(2)}% за ${st.medDur} мин, ${Math.round(st.upShare * 100)}% из них вверх.`);
    if (st.fadeRate != null) lines.push(`В течение 15 минут после импульса цена откатывала половину и больше в ${pc(st.fadeRate)} случаев и давала вторую волну в ${pc(st.contRate)}. Типичный откат составил ${pc(st.medGive)} движения.`);
    if (st.volLed != null) lines.push(`${pc(st.volLed)} импульсов начинались с минутного объёма минимум в 3 раза выше среднего за предыдущие 30 минут. Резкий всплеск объёма здесь служит ранним предупреждением.`);
    const hrs = st.hist.map((c, h) => ({ h, c })).sort((a, b) => b.c - a.c).filter(x => x.c > 0).slice(0, 3).map(x => String(x.h).padStart(2, '0') + ':00');
    if (hrs.length) lines.push(`Чаще всего импульсы начинались в ${hrs.join(', ')} (по вашему времени).`);
  }
  if (br.up.n || br.dn.n) lines.push(`После закрытия минутной свечи за уровнем цена проходила ещё ${br.goal.toFixed(1)}% раньше возврата за уровень в ${pc(br.up.rate)} пробоев вверх (${br.up.n}) и ${pc(br.dn.rate)} пробоев вниз (${br.dn.n}). Ложными оказывались ${pc(br.up.failRate)} и ${pc(br.dn.failRate)} соответственно.`);
  return { verdict, lines };
}
