// ============================================================
// world.js - 맵 생성(장애물) + 수축 존. (shared)
// rock/wall/crate: 고체 + 탄막 차단. tree: 비고체 + 탄막만 차단.
// ============================================================

import { CONFIG } from './config.js';
import { lerp, dist, circleRect, pick, rand } from './utils.js';

export class Zone {
  constructor() {
    const half = CONFIG.WORLD_SIZE / 2;
    this.center = { x: half, y: half };
    this.startRadius = half * CONFIG.ZONE_START_RATIO;
    this.finalRadius = half * CONFIG.ZONE_FINAL_RATIO;
    this.radius = this.startRadius;
    this.elapsed = 0;
    this.duration = CONFIG.ZONE_SHRINK_DURATION;
  }

  update(dt) {
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.duration > 0 ? this.elapsed / this.duration : 1;
    this.radius = lerp(this.startRadius, this.finalRadius, t);
  }

  isOutside(x, y) {
    return dist(x, y, this.center.x, this.center.y) > this.radius;
  }

  // 존 수축 진행도(0=시작 반경, 1=최종 반경). 존 데미지 단계적 강화에 사용.
  get progress() {
    const span = this.startRadius - this.finalRadius;
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (this.startRadius - this.radius) / span));
  }

  // 현재 존 바깥 초당 피해. 반경이 좁아질수록 START→END로 단조 증가.
  currentDps() {
    return lerp(CONFIG.ZONE_DPS_START, CONFIG.ZONE_DPS_END, this.progress);
  }
}

// 상수: 맵 생성 매직 넘버 제거
const OBSTACLE_TARGET = 52;
const OBSTACLE_MAX_TRIES_MULT = 12;
const SPAWN_CLEAR_RADIUS = 160;
const OBSTACLE_SPACING = 20;

// 맵 전체에 장애물 무작위 배치. 중앙 스폰은 비움. 각 장애물에 id 부여.
export function generateWorld() {
  const obstacles = [];
  const spawnX = CONFIG.WORLD_SIZE / 2, spawnY = CONFIG.WORLD_SIZE / 2;
  let tries = 0;
  while (obstacles.length < OBSTACLE_TARGET && tries < OBSTACLE_TARGET * OBSTACLE_MAX_TRIES_MULT) {
    tries++;
    const type = pick(['tree', 'tree', 'tree', 'tree', 'rock', 'rock', 'crate', 'wall']);
    let w, h;
    if (type === 'tree')       { w = h = rand(46, 64); }
    else if (type === 'rock')  { w = h = rand(34, 56); }
    else if (type === 'crate') { w = h = rand(34, 42); }
    else {
      if (Math.random() < 0.5) { w = rand(120, 260); h = rand(22, 40); }
      else { w = rand(22, 40); h = rand(120, 260); }
    }
    const x = rand(60, CONFIG.WORLD_SIZE - w - 60);
    const y = rand(60, CONFIG.WORLD_SIZE - h - 60);

    if (circleRect(spawnX, spawnY, SPAWN_CLEAR_RADIUS, x, y, w, h)) continue;
    let overlap = false;
    for (const o of obstacles) {
      if (x < o.x + o.w + OBSTACLE_SPACING && x + w + OBSTACLE_SPACING > o.x &&
          y < o.y + o.h + OBSTACLE_SPACING && y + h + OBSTACLE_SPACING > o.y) { overlap = true; break; }
    }
    if (overlap) continue;

    const destructible = type === 'crate';
    obstacles.push({
      id: obstacles.length,
      x, y, w, h, type,
      solid: type !== 'tree',
      blocksBullets: true,
      destructible,
      health: destructible ? 30 : Infinity,
      destroyed: false,
    });
  }
  return obstacles;
}


// 상수: 픽업 생성 매직 넘버 제거
const PICKUP_EDGE_PAD = 80;
const PICKUP_SPAWN_CLEAR = 140;
const PICKUP_OBSTACLE_PAD = 6;
const PICKUP_MIN_SPACING = 70;
const PICKUP_MAX_TRIES_MULT = 40;

// 라운드 시작 시 바닥에 노출되는 픽업 배치.
// 장애물/중앙 스폰 구역을 피하고, 서로 겹치지 않게 흩뿌린다.
export function generatePickups(obstacles = [], count = 18) {
  const pickups = [];
  const TYPES = ['health', 'health', 'smg', 'smg', 'shotgun', 'pistol', 'grenade', 'grenade'];
  const spawnX = CONFIG.WORLD_SIZE / 2, spawnY = CONFIG.WORLD_SIZE / 2;
  let tries = 0;
  while (pickups.length < count && tries < count * PICKUP_MAX_TRIES_MULT) {
    tries++;
    const x = rand(PICKUP_EDGE_PAD, CONFIG.WORLD_SIZE - PICKUP_EDGE_PAD);
    const y = rand(PICKUP_EDGE_PAD, CONFIG.WORLD_SIZE - PICKUP_EDGE_PAD);
    // 중앙 스폰 비우기
    if (dist(x, y, spawnX, spawnY) < PICKUP_SPAWN_CLEAR) continue;
    // 고체 장애물 안/너무 가깝지 않게
    let blocked = false;
    for (const o of obstacles) {
      if (!o.solid || o.destroyed) continue;
      if (circleRect(x, y, 16, o.x - PICKUP_OBSTACLE_PAD, o.y - PICKUP_OBSTACLE_PAD,
                     o.w + PICKUP_OBSTACLE_PAD * 2, o.h + PICKUP_OBSTACLE_PAD * 2)) { blocked = true; break; }
    }
    if (blocked) continue;
    // 픽업 간 최소 간격
    for (const pk of pickups) {
      if (dist(x, y, pk.x, pk.y) < PICKUP_MIN_SPACING) { blocked = true; break; }
    }
    if (blocked) continue;
    pickups.push({ x, y, type: pick(TYPES) });
  }
  return pickups;
}
