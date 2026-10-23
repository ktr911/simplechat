const BPM = 120;
const STEP_SEC = 60 / BPM / 4; // 16分音符1つ分の長さ

const stage = document.getElementById('stage');
const danceButtons = document.querySelectorAll('.dance-btn');
const musicButton = document.getElementById('music');

let currentDance = 'sway';
let interacting = false; // なでられている間と見送りの間は true

// ステージのクラスを付け替え、アニメーションを最初から始め直す
function setStageMode(mode) {
  stage.className = 'stage';
  void stage.offsetWidth; // クラスを外した状態を一度反映させる
  stage.classList.add(mode);
  if (affection >= 100) stage.classList.add('lv-max');
}

// ---- 踊りの切り替え ----

function setDance(name) {
  currentDance = name;
  danceButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.dance === name));
  });
  if (!interacting) setStageMode('dance-' + name);
}

danceButtons.forEach((btn) => {
  btn.addEventListener('click', () => setDance(btn.dataset.dance));
});

// ---- 音楽（Web Audio API で音を生成） ----

// 1小節 = 16ステップ、2小節でループ
const KICK = [0, 4, 8, 12, 16, 20, 24, 28];
const HIHAT = [2, 6, 10, 14, 18, 22, 26, 30];
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;
const MELODY = [
  C5, null, E5, null, G5, null, E5, null, A5, null, G5, null, E5, null, D5, null,
  C5, null, D5, null, E5, null, G5, null, E5, null, D5, null, C5, null, null, null,
];
const LOOP_STEPS = MELODY.length;

let ctx = null;
let master = null;
let noiseBuffer = null;
let timerId = null;
let nextStepTime = 0;
let step = 0;

function setupAudio() {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function playKick(time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  osc.connect(gain).connect(master);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playHihat(time) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noiseBuffer;
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(filter).connect(gain).connect(master);
  src.start(time);
  src.stop(time + 0.06);
}

function playNote(freq, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  osc.connect(gain).connect(master);
  osc.start(time);
  osc.stop(time + 0.2);
}

// 少し先までの音を予約しておき、タイマーのずれで音が乱れないようにする
function scheduler() {
  while (nextStepTime < ctx.currentTime + 0.1) {
    if (KICK.includes(step)) playKick(nextStepTime);
    if (HIHAT.includes(step)) playHihat(nextStepTime);
    if (MELODY[step]) playNote(MELODY[step], nextStepTime);
    nextStepTime += STEP_SEC;
    step = (step + 1) % LOOP_STEPS;
  }
}

async function startMusic() {
  if (!ctx) setupAudio();
  await ctx.resume();
  step = 0;
  nextStepTime = ctx.currentTime + 0.05;
  scheduler();
  timerId = setInterval(scheduler, 25);
  setTimeout(() => setDance(currentDance), 50); // 曲の頭と踊りの頭をそろえる
  musicButton.textContent = '♪ 音楽 OFF';
  musicButton.setAttribute('aria-pressed', 'true');
}

function stopMusic() {
  clearInterval(timerId);
  timerId = null;
  ctx.suspend();
  musicButton.textContent = '♪ 音楽 ON';
  musicButton.setAttribute('aria-pressed', 'false');
}

musicButton.addEventListener('click', () => {
  if (timerId) stopMusic();
  else startMusic();
});

function isMusicOn() {
  return timerId !== null;
}

function playChirp() {
  const time = ctx.currentTime;
  [1318.5, 1760].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = time + i * 0.07;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.12);
  });
}

// ---- なかよし度 ----

const STORAGE_KEY = 'clawd-affection';
const LEVELS = [
  { at: 30, message: 'なかよしになった！ 新しい反応: 手をふって見送る' },
  { at: 60, message: 'もっとなかよしになった！ 新しい反応: くるっと回っておじぎ' },
  { at: 100, message: '大好きになった！ ふだんからほっぺがピンクに' },
];

const gauge = document.getElementById('gauge');
const gaugeFill = document.getElementById('gauge-fill');
const affectionValue = document.getElementById('affection-value');
const levelMessage = document.getElementById('level-message');

let affection = loadAffection();
let messageTimer = null;

function loadAffection() {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.floor(n))) : 0;
  } catch (e) {
    return 0;
  }
}

function saveAffection() {
  try {
    localStorage.setItem(STORAGE_KEY, String(affection));
  } catch (e) {
    // 保存できない環境でも、その場では動き続ける
  }
}

function renderAffection() {
  gaugeFill.style.width = affection + '%';
  affectionValue.textContent = affection;
  gauge.setAttribute('aria-valuenow', String(affection));
  stage.classList.toggle('lv-max', affection >= 100);
}

