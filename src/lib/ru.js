/** Russian plural: pl(5, W.deal) -> "сделок". */
export function pl(n, f) {
  n = Math.abs(Math.round(n)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return f[2];
  if (n1 > 1 && n1 < 5) return f[1];
  if (n1 === 1) return f[0];
  return f[2];
}
export const W = {
  deal: ['сделка', 'сделки', 'сделок'],
  imp: ['импульс', 'импульса', 'импульсов'],
  pay: ['выплата', 'выплаты', 'выплат'],
  touch: ['касание', 'касания', 'касаний'],
  coin: ['монета', 'монеты', 'монет'],
  brk: ['пробой', 'пробоя', 'пробоев'],
  cas: ['случай', 'случая', 'случаев']
};
