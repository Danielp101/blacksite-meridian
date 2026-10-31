import { createGame, fireWeapon, restartGame, startReload, stepGame } from './simulation.js';
import { Renderer } from './renderer.js';
import { GameAudio, unlockAudioSafely } from './audio.js';
import { submitScore } from './score-api.js';
import { keyboardTurn } from './input.js';

const canvas = document.querySelector('#game-canvas');
const shell = document.querySelector('#game-shell');
const briefing = document.querySelector('#briefing');
const pausePanel = document.querySelector('#pause-panel');
const gameoverPanel = document.querySelector('#gameover-panel');
const hud = document.querySelector('#hud');
const startButton = document.querySelector('#start-button');
const resumeButton = document.querySelector('#resume-button');
const restartButton = document.querySelector('#restart-button');
const pauseMessage = document.querySelector('#pause-message');
const damageFlash = document.querySelector('#damage-flash');
const hitMarker = document.querySelector('#hit-marker');
const waveNotice = document.querySelector('#wave-notice');
const statusLive = document.querySelector('#status-live');
const playerNameInput = document.querySelector('#player-name');
const scoreSubmitStatus = document.querySelector('#score-submit-status');

const renderer = new Renderer(canvas);
const audio = new GameAudio();
let state = createGame();
let keys = new Set();
let accumulator = 0;
let previousTime = performance.now();
let lastWave = state.wave;
let lastHealth = state.player.health;
let started = false;
let playerName = '';
let scoreSubmitted = false;
let fallbackControls = false;
const fixedStep = 1 / 60;

try { playerNameInput.value = localStorage.getItem('blacksite-player-name') ?? ''; } catch { /* Storage is optional. */ }

async function submitFinalScore() {
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  scoreSubmitStatus.dataset.state = 'sending';
  scoreSubmitStatus.textContent = 'Sending score to the class arcade…';
  try {
    await submitScore({ playerName, score: state.score });
    scoreSubmitStatus.dataset.state = 'success';
    scoreSubmitStatus.textContent = `Score ${state.score} sent for ${playerName}.`;
  } catch (error) {
    scoreSubmitStatus.dataset.state = 'error';
    scoreSubmitStatus.textContent = 'Score could not be sent. Your run remains visible above.';
    console.warn('Arcade score submission failed:', error);
  }
}

function setPhase(phase) {
  state.phase = phase;
  shell.dataset.phase = phase;
  briefing.hidden = phase !== 'briefing';
  pausePanel.hidden = phase !== 'paused';
  gameoverPanel.hidden = phase !== 'gameover';
  hud.setAttribute('aria-hidden', phase === 'briefing' ? 'true' : 'false');
  if (phase === 'gameover') {
    document.querySelector('#final-wave').textContent = String(state.wave).padStart(2, '0');
    document.querySelector('#final-kills').textContent = String(state.kills).padStart(2, '0');
    document.querySelector('#final-score').textContent = String(state.score).padStart(6, '0');
    statusLive.textContent = `Signal lost on wave ${state.wave}. Score ${state.score}.`;
    void submitFinalScore();
    restartButton.focus();
  }
}

async function requestPlay() {
  if (!started) {
    if (!playerNameInput.reportValidity()) return;
    playerName = playerNameInput.value.trim().replace(/\s+/g, ' ');
    playerNameInput.value = playerName;
    try { localStorage.setItem('blacksite-player-name', playerName); } catch { /* Storage is optional. */ }
  }
  await unlockAudioSafely(audio);
  started = true;
  if (fallbackControls) {
    setPhase('playing');
    canvas.focus();
    previousTime = performance.now();
    return;
  }
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try { await canvas.requestPointerLock(); } catch { enableFallbackControls(); }
  }
}

function enableFallbackControls() {
  fallbackControls = true;
  pauseMessage.textContent = 'Pointer lock is unavailable. Use ← → or drag on the game view to look.';
  waveNotice.textContent = 'Codex controls / drag or ← → to look';
  waveNotice.classList.remove('active');
  void waveNotice.offsetWidth;
  waveNotice.classList.add('active');
  statusLive.textContent = 'Pointer lock unavailable. Keyboard and drag look controls enabled.';
  setPhase('playing');
  canvas.focus();
  previousTime = performance.now();
}

