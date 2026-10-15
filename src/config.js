/**
 * Central place for every tunable number. Change thresholds here, not inside modules.
 * Описания всех параметров см. в CLAUDE.md, раздел «Конфигурация».
 */
export const CONFIG = {
  stables: ['USDC','FDUSD','TUSD','BUSD','DAI','USDP','EUR','AEUR','EURI','USD1','PYUSD','XUSD','BFUSD','RLUSD','USDE','USDS','GBP','TRY','BRL'],

  screener: {
    defaults: { market: 'futures', minVol: 20e6, topN: 50, refreshMin: 2 },
    klineInterval: '5m',
    klineLimit: 289,            // 24h of 5m candles + the open one
    concurrency: 8,             // parallel REST requests during a scan
    weights: { rvol1h: 0.30, atr: 0.25, tpm: 0.20, qv: 0.15, spread: 0.10 },
    tags: { spikeRvol15: 3, activeRvol1h: 2, nearEdgePct: 8, oiPct: 3, fundingPct: 0.05, trendingEff: 0.6, choppyEff: 0.2, wideSpreadBp: 8 }
  },

  deep: {
    defaults: { T: 1, W: 5, alerts: false, autoTop: true },
    topCount: 5,
    historyPages: 4,            // x1000 one-minute candles (~2.8 days)
    concurrency: 2,
    depthLimit: 1000,
    depthRefreshMs: 10000,
    staleMs: 30 * 60 * 1000,    // re-download history of non-selected coins after this
    fees: { futures: 0.1, spot: 0.2 }, // % per round trip, subtracted in the backtest
    pivotK: 12,                 // candles on each side for a swing high/low
    breakLookahead: 15,         // minutes to judge a level break
    wall: { multiplier: 8, minEatMin: 0.4, minUsd: 15000, rangePct: 3 },
    backtest: { horizon: 15, targetR: 1.5, minSamples: 8, cooldown: 5, volMult: 1.5 },
    grade: { strong: 0.25, ok: 0.08 },
    alertNearPct: 0.15,
    alertCooldownMs: 180000
  }
};
