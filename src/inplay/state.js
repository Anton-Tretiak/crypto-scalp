import { CONFIG } from '../config.js';
import { load, save } from '../lib/storage.js';

/** Mutable state of the "In play" tab. Market and minimum volume come from the screener header. */
export const P = {
  ...CONFIG.inplay.defaults,
  ...load('inplay:settings', {}),
  rows: [],          // scored coins from the last scan (with raw bars in _b5/_days)
  market: null,      // market the rows belong to
  minVol: null,      // minimum volume the rows were scanned with
  scannedOf: 0,
  lastAt: null,
  error: null,       // message of the last failed scan
  triedAt: 0,        // start time of the last scan attempt
  scanning: false,
  active: false,
  sort: { key: 'score', dir: -1 }
};
export function saveSettings() { save('inplay:settings', { T: P.T, topN: P.topN }); }
