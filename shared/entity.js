// ============================================================
// entity.js - 총알(Bullet). 순수 데이터 + update. (shared)
// ============================================================

import { CONFIG } from './config.js';

export class Bullet {
  constructor(x, y, angle, speed, damage, ownerId) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = CONFIG.BULLET_RADIUS;
    this.damage = damage;
    this.ownerId = ownerId;
    this.life = CONFIG.BULLET_LIFE;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.x < -50 || this.y < -50 ||
        this.x > CONFIG.WORLD_SIZE + 50 || this.y > CONFIG.WORLD_SIZE + 50) {
      this.dead = true;
    }
  }
}

// 수류탄 — 투척 후 FUSE 초 뒤(또는 장애물/월드 경계 충돌 시) 폭발.
// 폭발 판정은 GameSim.resolveGrenades()가 서버 권위적으로 처리(클라는 그리기만).
export class Grenade {
  constructor(x, y, angle, ownerId, cfg) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * cfg.THROW_SPEED;
    this.vy = Math.sin(angle) * cfg.THROW_SPEED;
    this.ownerId = ownerId;
    this.fuse = cfg.FUSE;
    this.explodeRadius = cfg.EXPLODE_RADIUS;
    this.damage = cfg.DAMAGE;
    this.radius = 6;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.fuse -= dt;
    if (this.fuse <= 0) this.dead = true; // sim이 폭발 처리(즉시 제거 전 AoE 적용)
  }
}
