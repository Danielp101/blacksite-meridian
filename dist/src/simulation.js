export const DEFAULT_MAP = [
  '1111111111111111',
  '1000000000000001',
  '1022200100333001',
  '1000000100000001',
  '1000111100011001',
  '1000100000010001',
  '1000104400010001',
  '1000000000000001',
  '1000110001100001',
  '1000010001000001',
  '1000010001000001',
  '1000000000000001',
  '1000330011222001',
  '1000000000000001',
  '1000000000000001',
  '1111111111111111',
];

const TAU = Math.PI * 2;
const MAGAZINE_SIZE = 8;
const RELOAD_TIME = 1.25;

function cloneMap(map) {
  return map.slice();
}

function nextRandom(state) {
  let x = state.rng >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 0x100000000;
}

function mapCell(map, x, y) {
  const row = map[Math.floor(y)];
  return row?.[Math.floor(x)] ?? '1';
}

export function isWalkable(map, x, y, radius = 0.2) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const points = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
  ];
  return points.every(([px, py]) => mapCell(map, px, py) === '0');
}

export function moveActor(map, actor, dx, dy) {
  const result = { ...actor };
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  const stepX = dx / steps;
  const stepY = dy / steps;
  for (let i = 0; i < steps; i += 1) {
    if (isWalkable(map, result.x + stepX, result.y, result.radius)) result.x += stepX;
    if (isWalkable(map, result.x, result.y + stepY, result.radius)) result.y += stepY;
  }
  return result;
}

export function raycastWall(map, origin, angle, maxDistance = 30) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let cellX = Math.floor(origin.x);
  let cellY = Math.floor(origin.y);
  const deltaX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideDistanceX = dirX < 0 ? (origin.x - cellX) * deltaX : (cellX + 1 - origin.x) * deltaX;
  let sideDistanceY = dirY < 0 ? (origin.y - cellY) * deltaY : (cellY + 1 - origin.y) * deltaY;
  let distance = 0;
  let side = null;
  while (distance <= maxDistance) {
    if (sideDistanceX < sideDistanceY) {
      distance = sideDistanceX;
      sideDistanceX += deltaX;
      cellX += stepX;
      side = 'vertical';
    } else {
      distance = sideDistanceY;
      sideDistanceY += deltaY;
      cellY += stepY;
      side = 'horizontal';
    }
    const material = mapCell(map, cellX + 0.5, cellY + 0.5);
    if (material !== '0') {
      return {
        distance,
        x: origin.x + dirX * distance,
        y: origin.y + dirY * distance,
        cellX,
        cellY,
        material,
        side,
      };
    }
  }
  return {
    distance: maxDistance,
    x: origin.x + dirX * maxDistance,
    y: origin.y + dirY * maxDistance,
    cellX: Math.floor(origin.x + dirX * maxDistance),
    cellY: Math.floor(origin.y + dirY * maxDistance),
    material: '0',
    side,
  };
}

export function getWaveConfig(wave) {
  const level = Math.min(10, Math.max(1, Math.floor(wave || 1)));
  return {
    enemyCount: 2 + Math.ceil(level * 0.8),
    enemyHealth: 30 + (level - 1) * 5,
    attackCooldown: Math.max(0.65, 1.45 - level * 0.07),
    speed: Math.min(1.35, 0.72 + level * 0.055),
  };
}

function makePlayer() {
  return {
    x: 2.5,
    y: 7.5,
    angle: 0,
    radius: 0.2,
    health: 100,
    maxHealth: 100,
    ammo: MAGAZINE_SIZE,
    reserve: 40,
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
  };
}

export function createGame({ seed = 0x4d455249, spawnEnemies = true } = {}) {
  const state = {
    phase: 'briefing',
    map: cloneMap(DEFAULT_MAP),
    player: makePlayer(),
    enemies: [],
    projectiles: [],
    effects: [],
    wave: 1,
    score: 0,
    kills: 0,
    elapsed: 0,
    waveClearTimer: null,
    rng: seed >>> 0,
    nextEnemyId: 1,
    lastShot: null,
  };
  if (spawnEnemies) spawnWave(state, { rewardAmmo: false });
  return state;
}

export function spawnWave(state, { rewardAmmo = true } = {}) {
  const config = getWaveConfig(state.wave);
  if (rewardAmmo) {
    const roundsNeeded = config.enemyCount * Math.ceil(config.enemyHealth / 34);
    state.player.reserve += roundsNeeded + MAGAZINE_SIZE;
  }
  const candidates = [];
  for (let y = 1; y < state.map.length - 1; y += 1) {
    for (let x = 1; x < state.map[y].length - 1; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (isWalkable(state.map, px, py, 0.24) && Math.hypot(px - state.player.x, py - state.player.y) > 3) {
        candidates.push({ x: px, y: py });
      }
    }
  }
  state.enemies = [];
  for (let i = 0; i < config.enemyCount && candidates.length; i += 1) {
    const index = Math.floor(nextRandom(state) * candidates.length);
    const point = candidates.splice(index, 1)[0];
    state.enemies.push({
      id: state.nextEnemyId++,
      ...point,
      radius: 0.24,
      health: config.enemyHealth,
      maxHealth: config.enemyHealth,
      alive: true,
      speed: config.speed,
      attackCooldown: 0.35 + nextRandom(state) * config.attackCooldown,
      attackRate: config.attackCooldown,
      flash: 0,
    });
  }
  state.waveClearTimer = null;
  return state;
}

