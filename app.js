const $ = (selector) => document.querySelector(selector);
const targetOrb = $('#targetOrb');
const guessOrb = $('#guessOrb');
const liveMatch = $('#liveMatch');
const resultDialog = $('#resultDialog');
const settingsDialog = $('#settingsDialog');

const MODELS = {
  hsv: [
    { key: 'h', label: 'Hue', short: 'H', max: 360, value: 0, color: '#ff6b8a' },
    { key: 's', label: 'Saturation', short: 'S', max: 100, value: 0, color: '#b68cff' },
    { key: 'v', label: 'Value', short: 'V', max: 100, value: 100, color: '#f6f1e8' },
  ],
  rgb: [
    { key: 'r', label: 'Red', short: 'R', max: 255, value: 0, color: '#ff5c72' },
    { key: 'g', label: 'Green', short: 'G', max: 255, value: 0, color: '#65dc91' },
    { key: 'b', label: 'Blue', short: 'B', max: 255, value: 0, color: '#6f8cff' },
  ],
  cmyk: [
    { key: 'c', label: 'Cyan', short: 'C', max: 100, value: 0, color: '#49d9e8' },
    { key: 'm', label: 'Magenta', short: 'M', max: 100, value: 0, color: '#f45bb4' },
    { key: 'y', label: 'Yellow', short: 'Y', max: 100, value: 0, color: '#ffd84d' },
    { key: 'k', label: 'Black', short: 'K', max: 100, value: 0, color: '#77727f' },
  ],
};

const state = {
  round: 1,
  scores: [],
  streak: 0,
  target: [0, 0, 0],
  values: {},
  model: localStorage.getItem('chroma-model') || 'hsv',
  easyMode: localStorage.getItem('chroma-easy-mode') === 'true',
  muted: localStorage.getItem('chroma-muted') === 'true',
  best: Number(localStorage.getItem('chroma-best-average')) || 0,
};

let audioContext;
let installPrompt;

