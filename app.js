const $ = (selector) => document.querySelector(selector);
const sliders = [$('#redSlider'), $('#greenSlider'), $('#blueSlider')];
const outputs = [$('#redValue'), $('#greenValue'), $('#blueValue')];
const targetOrb = $('#targetOrb');
const guessOrb = $('#guessOrb');
const liveMatch = $('#liveMatch');
const resultDialog = $('#resultDialog');

const state = {
  round: 1,
  score: 0,
  streak: 0,
  target: [0, 0, 0],
  muted: localStorage.getItem('chroma-muted') === 'true',
  best: Number(localStorage.getItem('chroma-best')) || 0,
};

let audioContext;
let installPrompt;

function rgb(values) { return `rgb(${values.join(', ')})`; }
function hex(values) { return `#${values.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`; }
function guess() { return sliders.map((slider) => Number(slider.value)); }

function similarity(a, b) {
  const distance = Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
  return Math.max(0, Math.round((1 - distance / Math.sqrt(3 * 255 ** 2)) * 100));
}

function updateGuess() {
  const values = guess();
  guessOrb.style.backgroundColor = rgb(values);
  sliders.forEach((slider, index) => {
    outputs[index].value = slider.value;
    slider.style.setProperty('--fill', `${(slider.value / 255) * 100}%`);
  });
  const match = similarity(state.target, values);
  liveMatch.textContent = state.round ? `${match}%` : '—';
}

function generateTarget() {
  // Avoid targets that are nearly white/black or visually muddy.
  let candidate;
  do {
    candidate = Array.from({ length: 3 }, () => 24 + Math.floor(Math.random() * 208));
  } while (Math.max(...candidate) - Math.min(...candidate) < 42);
  state.target = candidate;
  targetOrb.style.backgroundColor = rgb(candidate);
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
  const result = similarity(state.target, values);
  const points = result * (state.streak + 1);
  state.score += points;
  state.streak = result >= 90 ? state.streak + 1 : 0;

  let title = 'Keep tuning';
  let copy = 'Every round sharpens your eye. Look for the strongest channel first.';
  if (result >= 98) { title = 'Nearly perfect'; copy = 'That is an exceptional match. Your colour instinct is dialled in.'; }
  else if (result >= 90) { title = 'Beautiful match'; copy = 'That was seriously close. Your eye for colour is warming up.'; }
  else if (result >= 78) { title = 'Nice read'; copy = 'You caught the character of the colour. A little fine-tuning will close the gap.'; }

  $('#resultScore').textContent = result;
  $('#resultTitle').textContent = title;
  $('#resultCopy').textContent = copy;
  $('#resultTarget').style.backgroundColor = rgb(state.target);
  $('#resultGuess').style.backgroundColor = rgb(values);
  $('#targetHex').textContent = hex(state.target);
  $('#guessHex').textContent = hex(values);
  $('#resultGlow').style.backgroundColor = rgb(state.target);
  $('#resultGlow').style.boxShadow = `0 0 45px 8px ${rgb(state.target)}`;
  $('#scoreCount').textContent = state.score.toLocaleString();

  const finalRound = state.round === 10;
  $('#resultEyebrow').textContent = finalRound ? 'GAME COMPLETE' : 'ROUND COMPLETE';
  $('#nextButton span').textContent = finalRound ? 'Play again' : 'Next round';

  if (finalRound && state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('chroma-best', state.best);
    $('#bestCount').textContent = state.best.toLocaleString();
  }

  result >= 90 ? (tone(740, .16), vibrate([18, 35, 18])) : (tone(280), vibrate(24));
  resultDialog.showModal();
}

function nextRound() {
  resultDialog.close();
  if (state.round === 10) {
    state.round = 1;
    state.score = 0;
    state.streak = 0;
    $('#scoreCount').textContent = '0';
  } else {
    state.round += 1;
  }
  $('#roundCount').textContent = state.round;
  $('#streakBadge').hidden = state.streak < 2;
  $('#streakCount').textContent = state.streak;
  generateTarget();
  sliders.forEach((slider) => { slider.value = 128; });
  updateGuess();
}

sliders.forEach((slider) => slider.addEventListener('input', updateGuess));
$('#checkButton').addEventListener('click', showResult);
$('#nextButton').addEventListener('click', nextRound);
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
$('#bestCount').textContent = state.best ? state.best.toLocaleString() : '—';
generateTarget();
updateGuess();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
