/** Deterministic synthetic 1-minute bars for tests. */
export function rng(seed = 1) {
  let x = seed;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function flatBars(n, price = 100, start = Date.UTC(2026, 0, 1)) {
  const r = rng(7), bars = [];
  let p = price;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + (r() - 0.5) * 0.001);
    bars.push({ t: start + i * 60000, o, h: Math.max(o, p) * 1.0003, l: Math.min(o, p) * 0.9997, c: p, qv: 1e5, n: 100, tb: 5e4 });
  }
  return bars;
}

/** Inserts a straight move of `pct` percent over `len` bars starting at index `at`. */
export function plantMove(bars, at, len, pct) {
  const base = bars[at].o, step = pct / 100 / len;
  for (let k = 0; k < len; k++) {
    const o = base * (1 + step * k), c = base * (1 + step * (k + 1));
    bars[at + k] = { ...bars[at + k], o, c, h: Math.max(o, c) * 1.0002, l: Math.min(o, c) * 0.9998, qv: 6e5 };
  }
  const shift = (1 + pct / 100);
  for (let k = at + len; k < bars.length; k++) {
    const b = bars[k];
    bars[k] = { ...b, o: b.o * shift, h: b.h * shift, l: b.l * shift, c: b.c * shift };
  }
  return bars;
}
