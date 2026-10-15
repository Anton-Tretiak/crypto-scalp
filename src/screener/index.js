import { emit } from '../lib/bus.js';
import { state, saveSettings, savePins } from './state.js';
import { runScan } from './scan.js';
import { render, setStatus, updateStatus, showError, clearError } from './view.js';

const $ = id => document.getElementById(id);
const SUBS = {
  futures: 'Binance USDT-M perpetuals, ranked by liquidity and activity right now',
  spot: 'Binance spot USDT pairs, ranked by liquidity and activity right now'
};

function schedule() { state.nextAt = state.refreshMin > 0 ? Date.now() + state.refreshMin * 60000 : 0; }

export async function scan() {
  if (state.scanning) { state.pending = true; return; }
  state.scanning = true;
  $('scanBtn').disabled = true;
  clearError();
  setStatus('Loading market data…');
  const market = state.market;
  try {
    const res = await runScan(
      { market, minVol: state.minVol, topN: state.topN, pins: state.pins },
      (done, total) => setStatus(`Scanning ${done} of ${total} coins…`)
    );
    if (market === state.market) {
      state.prev = {};
      if (state.rowsMarket === market) state.rows.forEach(r => { state.prev[r.symbol] = r.score; });
      state.rows = res.rows;
      state.rowsMarket = market;
      state.scannedOf = res.scannedOf;
      state.lastAt = new Date();
      render();
      emit('scan:done', { market, rows: state.rows });
    }
  } catch (e) {
    showError(e);
  } finally {
    state.scanning = false;
    $('scanBtn').disabled = false;
    schedule();
    updateStatus();
    if (state.pending) { state.pending = false; scan(); }
  }
}

function syncControls() {
  document.querySelectorAll('[data-market]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.market === state.market)));
  $('sub').textContent = SUBS[state.market];
  $('minVol').value = String(state.minVol);
  $('topN').value = String(state.topN);
  $('refresh').value = String(state.refreshMin);
}

export function initScreener() {
  syncControls();
  document.querySelectorAll('[data-market]').forEach(b => b.addEventListener('click', () => {
    if (state.market === b.dataset.market) return;
    state.market = b.dataset.market;
    if (state.market === 'spot' && state.minVol > 10e6) state.minVol = 10e6;
    if (state.market === 'futures' && state.minVol < 20e6) state.minVol = 20e6;
    saveSettings(); syncControls(); scan();
  }));
  $('minVol').addEventListener('change', e => { state.minVol = +e.target.value; saveSettings(); scan(); });
  $('topN').addEventListener('change', e => { state.topN = +e.target.value; saveSettings(); scan(); });
  $('refresh').addEventListener('change', e => { state.refreshMin = +e.target.value; saveSettings(); schedule(); updateStatus(); });
  $('scanBtn').addEventListener('click', scan);
  $('search').addEventListener('input', e => { state.search = e.target.value; render(); });
  $('pinnedOnly').addEventListener('change', e => { state.pinnedOnly = e.target.checked; render(); });
  $('tbl').addEventListener('click', e => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      const k = s.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'symbol' ? 1 : -1) };
      render(); return;
    }
    const p = e.target.closest('[data-pin]');
    if (p) {
      const sym = p.dataset.pin;
      if (state.pins.has(sym)) state.pins.delete(sym); else state.pins.add(sym);
      savePins(); render();
    }
  });
  // Auto-refresh loop. Browsers throttle hidden tabs, so catch up when the tab becomes visible again.
  setInterval(() => {
    if (state.nextAt && !state.scanning && Date.now() >= state.nextAt) scan();
    else updateStatus();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.nextAt && Date.now() >= state.nextAt && !state.scanning) scan();
  });
  render();
  scan();
}
