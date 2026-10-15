import { CONFIG } from '../config.js';
import { emit } from '../lib/bus.js';
import { state as screener } from '../screener/state.js';
import { P, saveSettings } from './state.js';
import { runInPlay, rescore } from './scan.js';
import { COLS, render, setStatus, updateStatus } from './view.js';

const $ = id => document.getElementById(id);

/** Market and minimum volume follow the screener header; the scan runs only while the tab is open. */
function due() {
  if (!P.active || P.scanning) return false;
  const since = Date.now() - (P.triedAt || 0);
  if (P.market !== screener.market || P.minVol !== screener.minVol) return since >= (P.error ? 60000 : 5000);
  return since >= CONFIG.inplay.refreshMin * 60000;
}

async function scan() {
  if (P.scanning) return;
  P.scanning = true; P.triedAt = Date.now();
  $('ipBtn').disabled = true;
  const market = screener.market, minVol = screener.minVol, T = P.T;
  setStatus('Загружаем рынок…');
  try {
    const res = await runInPlay({ market, minVol, topN: P.topN, pins: screener.pins, T },
      (done, total) => setStatus(`Разбираем ${done} из ${total} монет: 5-минутные свечи за 3,5 дня и дневные за 2 недели…`));
    Object.assign(P, { rows: res.rows, scannedOf: res.scannedOf, market, minVol, lastAt: new Date(), error: null });
    if (P.T !== T) P.rows = rescore(P.rows, { market, T: P.T });
  } catch (e) {
    P.error = e.message;
  } finally {
    P.scanning = false;
    $('ipBtn').disabled = false;
    render();
  }
}

function syncControls() {
  $('ipT').value = String(P.T);
  $('ipN').value = String(P.topN);
}

export function initInPlay() {
  syncControls();
  $('ipBtn').addEventListener('click', scan);
  $('ipT').addEventListener('change', e => {
    P.T = +e.target.value; saveSettings();
    if (P.rows.length) { P.rows = rescore(P.rows, { market: P.market, T: P.T }); render(); }
  });
  $('ipN').addEventListener('change', e => { P.topN = +e.target.value; saveSettings(); scan(); });
  $('tab-inplay').addEventListener('click', e => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      const k = s.dataset.sort, col = COLS.find(c => c.key === k);
      P.sort = { key: k, dir: P.sort.key === k ? -P.sort.dir : (k === 'symbol' || col.asc ? 1 : -1) };
      render(); return;
    }
    const o = e.target.closest('[data-open]');
    if (o) emit('deep:open', { symbol: o.dataset.open });
  });
  setInterval(() => { if (due()) scan(); else if (P.active) updateStatus(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && due()) scan(); });
  render();

  return {
    activate() { P.active = true; if (due()) scan(); else render(); },
    deactivate() { P.active = false; }
  };
}