function showMessage(text) {
  levelMessage.textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { levelMessage.textContent = ''; }, 4000);
}

function addAffection() {
  if (affection >= 100) return;
  const before = affection;
  affection += 1;
  saveAffection();
  renderAffection();
  const reached = LEVELS.find((lv) => before < lv.at && affection >= lv.at);
  if (reached) showMessage(reached.message);
}

// ---- なでる ----

const clawd = stage.querySelector('.clawd');
const svg = stage.querySelector('svg');
const heartsLayer = document.getElementById('hearts');

const MIN_SWING_PX = 15; // これより短い動きは往復として数えない
const HAPPY_LINGER_MS = 1500; // 手を離してから見送りを始めるまで
const WAVE_MS = 1800;
const BOW_MS = 2000;

let pointerId = null;
let lastX = 0;
let direction = 0; // 1: 右へ, -1: 左へ
let swing = 0; // 今の向きに動いた距離
let reversals = 0; // 向きが変わった回数（2回で1往復）
let petting = false;
let afterTimers = [];

function clearAfterTimers() {
  afterTimers.forEach(clearTimeout);
  afterTimers = [];
}

function later(fn, ms) {
  afterTimers.push(setTimeout(fn, ms));
}

// 画面上の距離を SVG の座標の距離に直す
function toSvgUnits(px) {
  return px * (svg.viewBox.baseVal.width / svg.getBoundingClientRect().width);
}

const HEART_PIXELS = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

function spawnHeart() {
  const ns = 'http://www.w3.org/2000/svg';
  const outer = document.createElementNS(ns, 'g');
  const x = 30 + Math.random() * 70;
  const y = -14 - Math.random() * 10;
  outer.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  const heart = document.createElementNS(ns, 'g');
  heart.setAttribute('class', 'heart');
  HEART_PIXELS.forEach((row, r) => {
    [...row].forEach((c, col) => {
      if (c !== 'X') return;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', col * 3);
      rect.setAttribute('y', r * 3);
      rect.setAttribute('width', 3);
      rect.setAttribute('height', 3);
      heart.appendChild(rect);
    });
  });
  outer.appendChild(heart);
  heartsLayer.appendChild(outer);
  heart.addEventListener('animationend', () => outer.remove());
  setTimeout(() => outer.remove(), 2000); // アニメーションが止められている環境向け
}

function startPetting() {
  petting = true;
  interacting = true;
  clearAfterTimers();
  setStageMode('petting');
}

function onStroke() {
  addAffection();
  spawnHeart();
  if (isMusicOn()) playChirp();
}

// 手を離したあと: 少し喜びを残し、段階に応じて見送ってから踊りに戻る
function finishPetting() {
  petting = false;
  setStageMode('happy');
  const steps = [];
  if (affection >= 60) steps.push(['farewell-bow', BOW_MS]);
  if (affection >= 30) steps.push(['farewell-wave', WAVE_MS]);
  let t = HAPPY_LINGER_MS;
  steps.forEach(([mode, ms]) => {
    later(() => setStageMode(mode), t);
    t += ms;
  });
  later(() => {
    interacting = false;
    setDance(currentDance);
  }, t);
}

clawd.addEventListener('pointerdown', (e) => {
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  svg.setPointerCapture(pointerId);
  lastX = e.clientX;
  direction = 0;
  swing = 0;
  reversals = 0;
  e.preventDefault();
});

svg.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  const dx = toSvgUnits(e.clientX - lastX);
  lastX = e.clientX;
  if (dx === 0) return;
  const dir = dx > 0 ? 1 : -1;
  if (dir === direction) {
    swing += Math.abs(dx);
    return;
  }
  if (direction !== 0 && swing >= MIN_SWING_PX) {
    reversals += 1;
    if (!petting && reversals >= 2) startPetting();
    if (petting && reversals % 2 === 0) onStroke();
  }
  direction = dir;
  swing = Math.abs(dx);
});

function endPointer(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  if (petting) finishPetting();
}

svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

// ---- リセット ----

const resetButton = document.getElementById('reset');
const resetConfirm = document.getElementById('reset-confirm');

resetButton.addEventListener('click', () => {
  resetButton.hidden = true;
  resetConfirm.hidden = false;
});

document.getElementById('reset-no').addEventListener('click', () => {
  resetConfirm.hidden = true;
  resetButton.hidden = false;
});

document.getElementById('reset-yes').addEventListener('click', () => {
  affection = 0;
  saveAffection();
  renderAffection();
  resetConfirm.hidden = true;
  resetButton.hidden = false;
});

renderAffection();
