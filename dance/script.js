const BPM = 120;
const STEP_SEC = 60 / BPM / 4; // 16分音符1つ分の長さ

const stage = document.getElementById('stage');
const danceButtons = document.querySelectorAll('.dance-btn');
const musicButton = document.getElementById('music');

let currentDance = 'sway';

// ---- 踊りの切り替え ----

function setDance(name) {
  currentDance = name;
  stage.className = 'stage';
  void stage.offsetWidth; // クラスを外した状態を一度反映させ、アニメーションを最初から始め直す
  stage.classList.add('dance-' + name);
  danceButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.dance === name));
  });
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