function rgb(values) { return `rgb(${values.join(', ')})`; }
function hex(values) { return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`; }
function average() { return state.scores.length ? Math.round(state.scores.reduce((sum, value) => sum + value, 0) / state.scores.length) : 0; }

function hsvToRgb([h, s, v]) {
  const saturation = s / 100;
  const value = v / 100;
  const chroma = value * saturation;
  const section = (h % 360) / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const channels = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const offset = value - chroma;
  return channels.map((channel) => Math.round((channel + offset) * 255));
}

function cmykToRgb([c, m, y, k]) {
  return [c, m, y].map((channel) => Math.round(255 * (1 - channel / 100) * (1 - k / 100)));
}

function guess() {
  const values = MODELS[state.model].map(({ key }) => state.values[key]);
  if (state.model === 'hsv') return hsvToRgb(values);
  if (state.model === 'cmyk') return cmykToRgb(values);
  return values;
}

function rgbToLab(values) {
  const linear = values.map((value) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * .4124 + linear[1] * .3576 + linear[2] * .1805) / .95047;
  const y = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  const z = (linear[0] * .0193 + linear[1] * .1192 + linear[2] * .9505) / 1.08883;
  const curve = (value) => value > .008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116);
  const [fx, fy, fz] = [x, y, z].map(curve);
  return [(116 * fy) - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function accuracy(a, b) {
  const labA = rgbToLab(a);
  const labB = rgbToLab(b);
  const deltaE = Math.sqrt(labA.reduce((sum, value, index) => sum + (value - labB[index]) ** 2, 0));
  return Math.max(0, Math.min(100, Math.round(100 - deltaE * 10)));
}

function renderSliders() {
  state.values = {};
  $('#modelSliders').innerHTML = MODELS[state.model].map((control) => {
    state.values[control.key] = control.value;
    return `<label class="slider-row" style="--channel:${control.color}">
      <span class="channel"><i>${control.short}</i><b>${control.label}</b></span>
      <input data-key="${control.key}" type="range" min="0" max="${control.max}" value="${control.value}" aria-label="${control.label}">
      <output>${control.value}</output>
    </label>`;
  }).join('');
  $('#modelSliders').querySelectorAll('input').forEach((slider) => slider.addEventListener('input', updateGuess));
  $('#modelHint').textContent = `Tune ${state.model.toUpperCase()} to match the target`;
  updateGuess();
}

function updateGuess(event) {
  if (event) state.values[event.target.dataset.key] = Number(event.target.value);
  $('#modelSliders').querySelectorAll('input').forEach((slider) => {
    const output = slider.parentElement.querySelector('output');
    output.value = slider.value;
    slider.style.setProperty('--fill', `${Number(slider.value) / Number(slider.max) * 100}%`);
  });
  const values = guess();
  guessOrb.style.backgroundColor = rgb(values);
  liveMatch.textContent = `${accuracy(state.target, values)}%`;
}

function generateTarget() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 32 + Math.floor(Math.random() * 64);
  const value = 38 + Math.floor(Math.random() * 59);
  state.target = hsvToRgb([hue, saturation, value]);
  targetOrb.style.backgroundColor = rgb(state.target);
}

function setEasyMode(enabled) {
  state.easyMode = enabled;
  localStorage.setItem('chroma-easy-mode', String(enabled));
  $('#easyModeToggle').checked = enabled;
  $('#matchMeter').classList.toggle('easy-mode', enabled);
}

function tone(frequency, duration = .09) {
  if (state.muted) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function vibrate(pattern) { if ('vibrate' in navigator) navigator.vibrate(pattern); }

function showResult() {
  const values = guess();
  const result = accuracy(state.target, values);
  state.scores.push(result);
  state.streak = result >= 90 ? state.streak + 1 : 0;

  let title = 'Keep tuning';
  let copy = 'Every round sharpens your eye. Look for the biggest difference first.';
  if (result >= 98) { title = 'Nearly perfect'; copy = 'That is an exceptional match. Your colour instinct is dialled in.'; }
  else if (result >= 90) { title = 'Beautiful match'; copy = 'That was seriously close. Your eye for colour is warming up.'; }
  else if (result >= 78) { title = 'Nice read'; copy = 'You caught the character of the colour. A little fine-tuning will close the gap.'; }

  $('#resultScore').textContent = result;
  $('#resultAverage').textContent = `${average()}%`;
  $('#resultTitle').textContent = title;
  $('#resultCopy').textContent = copy;
  $('#resultTarget').style.backgroundColor = rgb(state.target);
  $('#resultGuess').style.backgroundColor = rgb(values);
  $('#targetHex').textContent = hex(state.target);
  $('#guessHex').textContent = hex(values);
  $('#resultGlow').style.backgroundColor = rgb(state.target);
  $('#resultGlow').style.boxShadow = `0 0 45px 8px ${rgb(state.target)}`;
  $('#scoreCount').textContent = `${average()}%`;

  const finalRound = state.round === 10;
  $('#resultEyebrow').textContent = finalRound ? 'GAME COMPLETE' : 'ROUND COMPLETE';
  $('#nextButton span').textContent = finalRound ? 'Play again' : 'Next round';
  if (finalRound && average() > state.best) {
    state.best = average();
    localStorage.setItem('chroma-best-average', state.best);
    $('#bestCount').textContent = `${state.best}%`;
  }

  result >= 90 ? (tone(740, .16), vibrate([18, 35, 18])) : (tone(280), vibrate(24));
  resultDialog.showModal();
}

function nextRound() {
  resultDialog.close();
  if (state.round === 10) {
    state.round = 1;
    state.scores = [];
    state.streak = 0;
    $('#scoreCount').textContent = '0%';
  } else {
    state.round += 1;
  }
  $('#roundCount').textContent = state.round;
  $('#streakBadge').hidden = state.streak < 2;
  $('#streakCount').textContent = state.streak;
  generateTarget();
  renderSliders();
}

$('#checkButton').addEventListener('click', showResult);
$('#nextButton').addEventListener('click', nextRound);
$('#settingsButton').addEventListener('click', () => settingsDialog.showModal());
$('#easyModeToggle').addEventListener('change', (event) => setEasyMode(event.target.checked));
document.querySelectorAll('[name="colourModel"]').forEach((input) => input.addEventListener('change', (event) => {
  state.model = event.target.value;
  localStorage.setItem('chroma-model', state.model);
  renderSliders();
}));
$('#soundButton').addEventListener('click', () => {
  state.muted = !state.muted;
  localStorage.setItem('chroma-muted', state.muted);
  $('#soundButton').classList.toggle('muted', state.muted);
  $('#soundButton').setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
  if (!state.muted) tone(520);
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('#installButton').hidden = false;
});
$('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installButton').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#installButton').hidden = true; });

if (!MODELS[state.model]) state.model = 'hsv';
$(`[name="colourModel"][value="${state.model}"]`).checked = true;
$('#soundButton').classList.toggle('muted', state.muted);
$('#bestCount').textContent = state.best ? `${state.best}%` : '—';
setEasyMode(state.easyMode);
generateTarget();
renderSliders();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
