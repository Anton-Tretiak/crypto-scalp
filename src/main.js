import './styles/base.css';
import './styles/screener.css';
import './styles/deep.css';
import './styles/inplay.css';
import { initScreener } from './screener/index.js';
import { initInPlay } from './inplay/index.js';
import { initDeep } from './deep/index.js';
import { on } from './lib/bus.js';
import { load, save } from './lib/storage.js';

const $ = id => document.getElementById(id);
const TABS = {
  screener: { btn: 'tabBtnScreener', panel: 'tab-screener' },
  inplay: { btn: 'tabBtnInplay', panel: 'tab-inplay' },
  deep: { btn: 'tabBtnDeep', panel: 'tab-deep' }
};
const ctl = { deep: initDeep(), inplay: initInPlay() };
initScreener();

function setTab(name) {
  if (!TABS[name]) name = 'screener';
  Object.entries(TABS).forEach(([k, t]) => {
    $(t.btn).setAttribute('aria-selected', String(k === name));
    $(t.panel).hidden = k !== name;
  });
  save('ui:tab', name);
  Object.entries(ctl).forEach(([k, c]) => { if (k === name) c.activate(); else c.deactivate(); });
}
Object.entries(TABS).forEach(([k, t]) => $(t.btn).addEventListener('click', () => setTab(k)));
on('deep:open', ({ symbol }) => { setTab('deep'); ctl.deep.open(symbol); });
setTab(load('ui:tab', 'screener'));