function lineCircleDistance(origin, angle, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
  if (forward <= 0) return null;
  const perpendicular = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
  if (perpendicular > (target.radius ?? 0.24)) return null;
  return forward;
}

export function fireWeapon(state) {
  if (state.phase !== 'playing') return { fired: false, reason: state.phase };
  if (state.player.reloading) return { fired: false, reason: 'reloading' };
  if (state.player.fireCooldown > 0) return { fired: false, reason: 'cooldown' };
  if (state.player.ammo <= 0) return { fired: false, reason: 'empty' };

  state.player.ammo -= 1;
  state.player.fireCooldown = 0.24;
  const wallHit = raycastWall(state.map, state.player, state.player.angle, 24);
  let selected = null;
  let selectedDistance = wallHit.distance;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const distance = lineCircleDistance(state.player, state.player.angle, enemy);
    if (distance !== null && distance < selectedDistance) {
      selected = enemy;
      selectedDistance = distance;
    }
  }

  let killed = false;
  if (selected) {
    selected.health -= 34;
    selected.flash = 0.12;
    if (selected.health <= 0) {
      selected.health = 0;
      selected.alive = false;
      killed = true;
      state.score += 100 * state.wave;
      state.kills += 1;
    } else {
      state.score += 10;
    }
  }
  const result = {
    fired: true,
    reason: null,
    enemyId: selected?.id ?? null,
    killed,
    distance: selected ? selectedDistance : wallHit.distance,
    x: state.player.x + Math.cos(state.player.angle) * selectedDistance,
    y: state.player.y + Math.sin(state.player.angle) * selectedDistance,
    wallDistance: wallHit.distance,
  };
  state.lastShot = result;
  state.effects.push({ type: selected ? 'hit' : 'impact', x: result.x, y: result.y, life: 0.15 });
  return result;
}

export function startReload(state) {
  if (state.phase !== 'playing' || state.player.reloading || state.player.ammo >= MAGAZINE_SIZE || state.player.reserve <= 0) return false;
  state.player.reloading = true;
  state.player.reloadTimer = RELOAD_TIME;
  return true;
}

function hasLineOfSight(state, enemy, distance) {
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  return raycastWall(state.map, enemy, angle, distance + 0.2).distance >= distance - 0.1;
}

function buildFlowField(map, target) {
  const width = map[0].length;
  const height = map.length;
  const distances = Array.from({ length: height }, () => Array(width).fill(Infinity));
  const startX = Math.floor(target.x);
  const startY = Math.floor(target.y);
  const queue = [[startX, startY]];
  distances[startY][startX] = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    const nextDistance = distances[y][x] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= height || nx < 0 || nx >= width || distances[ny][nx] <= nextDistance) continue;
      if (!isWalkable(map, nx + 0.5, ny + 0.5, 0.24)) continue;
      distances[ny][nx] = nextDistance;
      queue.push([nx, ny]);
    }
  }
  return distances;
}

function routedDirection(flow, enemy, fallbackX, fallbackY) {
  const cellX = Math.floor(enemy.x);
  const cellY = Math.floor(enemy.y);
  let best = { x: cellX, y: cellY, distance: flow[cellY]?.[cellX] ?? Infinity };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = cellX + dx;
    const y = cellY + dy;
    const distance = flow[y]?.[x] ?? Infinity;
    if (distance < best.distance) best = { x, y, distance };
  }
  if (!Number.isFinite(best.distance) || (best.x === cellX && best.y === cellY)) return [fallbackX, fallbackY];
  return [best.x + 0.5 - enemy.x, best.y + 0.5 - enemy.y];
}

