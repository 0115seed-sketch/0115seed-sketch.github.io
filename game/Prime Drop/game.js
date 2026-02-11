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

const state = {
  keys: { left: false, right: false },
  pointerActive: false,
  pointerX: 0,
};

function resizeCanvas() {
  const wrap = document.getElementById("canvasWrap");
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  playerBaseY = canvas.height - 110;

  if (render) {
    render.options.width = canvas.width;
    render.options.height = canvas.height;
    Render.setPixelRatio(render, window.devicePixelRatio);
  }

  if (ground) {
    Body.setPosition(ground, {
      x: canvas.width / 2,
      y: canvas.height - 30,
    });
    Body.setVertices(
      ground,
      Bodies.rectangle(canvas.width / 2, canvas.height - 30, canvas.width, 60)
        .vertices
    );
  }

  if (player) {
    const currentX = player.position.x;
    const minX = 40 * window.devicePixelRatio;
    const maxX = canvas.width - 40 * window.devicePixelRatio;
    targetX = Math.max(minX, Math.min(maxX, currentX));
    Body.setPosition(player, {
      x: targetX,
      y: playerBaseY,
    });
  }
}

function setupWorld() {
  if (render) {
    Render.stop(render);
  }
  if (runner) {
    Runner.stop(runner);
  }
  Composite.clear(world, false);

  render = Render.create({
    canvas,
    engine,
    options: {
      width: canvas.width,
      height: canvas.height,
      wireframes: false,
      background: "transparent",
    },
  });

  ground = Bodies.rectangle(canvas.width / 2, canvas.height - 30, canvas.width, 60, {
    isStatic: true,
    render: { fillStyle: "#ffe6d8" },
  });

  player = Bodies.circle(canvas.width / 2, canvas.height - 110, 34, {
    frictionAir: 0.2,
    render: { fillStyle: "#ff9aa2" },
  });
  player.isStatic = true;
  player.isSensor = true;
  player.plugin = { labelText: "1", textColor: "#ffffff" };

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

  runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);
}

function drawLabels() {
  const ctx = render.context;
  ctx.save();
  const ratio = render.options.pixelRatio || window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const bodies = Composite.allBodies(world);
  bodies.forEach((body) => {
    if (!body.plugin || !body.plugin.labelText) {
      return;
    }
    const { x, y } = body.position;
    ctx.fillStyle = body.plugin.textColor || "#2f2a36";
    ctx.font = "600 18px 'Jua', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(body.plugin.labelText, x, y);
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

function updatePlayer(event) {
  if (!gameActive || isPaused) {
    return;
  }

  const currentX = player.position.x;
  const deltaRatio = event.delta / 16.67;
  const maxSpeed = 3.0 * window.devicePixelRatio;
  let targetVel = 0;
  if (state.pointerActive) {
    const diff = targetX - currentX;
    targetVel = Math.max(-maxSpeed, Math.min(maxSpeed, diff * 0.08));
  }
  if (state.keys.left || state.keys.right) {
    const direction = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
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

  const minX = 40 * window.devicePixelRatio;
  const maxX = canvas.width - 40 * window.devicePixelRatio;
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

  const x = 40 + Math.random() * (canvas.width - 80);
  const body = Bodies.circle(x, -40, 26, {
    restitution: 0.4,
    frictionAir: 0.01,
    render: { fillStyle: "#b6f0ff" },
  });
  body.plugin = {
    labelText: String(primeData.value),
    textColor: "#2f2a36",
    primeValue: primeData.value,
    source: primeData.source,
    driftX: Common.random(-0.00035, 0.00035),
  };
  Body.setVelocity(body, { x: Common.random(-0.4, 0.4), y: 1.2 * dropSpeedScale });

  World.add(world, body);
}

function cleanupOffscreen() {
  const bodies = Composite.allBodies(world);
  bodies.forEach((body) => {
    if (body === ground || body === player) {
      return;
    }
    if (body.position.y > canvas.height + 120) {
      World.remove(world, body);
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
  Composite.allBodies(world).forEach((body) => {
    if (!body.plugin || !body.plugin.primeValue) {
      return;
    }
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
  targetX = player ? player.position.x : canvas.width / 2;
  elapsedMs = 0;
  if (timerEl) {
    timerEl.textContent = formatTime(elapsedMs);
  }

  Composite.allBodies(world).forEach((body) => {
    if (body !== ground && body !== player) {
      World.remove(world, body);
    }
  });

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
  homeScreen.classList.add("active");
  pauseScreen.classList.remove("active");
  resultScreen.classList.remove("active");
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
  const x = e.clientX - rect.left;
  targetX = x * window.devicePixelRatio;
}

function setupInput() {
  window.addEventListener("keydown", (e) => handleKey(e, true));
  window.addEventListener("keyup", (e) => handleKey(e, false));

  canvas.addEventListener("pointerdown", (e) => {
    state.pointerActive = true;
    handlePointer(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.pointerActive) return;
    handlePointer(e);
  });
  canvas.addEventListener("pointerup", () => {
    state.pointerActive = false;
  });
  canvas.addEventListener("pointerleave", () => {
    state.pointerActive = false;
  });
}

function init() {
  resizeCanvas();
  setupWorld();
  setupInput();
  engine.timing.timeScale = 0;

  window.addEventListener("resize", resizeCanvas);

  startButton.addEventListener("click", startGame);
  resumeButton.addEventListener("click", resumeGame);
  homeButton.addEventListener("click", resetToHome);
  restartButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", pauseGame);
}

init();
