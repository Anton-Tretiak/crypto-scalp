import { CONFIG } from '../config.js';
import { load, save } from '../lib/storage.js';

const saved = load('screener:settings', {});
let legacyPins = [];
try { legacyPins = JSON.parse(localStorage.getItem('scalpScreenerPins') || '[]'); } catch (e) { /* ignore */ }

/** Single mutable state object for the screener tab. */
export const state = {
  ...CONFIG.screener.defaults,
  ...saved,
  rows: [],            // scored coins from the last scan
  rowsMarket: null,    // market the rows belong to
  prev: {},            // symbol -> score from the previous scan
  sort: { key: 'score', dir: -1 },
  search: '',
  pinnedOnly: false,
  pins: new Set(load('screener:pins', legacyPins)),
  scanning: false,
  pending: false,
  nextAt: 0,
  lastAt: null,
  scannedOf: 0
};

export function saveSettings() {
  save('screener:settings', { market: state.market, minVol: state.minVol, topN: state.topN, refreshMin: state.refreshMin });
}
export function savePins() { save('screener:pins', [...state.pins]); }

/** Top-N symbols by score from the latest scan. */
export function topSymbols(n) {
  return state.rows.slice().sort((a, b) => b.score - a.score).slice(0, n).map(r => r.symbol);
}
