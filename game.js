(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const welcomePanel = document.getElementById('welcomePanel');
  const pausePanel = document.getElementById('pausePanel');
  const finishPanel = document.getElementById('finishPanel');
  const pauseButton = document.getElementById('pauseButton');
  const restartButton = document.getElementById('restartButton');
  const soundButton = document.getElementById('soundButton');
  const musicButton = document.getElementById('musicButton');
  const fullScreenButton = document.getElementById('fullscreenButton');
  const announcement = document.getElementById('announcement');
  const friendTokens = [...document.querySelectorAll('.friend-token')];
  const WIDTH = 1280;
  const HEIGHT = 720;
  const GROUND = 600;
  const SCENERY_GROUND = 571;
  const START_X = 225;
  let FINISH_X = 4800;
  const WALK_SPEED = 105;
  const RUN_DURATION = 90;
  const OBSTACLE_COUNT = 15;
  const FRIEND_OBSTACLE_INDICES = [0, Math.floor((OBSTACLE_COUNT - 1) / 2), OBSTACLE_COUNT - 2];
  const REQUIRED_JUMP_DURATION = 1.35;
  const CELEBRATION_DURATION = 6;
  const OBSTACLE_STYLES = {
    log: { width: 126, height: 45 }, puddle: { width: 164, height: 18 },
    mushrooms: { width: 128, height: 68 }, stones: { width: 118, height: 58 },
    bush: { width: 132, height: 76 }, leaves: { width: 144, height: 58 },
    cake: { width: 90, height: 94 },
  };
  const FREE_JUMP_DURATION = 1.05;
  const HOP_APPROACH_WINDOW = WALK_SPEED * FREE_JUMP_DURATION + 10;
  const MUTE_STORAGE_KEY = 'yuli-rainbow-picnic:muted:v1';
  const MUSIC_STORAGE_KEY = 'yuli-rainbow-picnic:music-enabled:v1';
  const LANDING_GLOW_DURATION = 1.2;
  const JUMP_STAR_POSITIONS = [.24, .5, .76];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const friendNames = ['Bunny', 'Kitten', 'Deer'];
  const obstacleDefinitions = [];
  const rainbowDefinitions = [];
  let runSeed = 0;

  // A seeded layout makes runs reproducible for checks, while each replay picks a new seed.
  function createRun(seed) {
    let value = seed >>> 0;
    const random = () => {
      value = (value + 0x6d2b79f5) >>> 0;
      let n = Math.imul(value ^ (value >>> 15), 1 | value);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
    const types = Object.keys(OBSTACLE_STYLES);
    const shuffle = bag => {
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      return bag;
    };
    // Shuffled bags include every kind twice, plus one random extra. Bag boundaries
    // can repeat a kind twice, but can never create three identical obstacles in a row.
    const kinds = [];
    while (kinds.length < OBSTACLE_COUNT) kinds.push(...shuffle([...types]));
    kinds.length = OBSTACLE_COUNT;
    const gaps = Array.from({ length: OBSTACLE_COUNT + 1 }, (_, i) =>
      i === 0 ? 3.5 + random() : i === OBSTACLE_COUNT ? 4.5 + random() : 3.5 + random() * 1.2);
    // Normalize walking time, so obstacle mix and spacing don't change the one-minute target.
    const walkBudget = RUN_DURATION - OBSTACLE_COUNT * REQUIRED_JUMP_DURATION;
    const scale = walkBudget / gaps.reduce((sum, gap) => sum + gap, 0);
    const walkSeconds = gaps.map(gap => gap * scale);
    let cursor = START_X;
    const obstacles = kinds.map((kind, index) => {
      const width = OBSTACLE_STYLES[kind].width;
      const x = cursor + walkSeconds[index] * WALK_SPEED + 66;
      const friendSlot = FRIEND_OBSTACLE_INDICES.indexOf(index);
      const friendIndex = friendSlot === -1 ? null : friendSlot;
      const obstacle = { x, width, kind, friendIndex };
      cursor = landingPosition(obstacle);
      return obstacle;
    });
    const finishX = cursor + walkSeconds[OBSTACLE_COUNT] * WALK_SPEED;
    // Optional rainbows float in the walking stretches, clear of every safe-stop
    // approach. The first is close enough to reach with a jump right after starting.
    const rainbows = walkSeconds.map((_, index) => {
      const left = index === 0 ? START_X : landingPosition(obstacles[index - 1]);
      const right = index === OBSTACLE_COUNT ? finishX : stopPosition(obstacles[index]);
      const x = index === 0 ? left + 61 : mix(left, right, .46 + random() * .1);
      return { id: index, x, y: GROUND - 228, collected: false };
    });
    return { seed: seed >>> 0, obstacles, walkSeconds, finishX, rainbows };
  }

  function freshRun() {
    let seed;
    try {
      const bytes = new Uint32Array(1);
      window.crypto.getRandomValues(bytes);
      seed = bytes[0];
    } catch (_) { seed = Math.floor(Math.random() * 4294967296) >>> 0; }
    if (seed === runSeed) seed = (seed + 0x9e3779b9) >>> 0;
    const run = createRun(seed);
    runSeed = seed;
    obstacleDefinitions.splice(0, obstacleDefinitions.length, ...run.obstacles);
    rainbowDefinitions.splice(0, rainbowDefinitions.length, ...run.rainbows);
    FINISH_X = run.finishX;
  }

  const state = {
    phase: 'welcome', paused: false, time: 0, walkTime: 0,
    heroX: START_X, heroLift: 0, camera: 0, waiting: false,
    jump: null, obstacleIndex: 0, friends: 0, greeting: 0, friendJoin: null,
    particles: [], finishTime: 0, muted: readMutePreference(),
    landingGlow: 0, musicEnabled: readMusicPreference(), rainbowsCollected: 0, rainbowGlow: 0,
  };
  let heldSpace = false;
  let audioContext = null;
  let masterGain = null;
  let victoryGain = null;
  const victoryVoices = new Set();
  let heroImage = null;
  let heroFrames = [];
  let heroConfig = {};
  let assetLoaded = false;
  let heroPoseImage = null;
  let heroPoseFrames = {};
  let heroPoseConfig = {};
  let backgroundImage = null;
  const animalImages = new Map();
  let propsImage = null;
  let propsFrames = {};
  let extraPropsImage = null;
  let extraPropsFrames = {};
  let lastTick = performance.now();

  function nextObstacle() {
    return obstacleDefinitions[state.obstacleIndex] || null;
  }

  function stopPosition(obstacle) { return obstacle.x - 66; }
  function landingPosition(obstacle) { return obstacle.x + obstacle.width + 84; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function randomAt(value) {
    const n = Math.sin(value * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function focusGame() { canvas.focus({ preventScroll: true }); }

  function readMutePreference() {
    try { return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true'; }
    catch (_) { return false; }
  }

  function readMusicPreference() {
    try { return window.localStorage.getItem(MUSIC_STORAGE_KEY) !== 'false'; }
    catch (_) { return true; }
  }

  function syncSoundButton() {
    soundButton.setAttribute('aria-pressed', String(state.muted));
    soundButton.setAttribute('aria-label', state.muted ? 'Enable sound' : 'Mute sound');
    soundButton.title = state.muted ? 'Sound off' : 'Sound on';
    document.getElementById('soundWaves').setAttribute('d', state.muted
      ? 'M15 9l6 6m0-6-6 6' : 'M14 8q4 4 0 8M17 5q7 7 0 14');
  }

  function syncUI() {
    syncSoundButton();
    syncVictoryVolume();
    musicButton.setAttribute('aria-pressed', String(state.musicEnabled));
    musicButton.setAttribute('aria-label', state.musicEnabled ? 'Turn music off' : 'Turn music on');
    musicButton.title = state.musicEnabled ? 'Music on' : 'Music off';
    document.getElementById('musicSlash').setAttribute('visibility', state.musicEnabled ? 'hidden' : 'visible');
    window.YULI_MUSIC?.setState({
      playing: state.phase === 'playing' && !state.paused && !document.hidden,
      muted: state.muted, enabled: state.musicEnabled,
    });
    stage.dataset.phase = state.phase === 'complete' && state.finishTime < CELEBRATION_DURATION ? 'celebrating' : state.phase;
    welcomePanel.hidden = state.phase !== 'welcome';
    finishPanel.hidden = state.phase !== 'complete' || state.finishTime < CELEBRATION_DURATION;
    pausePanel.hidden = !state.paused || state.phase !== 'playing';
    pauseButton.disabled = state.phase !== 'playing';
    restartButton.disabled = state.phase === 'welcome';
    pauseButton.setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    pauseButton.title = state.paused ? 'Continue · Space' : 'Pause · Esc';
    pauseButton.innerHTML = state.paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>';
    friendTokens.forEach((token, index) => {
      const found = index < state.friends;
      token.classList.toggle('found', found);
      token.classList.toggle('joining', state.friendJoin?.index === index && !reducedMotion);
      token.setAttribute('aria-label', `${friendNames[index]} ${found ? 'found' : 'waiting'}`);
    });
    document.getElementById('friendTrail').setAttribute('aria-label', `Animal friends: ${state.friends} of 3 found`);
    const rainbowScore = document.getElementById('rainbowScore');
    rainbowScore.hidden = state.phase === 'welcome';
    rainbowScore.classList.toggle('collecting', state.rainbowGlow > 0 && !reducedMotion);
    rainbowScore.setAttribute('aria-label', `Rainbows collected: ${state.rainbowsCollected}`);
    document.getElementById('rainbowCount').textContent = String(state.rainbowsCollected);
    const rainbowSummary = document.getElementById('rainbowSummary');
    rainbowSummary.hidden = state.rainbowsCollected === 0;
    rainbowSummary.textContent = `${state.rainbowsCollected} little rainbow${state.rainbowsCollected === 1 ? '' : 's'} collected!`;
  }

  function ensureAudio() {
    if (state.muted) return;
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        audioContext = new Audio();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.22;
        masterGain.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* The adventure also works with no sound available. */ }
  }

  function tone(frequency, start, length, level = 0.17, type = 'sine', destination = masterGain, drift = .96) {
    if (state.muted || !audioContext || !masterGain || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const at = audioContext.currentTime + start;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * drift, at + length);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.onended = () => {
      victoryVoices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
    return oscillator;
  }

  function syncVictoryVolume() {
    if (victoryGain && audioContext) victoryGain.gain.setValueAtTime(
      state.musicEnabled && !document.hidden ? 1 : 0, audioContext.currentTime);
  }

  function stopVictoryMusic() {
    for (const voice of victoryVoices) {
      try { voice.stop(audioContext.currentTime); } catch (_) { /* Already ended. */ }
    }
    victoryVoices.clear();
  }

  function playVictoryMusic() {
    if (state.muted || !state.musicEnabled || document.hidden) return;
    ensureAudio();
    if (!audioContext || audioContext.state !== 'running') return;
    stopVictoryMusic();
    if (!victoryGain) {
      victoryGain = audioContext.createGain();
      victoryGain.connect(masterGain);
    }
    syncVictoryVolume();
    // Original, bouncy C-major toy-piano phrase at132bpm, lasting about six seconds.
    const step = 60 / 132 / 2;
    const notes = [523.25,659.25,783.99,1046.5,783.99,659.25,523.25,0,
      587.33,698.46,880,1174.66,880,698.46,587.33,0,
      659.25,783.99,1046.5,1318.51,1174.66,1046.5,783.99,1046.5];
    const add = (frequency, at, length, level, type = 'triangle') => {
      const voice = tone(frequency, at, length, level, type, victoryGain, 1);
      if (voice) victoryVoices.add(voice);
    };
    notes.forEach((frequency, i) => { if (frequency) add(frequency, i * step, i === 23 ? .65 : .20, .10); });
    [130.81,196,146.83,220,164.81,196].forEach((frequency, i) => add(frequency, i * step * 4, .6, .08));
    for (let i = 0; i < 12; i += 1) add(i % 2 ? 880 : 220, i * step * 2, .055, .025, 'sine');
  }

  function sound(kind) {
    if (kind === 'jump') {
      tone(392, 0, 0.2, 0.12);
      tone(587.33, 0.06, 0.28, 0.09);
    } else if (kind === 'friend') {
      [523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, index * 0.11, 0.42, 0.11));
    } else if (kind === 'rainbow') {
      [659.25, 987.77, 1318.51].forEach((frequency, index) => tone(frequency, index * .065, .24, .08));
    } else if (kind === 'finish') {
      if (state.musicEnabled) playVictoryMusic();
      else [523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, index * .12, .42, .10));
    } else if (kind === 'start') {
      tone(523.25, 0, 0.35, 0.09);
      tone(659.25, 0.15, 0.45, 0.1);
    }
  }

  function startGame() {
    stopVictoryMusic();
    ensureAudio();
    freshRun();
    Object.assign(state, {
      phase: 'playing', paused: false, heroX: START_X, heroLift: 0,
      camera: 0, waiting: false, jump: null, obstacleIndex: 0,
      friends: 0, greeting: 0, friendJoin: null, particles: [], finishTime: 0, walkTime: 0, landingGlow: 0,
      rainbowsCollected: 0, rainbowGlow: 0,
    });
    announcement.textContent = 'Let’s go, Yuli! Jump to collect little rainbows. Yuli will wait safely at every obstacle.';
    sound('start');
    syncUI();
    focusGame();
  }

  function setPaused(paused) {
    if (state.phase !== 'playing') return;
    state.paused = paused;
    heldSpace = false;
    lastTick = performance.now();
    if (!paused) ensureAudio();
    syncUI();
    focusGame();
  }

  function jump() {
    if (state.phase === 'welcome') { startGame(); return; }
    if (state.phase === 'complete') {
      if (state.finishTime < CELEBRATION_DURATION) {
        state.greeting = 2.6;
        makeSparkles(state.heroX + 8, GROUND - 151, 8);
        sound('friend');
        return;
      }
      startGame();
      return;
    }
    if (state.paused) { setPaused(false); return; }
    if (state.jump) return;
    ensureAudio();
    const obstacle = nextObstacle();
    // A press within one free hop's travel distance also clears the upcoming obstacle.
    const isRequired = obstacle && (state.waiting || stopPosition(obstacle) - state.heroX <= HOP_APPROACH_WINDOW);
    state.jump = isRequired
      ? { kind: 'required', elapsed: 0, duration: REQUIRED_JUMP_DURATION, peak: 164,
          startX: state.heroX, endX: landingPosition(obstacle), obstacleIndex: state.obstacleIndex, starsCollected: 0 }
      : { kind: 'free', elapsed: 0, duration: FREE_JUMP_DURATION, peak: 113, startX: state.heroX };
    state.waiting = false;
    sound('jump');
  }

  function makeSparkles(x, y, count = 19) {
    for (let i = 0; i < count; i += 1) {
      const angle = randomAt(i + state.time) * Math.PI * 2;
      const speed = 25 + randomAt(i * 2.31) * 70;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
        age: 0, life: 0.9 + randomAt(i + 8) * 0.8, size: 2 + randomAt(i + 45) * 4,
        color: ['#edb7c1', '#c2b3dc', '#ebd493', '#b8d7c5'][i % 4] });
    }
  }

  function clearObstacle(index) {
    const obstacle = obstacleDefinitions[index];
    state.obstacleIndex = index + 1;
    const friendIndex = obstacle.friendIndex;
    if (friendIndex === null) {
      makeSparkles(state.heroX + 8, GROUND - 18, 8);
      announcement.textContent = 'Lovely hop, Yuli!';
      return;
    }
    state.friends = friendIndex + 1;
    state.greeting = 2.6;
    state.friendJoin = reducedMotion ? null : {
      index: friendIndex, elapsed: 0, duration: 1.2, startX: landingPosition(obstacle) + 93,
    };
    makeSparkles(state.heroX + 34, GROUND - 95);
    announcement.textContent = `Yuli found her ${friendNames[friendIndex].toLowerCase()} friend!`;
    sound('friend');
    syncUI();
  }

  function rainbowPosition(rainbow) {
    return { x: rainbow.x, y: rainbow.y + (reducedMotion ? 0 : Math.sin(state.time * 1.7 + rainbow.id * 2) * 4) };
  }

  function collectAirRainbows() {
    if (state.phase !== 'playing' || !state.jump || state.paused) return;
    const footY = GROUND - state.heroLift;
    for (const rainbow of rainbowDefinitions) {
      if (rainbow.collected) continue;
      const target = rainbowPosition(rainbow);
      // A generous hand/body reach rewards the hop, but walking underneath cannot collect.
      if (Math.abs(target.x - state.heroX) > 38 || target.y < footY - 160 || target.y > footY - 18) continue;
      rainbow.collected = true;
      state.rainbowsCollected += 1;
      state.rainbowGlow = 1;
      makeSparkles(target.x, target.y, 14);
      sound('rainbow');
      announcement.textContent = `A rainbow for Yuli! ${state.rainbowsCollected} collected.`;
      syncUI();
    }
  }

  function update(dt) {
    if (state.paused) return;
    state.time += dt;
    state.greeting = Math.max(0, state.greeting - dt);
    state.landingGlow = Math.max(0, state.landingGlow - dt);
    if (state.rainbowGlow > 0) {
      state.rainbowGlow = Math.max(0, state.rainbowGlow - dt);
      if (state.rainbowGlow === 0) syncUI();
    }
    if (state.friendJoin) {
      state.friendJoin.elapsed += dt;
      if (state.friendJoin.elapsed >= state.friendJoin.duration) {
        state.friendJoin = null;
        syncUI();
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 32 * dt;
      if (particle.age > particle.life) state.particles.splice(i, 1);
    }
    if (state.phase === 'welcome') return;
    if (state.phase === 'complete') {
      const before = state.finishTime;
      state.finishTime += dt;
      if (before < CELEBRATION_DURATION && state.finishTime >= CELEBRATION_DURATION) {
        announcement.textContent = 'Hooray, Yuli! Everyone is at the picnic. Press Space to play again.';
        syncUI();
      }
      return;
    }

    if (state.jump) {
      const currentJump = state.jump;
      currentJump.elapsed = Math.min(currentJump.duration, currentJump.elapsed + dt);
      const progress = currentJump.elapsed / currentJump.duration;
      state.heroLift = Math.sin(progress * Math.PI) * currentJump.peak;
      if (currentJump.kind === 'required') {
        state.heroX = mix(currentJump.startX, currentJump.endX, progress);
        while (currentJump.starsCollected < JUMP_STAR_POSITIONS.length
          && progress >= JUMP_STAR_POSITIONS[currentJump.starsCollected]) {
          const starProgress = JUMP_STAR_POSITIONS[currentJump.starsCollected];
          makeSparkles(mix(currentJump.startX, currentJump.endX, starProgress),
            GROUND - Math.sin(starProgress * Math.PI) * currentJump.peak - 83, 4);
          currentJump.starsCollected += 1;
        }
      } else {
        const obstacle = nextObstacle();
        const limit = obstacle ? stopPosition(obstacle) : FINISH_X;
        state.heroX = Math.min(limit, state.heroX + WALK_SPEED * dt);
      }
      collectAirRainbows();
      if (progress >= 1) {
        state.heroLift = 0;
        state.jump = null;
        state.landingGlow = LANDING_GLOW_DURATION;
        if (currentJump.kind === 'required') clearObstacle(currentJump.obstacleIndex);
      }
    } else if (!state.waiting) {
      const obstacle = nextObstacle();
      const limit = obstacle ? stopPosition(obstacle) : FINISH_X;
      state.heroX = Math.min(limit, state.heroX + WALK_SPEED * dt);
      state.walkTime += dt * (WALK_SPEED / 68); // Match the steps to the walking pace.
    }

    const obstacle = nextObstacle();
    if (!state.jump && obstacle && state.heroX >= stopPosition(obstacle) - 0.01) {
      if (!state.waiting) announcement.textContent = 'Press Space when you are ready to hop.';
      state.waiting = true;
    }
    const targetCamera = Math.max(0, state.heroX - (state.phase === 'complete' ? 380 : 345));
    state.camera += (targetCamera - state.camera) * (1 - Math.exp(-5 * dt));
    if (state.heroX >= FINISH_X && state.obstacleIndex === obstacleDefinitions.length && state.friends === 3 && !state.jump) {
      state.phase = 'complete';
      state.waiting = false;
      state.finishTime = 0;
      announcement.textContent = 'Hooray, Yuli! Time to dance with the unicorn and celebrate!';
      sound('finish');
      syncUI();
    }
  }

  function roundedRect(x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function ellipse(x, y, rx, ry, fill, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function line(points, color, width = 2) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function star(x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + size * 0.22, y - size * 0.22, x + size, y);
    ctx.quadraticCurveTo(x + size * 0.22, y + size * 0.22, x, y + size);
    ctx.quadraticCurveTo(x - size * 0.22, y + size * 0.22, x - size, y);
    ctx.quadraticCurveTo(x - size * 0.22, y - size * 0.22, x, y - size);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function heart(x, y, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 20, size / 20);
    ctx.beginPath(); ctx.moveTo(0, 15);
    ctx.bezierCurveTo(-30, -2, -15, -22, 0, -10);
    ctx.bezierCurveTo(15, -22, 30, -2, 0, 15);
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  function cloud(x, y, scale = 1, opacity = 0.78) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = opacity;
    ellipse(-33, 2, 39, 17, '#fffef6');
    ellipse(-2, -12, 37, 31, '#fffef6');
    ellipse(31, -3, 31, 21, '#fffef6');
    ellipse(53, 9, 28, 13, '#fffef6');
    roundedRect(-66, 5, 138, 16, 12, '#fffef6');
    ctx.restore();
  }

  function flower(x, y, size, color, time = state.time) {
    const swish = reducedMotion ? 0 : Math.sin(time * 1.5 + x * 0.1) * 2;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -11, swish, -27);
    ctx.strokeStyle = '#88ad86'; ctx.lineWidth = 2.5; ctx.stroke();
    ellipse(5, -13, 7, 3, '#9ec199', -0.6);
    ellipse(-3, -8, 5, 2.5, '#b1ce9b', 0.4);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 0.4;
      ellipse(swish + Math.cos(angle) * 5, -28 + Math.sin(angle) * 5, 4.7, 4.7, color);
    }
    ellipse(swish, -28, 3.4, 3.4, '#e9c97e');
    ctx.restore();
  }

  function butterfly(x, y, size = 1, color = '#cea3c4') {
    const flap = reducedMotion ? 0.8 : 0.4 + Math.abs(Math.sin(state.time * 7 + x)) * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ellipse(-7 * flap, -4, 8 * flap, 8, color, -0.3);
    ellipse(7 * flap, -4, 8 * flap, 8, color, 0.3);
    ellipse(-5 * flap, 5, 6 * flap, 5, '#e9c4d0');
    ellipse(5 * flap, 5, 6 * flap, 5, '#e9c4d0');
    ellipse(0, 0, 1.5, 6, '#879177');
    ctx.restore();
  }

  function distantTree(x, y, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    roundedRect(-5, -7, 10, 61, 4, '#b9bd99');
    ellipse(0, -47, 39, 43, color);
    ellipse(-22, -18, 31, 30, color);
    ellipse(22, -17, 32, 32, color);
    ctx.restore();
  }

  function drawSky(camera) {
    const gradient = ctx.createLinearGradient(0, 0, 0, GROUND);
    gradient.addColorStop(0, '#edf5e9'); gradient.addColorStop(0.58, '#ecf2e5'); gradient.addColorStop(1, '#f9efd8');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (backgroundImage) {
      // A supplied illustration becomes the meadow; the animated details stay live.
      const imageRatio = backgroundImage.naturalWidth / backgroundImage.naturalHeight;
      const viewRatio = WIDTH / HEIGHT;
      const sourceW = imageRatio > viewRatio ? backgroundImage.naturalHeight * viewRatio : backgroundImage.naturalWidth;
      const sourceH = imageRatio > viewRatio ? backgroundImage.naturalHeight : backgroundImage.naturalWidth / viewRatio;
      const sourceX = clamp((backgroundImage.naturalWidth - sourceW) / 2 + (reducedMotion ? 0 : camera * .035),
        0, backgroundImage.naturalWidth - sourceW);
      const sourceY = (backgroundImage.naturalHeight - sourceH) / 2;
      ctx.drawImage(backgroundImage, sourceX, sourceY, sourceW, sourceH, 0, 0, WIDTH, HEIGHT);
    }
    if (!backgroundImage) {
      ellipse(1030 - camera * 0.025, 158, 53, 53, '#f7eac4');
      ellipse(1030 - camera * 0.025, 158, 67, 67, '#f6eac424');
      const drift = reducedMotion ? 0 : state.time * 2;
      for (let i = -1; i < 7; i += 1) {
        const x = i * 308 + 143 - ((camera * 0.085 + drift) % 308);
        cloud(x, 143 + randomAt(i + 4) * 160, 0.7 + randomAt(i + 3) * 0.8, 0.65);
      }
    }
    for (let i = 0; i < 7; i += 1) {
      const x = 150 + i * 172 - (camera * 0.045 % 172);
      const y = 265 + randomAt(i * 9) * 95;
      star(x, y, 2 + randomAt(i * 3) * 2, '#d6c58d', 0.5);
    }

    if (!backgroundImage) {
    ctx.fillStyle = '#d9d5df'; ctx.beginPath(); ctx.moveTo(0, 478);
    for (let x = -180; x < WIDTH + 320; x += 260) {
      const px = x - camera * 0.07 % 260;
      ctx.bezierCurveTo(px + 85, 356, px + 175, 387, px + 260, 477);
    }
    ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9dcca'; ctx.beginPath(); ctx.moveTo(0, 466);
    for (let x = -250; x < WIDTH + 400; x += 400) {
      const px = x - camera * 0.17 % 400;
      ctx.bezierCurveTo(px + 100, 334, px + 302, 354, px + 400, 464);
    }
    ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
    for (let i = -1; i < 11; i += 1) {
      const x = i * 166 - camera * 0.26 % 166;
      distantTree(x + 42, 478 + randomAt(i) * 26, 0.8 + randomAt(i + 8) * 0.8, i % 2 === 0 ? '#bbd5b9' : '#c1d6b4');
    }
    ctx.fillStyle = '#b6cfaa'; ctx.beginPath(); ctx.moveTo(0, 531);
    for (let x = -170; x < WIDTH + 400; x += 330) {
      const px = x - camera * 0.4 % 330;
      ctx.bezierCurveTo(px + 90, 448, px + 210, 478, px + 330, 528);
    }
    ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();

    const grassGradient = ctx.createLinearGradient(0, 493, 0, HEIGHT);
    grassGradient.addColorStop(0, '#cfddb1'); grassGradient.addColorStop(1, '#b5cc9b');
    ctx.fillStyle = grassGradient; ctx.fillRect(0, 523, WIDTH, HEIGHT - 523);
    }
    ctx.fillStyle = '#eadeb9'; ctx.beginPath(); ctx.moveTo(0, 555);
    for (let x = 0; x <= WIDTH; x += 80) {
      ctx.lineTo(x, 555 + Math.sin((x + camera) * 0.005) * 4);
    }
    ctx.lineTo(WIDTH, 631); ctx.lineTo(0, 631); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0e4c6'; ctx.fillRect(0, 563, WIDTH, 55);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(0, 573, WIDTH, 26);

    for (let i = Math.floor(camera / 76) - 1; i < Math.floor((camera + WIDTH) / 76) + 2; i += 1) {
      const x = i * 76 - camera;
      ellipse(x + 15, 590 + randomAt(i * 7) * 22, 1.9, 1.1, '#d8cba8');
      ellipse(x + 51, 587 + randomAt(i * 3) * 15, 2.8, 1.5, '#e4d7b5');
      const py = 632 + randomAt(i + 73) * 60;
      line([[x + 10, py], [x + 8, py - 8]], '#9bb68b', 2);
      line([[x + 10, py], [x + 15, py - 10]], '#9bb68b', 2);
    }
  }

  function drawScenery(camera, welcome = false) {
    const flowers = ['#eab2b8', '#d2b6d1', '#fcf5db', '#f3c6a1'];
    for (let i = Math.floor(camera / 130) - 1; i < Math.floor((camera + WIDTH) / 130) + 2; i += 1) {
      const x = i * 130 + randomAt(i + 3) * 44 - camera;
      flower(x, 547, 0.7 + randomAt(i + 28) * 0.5, flowers[Math.abs(i) % 4]);
      flower(x + 23, 550, 0.58 + randomAt(i + 14) * 0.45, flowers[Math.abs(i + 1) % 4]);
      if (Math.abs(i) % 4 === 1) {
        ellipse(x + 63, 541, 17, 6, '#b3bd9e');
        ellipse(x + 61, 538, 12, 6, '#c6c9ae');
      }
    }
    for (let i = Math.floor(camera / 173) - 1; i < Math.floor((camera + WIDTH) / 173) + 2; i += 1) {
      const x = i * 173 + randomAt(i) * 20 - camera;
      const y = 686 + randomAt(i + 1) * 30;
      flower(x, y, 1.0 + randomAt(i + 29) * 0.5, flowers[Math.abs(i) % 4]);
      flower(x + 19, y + 9, 0.8 + randomAt(i + 6) * 0.8, flowers[Math.abs(i + 2) % 4]);
      flower(x + 50, y - 2, 1.0 + randomAt(i + 5) * 0.4, flowers[Math.abs(i + 1) % 4]);
    }
    for (let i = Math.floor(camera / 670); i <= Math.floor((camera + WIDTH) / 670); i += 1) {
      const x = i * 670 + 329 - camera;
      const sway = reducedMotion ? 0 : Math.sin(state.time * 1.2 + i) * 16;
      const rise = reducedMotion ? 0 : Math.cos(state.time * 0.8 + i) * 10;
      butterfly(x + sway, 416 + rise, 0.76, i % 2 ? '#c9acd4' : '#ddafbb');
    }
    if (welcome) {
      for (let i = 0; i < 5; i += 1) star(723 + i * 87, 362 - Math.sin(i) * 48, 4, '#ceb769', 0.7);
    }
  }

  function drawProp(name, x, footY, width, height) {
    const frame = extraPropsFrames[name] || propsFrames[name];
    const image = extraPropsFrames[name] ? extraPropsImage : propsImage;
    if (!image || !frame) return false;
    const anchorX = Number.isFinite(frame.anchorX) ? frame.anchorX : .5;
    const anchorY = Number.isFinite(frame.anchorY) ? frame.anchorY : 1;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
      x - width * anchorX, footY - height * anchorY, width, height);
    return true;
  }

  function eye(x, y, size = 2.5, sleepy = false) {
    if (sleepy) {
      ctx.beginPath(); ctx.moveTo(x - size, y); ctx.quadraticCurveTo(x, y + size, x + size, y);
      ctx.strokeStyle = '#655e5e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    } else ellipse(x, y, size, size * 1.16, '#655e5e');
  }

  function smile(x, y, size = 5) {
    ctx.beginPath(); ctx.moveTo(x - size, y); ctx.quadraticCurveTo(x, y + size, x + size, y);
    ctx.strokeStyle = '#8d7473'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
  }

  function drawAnimalImage(name, x, footY, size, moving) {
    const asset = animalImages.get(name);
    if (!asset) return false;
    const heights = { bunny: 88, kitten: 94, deer: 113, unicorn: 187 };
    const frame = asset.frame;
    const height = (asset.drawHeight || heights[name]) * size;
    const scale = height / frame.h;
    const width = frame.w * scale;
    const anchorX = Number.isFinite(frame.anchorX) ? frame.anchorX : 0.5;
    const anchorY = Number.isFinite(frame.anchorY) ? frame.anchorY : 1;
    const rhythm = state.time * (name === 'bunny' ? 5.2 : 3.4) + (name === 'kitten' ? 1.5 : 0);
    const bob = reducedMotion ? 0 : (moving ? Math.abs(Math.sin(rhythm)) * 4.5 : Math.sin(rhythm * .4) * .8);
    const squish = reducedMotion ? 1 : 1 + Math.sin(rhythm) * (moving ? .02 : .007);
    ellipse(x, footY + 1, height * .29, 4.5 * size, '#87996925');
    ctx.save(); ctx.translate(x, footY - bob); ctx.scale(1 / squish, squish);
    ctx.drawImage(asset.image, frame.x, frame.y, frame.w, frame.h,
      -width * anchorX + (frame.offsetX || 0) * scale,
      -height * anchorY + (frame.offsetY || 0) * scale, width, height);
    ctx.restore();
    if (name === 'unicorn') star(x + height * .52, footY - height * .9, 5, '#d6b871', reducedMotion ? .65 : .65 + Math.sin(state.time * 2) * .2);
    return true;
  }

  function drawBunny(x, y, size = 1, moving = false) {
    if (drawAnimalImage('bunny', x, y, size, moving)) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    const hop = moving && !reducedMotion ? Math.abs(Math.sin(state.time * 5)) * 5 : 0;
    ctx.translate(0, -hop);
    ellipse(-6, -4 + hop, 28, 5, '#87996925');
    ellipse(-25, -26, 10, 10, '#fff5e6');
    ellipse(-5, -26, 26, 23, '#fff7eb');
    ellipse(-14, -5, 11, 5, '#f4e8d7');
    ellipse(11, -5, 11, 5, '#f4e8d7');
    ellipse(10, -74, 7, 23, '#fff7eb', -0.14);
    ellipse(27, -74, 7, 24, '#fff7eb', 0.19);
    ellipse(10, -74, 3.4, 16, '#e7b6c3', -0.14);
    ellipse(27, -74, 3.4, 17, '#e7b6c3', 0.19);
    ellipse(20, -48, 23, 21, '#fff7eb');
    eye(14, -51, 2.2); eye(31, -51, 2.2);
    ellipse(9, -44, 4.6, 2.9, '#eabcc7'); ellipse(36, -44, 4.6, 2.9, '#eabcc7');
    ellipse(23, -44, 2.4, 1.8, '#c78ea5'); smile(23, -40, 3);
    ctx.restore();
  }

  function drawKitten(x, y, size = 1, moving = false) {
    if (drawAnimalImage('kitten', x, y, size, moving)) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    const bounce = moving && !reducedMotion ? Math.sin(state.time * 5.5) * 2 : 0;
    ctx.translate(0, bounce);
    ellipse(-4, -3 - bounce, 29, 5, '#87996925');
    ctx.beginPath(); ctx.moveTo(-22, -30);
    ctx.bezierCurveTo(-52, -22, -53, -58, -34, -53);
    ctx.strokeStyle = '#d9a17b'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
    ellipse(-3, -28, 25, 24, '#e4b18a');
    ellipse(1, -22, 14, 16, '#fff0d5');
    roundedRect(-19, -13, 10, 11, 5, '#dbac87'); roundedRect(10, -13, 10, 11, 5, '#dbac87');
    ctx.beginPath(); ctx.moveTo(-3, -50); ctx.lineTo(-8, -78); ctx.lineTo(13, -65); ctx.lineTo(28, -65); ctx.lineTo(47, -78); ctx.lineTo(44, -49); ctx.closePath(); ctx.fillStyle = '#e4b18a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1, -58); ctx.lineTo(-3, -71); ctx.lineTo(9, -63); ctx.fillStyle = '#e9bac1'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(34, -63); ctx.lineTo(42, -72); ctx.lineTo(39, -57); ctx.fill();
    ellipse(21, -48, 26, 22, '#e9b994');
    ellipse(22, -40, 11, 8, '#fff2de');
    eye(11, -51, 2.3); eye(31, -51, 2.3);
    ellipse(22, -43, 3, 2, '#aa7b85'); smile(22, -38, 4);
    line([[1, -42], [-9, -45]], '#b58377', 1.4); line([[1, -37], [-10, -37]], '#b58377', 1.4);
    line([[42, -42], [51, -45]], '#b58377', 1.4); line([[42, -37], [52, -37]], '#b58377', 1.4);
    line([[18, -65], [18, -60]], '#cb997a', 2); line([[24, -65], [24, -60]], '#cb997a', 2);
    ctx.restore();
  }

  function drawDeer(x, y, size = 1, moving = false) {
    if (drawAnimalImage('deer', x, y, size, moving)) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    const step = moving && !reducedMotion ? Math.sin(state.time * 5) * 4 : 0;
    ellipse(-6, -3, 34, 5, '#87996925');
    line([[-22, -34], [-23 + step, -6]], '#b99475', 8);
    line([[15, -34], [17 - step, -6]], '#b99475', 8);
    line([[-23 + step, -6], [-17 + step, -6]], '#967e6c', 4);
    line([[17 - step, -6], [23 - step, -6]], '#967e6c', 4);
    ellipse(-7, -38, 34, 24, '#c5a083');
    ellipse(-28, -43, 8, 5, '#ead7bc', -0.5);
    ellipse(-6, -35, 19, 14, '#e4cdb0');
    ellipse(18, -55, 12, 29, '#c5a083', -0.25);
    ellipse(13, -94, 9, 17, '#c5a083', -0.9);
    ellipse(36, -93, 9, 17, '#c5a083', 0.65);
    ellipse(12, -94, 4, 11, '#e6bdb4', -0.9);
    ellipse(36, -94, 4, 11, '#e6bdb4', 0.65);
    ellipse(26, -75, 21, 23, '#c9a789');
    ellipse(28, -63, 15, 10, '#f3e1c3');
    eye(18, -79, 2.4); eye(35, -79, 2.4);
    ellipse(28, -67, 3.2, 2.2, '#81716d'); smile(28, -61, 3);
    ellipse(15, -71, 4, 2, '#d9a3a1'); ellipse(40, -71, 4, 2, '#d9a3a1');
    [[-22,-47],[-9,-51],[-13,-40],[3,-45]].forEach(([a,b]) => ellipse(a,b,2.6,2.5,'#f6e8ce'));
    ctx.restore();
  }

  function drawFriend(index, x, y, size, moving) {
    if (index === 0) drawBunny(x, y, size, moving);
    else if (index === 1) drawKitten(x, y, size, moving);
    else drawDeer(x, y, size, moving);
  }

  function unicornDance() {
    if (state.phase !== 'complete' || reducedMotion) return { lift: 0, sway: 0, tilt: 0 };
    const beat = state.finishTime * Math.PI * 2 * 1.1;
    return { lift: Math.max(0, Math.sin(beat)) * 48, sway: Math.sin(beat * .5) * 11,
      tilt: Math.sin(beat) * .055 };
  }

  function drawUnicorn(x, y, size = 1) {
    const dance = unicornDance();
    ctx.save();
    ctx.translate(x + dance.sway, y - dance.lift);
    ctx.rotate(dance.tilt);
    drawUnicornBody(0, 0, size);
    ctx.restore();
    if (dance.lift > 10) {
      star(x - 65, y - 40 - dance.lift, 7, '#ff8dd1', .8);
      star(x + 76, y - 75 - dance.lift, 8, '#ffe075', .9);
    }
  }

  function drawUnicornBody(x, y, size = 1) {
    if (drawAnimalImage('unicorn', x, y, size, false)) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    const sway = reducedMotion ? 0 : Math.sin(state.time * 1.8) * 2;
    ellipse(0, -3, 68, 9, '#8caa7626');
    ctx.beginPath(); ctx.moveTo(-42, -72);
    ctx.bezierCurveTo(-93, -102, -78, -25, -108, -23 + sway);
    ctx.bezierCurveTo(-64, -19 + sway, -56, -45, -42, -61); ctx.closePath();
    ctx.fillStyle = '#c9b0da'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-52, -69); ctx.bezierCurveTo(-80, -72, -74, -34, -93, -29);
    ctx.strokeStyle = '#efb9c9'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
    line([[-33, -58], [-32, -10]], '#f9f2e6', 13);
    line([[20, -58], [21, -10]], '#f9f2e6', 13);
    roundedRect(-39, -14, 17, 12, 5, '#c7b0ce'); roundedRect(14, -14, 17, 12, 5, '#c7b0ce');
    ellipse(-7, -66, 51, 31, '#fff8ec');
    ellipse(-14, -56, 34, 19, '#f8efdf');
    ctx.beginPath(); ctx.moveTo(18, -67); ctx.bezierCurveTo(3, -116, 37, -155, 52, -139);
    ctx.lineTo(57, -85); ctx.lineTo(30, -53); ctx.closePath(); ctx.fillStyle = '#fff8ec'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(27, -120); ctx.bezierCurveTo(9, -132, 2, -100, 10, -89);
    ctx.bezierCurveTo(20, -106, 34, -95, 27, -120); ctx.fillStyle = '#c5acd7'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, -132); ctx.bezierCurveTo(3, -133, 19, -159, 45, -151);
    ctx.bezierCurveTo(60, -147, 45, -127, 30, -132); ctx.fillStyle = '#cbb4db'; ctx.fill();
    ellipse(47, -123, 32, 26, '#fff8ec', -0.08);
    ellipse(70, -113, 20, 17, '#f4eadd');
    ellipse(42, -150, 8, 18, '#fff8ec', -0.28);
    ellipse(42, -150, 3, 11, '#eab8c7', -0.28);
    ctx.beginPath(); ctx.moveTo(61, -143); ctx.lineTo(70, -177); ctx.lineTo(76, -142); ctx.closePath(); ctx.fillStyle = '#edcf8b'; ctx.fill();
    line([[65,-154],[73,-152]], '#d9b671', 1.6); line([[67,-163],[72,-161]], '#d9b671', 1.6);
    eye(62, -127, 3.2, true);
    line([[64,-125],[67,-121]], '#7f7378', 1.6);
    ellipse(66, -117, 6, 3.7, '#eab4c5'); ellipse(78, -115, 1.4, 2, '#ac9d96');
    smile(80, -107, 3);
    ctx.beginPath(); ctx.moveTo(31, -141); ctx.bezierCurveTo(50, -158, 56, -141, 59, -132);
    ctx.strokeStyle = '#efbccb'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
    star(-12, -67, 12, '#e5ca8e');
    star(87, -168, 5, '#d6b871', reducedMotion ? .65 : 0.65 + Math.sin(state.time * 2) * 0.2);
    ctx.restore();
  }

  function drawTemporaryHero(x, footY, walking, jumping, scale = 1) {
    ctx.save(); ctx.translate(x, footY); ctx.scale(scale, scale);
    const stride = walking && !reducedMotion ? Math.sin(state.walkTime * 8) : 0;
    const skirt = reducedMotion ? 0 : Math.sin(state.time * 5) * (walking ? 6 : 2);
    const skin = '#f3c5aa';
    line([[-12, -42], [-12 + stride * 7, -11]], skin, 12);
    line([[12, -42], [12 - stride * 7, -11]], skin, 12);
    roundedRect(-21 + stride * 7, -13, 24, 11, 5, '#a98daf');
    roundedRect(4 - stride * 7, -13, 25, 11, 5, '#a98daf');
    line([[-18,-88],[-31 - stride * 5,-63],[-27 - stride * 6,-46]], skin, 10);
    line([[18,-88],[32 + stride * 4,-64],[35 + stride * 5,-49]], skin, 10);
    if (jumping) line([[20,-82],[40,-98]], skin, 10);
    ctx.beginPath(); ctx.moveTo(-18,-92); ctx.quadraticCurveTo(0,-105,18,-92); ctx.lineTo(22,-70); ctx.lineTo(-22,-70); ctx.closePath(); ctx.fillStyle='#b899c5'; ctx.fill();
    ellipse(-21,-88,8,9,'#b899c5'); ellipse(21,-88,8,9,'#b899c5');
    ctx.beginPath(); ctx.moveTo(-20,-71); ctx.quadraticCurveTo(-23 + skirt,-49,-37 + skirt,-31);
    ctx.quadraticCurveTo(0 + skirt,-20,37 + skirt,-31); ctx.quadraticCurveTo(25 + skirt,-52,20,-71);
    ctx.closePath(); ctx.fillStyle='#efb6ba'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-35 + skirt,-34); ctx.quadraticCurveTo(0 + skirt,-24,35 + skirt,-34);
    ctx.strokeStyle='#a8cabb'; ctx.lineWidth=6; ctx.stroke();
    line([[-19,-69],[19,-69]],'#a8cabb',5);
    flower(-11 + skirt * 0.3,-40,0.38,'#fff1da',0);
    flower(16 + skirt * 0.5,-37,0.28,'#fff1da',0);
    roundedRect(-7,-108,14,15,5,skin);
    ellipse(-2,-128,30,31,'#ac8159');
    for(let i=0;i<13;i+=1){const a=i*Math.PI*2/13;ellipse(-2+Math.cos(a)*27,-128+Math.sin(a)*27,9,9,i%3===0?'#b48c61':'#ad8258');}
    ellipse(4,-122,23,25,skin);
    ellipse(4,-147,26,12,'#b0875c',-0.12);
    ellipse(-14,-134,10,13,'#ad8258',-0.3);
    ellipse(12,-148,8,8,'#ba9062'); ellipse(26,-140,8,8,'#b0875c');
    eye(7,-125,2.2); eye(21,-124,2.1);
    ellipse(6,-117,4,2.4,'#e7a9a6'); ellipse(23,-116,3.8,2.4,'#e7a9a6');
    smile(16,-111,5);
    ctx.restore();
  }

  function heroDance() {
    if (state.phase !== 'complete' || reducedMotion) return { lift: 0, sway: 0, tilt: 0 };
    const beat = state.finishTime * Math.PI * 2 * 1.1;
    return { lift: Math.max(0, Math.sin(beat)) * 22, sway: Math.sin(beat) * 9,
      tilt: Math.sin(beat * .5) * .075 };
  }

  function drawHero(x, footY, walking = false, jumping = false, scale = 1) {
    const shadowSize = jumping ? 20 : 34;
    ellipse(x, GROUND + 1, shadowSize * scale, 6 * scale, '#8b9a762c');
    const dance = heroDance();
    ctx.save(); ctx.translate(x + dance.sway, footY - dance.lift); ctx.rotate(dance.tilt);
    drawHeroBody(0, 0, walking, jumping, scale);
    ctx.restore();
  }

  function drawHeroBody(x, footY, walking, jumping, scale) {
    const poseName = state.phase === 'complete' ? 'celebrate'
      : jumping ? 'jump' : state.waiting ? 'waiting' : !walking ? 'idle' : null;
    const pose = poseName && heroPoseFrames[poseName];
    if (heroPoseImage && pose) {
      const highestPose = Math.max(...Object.values(heroPoseFrames).map(frame => frame.h));
      const imageScale = ((heroPoseConfig.drawHeight || heroConfig.drawHeight || 190) / highestPose) * scale;
      const width = pose.w * imageScale;
      const height = pose.h * imageScale;
      const anchorX = Number.isFinite(pose.anchorX) ? pose.anchorX : .5;
      const anchorY = Number.isFinite(pose.anchorY) ? pose.anchorY : 1;
      const bob = !walking && !jumping && !reducedMotion ? Math.sin(state.time * 2) * .8 : 0;
      ctx.drawImage(heroPoseImage, pose.x, pose.y, pose.w, pose.h,
        x - width * anchorX + (pose.offsetX || 0) * imageScale,
        footY - height * anchorY + (pose.offsetY || 0) * imageScale + bob, width, height);
      return;
    }
    if (!assetLoaded || !heroFrames.length) {
      drawTemporaryHero(x, footY, walking, jumping, scale);
      return;
    }
    let index = walking ? Math.floor(state.walkTime * 6) % heroFrames.length : 0;
    if (jumping) index = Math.min(1, heroFrames.length - 1);
    if (state.phase === 'complete' && !reducedMotion) index = Math.floor(state.time * 3) % heroFrames.length;
    const frame = heroFrames[index];
    const highestFrame = Math.max(...heroFrames.map(f => f.h));
    const imageScale = ((heroConfig.drawHeight || 190) / highestFrame) * scale;
    const width = frame.w * imageScale;
    const height = frame.h * imageScale;
    const anchorX = Number.isFinite(frame.anchorX) ? frame.anchorX : 0.5;
    const anchorY = Number.isFinite(frame.anchorY) ? frame.anchorY : 1;
    const offsetX = (frame.offsetX || 0) * imageScale;
    const offsetY = (frame.offsetY || 0) * imageScale;
    const bob = (!walking && !jumping && !reducedMotion) ? Math.sin(state.time * 2) * 0.8 : 0;
    ctx.drawImage(heroImage, frame.x, frame.y, frame.w, frame.h,
      x - width * anchorX + offsetX, footY - height * anchorY + offsetY + bob, width, height);
  }

  function mushroom(x, y, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    roundedRect(-8,-28,16,29,6,'#fff3da');
    ctx.beginPath(); ctx.moveTo(-28,-22); ctx.bezierCurveTo(-28,-53,27,-53,28,-22);
    ctx.quadraticCurveTo(0,-12,-28,-22); ctx.fillStyle=color; ctx.fill();
    ellipse(-9,-31,4,3,'#fff6e0'); ellipse(10,-32,3.5,3,'#fff6e0'); ellipse(1,-40,3,2,'#fff6e0');
    ctx.restore();
  }

  function drawObstacle(obstacle, camera) {
    const x = obstacle.x - camera;
    if (x < -250 || x > WIDTH + 150) return;
    if (propsFrames[obstacle.kind] || extraPropsFrames[obstacle.kind]) {
      const height = OBSTACLE_STYLES[obstacle.kind].height;
      if (obstacle.kind !== 'puddle') ellipse(x + obstacle.width / 2, GROUND + 2,
        obstacle.width * .54, 6, '#8f9b7020');
      if (drawProp(obstacle.kind, x + obstacle.width / 2, GROUND, obstacle.width, height)) return;
    }
    if (obstacle.kind === 'log') {
      ellipse(x + 65, GROUND + 3, 73, 8, '#8f9b702b');
      roundedRect(x, GROUND - 38, obstacle.width, 40, 18, '#c6a07b');
      roundedRect(x + 4, GROUND - 37, obstacle.width - 15, 11, 8, '#d5b18a');
      ellipse(x + obstacle.width - 9, GROUND - 18, 13, 21, '#edd4ae');
      ellipse(x + obstacle.width - 9, GROUND - 18, 8.5, 14, '#d5b38a');
      ellipse(x + obstacle.width - 9, GROUND - 18, 4, 8, '#e8cba3');
      line([[x+13,GROUND-22],[x+45,GROUND-20],[x+59,GROUND-24]],'#b99270',2);
      line([[x+34,GROUND-9],[x+69,GROUND-8],[x+95,GROUND-12]],'#b99270',2);
      ellipse(x + 18, GROUND - 36, 12, 3, '#9bb689');
      ellipse(x + 38, GROUND - 37, 10, 3, '#aac18e');
    } else if (obstacle.kind === 'puddle') {
      ellipse(x + obstacle.width / 2, GROUND + 1, obstacle.width / 2 + 8, 17, '#c2d8c8');
      ellipse(x + obstacle.width / 2, GROUND - 1, obstacle.width / 2, 13, '#aed4d6');
      ellipse(x + obstacle.width / 2 + 8, GROUND - 2, obstacle.width / 2 - 18, 8, '#c7e3dc');
      ctx.beginPath(); ctx.ellipse(x+55,GROUND-1,22,4,0,Math.PI,Math.PI*1.9);
      ctx.strokeStyle='#f6f6dd';ctx.lineWidth=3;ctx.stroke();
      ellipse(x + obstacle.width - 24, GROUND - 4, 9, 2, '#eff1d7');
      star(x + obstacle.width - 40, GROUND - 13, 5, '#fffce5');
    } else if (obstacle.kind === 'cake') {
      drawCake(x + obstacle.width / 2, GROUND, obstacle.width, OBSTACLE_STYLES.cake.height);
    } else if (obstacle.kind === 'stones') {
      ellipse(x + 59, GROUND + 3, 66, 7, '#8f9b7020');
      [[24,14,23,14],[59,17,23,17],[91,13,25,13],[57,40,28,17]].forEach(([dx,dy,rx,ry], i) => {
        ellipse(x+dx,GROUND-dy,rx,ry,['#aaa9ba','#c4becb','#b5b2c1','#c9c4d0'][i]);
        ellipse(x+dx-5,GROUND-dy-ry*.4,rx*.6,3,'#ddd6df');
      });
    } else if (obstacle.kind === 'bush') {
      [[23,22,25],[53,36,32],[87,36,30],[112,20,24]].forEach(([dx,dy,r], i) => ellipse(x+dx,GROUND-dy,r,r,'#95b976'));
      [[20,28],[46,56],[72,29],[98,49],[114,20]].forEach(([dx,dy], i) => ellipse(x+dx,GROUND-dy,7,7,i%2?'#e6a353':'#df8391'));
    } else if (obstacle.kind === 'leaves') {
      for(let i=0;i<15;i+=1) {
        const dx=12+randomAt(i+6)*120, dy=7+randomAt(i+2)*34;
        ellipse(x+dx,GROUND-dy,18,9,['#dfab68','#e5c87a','#ce9574'][i%3],(randomAt(i)-.5)*1.4);
      }
    } else {
      ellipse(x+59,GROUND+3,78,8,'#8f9b701f');
      mushroom(x+15,GROUND,0.73,'#dcb0c6');
      mushroom(x+59,GROUND,1.18,'#c3afd2');
      mushroom(x+109,GROUND,0.88,'#e5b6b8');
    }
  }

  function drawWaitingCue(x, footY) {
    const cycle = state.time * Math.PI;
    const pressed = reducedMotion ? 0 : Math.max(0, Math.sin(cycle));
    const bounce = reducedMotion ? 0 : Math.sin(state.time * 1.6) * 2;
    const y = footY - 287 + bounce;
    ctx.save();
    ctx.lineWidth = 1.5;
    roundedRect(x - 88, y, 176, 89, 20, '#fffdf1f5', '#d4d3b8');
    ctx.beginPath(); ctx.moveTo(x - 8, y + 89); ctx.lineTo(x, y + 98); ctx.lineTo(x + 8, y + 89);
    ctx.fillStyle = '#fffdf1'; ctx.fill();
    // A long keyboard key, fingertip press, and hopping figure work without reading.
    const keyX = x - 72;
    const keyY = y + 51 + pressed * 3;
    roundedRect(keyX, y + 56, 92, 22, 7, '#cdd3bb');
    roundedRect(keyX, keyY, 92, 22, 7, pressed > .5 ? '#f3e6bb' : '#f9f6e7', '#b9c3a7');
    line([[keyX + 34, keyY + 8], [keyX + 34, keyY + 12], [keyX + 58, keyY + 12], [keyX + 58, keyY + 8]], '#899776', 1.6);
    ctx.font = '600 9px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#79866d'; ctx.fillText('SPACE', keyX + 46, keyY + 20);
    const fingertipY = y + 45 + pressed * 7;
    roundedRect(x - 31, fingertipY - 23, 10, 27, 5, '#ecc9ac');
    ellipse(x - 23, fingertipY - 24, 12, 8, '#ecc9ac', -.12);
    line([[x - 19, fingertipY - 18], [x - 13, fingertipY - 13]], '#e4bfa5', 6);
    if (pressed > .65) {
      line([[x - 45, keyY - 8], [x - 41, keyY - 4]], '#cabd82', 1.5);
      line([[x - 11, keyY - 8], [x - 15, keyY - 4]], '#cabd82', 1.5);
    }
    line([[x + 29, y + 14], [x + 29, y + 74]], '#e3e4cd', 1);
    const hop = pressed * 9;
    ctx.save(); ctx.translate(x + 57, y + 48 - hop);
    ellipse(0, -12, 7, 7, '#edc5ad');
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-10, 14); ctx.quadraticCurveTo(0, 18, 10, 14); ctx.lineTo(6, -4); ctx.closePath(); ctx.fillStyle = '#c2a0c9'; ctx.fill();
    line([[-5, 15], [-9, 22]], '#be93b9', 3); line([[5, 15], [11, 21]], '#be93b9', 3);
    line([[-5, 0], [-12, -3]], '#edc5ad', 3); line([[5, 0], [12, -5]], '#edc5ad', 3);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x + 42, y + 67); ctx.quadraticCurveTo(x + 28, y + 45, x + 43, y + 23);
    ctx.strokeStyle = '#a48bac'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    line([[x + 36, y + 25], [x + 43, y + 23], [x + 45, y + 31]], '#a48bac', 2.5);
    ctx.restore();
  }

  function drawRainbow(x, y, width, opacity = 1) {
    ctx.save(); ctx.globalAlpha = opacity; ctx.lineWidth = width * 0.048;
    const colors = ['#e7b1be','#efc5a1','#ead99b','#b8d4b0','#b4d4d3','#c7b6da'];
    colors.forEach((color,index) => {
      ctx.beginPath(); ctx.arc(x,y,width*0.5-index*width*0.049,Math.PI,Math.PI*2);
      ctx.strokeStyle=color;ctx.stroke();
    });
    if (!backgroundImage) { cloud(x-width*0.5,y,0.65,0.96);cloud(x+width*0.5,y,0.65,0.96); }
    ctx.restore();
  }

  function drawPicnic(camera, welcome = false) {
    const base = welcome ? 1060 : FINISH_X + 300 - camera;
    if (base < -330 || base > WIDTH + 350) return;
    if (!welcome) drawRainbow(base - 56, 474, 380, 0.67);
    ctx.save();
    ctx.translate(base - 60, GROUND + 10);
    ctx.transform(1, 0, -0.3, 0.42, 0, 0);
    roundedRect(-97, -9, 226, 100, 9, '#e2abb5');
    ctx.save(); ctx.beginPath(); ctx.roundRect(-97,-9,226,100,9);ctx.clip();
    ctx.fillStyle='#f2c5c8';for(let i=0;i<8;i+=1)ctx.fillRect(-95+i*32,-10,15,110);
    ctx.fillStyle='#f7d5cbaa';for(let i=0;i<5;i+=1)ctx.fillRect(-100,-8+i*25,240,11);
    ctx.restore(); ctx.restore();
    ellipse(base-10,GROUND+9,26,8,'#fcf4de');
    ellipse(base-10,GROUND+6,20,6,'#efe1be');
    ellipse(base-15,GROUND+4,5,4,'#d997a1');ellipse(base-4,GROUND+2,5,4,'#eab094');
    roundedRect(base-102,GROUND-20,33,32,5,'#cba67a');
    ctx.beginPath();ctx.arc(base-85,GROUND-19,12,Math.PI,0);ctx.strokeStyle='#b18d6d';ctx.lineWidth=4;ctx.stroke();
    line([[base-97,GROUND-11],[base-74,GROUND-11]],'#dfbd92',2);
    line([[base-97,GROUND-4],[base-74,GROUND-4]],'#dfbd92',2);
    if(!welcome){
      line([[base-177,GROUND-25],[base-177,GROUND-194]],'#a6b393',3);
      line([[base+159,GROUND-25],[base+159,GROUND-194]],'#a6b393',3);
      ctx.beginPath();ctx.moveTo(base-177,GROUND-190);ctx.quadraticCurveTo(base-7,GROUND-147,base+159,GROUND-190);
      ctx.strokeStyle='#acaa8b';ctx.lineWidth=1.5;ctx.stroke();
      for(let i=0;i<9;i+=1){const px=base-158+i*35;const py=GROUND-188+Math.sin((i+.5)/9*Math.PI)*21;
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+21,py+2);ctx.lineTo(px+10,py+22);ctx.closePath();
        ctx.fillStyle=['#d6b8ce','#eab4b8','#ecd59d','#b7d0b4'][i%4];ctx.fill();}
    }
    drawUnicorn(base+40,GROUND-1,welcome?1:1.04);
    if (state.phase === 'complete') drawCake(base + 220, GROUND + 10);
  }

  function drawCake(x, footY, width = 126, height = 131) {
    ctx.save(); ctx.translate(x, footY); ctx.scale(width / 126, height / 131);
    drawCakeBody(0, 0);
    ctx.restore();
  }

  function drawCakeBody(x, footY) {
    const width = 126, height = 131;
    ellipse(x, footY + 2, 70, 9, '#8caa7626');
    if (!drawProp('cake', x, footY, width, height)) {
      ellipse(x, footY, 67, 10, '#fff4df');
      roundedRect(x-51,footY-64,102,60,14,'#f7d093');
      roundedRect(x-52,footY-67,104,23,11,'#ecabc4');
      line([[x-47,footY-25],[x+47,footY-25]],'#b9a4df',6);
      for(const [i,dx] of [-27,0,27].entries()) {
        roundedRect(x+dx-4,footY-99,8,34,3,['#83d1de','#e895bd','#e6c17c'][i]);
        ellipse(x+dx,footY-108,5,9,'#ffe184');
      }
    }
    // Warm little glows sit over the three already-lit illustrated candle flames.
    const candles = extraPropsFrames.cake ? [[-.20,-.86],[.015,-.94],[.235,-.83]] : [[-.214,-.824],[0,-.824],[.214,-.824]];
    for (const [i,[dx,dy]] of candles.entries()) {
      const glow = reducedMotion ? .18 : .17 + Math.sin(state.finishTime*4+i)*.025;
      ctx.save();ctx.globalAlpha=glow;
      ellipse(x+dx*width,footY+dy*height,8,11,'#ffe5a0');
      ctx.restore();
    }
  }

  function drawParticles(camera) {
    state.particles.forEach(particle => {
      star(particle.x-camera,particle.y,particle.size,particle.color,Math.max(0,1-particle.age/particle.life));
    });
  }

  function drawSmallRainbow(x, y) {
    ellipse(x, y, 40, 29, '#fff9e83b');
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + 14, 29, Math.PI, Math.PI * 2);
    ctx.strokeStyle = '#fffaf2'; ctx.lineWidth = 8; ctx.stroke();
    ['#e891b5','#f5b37c','#efda75','#a5cb8d','#92c9db','#b5a0d7'].forEach((color,index) => {
      ctx.beginPath(); ctx.arc(x, y + 14, 28 - index * 3.5, Math.PI, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 3.8; ctx.stroke();
    });
    [-27,27].forEach(dx => {
      ellipse(x+dx,y+13,10,6,'#fffaf1');
      ellipse(x+dx-4,y+9,6,6,'#fffaf1'); ellipse(x+dx+4,y+10,6,5,'#fffaf1');
    });
    ctx.restore();
    star(x+36,y-22,4,'#f0cd79');
  }

  function drawAirRainbows(camera) {
    if (state.phase !== 'playing') return;
    for (const rainbow of rainbowDefinitions) {
      if (rainbow.collected) continue;
      const target = rainbowPosition(rainbow);
      const x = target.x - camera;
      if (x < -70 || x > WIDTH + 70) continue;
      drawSmallRainbow(x, target.y);
    }
  }

  function drawJumpStars(camera) {
    const hop = state.jump;
    if (!hop || hop.kind !== 'required') return;
    for (let i = hop.starsCollected; i < JUMP_STAR_POSITIONS.length; i += 1) {
      const progress = JUMP_STAR_POSITIONS[i];
      const x = mix(hop.startX, hop.endX, progress) - camera;
      const y = GROUND - Math.sin(progress * Math.PI) * hop.peak - 83;
      ctx.save(); ctx.translate(x, y); ctx.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = point * Math.PI / 5 - Math.PI / 2;
        const radius = point % 2 ? 4.4 : 9;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = '#f0cf83'; ctx.fill();
      ctx.strokeStyle = '#fff5cf'; ctx.lineWidth = 1.7; ctx.stroke(); ctx.restore();
      star(x + 12, y - 9, 2.5, '#fff6d8', .8);
    }
  }

  function drawLandingGlow(x, soles = false) {
    if (state.landingGlow <= 0 || state.jump) return;
    // Stay bright through the landing, then gently fade without flashing.
    const fade = Math.min(1, state.landingGlow / .85);
    const elapsed = LANDING_GLOW_DURATION - state.landingGlow;
    const colors = ['#00dedb', '#ff48af'];
    const feet = [x - 20, x + 22];
    ctx.save();
    ctx.globalAlpha = fade;
    if (soles) {
      feet.forEach((foot, index) => {
        ctx.shadowColor = colors[index];
        ctx.shadowBlur = reducedMotion ? 10 : 16;
        roundedRect(foot - 15, GROUND - 5, 30, 6, 3, colors[index], '#fffef3');
        ctx.shadowBlur = 0;
        for (const offset of [-9, -3, 3, 9]) ellipse(foot + offset, GROUND - 2, 1.6, 1.5, '#ffffff');
      });
      const rise = reducedMotion ? 0 : elapsed * 24;
      star(x - 39, GROUND - 14 - rise, 6, colors[0], fade);
      star(x + 38, GROUND - 19 - rise, 6, colors[1], fade);
      star(x + 1, GROUND - 13 - rise, 4.5, '#ffe386', fade);
      star(x - 12, GROUND - 29 - rise * .7, 3.5, '#fffef0', fade);
      star(x + 22, GROUND - 34 - rise * .7, 3.5, '#fffef0', fade);
    } else {
      ctx.globalAlpha = fade * .85;
      feet.forEach((foot, index) => {
        const glow = ctx.createRadialGradient(foot, GROUND, 1, foot, GROUND, 38);
        glow.addColorStop(0, colors[index]);
        glow.addColorStop(.4, `${colors[index]}b0`);
        glow.addColorStop(1, `${colors[index]}00`);
        ellipse(foot, GROUND + 2, 38, 14, glow);
      });
    }
    ctx.restore();
  }

  function drawFireworks() {
    const colors = ['#ff58b6', '#37d9ed', '#ac79ff', '#ffda4b', '#8ae66c', '#ff9867'];
    const bursts = [[190,195],[1090,220],[310,405],[950,425],[95,520],
      [1180,510],[525,140],[770,370],[220,325],[1090,160]];
    if (reducedMotion) {
      bursts.forEach(([x, y], index) => {
        star(x, y, 24, colors[index % colors.length], .9);
        star(x - 47, y + 26, 11, '#ffe599', .9);
        star(x + 43, y - 38, 13, '#d3b5ee', .9);
      });
      return;
    }
    // Huge, overlapping blooms across the whole stage, with no full-screen flashes.
    const celebrationTime = state.finishTime % 10;
    bursts.forEach(([x, y], index) => {
      const age = celebrationTime - index * .62;
      if (age < 0 || age > 3.25) return;
      if (age < .35) {
        const rocketY = mix(HEIGHT + 25, y, age / .35);
        line([[x, rocketY + 42], [x, rocketY]], '#ffdf79', 5);
        star(x, rocketY, 9, '#fff7ce');
        return;
      }
      const progress = (age - .35) / 2.9;
      const radius = 24 + Math.sin(progress * Math.PI / 2) * (230 + index % 3 * 24);
      const opacity = (1 - progress) ** .55;
      const fall = progress * progress * 75;
      ctx.save();
      ctx.globalAlpha = opacity;
      for (let petal = 0; petal < 42; petal += 1) {
        const angle = petal / 42 * Math.PI * 2 + index * .35;
        const distance = radius * (.85 + randomAt(petal + index * 31) * .15);
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance + fall;
        const color = colors[(petal + index) % colors.length];
        line([[x + Math.cos(angle) * distance * .63, y + Math.sin(angle) * distance * .63 + fall], [px, py]], color, 4);
        star(px, py, petal % 3 ? 5 : 9, color);
        star(x + Math.cos(angle + .06) * distance * .54, y + Math.sin(angle + .06) * distance * .54 + fall,
          petal % 4 ? 3 : 6, '#fff4cb');
      }
      star(x, y + fall, 17 * (1 - progress), colors[index % colors.length]);
      ctx.restore();
    });
  }

  function drawCelebration() {
    drawFireworks();
    const duration = reducedMotion ? 0 : state.finishTime;
    for(let i=0;i<45;i+=1){
      const speed=19+randomAt(i+75)*29;
      const x=125+randomAt(i+3)*1040+Math.sin(duration*.6+i)*14;
      const y=(randomAt(i)*650+duration*speed)%735-15;
      const color=['#e6b1bf','#c7b3d7','#daca91','#bad1b2'][i%4];
      if(i%3===0)star(x,y,3+randomAt(i+8)*4,color,.72);
      else{ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(duration+i)*.8);roundedRect(-3,-5,6,10,2,color);ctx.restore();}
    }
  }

  function draw() {
    ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);
    ctx.clearRect(0,0,WIDTH,HEIGHT);
    const camera=state.phase==='welcome'?0:state.camera;
    drawSky(camera);
    drawScenery(camera,state.phase==='welcome');

    if(state.phase==='welcome'){
      drawRainbow(934,448,435,.68);
      drawPicnic(0,true);
      drawBunny(698,GROUND,.85,false);
      drawKitten(930,GROUND,.88,false);
      drawHero(823,GROUND,false,false,1.23);
      const by=GROUND-268+(reducedMotion?0:Math.sin(state.time*2)*4);
      heart(826,by,13,'#dca7bb');
      star(768,404,6,'#d7ba79',.8);star(956,390,7,'#d7ba79',.8);
      return;
    }

    obstacleDefinitions.forEach(obstacle=>drawObstacle(obstacle,camera));
    drawPicnic(camera);
    obstacleDefinitions.forEach((obstacle,index)=>{
      const friendIndex = obstacle.friendIndex;
      if(friendIndex === null || friendIndex < state.friends)return;
      const x=landingPosition(obstacle)+93-camera;
      if(x<-140||x>WIDTH+140)return;
      drawFriend(friendIndex,x,GROUND,0.86,false);
      if(index===state.obstacleIndex){
        const bob=reducedMotion?0:Math.sin(state.time*2)*3;
        heart(x+8,GROUND-(friendIndex===2?132:112)+bob,7,'#d9a9b5');
      }
    });

    const heroScreenX=state.heroX-camera;
    const moving=state.phase==='playing'&&!state.waiting&&!state.paused;
    for(let index=state.friends-1;index>=0;index-=1){
      const gap=[99,174,256][index];
      let x=heroScreenX-gap;
      if(state.phase==='complete')x=heroScreenX+97+index*80;
      let lift=state.jump?Math.sin(clamp((state.jump.elapsed-0.13*(index+1))/state.jump.duration,0,1)*Math.PI)*21:0;
      const join=state.friendJoin?.index===index?state.friendJoin:null;
      if(join){
        const progress=clamp(join.elapsed/join.duration,0,1);
        const ease=progress*progress*(3-2*progress);
        x=mix(join.startX-camera,x,ease);
        lift=Math.sin(Math.min(join.elapsed/.7,1)*Math.PI)*24;
        heart(x+10,GROUND-(index===2?125:108)-lift,9,'#dca7bb');
      }
      drawFriend(index,x,GROUND-lift,index===2?.8:.88,moving&&!join);
      if(state.phase==='complete'&&!reducedMotion){
        const bob=Math.sin(state.time*2+index)*5;
        heart(x+9,GROUND-(index===2?120:109)+bob,7,'#dca7bb');
      }
    }
    drawAirRainbows(camera);
    drawJumpStars(camera);
    drawLandingGlow(heroScreenX);
    drawHero(heroScreenX,GROUND-state.heroLift,moving&&!state.jump,Boolean(state.jump));
    drawLandingGlow(heroScreenX,true);
    if(state.waiting&&!state.paused)drawWaitingCue(heroScreenX,GROUND);
    if(state.greeting>0){
      const rise=(2.6-state.greeting)*14;
      heart(heroScreenX+42,GROUND-185-rise,12,'#dca6b8');
      star(heroScreenX-25,GROUND-155-rise,6,'#d7ba79');
    }
    drawParticles(camera);
    if(state.phase==='complete')drawCelebration();
  }

  function resizeCanvas() {
    const rect=canvas.getBoundingClientRect();
    const ratio=Math.min(window.devicePixelRatio||1,3);
    canvas.width=Math.max(1,Math.round(rect.width*ratio));
    canvas.height=Math.max(1,Math.round(rect.height*ratio));
    draw();
  }

  function loadHeroAsset() {
    loadHeroPoses();
    heroConfig=window.YULI_ASSETS?.hero||{};
    if(!heroConfig.src)return;
    const image=new Image();
    image.onload=()=>{
      const supplied=Array.isArray(heroConfig.frames)?heroConfig.frames:[];
      heroFrames=supplied.filter(f=>[f.x,f.y,f.w,f.h].every(Number.isFinite)&&f.w>0&&f.h>0&&f.x>=0&&f.y>=0&&f.x+f.w<=image.naturalWidth&&f.y+f.h<=image.naturalHeight);
      if(!heroFrames.length)heroFrames=[{x:0,y:0,w:image.naturalWidth,h:image.naturalHeight}];
      heroImage=image;assetLoaded=true;draw();
    };
    image.onerror=()=>{assetLoaded=false;};
    image.src=heroConfig.src;
  }

  function loadHeroPoses() {
    heroPoseConfig = window.YULI_ASSETS?.heroPoses || {};
    if (!heroPoseConfig.src) return;
    const image = new Image();
    image.onload = () => {
      const frames = {};
      for (const name of ['idle', 'waiting', 'jump', 'celebrate']) {
        const frame = heroPoseConfig.frames?.[name];
        if (frame && [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite)
          && frame.w > 0 && frame.h > 0 && frame.x >= 0 && frame.y >= 0
          && frame.x + frame.w <= image.naturalWidth && frame.y + frame.h <= image.naturalHeight) {
          frames[name] = frame;
        }
      }
      if (Object.keys(frames).length) {
        heroPoseFrames = frames;
        heroPoseImage = image;
        draw();
      }
    };
    image.src = heroPoseConfig.src;
  }

  function loadMeadowAssets() {
    const assets = window.YULI_ASSETS || {};
    if (assets.background?.src) {
      const image = new Image();
      image.onload = () => { backgroundImage = image; draw(); };
      image.src = assets.background.src;
    }
    if (assets.props?.src) {
      const image = new Image();
      image.onload = () => {
        const frames = {};
        for (const name of ['log', 'puddle', 'mushrooms', 'flowers']) {
          const frame = assets.props.frames?.[name];
          if (frame && [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite)
            && frame.w > 0 && frame.h > 0 && frame.x >= 0 && frame.y >= 0
            && frame.x + frame.w <= image.naturalWidth && frame.y + frame.h <= image.naturalHeight) {
            frames[name] = frame;
          }
        }
        if (Object.keys(frames).length) {
          propsFrames = frames;
          propsImage = image;
          draw();
        }
      };
      image.src = assets.props.src;
    }
    if (assets.extraProps?.src) {
      const image = new Image();
      image.onload = () => {
        const frames = {};
        for (const name of ['stones', 'bush', 'leaves', 'cake']) {
          const f = assets.extraProps.frames?.[name];
          if (f && [f.x,f.y,f.w,f.h].every(Number.isFinite) && f.w>0 && f.h>0
            && f.x>=0 && f.y>=0 && f.x+f.w<=image.naturalWidth && f.y+f.h<=image.naturalHeight) frames[name] = f;
        }
        if (Object.keys(frames).length) { extraPropsFrames = frames; extraPropsImage = image; draw(); }
      };
      image.src = assets.extraProps.src;
    }
    for (const name of ['bunny', 'kitten', 'deer', 'unicorn']) {
      const config = assets.animals?.[name];
      if (!config?.src) continue;
      const image = new Image();
      image.onload = () => {
        const requested = config.frame;
        const frame = requested && [requested.x, requested.y, requested.w, requested.h].every(Number.isFinite)
          && requested.w > 0 && requested.h > 0 && requested.x >= 0 && requested.y >= 0
          && requested.x + requested.w <= image.naturalWidth && requested.y + requested.h <= image.naturalHeight
          ? requested : { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
        animalImages.set(name, { image, frame, drawHeight: config.drawHeight });
        draw();
      };
      image.src = config.src;
    }
  }

  document.getElementById('startButton').addEventListener('click',startGame);
  document.getElementById('replayButton').addEventListener('click',startGame);
  document.getElementById('resumeButton').addEventListener('click',()=>setPaused(false));
  pauseButton.addEventListener('click',()=>setPaused(!state.paused));
  restartButton.addEventListener('click',startGame);
  soundButton.addEventListener('click',()=>{
    state.muted=!state.muted;
    try { window.localStorage.setItem(MUTE_STORAGE_KEY, String(state.muted)); }
    catch (_) { /* Sound still works when a local browser denies saved preferences. */ }
    syncUI();
    if(masterGain)masterGain.gain.setValueAtTime(state.muted?0:.22,audioContext.currentTime);
    if(!state.muted){ensureAudio();if(state.phase==='complete'&&state.musicEnabled&&!victoryVoices.size)playVictoryMusic();}
    focusGame();
  });
  musicButton.addEventListener('click',()=>{
    state.musicEnabled = !state.musicEnabled;
    try { window.localStorage.setItem(MUSIC_STORAGE_KEY, String(state.musicEnabled)); }
    catch (_) { /* A local browser may deny saved preferences. */ }
    syncUI();
    if(state.phase==='complete'&&state.musicEnabled&&!victoryVoices.size)playVictoryMusic();
    focusGame();
  });
  fullScreenButton.addEventListener('click',()=>{
    try{
      const active=document.fullscreenElement||document.webkitFullscreenElement;
      if(active){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit){const result=exit.call(document);if(result?.catch)result.catch(()=>{});}}
      else{const enter=stage.requestFullscreen||stage.webkitRequestFullscreen;if(enter){const result=enter.call(stage);if(result?.catch)result.catch(()=>{});}}
    }catch(_){/* Full screen can be unavailable in an embedded preview. */}
    focusGame();
  });
  function syncFullScreen(){
    const active=Boolean(document.fullscreenElement||document.webkitFullscreenElement);
    fullScreenButton.setAttribute('aria-label',active?'Exit full screen':'Enter full screen');
    fullScreenButton.title=active?'Exit full screen':'Full screen';
    resizeCanvas();focusGame();
  }
  document.addEventListener('fullscreenchange',syncFullScreen);
  document.addEventListener('webkitfullscreenchange',syncFullScreen);
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==undefined&&event.button!==0)return;
    event.preventDefault();
    focusGame();
    jump();
  });
  window.addEventListener('keydown',event=>{
    if(event.code==='Space'||event.key===' '){
      // Parent controls keep their native keyboard activation when reached with Tab.
      if(event.target instanceof HTMLButtonElement)return;
      event.preventDefault();
      if(event.repeat||heldSpace)return;
      heldSpace=true;jump();
    }else if(event.key==='Escape'&&state.phase==='playing'){
      event.preventDefault();if(!event.repeat)setPaused(!state.paused);
    }
  });
  window.addEventListener('keyup',event=>{if(event.code==='Space'||event.key===' ')heldSpace=false;});
  window.addEventListener('blur',()=>{heldSpace=false;if(state.phase==='playing'&&!state.paused)setPaused(true);});
  document.addEventListener('visibilitychange',()=>{
    heldSpace=false;
    if(document.hidden){stopVictoryMusic();if(state.phase==='playing'&&!state.paused)setPaused(true);}
    lastTick=performance.now();
  });
  if('ResizeObserver'in window)new ResizeObserver(resizeCanvas).observe(stage);
  else window.addEventListener('resize',resizeCanvas);

  function getState(){
    return Object.freeze({phase:state.phase,heroX:Math.round(state.heroX*100)/100,
      runSeed, finishX:FINISH_X, obstacleCount:obstacleDefinitions.length, targetRunSeconds:RUN_DURATION,
      rainbowsCollected:state.rainbowsCollected, rainbowCount:rainbowDefinitions.length,
      airRainbows:Object.freeze(rainbowDefinitions.map(rainbow=>Object.freeze({...rainbow}))),
      nextObstacleKind:nextObstacle()?.kind || null,
      obstacleIndex:state.obstacleIndex,friends:state.friends,friendsCount:state.friends,
      waiting:state.waiting,jumping:Boolean(state.jump),jumpKind:state.jump?.kind||null,
      paused:state.paused,assetLoaded,muted:state.muted,
      landingGlow:Math.round(state.landingGlow*1000)/1000,musicEnabled:state.musicEnabled,
      jumpStarsRemaining:state.jump?.kind==='required'?JUMP_STAR_POSITIONS.length-state.jump.starsCollected:0,
      poseAssetLoaded:Boolean(heroPoseImage),
      propsAssetLoaded:Boolean(propsImage),extraPropsAssetLoaded:Boolean(extraPropsImage),
      celebrating:state.phase==='complete'&&state.finishTime<CELEBRATION_DURATION,
      wrapUpVisible:state.phase==='complete'&&state.finishTime>=CELEBRATION_DURATION,
      celebrationRemaining:state.phase==='complete'?Math.max(0,CELEBRATION_DURATION-state.finishTime):0,
      friendJoining:state.friendJoin?.index??null,
      progress:Math.round(clamp((state.heroX-START_X)/(FINISH_X-START_X),0,1)*100),
      camera:Math.round(state.camera*100)/100});
  }
  Object.defineProperty(window,'__YULI_GAME__',{value:Object.freeze({
    getState,
    advance(seconds){
      if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new RangeError('Advance must be between 0 and 120 seconds.');
      const fullSteps=Math.floor(seconds*60);
      for(let i=0;i<fullSteps;i+=1)update(1/60);
      const remainder=seconds-fullSteps/60;if(remainder>0)update(remainder);
      draw();return getState();
    },
  }),writable:false,configurable:false});

  function tick(now){
    const dt=Math.min(Math.max(0,(now-lastTick)/1000),0.05);
    lastTick=now;
    if(!document.hidden&&!state.paused){
      update(dt);
      draw();
    }
    requestAnimationFrame(tick);
  }
  syncUI();loadHeroAsset();loadMeadowAssets();resizeCanvas();requestAnimationFrame(tick);
})();
