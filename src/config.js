/**
 * Central place for every tunable number. Change thresholds here, not inside modules.
 * Описания всех параметров см. в CLAUDE.md, раздел «Конфигурация».
 */
export const CONFIG = {
  fees: { futures: 0.1, spot: 0.2 }, // % per round trip (taker in and out)
  stables: ['USDC','FDUSD','TUSD','BUSD','DAI','USDP','EUR','AEUR','EURI','USD1','PYUSD','XUSD','BFUSD','RLUSD','USDE','USDS','GBP','TRY','BRL'],

  screener: {
    defaults: { market: 'futures', minVol: 20e6, topN: 50, refreshMin: 2 },
    klineInterval: '5m',
    klineLimit: 289,            // 24h of 5m candles + the open one
    concurrency: 8,             // parallel REST requests during a scan
    weights: { rvol1h: 0.30, atr: 0.25, tpm: 0.20, qv: 0.15, spread: 0.10 },
    tags: { spikeRvol15: 3, activeRvol1h: 2, nearEdgePct: 8, oiPct: 3, fundingPct: 0.05, trendingEff: 0.6, choppyEff: 0.2, wideSpreadBp: 8 }
  },

  inplay: {
    defaults: { T: 1, topN: 60 },
    refreshMin: 10,             // auto-refresh while the tab is open
    klineLimit: 1000,           // 5m candles (~3.5 days): last 24h + baseline for impulse counts
    baseDays: 14,               // closed daily candles that define a "normal day"
    minBaseDays: 5,             // fewer closed days -> new listing, no daily baseline
    impulseBars: 2,             // impulse = move >= T within this many 5m candles (<= 10 min)
    concurrency: 6,
    cards: 8,                   // coins shown as cards on top
    preRank: { range: 0.6, vol: 0.4 },
    weights: { moves: 0.30, rvolDay: 0.20, rangeX: 0.15, costX: 0.15, now: 0.10, liq: 0.10 },
    nearPct: 1,                 // % from a 7-day high/low that counts as "at the level"
    spikeShare: 0.35,           // one hour holds >= this share of 24h volume...
    deadRvol: 0.6,              // ...and the last hour is below this RVOL -> the spike has faded
    penalty: { minCostX: 2, lowCost: 0.6, wideSpreadBp: 8, wideSpread: 0.8, faded: 0.8 },
    tags: { rvolDay: 2, rangeX: 1.8, rvol1h: 2, funding: 0.05, oiPct: 10 }
  },

  deep: {
    defaults: { T: 1, W: 5, alerts: false, autoTop: true },
    topCount: 5,
    historyPages: 4,            // x1000 one-minute candles (~2.8 days)
    concurrency: 2,
    depthLimit: 1000,
    depthRefreshMs: 10000,
    staleMs: 30 * 60 * 1000,    // re-download history of non-selected coins after this
    pivotK: 12,                 // candles on each side for a swing high/low
    breakLookahead: 15,         // minutes to judge a level break
    wall: { multiplier: 8, minEatMin: 0.4, minUsd: 15000, rangePct: 3 },
    backtest: { horizon: 15, targetR: 1.5, minSamples: 8, cooldown: 5, volMult: 1.5 },
    grade: { strong: 0.25, ok: 0.08 },
    funding: {
      events: 30,               // last funding payments to study
      window: 60,               // minutes of 1m candles loaded on each side of a payment
      preIn: [60, 30, 15, 5],   // "before funding" entries: minutes before the payment
      preOut: [1, 5, 15],       // ...and exits: minutes after it (the position is held through the payment)
      postOut: [5, 15, 30, 60], // "after funding" entries at the payment, exits this many minutes later
      minN: 8,                  // fewer trades -> no recommendation
      similar: [0.5, 2],        // "similar" past rates: same sign, |rate| within these multiples of the current one
      minWin: 0.4,              // required win rate (fat-tailed setups win less often but more per trade)
      stopFloor: 0.12, stopMax: 5,
      beSteps: [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 3], // % profit levels tested for moving the stop to entry
      beBackMax: 0.25,          // breakeven level = first one after which <= 25% of trades came back to entry
      reloadMs: 60 * 60 * 1000, // full reload of the history; the current rate is refreshed every minute
      concurrency: 4
    },
    alertNearPct: 0.15,
    alertCooldownMs: 180000
  }
};
