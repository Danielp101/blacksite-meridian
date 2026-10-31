import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  fireWeapon,
  getWaveConfig,
  isWalkable,
  moveActor,
  raycastWall,
  restartGame,
  spawnWave,
  startReload,
  stepGame,
} from '../src/simulation.js';

const OPEN_MAP = [
  '1111111',
  '1000001',
  '1001001',
  '1000001',
  '1111111',
];

function combatState(overrides = {}) {
  const state = createGame({ seed: 7, spawnEnemies: false });
  state.map = OPEN_MAP;
  state.phase = 'playing';
  state.player = { ...state.player, x: 1.5, y: 1.5, angle: 0, ammo: 8, reserve: 32 };
  state.enemies = [];
  return Object.assign(state, overrides);
}

test('createGame is deterministic for the same seed', () => {
  const a = createGame({ seed: 42 });
  const b = createGame({ seed: 42 });
  assert.deepEqual(a, b);
});

test('walkability rejects walls, boundaries, and a radius clipping a wall', () => {
  assert.equal(isWalkable(OPEN_MAP, 1.5, 1.5, 0.2), true);
  assert.equal(isWalkable(OPEN_MAP, 0.5, 0.5, 0.2), false);
  assert.equal(isWalkable(OPEN_MAP, -1, 1, 0.2), false);
  assert.equal(isWalkable(OPEN_MAP, 2.85, 2.5, 0.2), false);
});

test('movement slides on an open axis and cannot tunnel through walls', () => {
  const actor = { x: 2.5, y: 1.5, radius: 0.2 };
  const slid = moveActor(OPEN_MAP, actor, 0.8, 1);
  assert.ok(slid.x > 2.5 && slid.x < 2.8);
  assert.ok(slid.y > 2.4);
  const blocked = moveActor(OPEN_MAP, { x: 1.5, y: 2.5, radius: 0.2 }, 4, 0);
  assert.ok(blocked.x < 2.8);
});

test('stepGame moves the player only while playing', () => {
  const state = combatState();
  const x = state.player.x;
  stepGame(state, { forward: 1 }, 0.1);
  assert.ok(state.player.x > x);
  state.phase = 'paused';
  const pausedX = state.player.x;
  stepGame(state, { forward: 1 }, 0.1);
  assert.equal(state.player.x, pausedX);
});

test('raycastWall returns the first wall in the ray', () => {
  const hit = raycastWall(OPEN_MAP, { x: 1.5, y: 2.5 }, 0, 20);
  assert.equal(hit.cellX, 3);
  assert.ok(Math.abs(hit.distance - 1.5) < 0.01);
});

test('firing consumes ammo, respects cooldown, and reports empty magazines', () => {
  const state = combatState();
  const first = fireWeapon(state);
  assert.equal(first.fired, true);
  assert.equal(state.player.ammo, 7);
  assert.equal(fireWeapon(state).fired, false);
  state.player.fireCooldown = 0;
  state.player.ammo = 0;
  assert.equal(fireWeapon(state).reason, 'empty');
});

test('hitscan damages only the nearest visible target and awards a kill', () => {
  const state = combatState();
  state.enemies = [
    { id: 1, x: 2.5, y: 1.5, radius: 0.25, health: 30, maxHealth: 30, alive: true },
    { id: 2, x: 4.5, y: 1.5, radius: 0.25, health: 30, maxHealth: 30, alive: true },
  ];
  const shot = fireWeapon(state);
  assert.equal(shot.enemyId, 1);
  assert.equal(shot.killed, true);
  assert.equal(state.enemies[0].alive, false);
  assert.equal(state.enemies[1].health, 30);
  assert.equal(state.score, 100);
});

test('a wall-occluded enemy cannot be hit', () => {
  const state = combatState();
  state.player.y = 2.5;
  state.enemies = [{ id: 1, x: 4.5, y: 2.5, radius: 0.25, health: 30, alive: true }];
  const shot = fireWeapon(state);
  assert.equal(shot.enemyId, null);
  assert.equal(state.enemies[0].health, 30);
});

test('hitscan cannot skip a grazing wall corner', () => {
  const state = combatState();
  state.map = ['11111', '10001', '10101', '10001', '11111'];
  state.player = { ...state.player, x: 1.5, y: 2.5, angle: Math.atan2(-0.995, 1) };
  state.enemies = [{ id: 1, x: 2.5, y: 1.505, radius: 0.24, health: 30, maxHealth: 30, alive: true }];
  const shot = fireWeapon(state);
  assert.equal(shot.enemyId, null);
  assert.equal(state.enemies[0].health, 30);
});

