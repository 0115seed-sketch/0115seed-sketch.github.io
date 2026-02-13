/* global Matter */
const {
  Engine,
  Render,
  Runner,
  World,
  Bodies,
  Body,
  Events,
  Composite,
  Common,
} = Matter;

const canvas = document.getElementById("gameCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const pauseButton = document.getElementById("pauseButton");
const homeScreen = document.getElementById("homeScreen");
const pauseScreen = document.getElementById("pauseScreen");
const resultScreen = document.getElementById("resultScreen");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const timerEl = document.getElementById("timer");
const actionToast = document.getElementById("actionToast");
const startButton = document.getElementById("startButton");
const resumeButton = document.getElementById("resumeButton");
const homeButton = document.getElementById("homeButton");
const restartButton = document.getElementById("restartButton");

const engine = Engine.create();
const world = engine.world;
world.gravity.y = 0.1;

let render;
let runner;
let player;
let ground;
let gameActive = false;
let isPaused = false;
let targetX = 0;
let currentXValue = 1;
let spawnTimer = 0;
let spawnInterval = 1600;
let dropSpeedScale = 0.1;
let playerBaseY = 0;
const basePrimes = [2, 3, 5, 7];
const effects = [];
const particles = [];
let elapsedMs = 0;
let playerVelocityX = 0;
let playerScale = 1;
let pulseTimer = 0;
let pulseDuration = 0;
let toastTimer;
let resizeRaf;
let resizeDebounceTimer;
const primeBodies = new Set();

const cutePalettes = {
  player: {
    base: "#ff9aa2",
    light: "#ffe2e6",
    outline: "#ff6f83",
    eye: "#5a3941",
    blush: "#ffb6c1",
  },
  prime: {
    base: "#9de7ff",
    light: "#e8f9ff",
    outline: "#5fbfe0",
    eye: "#2f4b5f",
    blush: "#ffb6d4",
  },
};

const state = {
  keys: { left: false, right: false },
  touch: { left: false, right: false },
  pointerActive: false,
};

const activeTouchZones = new Map();

const GAME_WIDTH = 560;
const GAME_HEIGHT = 900;

function resizeCanvas() {
  const wrap = document.getElementById("canvasWrap");
  const rect = wrap.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) {
    return;
  }
  const scale = Math.min(rect.width / GAME_WIDTH, rect.height / GAME_HEIGHT);
  const safeScale = Number.isFinite(scale) ? scale : 1;
  canvas.style.width = `${GAME_WIDTH}px`;
  canvas.style.height = `${GAME_HEIGHT}px`;
  canvas.style.transform = `translate(-50%, -50%) scale(${safeScale})`;

  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = GAME_WIDTH * ratio;
  canvas.height = GAME_HEIGHT * ratio;
  playerBaseY = GAME_HEIGHT - 110;

  if (render) {
    render.options.width = GAME_WIDTH;
    render.options.height = GAME_HEIGHT;
    Render.setPixelRatio(render, ratio);
  }

  if (ground) {
    Body.setPosition(ground, {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 30,
    });
    Body.setVertices(
      ground,
      Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 30, GAME_WIDTH, 60)
        .vertices
    );
  }

  if (player) {
    const currentX = player.position.x;
    const minX = 40;
    const maxX = GAME_WIDTH - 40;
    targetX = Math.max(minX, Math.min(maxX, currentX));
    Body.setPosition(player, {
      x: targetX,
      y: playerBaseY,
    });
  }
}

function scheduleResize() {
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf);
  }
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    resizeCanvas();
  });
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
  }
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null;
    resizeCanvas();
  }, 180);
}

