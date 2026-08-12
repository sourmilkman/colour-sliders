const $ = (selector) => document.querySelector(selector);
const targetOrb = $('#targetOrb');
const guessOrb = $('#guessOrb');
const liveMatch = $('#liveMatch');
const resultDialog = $('#resultDialog');
const settingsDialog = $('#settingsDialog');
const sliders = [$('#redSlider'), $('#yellowSlider'), $('#blueSlider'), $('#whiteSlider'), $('#blackSlider')];
const outputs = [$('#redValue'), $('#yellowValue'), $('#blueValue'), $('#whiteValue'), $('#blackValue')];

const state = {
  round: 1,
  scores: [],
  streak: 0,
  target: [0, 0, 0],
  easyMode: localStorage.getItem('chroma-easy-mode') === 'true',
  muted: localStorage.getItem('chroma-muted') === 'true',
  best: Number(localStorage.getItem('chroma-best-average')) || 0,
};

let audioContext;
let installPrompt;

function rgb(values) { return `rgb(${values.join(', ')})`; }
function hex(values) { return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`; }
function average() { return state.scores.length ? Math.round(state.scores.reduce((sum, value) => sum + value, 0) / state.scores.length) : 0; }

function cubic(t, a, b) {
  const weight = t * t * (3 - 2 * t);
  return a + weight * (b - a);
}

function rybToRgb([red, yellow, blue, white, black]) {
  const r = red / 100;
  const y = yellow / 100;
  const b = blue / 100;
  const channel = (corners) => {
    const pale = cubic(b, corners[0], corners[1]);
    const yellowed = cubic(b, corners[2], corners[3]);
    const reddened = cubic(b, corners[4], corners[5]);
    const dark = cubic(b, corners[6], corners[7]);
    return cubic(r, cubic(y, pale, yellowed), cubic(y, reddened, dark));
  };
  const mixed = [
    channel([1, .163, 1, 0, 1, .5, 1, .2]),
    channel([1, .373, 1, .66, 0, .094, .5, .2]),
    channel([1, .6, 0, .2, 0, .5, 0, 0]),
  ];
  const tint = white / 100;
  const shade = black / 100;
  return mixed.map((value) => Math.round(cubic(shade, cubic(tint, value, 1), 0) * 255));
}

function guess() { return rybToRgb(sliders.map((slider) => Number(slider.value))); }

function accuracy(a, b) {
  const distance = Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
  const maximumDistance = Math.sqrt(3 * 255 ** 2);
  return Math.max(0, Math.min(100, Math.round((1 - distance / maximumDistance) * 100)));
}

function renderSliders() {
  sliders.forEach((slider) => { slider.value = 0; });
  updateGuess();
}

function updateGuess() {
  sliders.forEach((slider, index) => {
    outputs[index].value = slider.value;
    slider.style.setProperty('--fill', `${slider.value}%`);
  });
  const values = guess();
  guessOrb.style.backgroundColor = rgb(values);
  liveMatch.textContent = `${accuracy(state.target, values)}%`;
}

function generateTarget() {
  let recipe;
  let candidate;
  do {
    recipe = [
      Math.floor(Math.random() * 101),
      Math.floor(Math.random() * 101),
      Math.floor(Math.random() * 101),
      Math.floor(Math.random() * 36),
      Math.floor(Math.random() * 36),
    ];
    candidate = rybToRgb(recipe);
  } while (Math.max(...candidate) - Math.min(...candidate) < 28 || Math.max(...candidate) < 48);
  state.target = candidate;
  targetOrb.style.backgroundColor = rgb(state.target);
}

function setEasyMode(enabled) {
  state.easyMode = enabled;
  localStorage.setItem('chroma-easy-mode', String(enabled));
  $('#easyModeToggle').checked = enabled;
  $('#matchMeter').classList.toggle('easy-mode', enabled);
  $('#matchMeter').setAttribute('aria-hidden', String(!enabled));
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
sliders.forEach((slider) => {
  slider.addEventListener('input', updateGuess);
  slider.addEventListener('change', updateGuess);
});
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

$('#soundButton').classList.toggle('muted', state.muted);
$('#bestCount').textContent = state.best ? `${state.best}%` : '—';
setEasyMode(state.easyMode);
generateTarget();
renderSliders();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