test('reload transfers reserve ammo after its timer', () => {
  const state = combatState();
  state.player.ammo = 3;
  state.player.reserve = 5;
  assert.equal(startReload(state), true);
  for (let i = 0; i < 5; i += 1) stepGame(state, {}, 0.25);
  assert.equal(state.player.ammo, 8);
  assert.equal(state.player.reserve, 0);
  assert.equal(state.player.reloading, false);
});

test('paused and game-over states gate combat mutations', () => {
  const state = combatState();
  state.phase = 'paused';
  assert.equal(fireWeapon(state).fired, false);
  assert.equal(startReload(state), false);
  assert.equal(state.player.ammo, 8);
  state.phase = 'gameover';
  assert.equal(fireWeapon(state).fired, false);
});

test('enemy projectile damage causes game-over and restart resets the run', () => {
  const state = combatState();
  state.player.health = 10;
  state.projectiles = [{ x: 1.5, y: 1.5, vx: 0, vy: 0, damage: 10, life: 1, hostile: true }];
  stepGame(state, {}, 0.02);
  assert.equal(state.phase, 'gameover');
  const restarted = restartGame(state);
  assert.equal(restarted.phase, 'briefing');
  assert.equal(restarted.player.health, 100);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.wave, 1);
});

test('wave difficulty scales through 10 and caps afterward', () => {
  const ten = getWaveConfig(10);
  const eleven = getWaveConfig(11);
  assert.deepEqual(eleven, ten);
  assert.ok(ten.enemyCount > getWaveConfig(1).enemyCount);
});

test('spawnWave creates alive enemies on walkable separated cells', () => {
  const state = combatState({ wave: 2 });
  spawnWave(state);
  assert.equal(state.enemies.length, getWaveConfig(2).enemyCount);
  for (const enemy of state.enemies) {
    assert.equal(enemy.alive, true);
    assert.equal(isWalkable(state.map, enemy.x, enemy.y, enemy.radius), true);
    assert.ok(Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) > 1.5);
  }
});

test('clearing a wave replenishes enough reserve ammunition to continue indefinitely', () => {
  const state = combatState({ wave: 10 });
  state.player.ammo = 0;
  state.player.reserve = 0;
  spawnWave(state);
  const config = getWaveConfig(10);
  const roundsNeeded = config.enemyCount * Math.ceil(config.enemyHealth / 34);
  assert.ok(state.player.reserve >= roundsNeeded);
});

test('enemies pursue, attack on cadence, and maintain separation', () => {
  const state = combatState();
  state.enemies = [
    { id: 1, x: 4.5, y: 3.5, radius: 0.24, health: 30, maxHealth: 30, alive: true, speed: 1, attackCooldown: 0 },
    { id: 2, x: 4.6, y: 3.5, radius: 0.24, health: 30, maxHealth: 30, alive: true, speed: 1, attackCooldown: 0 },
  ];
  const before = Math.hypot(state.enemies[0].x - state.player.x, state.enemies[0].y - state.player.y);
  stepGame(state, {}, 0.25);
  const after = Math.hypot(state.enemies[0].x - state.player.x, state.enemies[0].y - state.player.y);
  assert.ok(after < before);
  assert.ok(Math.hypot(state.enemies[0].x - state.enemies[1].x, state.enemies[0].y - state.enemies[1].y) > 0.1);
  state.enemies[0].x = 2.5;
  state.enemies[0].y = 1.5;
  state.enemies[0].attackCooldown = 0;
  stepGame(state, {}, 0.02);
  assert.ok(state.projectiles.length > 0);
});

test('enemy routing makes progress around an obstructing wall', () => {
  const state = createGame();
  state.phase = 'playing';
  const enemy = state.enemies.find((candidate) => candidate.id === 1);
  state.enemies = [enemy];
  state.player.health = 1_000_000;
  state.player.maxHealth = 1_000_000;
  enemy.attackCooldown = 99;
  for (let i = 0; i < 120; i += 1) stepGame(state, {}, 0.25);
  const final = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
  assert.ok(final < 2.5, `expected sentry to route around cover, remained ${final} units away`);
});

test('projectiles stop at first wall contact instead of sliding around cover', () => {
  const state = combatState();
  state.player.x = 1.5;
  state.player.y = 1.5;
  state.projectiles = [{ x: 2.6, y: 2.2, vx: 2, vy: 2, damage: 12, life: 3, hostile: true }];
  stepGame(state, {}, 0.25);
  assert.equal(state.projectiles.length, 0);
});

test('clearing a wave advances after a short transition', () => {
  const state = combatState();
  state.enemies = [{ id: 1, alive: false }];
  stepGame(state, {}, 0.5);
  assert.equal(state.wave, 1);
  for (let i = 0; i < 4; i += 1) stepGame(state, {}, 0.25);
  assert.equal(state.wave, 2);
  assert.ok(state.enemies.some((enemy) => enemy.alive));
});
