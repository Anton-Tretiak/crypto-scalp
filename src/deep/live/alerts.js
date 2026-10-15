import { CONFIG } from '../../config.js';

let audio = null, hideTimer = null;
const last = {};

export function beep() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.18);
  } catch (e) { /* audio unavailable */ }
}

/** Shows the alert bar (and beeps if enabled) at most once per key per cooldown. */
export function alertOnce(key, text, withSound) {
  const now = Date.now();
  if (last[key] && now - last[key] < CONFIG.deep.alertCooldownMs) return;
  last[key] = now;
  const bar = document.getElementById('dAlertBar');
  bar.textContent = text; bar.classList.add('show');
  clearTimeout(hideTimer); hideTimer = setTimeout(() => bar.classList.remove('show'), 12000);
  if (withSound) beep();
}