function setupWorld() {
  if (render) {
    Render.stop(render);
  }
  if (runner) {
    Runner.stop(runner);
  }
  Composite.clear(world, false);
  primeBodies.clear();

  render = Render.create({
    canvas,
    engine,
    options: {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      wireframes: false,
      background: "transparent",
    },
  });

  ground = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 30, GAME_WIDTH, 60, {
    isStatic: true,
    render: { fillStyle: "#ffe6d8" },
  });

  player = Bodies.circle(GAME_WIDTH / 2, GAME_HEIGHT - 110, 34, {
    frictionAir: 0.2,
    render: { visible: false },
  });
  player.isStatic = true;
  player.isSensor = true;
  player.plugin = {
    labelText: "1",
    textColor: "#2f2a36",
    textStroke: "#ffffff",
    kind: "player",
    cuteLabelOffset: 0,
  };

  World.add(world, [ground, player]);

  Events.on(render, "afterRender", drawLabels);
  Events.on(engine, "beforeUpdate", updatePlayer);
  Events.on(engine, "beforeUpdate", handleSpawns);
  Events.on(engine, "beforeUpdate", updateTimer);
  Events.on(engine, "beforeUpdate", updatePrimeMotion);
  Events.on(engine, "beforeUpdate", updatePlayerPulse);
  Events.on(engine, "afterUpdate", cleanupOffscreen);
  Events.on(engine, "afterUpdate", updateEffects);
  Events.on(engine, "afterUpdate", updateParticles);
  Events.on(engine, "collisionStart", handleCollision);

  runner = Runner.create({
    isFixed: true,
    delta: 1000 / 60,
  });
  Runner.run(runner, engine);
  Render.run(render);
}