function onPointerChange() {
  if (fallbackControls) return;
  if (document.pointerLockElement === canvas) {
    pauseMessage.textContent = 'Click below to recapture the signal and continue.';
    setPhase('playing');
    previousTime = performance.now();
  } else if (started && state.phase !== 'gameover') {
    setPhase('paused');
    resumeButton.focus();
  }
}

function shoot() {
  const result = fireWeapon(state);
  if (result.fired) {
    renderer.recoil();
    audio.shot();
    if (result.enemyId != null) {
      hitMarker.classList.remove('active');
      void hitMarker.offsetWidth;
      hitMarker.classList.add('active');
      result.killed ? audio.kill() : audio.hit();
    }
  } else if (result.reason === 'empty') audio.empty();
}

function reload() {
  if (startReload(state)) audio.reload();
}

function restart() {
  state = restartGame(state);
  lastWave = state.wave;
  lastHealth = state.player.health;
  scoreSubmitted = false;
  scoreSubmitStatus.dataset.state = 'idle';
  scoreSubmitStatus.textContent = 'Score standing by.';
  setPhase('paused');
  requestPlay();
}

startButton.addEventListener('click', requestPlay);
resumeButton.addEventListener('click', requestPlay);
restartButton.addEventListener('click', restart);
canvas.addEventListener('mousedown', (event) => { if (event.button === 0) shoot(); });
document.addEventListener('pointerlockchange', onPointerChange);
document.addEventListener('pointerlockerror', enableFallbackControls);
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas && state.phase === 'playing') state.player.angle += event.movementX * 0.0022;
  else if (fallbackControls && state.phase === 'playing' && (event.buttons & 1)) state.player.angle += event.movementX * 0.006;
});
document.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyP' && started && state.phase !== 'gameover') {
    if (fallbackControls) {
      if (state.phase === 'playing') {
        setPhase('paused');
        resumeButton.focus();
      } else requestPlay();
    } else if (state.phase === 'playing') document.exitPointerLock();
    else requestPlay();
  }
  if (event.code === 'Enter' && state.phase === 'gameover') restart();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

function inputState(dt = fixedStep) {
  return {
    forward: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    turn: fallbackControls ? keyboardTurn(keys, dt) : 0,
  };
}

function updateHud() {
  const alive = state.enemies.filter((enemy) => enemy.alive).length;
  document.querySelector('#wave-value').textContent = `Wave ${String(state.wave).padStart(2, '0')}`;
  document.querySelector('#hostiles-value').textContent = `${alive} signal${alive === 1 ? '' : 's'}`;
  document.querySelector('#score-value').textContent = String(state.score).padStart(6, '0');
  document.querySelector('#health-value').textContent = Math.ceil(state.player.health);
  document.querySelector('#health-meter').style.transform = `scaleX(${state.player.health / state.player.maxHealth})`;
  document.querySelector('#ammo-value').textContent = state.player.ammo;
  document.querySelector('#reserve-value').textContent = state.player.reserve;
  document.querySelector('#weapon-state').textContent = state.player.reloading ? 'Reloading mechanism' : state.player.ammo ? 'Sidearm ready' : 'Magazine empty';
  if (state.player.health < lastHealth) {
    renderer.damage();
    audio.hurt();
    damageFlash.classList.add('active');
    setTimeout(() => damageFlash.classList.remove('active'), 120);
  }
  lastHealth = state.player.health;
  if (state.wave !== lastWave) {
    waveNotice.textContent = `Wave ${String(state.wave).padStart(2, '0')} / signal rising`;
    waveNotice.classList.remove('active');
    void waveNotice.offsetWidth;
    waveNotice.classList.add('active');
    audio.wave();
    lastWave = state.wave;
  }
}

function frame(time) {
  const frameTime = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;
  if (state.phase === 'playing') {
    accumulator = Math.min(accumulator + frameTime, 0.25);
    while (accumulator >= fixedStep) {
      stepGame(state, inputState(fixedStep), fixedStep);
      accumulator -= fixedStep;
    }
    if (state.phase === 'gameover') {
      if (document.pointerLockElement) document.exitPointerLock();
      setPhase('gameover');
    }
  }
  renderer.render(state, frameTime);
  updateHud();
  requestAnimationFrame(frame);
}

setPhase('briefing');
requestAnimationFrame(frame);
