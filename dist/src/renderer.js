import { raycastWall } from './simulation.js';

const FOV = Math.PI / 3;
const COLORS = {
  1: ['#274455', '#1b3342'],
  2: ['#49656b', '#344d53'],
  3: ['#8b4f39', '#6d3c2d'],
  4: ['#8c713a', '#66542f'],
};

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function projectSprite(player, x, y, width, height) {
  const dx = x - player.x;
  const dy = y - player.y;
  const distance = Math.hypot(dx, dy);
  const relative = normalizeAngle(Math.atan2(dy, dx) - player.angle);
  if (Math.abs(relative) > FOV * .65 || distance < 0.1) return null;
  return {
    distance,
    cameraDepth: distance * Math.cos(relative),
    x: width * (0.5 + relative / FOV),
    size: height / distance,
  };
}

export function visibleDepthColumns(projection, depth, width, margin = 0.08) {
  const halfWidth = projection.size * 0.34;
  const start = Math.max(0, Math.floor(((projection.x - halfWidth) / width) * depth.length));
  const end = Math.min(depth.length - 1, Math.ceil(((projection.x + halfWidth) / width) * depth.length));
  const visible = [];
  for (let column = start; column <= end; column += 1) {
    if (projection.cameraDepth <= depth[column] + margin) visible.push(column);
  }
  return visible;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.depth = [];
    this.time = 0;
    this.shake = 0;
    this.kick = 0;
    this.muzzle = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(480, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(270, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  recoil() { this.kick = this.reducedMotion ? 0 : 1; this.muzzle = 1; }
  damage() { this.shake = this.reducedMotion ? 0 : 1; }

  render(state, dt = 0) {
    this.resize();
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 7);
    this.muzzle = Math.max(0, this.muzzle - dt * 12);
    this.shake = Math.max(0, this.shake - dt * 8);
    const ctx = this.context;
    const { width, height } = this.canvas;
    const shakeX = this.shake ? (Math.random() - 0.5) * 9 * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * 7 * this.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawWorld(state, width, height);
    this.drawSprites(state, width, height);
    this.drawWeapon(state, width, height);
    ctx.restore();
    this.drawSignalTrace(width, height);
  }

  drawWorld(state, width, height) {
    const ctx = this.context;
    const horizon = height * 0.51;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#02070b');
    sky.addColorStop(1, '#173042');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    const floor = ctx.createLinearGradient(0, horizon, 0, height);
    floor.addColorStop(0, '#142630');
    floor.addColorStop(1, '#03090d');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, width, height - horizon);

    const columns = Math.min(400, Math.ceil(width / 2));
    const columnWidth = width / columns;
    this.depth = new Array(columns);
    for (let column = 0; column < columns; column += 1) {
      const camera = column / columns - 0.5;
      const angle = state.player.angle + camera * FOV;
      const hit = raycastWall(state.map, state.player, angle, 30);
      const corrected = Math.max(0.001, hit.distance * Math.cos(angle - state.player.angle));
      this.depth[column] = corrected;
      const wallHeight = Math.min(height * 2, height / corrected);
      const top = horizon - wallHeight / 2;
      const palette = COLORS[hit.material] || COLORS[1];
      const shade = Math.max(0.2, 1 - corrected / 16);
      ctx.globalAlpha = shade;
      ctx.fillStyle = palette[hit.side === 'vertical' ? 0 : 1];
      ctx.fillRect(column * columnWidth, top, columnWidth + 1, wallHeight);
      if (hit.material === '3' && corrected < 8) {
        ctx.globalAlpha = shade * 0.32;
        ctx.fillStyle = '#f0b44d';
        ctx.fillRect(column * columnWidth, top + wallHeight * 0.16, columnWidth + 1, Math.max(1, wallHeight * 0.025));
      }
    }
    ctx.globalAlpha = 1;
    const haze = ctx.createLinearGradient(0, horizon - height * .18, 0, horizon + height * .22);
    haze.addColorStop(0, 'rgba(7,16,24,0)');
    haze.addColorStop(.52, 'rgba(143,163,164,.12)');
    haze.addColorStop(1, 'rgba(7,16,24,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - height * .2, width, height * .45);
  }

  projectSprite(player, x, y, width, height) {
    return projectSprite(player, x, y, width, height);
  }

  drawSprites(state, width, height) {
    const sprites = [
      ...state.enemies.filter((enemy) => enemy.alive).map((enemy) => ({ ...enemy, kind: 'enemy' })),
      ...state.projectiles.map((projectile) => ({ ...projectile, kind: 'projectile' })),
      ...state.effects.filter((effect) => effect.x != null).map((effect) => ({ ...effect, kind: effect.type })),
    ].map((sprite) => ({ sprite, projection: this.projectSprite(state.player, sprite.x, sprite.y, width, height) }))
      .filter((item) => item.projection)
      .sort((a, b) => b.projection.distance - a.projection.distance);

    for (const { sprite, projection } of sprites) {
      const visible = visibleDepthColumns(projection, this.depth, width);
      if (visible.length === 0) continue;
      const columnWidth = width / this.depth.length;
      this.context.save();
      this.context.beginPath();
      for (const column of visible) this.context.rect(column * columnWidth, 0, columnWidth + 1, height);
      this.context.clip();
      if (sprite.kind === 'enemy') this.drawEnemy(sprite, projection, height);
      else this.drawOrb(sprite, projection, height);
      this.context.restore();
    }
  }

  drawEnemy(enemy, p, height) {
    const ctx = this.context;
    const size = Math.min(height * 1.2, p.size * .85);
    const x = p.x;
    const y = height * .51 + size * .08;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = Math.max(.35, 1 - p.distance / 22);
    ctx.fillStyle = enemy.flash > 0 ? '#f6eee5' : '#752f2f';
    ctx.beginPath();
    ctx.moveTo(-size * .27, size * .36);
    ctx.lineTo(-size * .18, -size * .24);
    ctx.lineTo(0, -size * .42);
    ctx.lineTo(size * .18, -size * .24);
    ctx.lineTo(size * .27, size * .36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#101c23';
    ctx.fillRect(-size * .15, -size * .19, size * .3, size * .2);
    ctx.fillStyle = enemy.attackCooldown < .22 ? '#f0b44d' : '#e14f4f';
    ctx.fillRect(-size * .11, -size * .12, size * .22, Math.max(2, size * .045));
    ctx.fillStyle = '#203945';
    ctx.fillRect(-size * .34, size * .32, size * .2, size * .1);
    ctx.fillRect(size * .14, size * .32, size * .2, size * .1);
    if (p.distance < 6) {
      ctx.fillStyle = 'rgba(3,8,12,.8)';
      ctx.fillRect(-size * .28, -size * .51, size * .56, Math.max(3, size * .035));
      ctx.fillStyle = '#e14f4f';
      ctx.fillRect(-size * .28, -size * .51, size * .56 * Math.max(0, enemy.health / enemy.maxHealth), Math.max(3, size * .035));
    }
    ctx.restore();
  }

  drawOrb(sprite, p, height) {
    const ctx = this.context;
    const size = sprite.kind === 'projectile' ? Math.max(5, p.size * .1) : Math.max(3, p.size * .04);
    const y = height * .5;
    const glow = ctx.createRadialGradient(p.x, y, 0, p.x, y, size * 2.5);
    glow.addColorStop(0, '#fff0c8');
    glow.addColorStop(.25, sprite.kind === 'hit' ? '#f0b44d' : '#e14f4f');
    glow.addColorStop(1, 'rgba(225,79,79,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - size * 2.5, y - size * 2.5, size * 5, size * 5);
  }

  drawWeapon(state, width, height) {
    const ctx = this.context;
    const scale = Math.min(width, height * 1.7) / 900;
    const bob = state.phase === 'playing' && !this.reducedMotion ? Math.sin(this.time * 8) * 3 : 0;
    const kick = this.kick * 25;
    const x = width * .5;
    const y = height + bob + kick;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#0b161d';
    ctx.beginPath(); ctx.moveTo(-115, 0); ctx.lineTo(-77, -230); ctx.lineTo(78, -230); ctx.lineTo(126, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8b4f39';
    ctx.fillRect(-58, -255, 116, 72);
    ctx.fillStyle = '#203945';
    ctx.fillRect(-38, -282, 76, 42);
    ctx.fillStyle = '#d8e2dc';
    ctx.globalAlpha = .45;
    ctx.fillRect(-26, -270, 52, 5);
    if (this.muzzle > 0) {
      ctx.globalAlpha = this.muzzle;
      ctx.fillStyle = '#f0b44d';
      ctx.beginPath(); ctx.moveTo(0, -280); ctx.lineTo(-55, -345); ctx.lineTo(-13, -333); ctx.lineTo(0, -398); ctx.lineTo(16, -335); ctx.lineTo(58, -350); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawSignalTrace(width, height) {
    if (this.reducedMotion) return;
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,180,77,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const y = height * .88 + Math.sin(x * .018 + this.time * 2.2) * 3 + Math.sin(x * .071) * 1.2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
