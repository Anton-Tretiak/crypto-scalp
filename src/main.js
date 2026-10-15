import './styles/base.css';
import './styles/screener.css';
import './styles/deep.css';
import { initScreener } from './screener/index.js';
import { initDeep } from './deep/index.js';
import { load, save } from './lib/storage.js';

const $ = id => document.getElementById(id);
const deep = initDeep();
initScreener();

function setTab(name) {
  const isDeep = name === 'deep';
  $('tabBtnScreener').setAttribute('aria-selected', String(!isDeep));
  $('tabBtnDeep').setAttribute('aria-selected', String(isDeep));
  $('tab-screener').hidden = isDeep;
  $('tab-deep').hidden = !isDeep;
  save('ui:tab', name);
  if (isDeep) deep.activate(); else deep.deactivate();
}
$('tabBtnScreener').addEventListener('click', () => setTab('screener'));
$('tabBtnDeep').addEventListener('click', () => setTab('deep'));
setTab(load('ui:tab', 'screener'));