function drawLabels() {
  const ctx = render.context;
  ctx.save();
  const ratio = render.options.pixelRatio || window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const bodies = [];
  if (player) {
    bodies.push(player);
  }
  primeBodies.forEach((body) => bodies.push(body));

  bodies.forEach((body) => {
    if (body.plugin && body.plugin.kind) {
      drawCuteBall(ctx, body);
    }
  });
  bodies.forEach((body) => {
    if (!body.plugin || !body.plugin.labelText) {
      return;
    }
    const { x, y } = body.position;
    ctx.fillStyle = body.plugin.textColor || "#2f2a36";
    ctx.strokeStyle = body.plugin.textStroke || "#ffffff";
    const radius = body.circleRadius || 28;
    const fontSize = Math.max(14, Math.min(20, radius * 0.7));
    ctx.font = `700 ${fontSize}px 'Jua', 'Trebuchet MS', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const offset = body.plugin.cuteLabelOffset || 0;
    ctx.lineWidth = Math.max(3, radius * 0.12);
    ctx.strokeText(body.plugin.labelText, x, y + offset);
    ctx.fillText(body.plugin.labelText, x, y + offset);
  });

  effects.forEach((effect) => {
    ctx.globalAlpha = effect.alpha;
    ctx.fillStyle = effect.color;
    ctx.font = "700 18px 'Jua', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(effect.text, effect.x, effect.y);
  });

  particles.forEach((particle) => {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawCuteBall(ctx, body) {
  const palette = body.plugin.kind === "player" ? cutePalettes.player : cutePalettes.prime;
  const radius = body.circleRadius || 26;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);

  const gradient = ctx.createRadialGradient(
    -radius * 0.3,
    -radius * 0.4,
    radius * 0.2,
    0,
    0,
    radius
  );
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(1, palette.base);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.strokeStyle = palette.outline;
  ctx.stroke();

  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(
    -radius * 0.35,
    -radius * 0.35,
    radius * 0.22,
    radius * 0.16,
    -0.4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function updatePlayer(event) {
  if (!gameActive || isPaused) {
    return;
  }

  const currentX = player.position.x;
  const deltaRatio = event.delta / 16.67;
  const maxSpeed = 3.0;
  let targetVel = 0;
  if (state.pointerActive) {
    const diff = targetX - currentX;
    targetVel = Math.max(-maxSpeed, Math.min(maxSpeed, diff * 0.08));
  }
  const leftHeld = state.keys.left || state.touch.left;
  const rightHeld = state.keys.right || state.touch.right;
  if (leftHeld || rightHeld) {
    const direction = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
    targetVel = direction * maxSpeed;
  }

  const accel = maxSpeed * 0.35;
  const decel = maxSpeed * 0.45;
  if (targetVel !== 0) {
    const diff = targetVel - playerVelocityX;
    const step = Math.sign(diff) * accel * deltaRatio;
    playerVelocityX = Math.abs(step) > Math.abs(diff) ? targetVel : playerVelocityX + step;
  } else {
    const step = Math.sign(playerVelocityX) * decel * deltaRatio;
    playerVelocityX = Math.abs(step) > Math.abs(playerVelocityX) ? 0 : playerVelocityX - step;
  }

  let desiredX = currentX + playerVelocityX * deltaRatio;

  const minX = 40;
  const maxX = GAME_WIDTH - 40;
  desiredX = Math.max(minX, Math.min(maxX, desiredX));

  Body.setPosition(player, { x: desiredX, y: playerBaseY });
}

function handleSpawns(event) {
  if (!gameActive || isPaused) {
    return;
  }

  spawnTimer += event.delta;
  if (spawnTimer < spawnInterval) {
    return;
  }
  spawnTimer = 0;

  const primeData = pickPrimeForDrop();
  if (!primeData) {
    return;
  }

  const x = 40 + Math.random() * (GAME_WIDTH - 80);
  const body = Bodies.circle(x, -40, 26, {
    restitution: 0.4,
    frictionAir: 0.01,
    render: { visible: false },
  });
  body.plugin = {
    labelText: String(primeData.value),
    textColor: "#2f2a36",
    textStroke: "#ffffff",
    primeValue: primeData.value,
    source: primeData.source,
    driftX: Common.random(-0.00035, 0.00035),
    swingPhase: Common.random(0, Math.PI * 2),
    kind: "prime",
    cuteLabelOffset: 0,
  };
  Body.setVelocity(body, { x: Common.random(-0.4, 0.4), y: 1.2 * dropSpeedScale });

  World.add(world, body);
  primeBodies.add(body);
}

function cleanupOffscreen() {
  primeBodies.forEach((body) => {
    if (body.position.y > GAME_HEIGHT + 120) {
      World.remove(world, body);
      primeBodies.delete(body);
    }
  });
}

function handleCollision(event) {
  if (!gameActive || isPaused) {
    return;
  }

  event.pairs.forEach((pair) => {
    const bodies = [pair.bodyA, pair.bodyB];
    const primeBody = bodies.find((body) => body.plugin && body.plugin.primeValue);
    if (!primeBody) {
      return;
    }

    const other = primeBody === pair.bodyA ? pair.bodyB : pair.bodyA;
    if (other === ground) {
      World.remove(world, primeBody);
      primeBodies.delete(primeBody);
      return;
    }
    if (other !== player) {
      return;
    }

    const prime = primeBody.plugin.primeValue;
    const isDivisor = currentXValue % prime === 0;
    if (currentXValue % prime === 0) {
      currentXValue = currentXValue / prime;
    } else {
      currentXValue += prime;
    }

    updateXValue();
    addEffect(isDivisor ? `÷${prime}` : `+${prime}`, player.position.x, player.position.y - 50, isDivisor);
    addParticles(player.position.x, player.position.y - 20, isDivisor);
    triggerPulse();
    if (isDivisor) {
      triggerShake();
    }
    World.remove(world, primeBody);
    primeBodies.delete(primeBody);

    if (currentXValue >= 1000) {
      endGame(true);
    }
  });
}

function updateXValue() {
  if (player && player.plugin) {
    player.plugin.labelText = String(currentXValue);
  }
}

function updateTimer(event) {
  if (!gameActive || isPaused) {
    return;
  }
  elapsedMs += event.delta;
  if (timerEl) {
    timerEl.textContent = formatTime(elapsedMs);
  }
}

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function addEffect(text, x, y, isDivide) {
  effects.push({
    text,
    x,
    y,
    life: 800,
    total: 800,
    alpha: 1,
    vy: 0.6,
    color: isDivide ? "#5aa6ff" : "#ff6f61",
  });
}

function updateEffects(event) {
  const deltaRatio = event.delta / 16.67;
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    effect.life -= event.delta;
    effect.y -= effect.vy * deltaRatio;
    effect.alpha = Math.max(0, effect.life / effect.total);
    if (effect.life <= 0) {
      effects.splice(i, 1);
    }
  }
}

function addParticles(x, y, isDivide) {
  const color = isDivide ? "#ff5b5b" : "#5ccf7a";
  for (let i = 0; i < 8; i += 1) {
    const angle = Common.random(0, Math.PI * 2);
    const speed = Common.random(0.6, 1.6);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life: 700,
      total: 700,
      alpha: 1,
      size: Common.random(2, 4),
      color,
    });
  }
}

function updateParticles(event) {
  const deltaRatio = event.delta / 16.67;
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= event.delta;
    particle.x += particle.vx * deltaRatio;
    particle.y += particle.vy * deltaRatio;
    particle.vy += 0.06 * deltaRatio;
    particle.alpha = Math.max(0, particle.life / particle.total);
    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updatePrimeMotion(event) {
  if (!gameActive || isPaused) {
    return;
  }
  primeBodies.forEach((body) => {
    const phase = body.plugin.swingPhase || 0;
    const forceX = Math.sin(performance.now() / 1000 * 2.4 + phase) * (0.0008 * dropSpeedScale);
    Body.applyForce(body, body.position, { x: forceX, y: 0 });
  });
}

function triggerPulse() {
  pulseTimer = 0;
  pulseDuration = 180;
}

function updatePlayerPulse(event) {
  if (pulseDuration <= 0 || !player) {
    return;
  }
  pulseTimer += event.delta;
  const t = Math.min(1, pulseTimer / pulseDuration);
  const eased = t < 0.5 ? t * 2 : (1 - t) * 2;
  const targetScale = 1 + eased * 0.12;
  const scaleFactor = targetScale / playerScale;
  if (Math.abs(scaleFactor - 1) > 0.001) {
    Body.scale(player, scaleFactor, scaleFactor);
    playerScale = targetScale;
  }
  if (t >= 1) {
    const resetFactor = 1 / playerScale;
    if (Math.abs(resetFactor - 1) > 0.001) {
      Body.scale(player, resetFactor, resetFactor);
    }
    playerScale = 1;
    pulseDuration = 0;
  }
}

function triggerShake() {
  if (!canvasWrap) {
    return;
  }
  canvasWrap.classList.remove("shake");
  void canvasWrap.offsetWidth;
  canvasWrap.classList.add("shake");
  setTimeout(() => {
    canvasWrap.classList.remove("shake");
  }, 180);
}

function pickPrimeForDrop() {
  const roll = Math.random();
  if (roll < 0.8) {
    return {
      value: basePrimes[Math.floor(Math.random() * basePrimes.length)],
      source: "base",
    };
  }
  if (roll < 0.9) {
    const factors = primeFactors(currentXValue);
    if (factors.length) {
      return {
        value: factors[Math.floor(Math.random() * factors.length)],
        source: "factor",
      };
    }
  }
  const randomPrime = randomPrimeBelow(currentXValue + 2);
  if (randomPrime) {
    return { value: randomPrime, source: "random" };
  }
  return {
    value: basePrimes[Math.floor(Math.random() * basePrimes.length)],
    source: "base",
  };
}

function primeFactors(number) {
  const factors = [];
  let n = number;
  if (n < 2) {
    return factors;
  }
  if (n % 2 === 0) {
    factors.push(2);
    while (n % 2 === 0) {
      n /= 2;
    }
  }
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) {
      factors.push(i);
      while (n % i === 0) {
        n /= i;
      }
    }
  }
  if (n > 1) {
    factors.push(n);
  }
  return factors;
}

function randomPrimeBelow(limit) {
  const primes = [];
  for (let n = 2; n < limit; n += 1) {
    if (isPrime(n)) {
      primes.push(n);
    }
  }
  if (!primes.length) {
    return null;
  }
  return primes[Math.floor(Math.random() * primes.length)];
}

function isPrime(number) {
  if (number < 2) return false;
  if (number === 2) return true;
  if (number % 2 === 0) return false;
  const limit = Math.floor(Math.sqrt(number));
  for (let i = 3; i <= limit; i += 2) {
    if (number % i === 0) {
      return false;
    }
  }
  return true;
}

function startGame() {
  gameActive = true;
  isPaused = false;
  engine.timing.timeScale = 1;
  currentXValue = 1;
  updateXValue();
  spawnTimer = 0;
  spawnInterval = 1600;
  targetX = player ? player.position.x : GAME_WIDTH / 2;
  elapsedMs = 0;
  if (timerEl) {
    timerEl.textContent = formatTime(elapsedMs);
  }

  primeBodies.forEach((body) => {
    World.remove(world, body);
  });
  primeBodies.clear();

  homeScreen.classList.remove("active");
  pauseScreen.classList.remove("active");
  resultScreen.classList.remove("active");
}

function endGame(isClear) {
  gameActive = false;
  isPaused = false;
  engine.timing.timeScale = 0;
  resultTitle.textContent = isClear ? "게임 클리어" : "게임 종료";
  resultMessage.textContent = isClear
    ? `1000까지 도달 시간: ${formatTime(elapsedMs)}`
    : "다시 도전해 보세요!";
  resultScreen.classList.add("active");
}

function pauseGame() {
  if (!gameActive || isPaused) {
    return;
  }
  isPaused = true;
  engine.timing.timeScale = 0;
  pauseScreen.classList.add("active");
}

function resumeGame() {
  if (!gameActive) {
    return;
  }
  isPaused = false;
  engine.timing.timeScale = 1;
  pauseScreen.classList.remove("active");
}

function resetToHome() {
  gameActive = false;
  isPaused = false;
  engine.timing.timeScale = 0;
  elapsedMs = 0;
  if (timerEl) {
    timerEl.textContent = formatTime(elapsedMs);
  }
  primeBodies.forEach((body) => {
    World.remove(world, body);
  });
  primeBodies.clear();
  homeScreen.classList.add("active");
  pauseScreen.classList.remove("active");
  resultScreen.classList.remove("active");
}

function showToast(message) {
  if (!actionToast) {
    return;
  }
  actionToast.textContent = message;
  actionToast.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    actionToast.classList.remove("show");
  }, 900);
}

function handleKey(e, isDown) {
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    state.keys.left = isDown;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    state.keys.right = isDown;
  }
}

function handlePointer(e) {
  if (!gameActive || isPaused) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / GAME_WIDTH;
  if (scaleX <= 0) {
    return;
  }
  const x = (e.clientX - rect.left) / scaleX;
  targetX = x;
}

function getTouchZone(e) {
  const rect = canvas.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  return e.clientX < midX ? "left" : "right";
}

function syncTouchState() {
  state.touch.left = false;
  state.touch.right = false;
  activeTouchZones.forEach((zone) => {
    if (zone === "left") {
      state.touch.left = true;
    }
    if (zone === "right") {
      state.touch.right = true;
    }
  });
}

function setupInput() {
  window.addEventListener("keydown", (e) => handleKey(e, true));
  window.addEventListener("keyup", (e) => handleKey(e, false));

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      activeTouchZones.set(e.pointerId, getTouchZone(e));
      syncTouchState();
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    state.pointerActive = true;
    handlePointer(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      return;
    }
    if (!state.pointerActive) return;
    handlePointer(e);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      activeTouchZones.delete(e.pointerId);
      syncTouchState();
      return;
    }
    state.pointerActive = false;
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") {
      activeTouchZones.delete(e.pointerId);
      syncTouchState();
      return;
    }
    state.pointerActive = false;
  });
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") {
      activeTouchZones.delete(e.pointerId);
      syncTouchState();
      return;
    }
    state.pointerActive = false;
  });
}

function init() {
  resizeCanvas();
  setupWorld();
  setupInput();
  engine.timing.timeScale = 0;

  window.addEventListener("resize", scheduleResize);
  if ("ResizeObserver" in window && canvasWrap) {
    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(canvasWrap);
  }

  startButton.addEventListener("click", () => {
    showToast("게임 시작!");
    startGame();
  });
  resumeButton.addEventListener("click", () => {
    showToast("다시 시작!");
    resumeGame();
  });
  homeButton.addEventListener("click", () => {
    showToast("홈으로 이동");
    resetToHome();
  });
  restartButton.addEventListener("click", () => {
    showToast("다시 도전!");
    startGame();
  });
  pauseButton.addEventListener("click", () => {
    showToast("일시정지");
    pauseGame();
  });
}

init();
