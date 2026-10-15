import { CONFIG } from '../config.js';
import { load, save } from '../lib/storage.js';

/** Mutable state of the deep-analysis tab. Per-coin data lives in D.data[symbol]. */
export const D = {
  ...CONFIG.deep.defaults,
  ...load('deep:settings', {}),
  coins: [],         // symbols shown as chips
  manual: new Set(), // coins added by hand (kept when the top-5 changes)
  data: {},          // symbol -> coin analysis object (see CLAUDE.md "Coin object")
  failed: {},
  sel: null,
  market: null,
  loading: false,
  active: false,
  stream: null,
  timers: []
};
export function saveSettings() { save('deep:settings', { T: D.T, W: D.W, alerts: D.alerts, autoTop: D.autoTop }); }
