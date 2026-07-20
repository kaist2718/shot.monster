// ============================================================
// player.js - Player(인간, 컨트롤러 구동) + Bot(AI). (shared, DOM 무의존)
// 인간 Player는 update(dt, controller, state)에서 컨트롤러 계약을 읽는다:
//   controller = { moveX, moveY, angle, firing, reload, sprint }
// 반자동 사격은 this.prevFiring 엣지 검출(서버 권위적).
// 샷건은 pellets 만큼 산탄. 무기별 재장전 시간. 전투 외 체력 재생.
// ============================================================

import { CONFIG, WEAPONS } from './config.js';
import { Bullet } from './entity.js';
import { clamp, circleRect, rand, dist, dist2, TAU } from './utils.js';

export class Player {
  constructor(id, x, y, opts = {}) {
    this.id = id;
    this.type = 'player';
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this._px = x; this._py = y;
    this.radius = CONFIG.PLAYER_RADIUS;
    this.angle = 0;
    this.health = CONFIG.PLAYER_MAX_HEALTH;
    this.maxHealth = CONFIG.PLAYER_MAX_HEALTH;
    this.alive = true;
    this.isBot = false;
    this.isHuman = false;
    this.color = opts.color || CONFIG.COLORS.player;
    this.name = opts.name || 'Player';
    this.country = null;     // ISO alpha-2 코드(없으면 null). server.js가 auth에서 적용.
    this.weaponKey = 'pistol';
    this.ammo = WEAPONS.pistol.magSize;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.score = 0;
    this.kills = 0;          // 실제 킬 수(리더보드용) — 라운드 간 누적
    this.deaths = 0;         // 사망 횟수(K/D용)
    this.prevFiring = false; // 반자동 엣지 검출용
    this.grenadeCount = CONFIG.GRENADE.START_COUNT; // 수류탄 보유 수
    // 경기 후 스탯 누적기(라운드 시작 시 리셋 → 해당 라운드 기준)
    this.damageDealt = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.spawnTime = 0;      // 라운드 스폰 시각(생존시간 산출)
    this.deathTime = 0;      // 사망 시각(placement 산출)
    this.ownedWeapons = new Set(['pistol']); // 픽업/전환 가능한 무기
    this.lastHitBy = null;    // 마지막 데미지 가해자(id | 'zone' | null) — 킬 귀속용
    this._reportedDeath = false; // 라운드 내 사망 리포트 1회 방지
    this.socketId = null;     // 현재 제어 중인 소켓(server.js 재접속 판정용). null=유예 중(활성 소켓 없음)
    this.room = null;         // 소속 룸(server.js Room). 룸별 라우팅/브로드캐스트의 진실원
    this.coins = 0;           // 획득 코인(일간 보드에 누적)
    this.revivedThisLife = false; // 이번 생애 부활 사용 여부(1회 제한)
    this.adSMG = false;       // 다음 라운드 SMG로 시작(보상형 광고 혜택)
    this.adPerkUsed = false;  // 이번 라운드 광고 혜택 사용 여부(1회 제한, 스폰 시 리셋)
    this.regenLock = 0;       // 피격 후 재생 봉쇄 타이머(초)
  }

  get weapon() { return WEAPONS[this.weaponKey]; }