function updateEnemies(state, dt) {
  const alive = state.enemies.filter((enemy) => enemy.alive);
  const flow = buildFlowField(state.map, state.player);
  for (const enemy of alive) {
    enemy.attackCooldown = Math.max(0, (enemy.attackCooldown ?? 0) - dt);
    enemy.flash = Math.max(0, (enemy.flash ?? 0) - dt);
    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 0.001;
    if (distance < 6.5 && enemy.attackCooldown <= 0 && hasLineOfSight(state, enemy, distance)) {
      const angle = Math.atan2(dy, dx);
      state.projectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * 3.2,
        vy: Math.sin(angle) * 3.2,
        damage: 12,
        life: 3,
        hostile: true,
      });
      enemy.attackCooldown = enemy.attackRate ?? getWaveConfig(state.wave).attackCooldown;
    }
    if (distance > 1.45) {
      const canSeePlayer = hasLineOfSight(state, enemy, distance);
      const routed = canSeePlayer ? [dx, dy] : routedDirection(flow, enemy, dx, dy);
      const routedLength = Math.hypot(routed[0], routed[1]) || 1;
      let steerX = routed[0] / routedLength;
      let steerY = routed[1] / routedLength;
      for (const other of alive) {
        if (other === enemy) continue;
        const sx = enemy.x - other.x;
        const sy = enemy.y - other.y;
        const separation = Math.hypot(sx, sy);
        if (separation > 0 && separation < 0.8) {
          steerX += (sx / separation) * (0.8 - separation) * 2;
          steerY += (sy / separation) * (0.8 - separation) * 2;
        }
      }
      const length = Math.hypot(steerX, steerY) || 1;
      const moved = moveActor(state.map, enemy, (steerX / length) * enemy.speed * dt, (steerY / length) * enemy.speed * dt);
      enemy.x = moved.x;
      enemy.y = moved.y;
    }
  }
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const minimum = a.radius + b.radius + 0.05;
      if (distance >= minimum) continue;
      const push = (minimum - distance) / 2;
      const nx = dx / distance;
      const ny = dy / distance;
      if (isWalkable(state.map, a.x - nx * push, a.y - ny * push, a.radius)) {
        a.x -= nx * push;
        a.y -= ny * push;
      }
      if (isWalkable(state.map, b.x + nx * push, b.y + ny * push, b.radius)) {
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function updateProjectiles(state, dt) {
  const survivors = [];
  for (const projectile of state.projectiles) {
    projectile.life -= dt;
    if (projectile.hostile && Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < state.player.radius + 0.12) {
      state.player.health = Math.max(0, state.player.health - projectile.damage);
      state.effects.push({ type: 'damage', life: 0.4 });
      if (state.player.health <= 0) state.phase = 'gameover';
      continue;
    }
    const dx = projectile.vx * dt;
    const dy = projectile.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.05));
    let hitWall = false;
    for (let step = 1; step <= steps; step += 1) {
      const x = projectile.x + dx / steps;
      const y = projectile.y + dy / steps;
      if (!isWalkable(state.map, x, y, 0.05)) { hitWall = true; break; }
      projectile.x = x;
      projectile.y = y;
    }
    if (hitWall) continue;
    if (projectile.hostile && Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < state.player.radius + 0.12) {
      state.player.health = Math.max(0, state.player.health - projectile.damage);
      state.effects.push({ type: 'damage', life: 0.4 });
      if (state.player.health <= 0) state.phase = 'gameover';
      continue;
    }
    if (projectile.life > 0) survivors.push(projectile);
  }
  state.projectiles = survivors;
}

function updateWeapon(state, dt) {
  state.player.fireCooldown = Math.max(0, state.player.fireCooldown - dt);
  if (!state.player.reloading) return;
  state.player.reloadTimer -= dt;
  if (state.player.reloadTimer <= 0) {
    const needed = MAGAZINE_SIZE - state.player.ammo;
    const transferred = Math.min(needed, state.player.reserve);
    state.player.ammo += transferred;
    state.player.reserve -= transferred;
    state.player.reloading = false;
    state.player.reloadTimer = 0;
  }
}

export function stepGame(state, input = {}, dt = 0) {
  if (state.phase !== 'playing') return state;
  const safeDt = Math.min(0.25, Math.max(0, dt));
  state.elapsed += safeDt;
  state.player.angle = ((state.player.angle + (input.turn ?? 0) + TAU) % TAU);
  const speed = input.sprint ? 3.8 : 2.6;
  const forward = Math.max(-1, Math.min(1, input.forward ?? 0));
  const strafe = Math.max(-1, Math.min(1, input.strafe ?? 0));
  const length = Math.hypot(forward, strafe) || 1;
  const dx = ((Math.cos(state.player.angle) * forward + Math.cos(state.player.angle + Math.PI / 2) * strafe) / length) * speed * safeDt;
  const dy = ((Math.sin(state.player.angle) * forward + Math.sin(state.player.angle + Math.PI / 2) * strafe) / length) * speed * safeDt;
  Object.assign(state.player, moveActor(state.map, state.player, dx, dy));
  updateWeapon(state, safeDt);
  updateEnemies(state, safeDt);
  updateProjectiles(state, safeDt);
  state.effects = state.effects.map((effect) => ({ ...effect, life: effect.life - safeDt })).filter((effect) => effect.life > 0);

  if (state.enemies.length > 0 && state.enemies.every((enemy) => !enemy.alive)) {
    state.waveClearTimer = state.waveClearTimer ?? 1.2;
    state.waveClearTimer -= safeDt;
    if (state.waveClearTimer <= 0) {
      state.wave += 1;
      state.score += 250 * state.wave;
      spawnWave(state);
    }
  }
  return state;
}

export function restartGame(state) {
  return createGame({ seed: state.rng || 0x4d455249 });
}