  tryFire(state, angleOverride) {
    if (!this.alive || this.reloadTimer > 0 || this.fireCooldown > 0) return false;
    if (this.ammo <= 0) { this.startReload(); return false; }
    const w = this.weapon;
    const base = (angleOverride !== undefined ? angleOverride : this.angle);
    const bx = this.x + Math.cos(base) * (this.radius + 4);
    const by = this.y + Math.sin(base) * (this.radius + 4);
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const ang = base + rand(-w.spread, w.spread);
      state.bullets.push(new Bullet(bx, by, ang, w.bulletSpeed * rand(0.9, 1.02), w.damage, this.id));
    }
    this.ammo--;
    this.fireCooldown = w.fireRate;
    this.shotsFired += pellets; // 적중률(정확도) 집계용
    if (this.ammo <= 0) this.startReload();
    return true;
  }

  startReload() {
    if (this.reloadTimer <= 0 && this.ammo < this.weapon.magSize) {
      this.reloadTimer = this.weapon.reloadTime || CONFIG.RELOAD_TIME;
    }
  }

  // 무기 전환(서버 권위적). 보유한 무기만 가능.
  switchWeapon(key) {
    if (WEAPONS[key] && this.ownedWeapons.has(key) && key !== this.weaponKey) {
      this.weaponKey = key;
      this.ammo = WEAPONS[key].magSize;
      this.reloadTimer = 0;
      this.fireCooldown = Math.max(this.fireCooldown, 0.12); // 전환 딜레이(가벼운 페널티)
    }
  }

  takeDamage(d, source = null) {
    if (!this.alive) return;
    this.health -= d;
    this.lastHitBy = source;
    this.regenLock = CONFIG.REGEN_DELAY; // 피격 시 재생 봉쇄 리셋
    if (this.health <= 0) { this.health = 0; this.deaths++; this.die(); } // 사망 1회 집계
  }

  // 공통 타이머 + 인간 컨트롤러 처리. Bot은 update를 덮어쓴다.
  update(dt, controller, state) {
    // 직전 프레임 대비 속도(표적 리드/렌더용)
    if (dt > 0 && this._px !== undefined) {
      this.vx = (this.x - this._px) / dt; this.vy = (this.y - this._py) / dt;
    }
    this._px = this.x; this._py = this.y;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = this.weapon.magSize; this.reloadTimer = 0; }
    }
    // 전투 외 체력 재생
    if (this.alive) {
      if (this.regenLock > 0) this.regenLock -= dt;
      else if (this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + CONFIG.REGEN_HP * dt);
    }
    if (this.isBot || !this.alive) return;
    this.applyController(dt, controller, state);
  }

  // 컨트롤러 계약 -> 이동/조준/재장전/사격
  applyController(dt, c, state) {
    if (!c) c = { moveX: 0, moveY: 0, angle: this.angle, firing: false, reload: false, sprint: false };

    const dx = c.moveX, dy = c.moveY;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = dx / len, ny = dy / len;
      const mag = Math.min(len, 1);
      let speed = CONFIG.PLAYER_SPEED * mag;
      if (c.sprint) speed *= CONFIG.PLAYER_SPRINT_MULT;
      this.applyMove(this.x + nx * speed * dt, this.y + ny * speed * dt, state);
    }

    this.angle = c.angle;
    if (c.reload) this.startReload();

    const w = this.weapon;
    const fire = w.auto ? c.firing : (c.firing && !this.prevFiring); // 반자동: false→true 엣지
    this.prevFiring = c.firing;
    if (fire) this.tryFire(state);
  }

  // 충돌 해결 포함 이동 (축별 분리 -> 벽을 타고 미끄러짐)
  applyMove(nx, ny, state) {
    const px = this.x;
    this.x = nx;
    if (this.collidesWorld(state)) this.x = px;
    const py = this.y;
    this.y = ny;
    if (this.collidesWorld(state)) this.y = py;
    this.x = clamp(this.x, this.radius, CONFIG.WORLD_SIZE - this.radius);
    this.y = clamp(this.y, this.radius, CONFIG.WORLD_SIZE - this.radius);
  }

  collidesWorld(state) {
    for (const o of state.obstacles) {
      if (o.solid && circleRect(this.x, this.y, this.radius, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  }

  die() { this.alive = false; }
}

// ============================================================
// Bot - 상태머신 AI. 표적 리드/저체력 후퇴/스트레이프 사격/존 회피.
// 난이도 스케일링(setSkill): AI 모드는 레벨별, multi 는 중간값.
// v2: 행동 전환 랜덤화, 수류탄 투척, 엄폐물 활용, 무기 전환.
// ============================================================
export class Bot extends Player {
  constructor(id, x, y) {
    super(id, x, y, { color: CONFIG.COLORS.bot, name: 'Bot' });
    this.isBot = true;
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(0.8, 2);
    this.startWeapon = null; // sim이 지정하면 스폰 시 장비
    // 행동 전환 타이머 — 패턴 예측 방지
    this._actionTimer = rand(1.5, 4);
    this._currentAction = 'idle'; // 'aggressive' | 'defensive' | 'roaming' | 'idle'
    this._grenadeTimer = rand(3, 8); // 수류탄 투척 쿨다운
    this._weaponSwitchTimer = rand(5, 12); // 무기 전환 타이머
    this._retreatAngle = 0; // 후퇴 방향 오프셋
    this.setSkill(0.5);      // 기본 중간 난이도(sim이 덮어씀)
  }

  // 난이도 t(0=매우 약함 ~ 1=매우 강함)에 따른 능력치 스케일.
  setSkill(t) {
    t = clamp(t, 0, 1);
    this.skill = t;
    this.speed = CONFIG.BOT_SPEED * (0.88 + 0.20 * t);            // 속도 0.88x ~ 1.08x
    this.aimJitter = 0.15 - 0.12 * t;                             // 조준 흐트러짐 ±0.15 ~ ±0.03
    this.leadFactor = 0.35 + 0.50 * t;                            // 표적 리드 계수 0.35 ~ 0.85
    this.aggression = 0.45 + 0.55 * t;                            // 사격 의지 0.45 ~ 1.0
    this.maxHealth = CONFIG.PLAYER_MAX_HEALTH + Math.round(25 * t); // 체력 100 ~ 125
    this.health = Math.min(this.health || this.maxHealth, this.maxHealth);
  }

  update(dt, controller, state) {
    super.update(dt, controller, state); // 타이머/재생(봇이라 여기서 리턴)
    if (!this.alive) return;

    // 행동 전환 타이머 — 예측 불가능한 패턴 변경
    this._actionTimer -= dt;
    if (this._actionTimer <= 0) {
      const r = Math.random();
      if (r < 0.4) this._currentAction = 'aggressive';
      else if (r < 0.7) this._currentAction = 'defensive';
      else this._currentAction = 'roaming';
      this._actionTimer = rand(2, 5); // 2~5초 후 재결정
      this._retreatAngle = rand(-0.5, 0.5); // 후퇴 방향 흔들기
    }

    // 무기 전환 시도(스킬 높은 봇만) — 거리 기반 최적 무기 선택
    this._weaponSwitchTimer -= dt;
    if (this._weaponSwitchTimer <= 0 && this.skill > 0.3) {
      this._trySmartWeaponSwitch(state);
      this._weaponSwitchTimer = rand(4, 10);
    }

    // 존 바깥/가장자리면 전투보다 생존 우선 — 중심으로 후퇴. 존 사냥(cheese) 방지.
    const zc = state.zone.center;
    const zoneEdgeRatio = 0.82 - 0.05 * (1 - this.skill); // 스킬 높은 봇은 더 일찍 회피
    const nearEdge = dist(this.x, this.y, zc.x, zc.y) > state.zone.radius * zoneEdgeRatio;
    if (state.zone.isOutside(this.x, this.y) || nearEdge) {
      this.moveToward(zc.x, zc.y, dt, state);
      const t = this.findNearestEnemy(state);
      if (t) {
        this.angle = Math.atan2(t.y - this.y, t.x - this.x) + rand(-this.aimJitter, this.aimJitter);
        if (dist(this.x, this.y, t.x, t.y) <= CONFIG.BOT_SHOOT_RANGE && Math.random() < this.aggression * 0.5) this.tryFire(state);
      }
      return;
    }

    const target = this.findNearestEnemy(state);
    if (target) {
      const d = dist(this.x, this.y, target.x, target.y);
      const hpRatio = this.health / this.maxHealth;
      // 표적 리드: 탄 비행 시간 추정 후 예상 위치로 조준
      const w = this.weapon;
      const tof = d / w.bulletSpeed;
      const px = target.x + (target.vx || 0) * tof * this.leadFactor;
      const py = target.y + (target.vy || 0) * tof * this.leadFactor;
      this.angle = Math.atan2(py - this.y, px - this.x) + rand(-this.aimJitter, this.aimJitter);

      // 수류탄 투척(스킬 ≥ 0.4, HP 높음, 적 거리 적당)
      if (this.skill >= 0.4 && this.grenadeCount > 0 && d > 80 && d < 350 && hpRatio > 0.5) {
        this._grenadeTimer -= dt;
        if (this._grenadeTimer <= 0) {
          state.throwGrenade(this);
          this._grenadeTimer = rand(5, 12);
        }
      }

      // 저체력 임계값을 난이도/행동 기반으로 동적 조절 (더 예측 어려움)
      const lowHPThreshold = 0.28 + 0.08 * (1 - this.skill);
      const lowHP = hpRatio < lowHPThreshold;

      if (lowHP) {
        // 후퇴: 표적 반대 방향 + 랜덤 오프셋으로 예측 방지
        const retAng = Math.atan2(this.y - target.y, this.x - target.x) + this._retreatAngle;
        const retX = this.x + Math.cos(retAng) * 200;
        const retY = this.y + Math.sin(retAng) * 200;
        this.moveToward(retX, retY, dt, state);
        // 후퇴 중에도 가끔 사격 (절박한 반격)
        if (Math.random() < this.aggression * 0.35) this.tryFire(state);
      } else if (this._currentAction === 'aggressive') {
        // 공격적: 적극 추격 + 근접 선호
        if (d > 120) this.moveToward(target.x, target.y, dt, state);
        else this.strafe(dt, state); // 근접 스트레이프
        if (d <= CONFIG.BOT_SHOOT_RANGE && Math.random() < this.aggression) this.tryFire(state);
      } else if (this._currentAction === 'defensive') {
        // 방어적: 거리 유지 + 스트레이프
        if (d < CONFIG.BOT_SHOOT_RANGE * 0.4) {
          // 너무 가까우면 뒤로 빠지며 스트레이프
          const retAng = Math.atan2(this.y - target.y, this.x - target.x);
          this.applyMove(this.x + Math.cos(retAng + this.strafeDir * 0.8) * this.speed * 0.6 * dt,
                         this.y + Math.sin(retAng + this.strafeDir * 0.8) * this.speed * 0.6 * dt, state);
        } else if (d > CONFIG.BOT_SHOOT_RANGE * 0.7) {
          this.moveToward(target.x, target.y, dt, state);
        } else {
          this.strafe(dt, state);
        }
        if (d <= CONFIG.BOT_SHOOT_RANGE && Math.random() < this.aggression * 0.8) this.tryFire(state);
      } else {
        // roaming: 기본 행동 (기존 로직)
        if (d > CONFIG.BOT_SHOOT_RANGE * 0.6) {
          this.moveToward(target.x, target.y, dt, state);
        } else {
          this.strafe(dt, state);
        }
        if (d <= CONFIG.BOT_SHOOT_RANGE && Math.random() < this.aggression) this.tryFire(state);
      }
    } else {
      this.wander(dt, state);
    }
  }

  // 지능형 무기 전환: 적 거리에 따라 최적 무기 선택
  _trySmartWeaponSwitch(state) {
    const target = this.findNearestEnemy(state);
    if (!target) return;
    const d = dist(this.x, this.y, target.x, target.y);
    // 근접: 샷건 선호, 중거리: SMG, 원거리: 권총
    if (d < 120 && this.ownedWeapons.has('shotgun')) {
      this.switchWeapon('shotgun');
    } else if (d > 300 && this.ownedWeapons.has('pistol')) {
      this.switchWeapon('pistol');
    } else if (this.ownedWeapons.has('smg')) {
      this.switchWeapon('smg');
    }
  }

  findNearestEnemy(state) {
    let best = null, bestD = CONFIG.BOT_VIEW_RANGE * CONFIG.BOT_VIEW_RANGE;
    for (const e of state.entities) {
      if (e === this || !e.alive) continue;
      const d2 = dist2(this.x, this.y, e.x, e.y);
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  moveToward(tx, ty, dt, state) {
    const ang = Math.atan2(ty - this.y, tx - this.x);
    this.applyMove(this.x + Math.cos(ang) * this.speed * dt,
                   this.y + Math.sin(ang) * this.speed * dt, state);
  }

  strafe(dt, state) {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = rand(0.7, 1.8); }
    const ang = this.angle + (Math.PI / 2) * this.strafeDir;
    this.applyMove(this.x + Math.cos(ang) * this.speed * 0.75 * dt,
                   this.y + Math.sin(ang) * this.speed * 0.75 * dt, state);
  }

  wander(dt, state) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) { this.wanderAngle = rand(0, TAU); this.wanderTimer = rand(1, 3); }
    const zc = state.zone.center;
    if (dist(this.x, this.y, zc.x, zc.y) > state.zone.radius * 0.8) {
      this.wanderAngle = Math.atan2(zc.y - this.y, zc.x - this.x);
    }
    this.applyMove(this.x + Math.cos(this.wanderAngle) * this.speed * 0.6 * dt,
                   this.y + Math.sin(this.wanderAngle) * this.speed * 0.6 * dt, state);
    this.angle = this.wanderAngle;
  }
}
