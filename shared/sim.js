// ============================================================
// sim.js - GameSim: 서버 권위적 시뮬레이션 + 매치/라운드 상태머신. (shared, 서버 사용)
//
// 페이즈: lobby(대기) -> playing(라운드) -> roundover(승자 표시) -> playing ...
// 인간은 소켓 접속 시 엔티티로 추가(초기 alive=false=관전), 다음 startRound에 스폰.
// 봇은 라운드 시작 시 인원을 채우도록 생성. 장애물/존/탄은 매 라운드 초기화.
// ============================================================

import { CONFIG, WEAPONS } from './config.js';
import { Player, Bot } from './player.js';
import { Zone, generateWorld, generatePickups } from './world.js';
import { Bullet, Grenade } from './entity.js';
import { dist, circleRect, clamp, rand, randInt, TAU } from './utils.js';

const LOBBY_TIME = 8;        // 기본 첫 대기(초) — 생성자 lobbyTime 기본값
const ROUND_OVER_TIME = 6;   // 기본 라운드 종료 후 표시(초) — 생성자 roundOverTime 기본값

const BOT_NAMES = ['Hunter', 'Viper', 'Ghost', 'Reaper', 'Wolf', 'Falcon', 'Blaze', 'Nova', 'Raptor', 'Echo', 'Shade', 'Onyx'];

// 상수화: 하드코딩된 매직 넘버 제거
const SAFE_SPAWN_ENT_DIST = 230;   // 스폰 시 엔티티 최소 거리(px)
const SPAWN_CLEAR_RADIUS = 160;    // 중앙 스폰 클리어 반경
const PICKUP_PICKUP_RADIUS = 14;   // 픽업 획득 반경
const DEFAULT_PICKUP_COUNT = 18;   // 한 라운드 기본 픽업 수
const DEFAULT_OBSTACLE_TARGET = 52;// 한 라운드 목표 장애물 수

// 전역 엔티티 id 시퀀스 — 모든 룸의 player/bot id가 globally unique하도록(룸 간 yourId 충돌 방지).
let ID_SEQ = 0;

function zeroInput() {
  return { moveX: 0, moveY: 0, angle: 0, firing: false, reload: false, sprint: false };
}

// 클라이언트 입력을 검증/정규화. NaN·잘못된 타입이 시뮬을 오염(NaN 전파)시키는 걸 막는다.
export function sanitizeController(c) {
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v)) ? v : d;
  let moveX = num(c && c.moveX, 0);
  let moveY = num(c && c.moveY, 0);
  const len = Math.hypot(moveX, moveY);
  if (len > 1) { moveX /= len; moveY /= len; } // 이동 벡터 크기 1 이하로 클램프
  return {
    moveX, moveY,
    angle: num(c && c.angle, 0),
    firing: !!(c && c.firing),
    reload: !!(c && c.reload),
    sprint: !!(c && c.sprint),
  };
}

export class GameSim {
  // 다중 룸 지원: 모든 설정은 선택적 config로, 무인자 new GameSim()도 동작(테스트 호환).
  //  mode='ai' 면 레벨(=봇 수) 기반 1인용 캠페인, 'multi' 면 목표 인원(인간+봇) 기반 공유 룸.
  constructor({ mode = 'multi', level = 1, maxHumans = 9, targetEntities = 9,
                lobbyTime = LOBBY_TIME, roundOverTime = ROUND_OVER_TIME } = {}) {
    this.mode = mode;                  // 'ai' | 'multi'
    this.level = level;                // AI 모드 현재 레벨(1~9). multi 는 사용 안 함
    this.maxLevelReached = level;      // AI: 이 룸이 도달한 최고 레벨(오늘의 AI 랭킹 기록용)
    this.maxHumans = maxHumans;        // multi 인간 상한
    this.targetEntities = targetEntities; // multi 목표 인원(인간+봇). 부족분은 봇이 채움
    this.lobbyTime = lobbyTime;
    this.roundOverTime = roundOverTime;
    this.entities = [];
    this.bullets = [];
    this.grenades = [];
    this.pickups = [];
    this.zone = new Zone();
    this.obstacles = generateWorld();
    this.time = 0;
    this.phase = 'lobby';
    this.phaseTimer = lobbyTime;
    this.winnerId = null;
    this.pendingEvents = [];   // 클라로 브로드캐스트할 킬/히트/aiRoundOver 이벤트 큐
    this._entityMap = new Map(); // O(1) 엔티티 룩업 (ID → 엔티티) — 충돌/킬 귀속 성능 개선
  }

  // ---- 엔티티 Map 동기화 (O(1) 룩업용) ----
  _rebuildEntityMap() {
    this._entityMap.clear();
    for (const e of this.entities) this._entityMap.set(e.id, e);
  }
  _getEntity(id) { return this._entityMap.get(id); }

  // ---- 플레이어 입장/퇴장 ----
  addPlayer() {
    const p = new Player('p' + (++ID_SEQ), CONFIG.WORLD_SIZE / 2, CONFIG.WORLD_SIZE / 2,
      { color: this.randomColor(), name: 'Player' + randInt(100, 999) });
    p.isHuman = true;
    p.alive = false; // 다음 라운드까지 관전
    this.entities.push(p);
    this._entityMap.set(p.id, p);
    return p;
  }

  removePlayer(id) {
    this.entities = this.entities.filter((e) => e.id !== id);
    this._entityMap.delete(id);
    // 발사자가 제거(이탈/사망)된 탄을 즉시 정리 — 어색한 킬 귀속/킬피드 방지
    for (const b of this.bullets) if (b.ownerId === id) b.dead = true;
  }

  // ---- 정적/스냅샷 데이터 ----
  getInitData() {
    return { worldSize: CONFIG.WORLD_SIZE, phase: this.phase, phaseTimeLeft: this.phaseTimer,
             mode: this.mode, level: this.level, maxLevelReached: this.maxLevelReached };
  }

  // 라운드 시작 시 한 번만 전송되는 정적 데이터(장애물 등). 스냅샷은 가볍게 유지.
  getRoundStartData() {
    return {
      worldSize: CONFIG.WORLD_SIZE,
      phase: this.phase,
      phaseTimeLeft: Math.max(0, this.phaseTimer),
      winnerId: this.winnerId,
      obstacles: this.obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, type: o.type })),
    };
  }

  // 누적된 이벤트를 가져오고 큐를 비운다(서버가 틱마다 브로드캐스트).
  drainEvents() {
    if (this.pendingEvents.length === 0) return null;
    const evs = this.pendingEvents;
    this.pendingEvents = [];
    return evs;
  }

  getSnapshot() {
    return {
      time: this.time,
      phase: this.phase,
      phaseTimeLeft: Math.max(0, this.phaseTimer),
      winnerId: this.winnerId,
      mode: this.mode,
      level: this.level,
      maxLevelReached: this.maxLevelReached,
      entities: this.entities.map((e) => {
        // 공통 필드. 경제/보유무기/부활플래그는 인간 전용(봇은 미사용 → 송출/alloc 절약).
        const base = {
          id: e.id, x: e.x, y: e.y, angle: e.angle,
          health: e.health, maxHealth: e.maxHealth, alive: e.alive,
          isBot: e.isBot, color: e.color, name: e.name, country: e.country,
          weaponKey: e.weaponKey, ammo: e.ammo, reloadTimer: e.reloadTimer,
          radius: e.radius,
          grenadeCount: e.grenadeCount,
        };
        if (!e.isBot) {
          base.score = e.score; base.coins = e.coins;
          base.revivedThisLife = e.revivedThisLife; base.adSMG = e.adSMG;
          base.ownedWeapons = [...e.ownedWeapons];
        }
        return base;
      }),
      bullets: this.bullets.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
      grenades: this.grenades.map((g) => ({ x: g.x, y: g.y, fuse: g.fuse, ownerId: g.ownerId })),
      zone: { cx: this.zone.center.x, cy: this.zone.center.y, r: this.zone.radius },
      pickups: this.pickups.map((p) => ({ x: p.x, y: p.y, type: p.type })),
    };
  }

  // ---- 매치/라운드 ----
  startRound() {
    this.phase = 'playing';
    this.winnerId = null;
    this.obstacles = generateWorld();
    this.bullets = [];
    this.grenades = [];
    // 아이템은 크레이트 파괴가 아니라 바닥에 미리 노출
    this.pickups = generatePickups(this.obstacles, DEFAULT_PICKUP_COUNT);
    this.zone = new Zone();
    this.roundStartEvent = true; // 서버가 라운드 시작 시 정적 데이터를 브로드캐스트

    // 인간만 남기고, 활성(연결된) 인간은 재스폰. 유예 중(grace) 인간은 관전(alive=false) —
    // 봇 수를 밀어내거나 무방비 표적(서 있는 사냥감)이 되는 것을 방지.
    this.entities = this.entities.filter((e) => e.isHuman);
    for (const h of this.entities) {
      if (h.socketId !== null) this.spawnEntity(h);
      else { h.alive = false; h._reportedDeath = true; } // grace: 관전, 사망 리포트 방지
    }

    // AI 모드는 진행 중인 레벨(=봇 수) 도달로 기록. 멀티는 매 라운드 새 장비.
    if (this.mode === 'ai') this.maxLevelReached = Math.max(this.maxLevelReached, this.level);

    const activeHumans = this.entities.filter((e) => e.socketId !== null).length;
    // 봇 수: AI 모드는 레벨=N→봇 N, 멀티는 (목표 인원 − 활성 인간), 9인 가득 시 0
    const botCount = (this.mode === 'ai') ? this.level : Math.max(0, this.targetEntities - activeHumans);
    for (let i = 0; i < botCount; i++) {
      const b = new Bot('b' + (++ID_SEQ), 0, 0);
      b.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + randInt(1, 99);
      // 난이도: AI 모드는 레벨별 상승(±약간의 분산), multi 는 중간 고정. spawnEntity 전에 설정(체력 반영).
      let t;
      if (this.mode === 'ai') {
        const span = CONFIG.MODES.AI_MAX_LEVEL - 1;
        const base = span > 0 ? (this.level - 1) / span : 0.5;
        t = clamp(base + rand(-0.08, 0.08), 0, 1);
      } else {
        t = 0.45;
      }
      b.setSkill(t);
      // 고난이도일수록 샷건 시작 확률 증가(무기 다양성 + 위협)
      b.startWeapon = (Math.random() < (0.10 + 0.32 * t)) ? 'shotgun' : null;
      this.spawnEntity(b);
      this.entities.push(b);
    }
    // 라운드 시작 시 엔티티 Map 재구축
    this._rebuildEntityMap();
  }

  endRound(winnerId) {
    this.phase = 'roundover';
    this.winnerId = winnerId;
    this.phaseTimer = this.roundOverTime;
    if (this.mode === 'ai') {
      // AI 모드: 단일 인간의 승패가 레벨 진행/재도전을 결정.
      const human = this.entities.find((e) => e.isHuman);
      const humanWon = !!(human && winnerId === human.id);
      const playedLevel = this.level;                       // 방금 플레이한(클리어/실패한) 레벨
      if (humanWon) this.level = Math.min(CONFIG.MODES.AI_MAX_LEVEL, this.level + 1); // 클리어 → 다음 레벨
      // 패배면 level 유지(같은 레벨 재도전)
      this.maxLevelReached = Math.max(this.maxLevelReached, this.level);
      if (human) {
        const acc = human.shotsFired > 0 ? Math.round(100 * human.shotsHit / human.shotsFired) : 0;
        this.pendingEvents.push({
          type: 'playerResult', id: human.id, won: humanWon,
          kills: human.kills, deaths: human.deaths, damage: Math.round(human.damageDealt),
          shotsFired: human.shotsFired, shotsHit: human.shotsHit, accuracy: acc,
          timeSurvived: Math.max(0, this.time - (human.spawnTime || 0)),
          placement: humanWon ? 1 : playedLevel, total: playedLevel,
          level: this.level,
        });
      }
      this.pendingEvents.push({
        type: 'aiRoundOver', winnerId, humanWon, playedLevel,
        level: this.level, maxLevelReached: this.maxLevelReached,
      });
    } else {
      // 멀티: 승리 보너스(인간 한정)
      const w = this.entities.find((e) => e.id === winnerId);
      if (w && w.isHuman) w.coins += CONFIG.COINS.WIN;
      // 경기 후 스탯(인간별 placement/정확도/생존시간 등) — 각 클라가 자기 결과만 표시
      const humans = this.entities.filter((e) => e.isHuman);
      for (const h of humans) if (h.alive) h.deathTime = Infinity; // 생존자(승자)는 마지막
      humans.sort((a, b) => (b.deathTime || 0) - (a.deathTime || 0)); // 늦게 죽은 순(승자 우선)
      const total = humans.length;
      humans.forEach((h, i) => {
        const acc = h.shotsFired > 0 ? Math.round(100 * h.shotsHit / h.shotsFired) : 0;
        this.pendingEvents.push({
          type: 'playerResult', id: h.id, won: h.id === winnerId,
          kills: h.kills, deaths: h.deaths, damage: Math.round(h.damageDealt),
          shotsFired: h.shotsFired, shotsHit: h.shotsHit, accuracy: acc,
          timeSurvived: Math.max(0, (h.deathTime === Infinity ? this.time : h.deathTime) - (h.spawnTime || 0)),
          placement: i + 1, total,
        });
      });
    }
  }

  // 부활(보상형 광고 보상). 생존 중 1회, 라운드 진행 중에만.
  revivePlayer(p) {
    if (!p || !p.isHuman || p.alive || this.phase !== 'playing') return false;
    if (p.revivedThisLife) return false;
    p.alive = true;
    p.health = Math.max(CONFIG.COINS.REVIVE_HEALTH, p.maxHealth * 0.5);
    p.weaponKey = p.ownedWeapons.has('smg') ? 'smg' : 'pistol';
    p.ammo = WEAPONS[p.weaponKey].magSize;
    p.fireCooldown = 0; p.reloadTimer = 0; p.prevFiring = false;
    p.revivedThisLife = true;
    p.regenLock = 0;          // 피격 락 이월 방지
    p._reportedDeath = false; // 부활 후 재사망 시 킬 피드 누락 방지
    const sp = this.findSafeSpawn();
    p.x = sp.x; p.y = sp.y; p.angle = rand(0, TAU);
    p._px = p.x; p._py = p.y;
    return true;
  }

  spawnEntity(e) {
    e.health = e.maxHealth;
    e.alive = true;
    e.weaponKey = 'pistol';
    e.ammo = WEAPONS.pistol.magSize;
    e.fireCooldown = 0;
    e.reloadTimer = 0;
    e.prevFiring = false;
    e.ownedWeapons = new Set(['pistol']);
    e.lastHitBy = null;
    e._reportedDeath = false;
    e.revivedThisLife = false;
    e.regenLock = 0;       // 전 라운드 피격 락 이월 방지
    e.adPerkUsed = false;  // 라운드당 광고 혜택 1회 제한 리셋
    e.grenadeCount = CONFIG.GRENADE.START_COUNT; // 라운드 시작 수류탄 지급
    e.kills = 0; e.deaths = 0; e.damageDealt = 0; e.shotsFired = 0; e.shotsHit = 0; // 라운드 스탯 리셋
    e.spawnTime = this.time; e.deathTime = 0;
    if (e.adSMG) { // 보상형 광고 혜택: SMG로 시작
      e.ownedWeapons.add('smg');
      e.weaponKey = 'smg'; e.ammo = WEAPONS.smg.magSize; e.adSMG = false;
    }
    e.vx = 0; e.vy = 0;
    if (e.isBot && e.startWeapon && WEAPONS[e.startWeapon]) {
      e.ownedWeapons.add(e.startWeapon); // 보유 무기 세트 동기화(스냅샷 일치)
      e.weaponKey = e.startWeapon; e.ammo = WEAPONS[e.startWeapon].magSize;
      e.startWeapon = null;
    }
    const sp = this.findSafeSpawn();
    e.x = sp.x; e.y = sp.y;
    e._px = e.x; e._py = e.y; // 속도 추적 기준점 보정(텔레포트 오차 방지)
    e.angle = rand(0, TAU);
  }

  findSafeSpawn() {
    for (let i = 0; i < 60; i++) {
      const x = rand(120, CONFIG.WORLD_SIZE - 120);
      const y = rand(120, CONFIG.WORLD_SIZE - 120);
      if (this.zone.isOutside(x, y)) continue;
      let bad = false;
      for (const o of this.obstacles) {
        if (o.solid && circleRect(x, y, CONFIG.PLAYER_RADIUS, o.x, o.y, o.w, o.h)) { bad = true; break; }
      }
      if (bad) continue;
      for (const e of this.entities) {
        if (e.alive && dist(x, y, e.x, e.y) < SAFE_SPAWN_ENT_DIST) { bad = true; break; }
      }
      if (bad) continue;
      return { x, y };
    }
    return { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2 };
  }

  randomColor() {
    const hue = Math.floor(rand(0, 360));
    return `hsl(${hue},70%,58%)`;
  }

  // ---- 메인 스텝 ----
  step(dt, controllers) {
    this.time += dt;
    if (this.phase !== 'playing') {
      this.phaseTimer -= dt;
      // 라운드는 인간이 최소 1명 있을 때만 시작(빈 봇 전쟁 방지)
      if (this.phaseTimer <= 0) {
        if (this.entities.some((e) => e.isHuman)) this.startRound();
        else this.phaseTimer = this.lobbyTime; // 인간 대기
      }
      return;
    }
    this.stepPlay(dt, controllers);
  }

  stepPlay(dt, controllers) {
    for (const e of this.entities) {
      const c = e.isHuman ? (controllers.get(e.id) || zeroInput()) : null;
      e.update(dt, c, this);
    }

    // 엔티티 간 겹침 분리(관전자 제외). bullet 처리 이전에 위치를 확정.
    this.resolveEntityCollisions();

    for (const b of this.bullets) b.update(dt);
    this.resolveBulletCollisions();

    this.zone.update(dt);
    const zoneDps = this.zone.currentDps(); // 반경 축소에 따라 START→END로 강화
    for (const e of this.entities) {
      if (e.alive && this.zone.isOutside(e.x, e.y)) e.takeDamage(zoneDps * dt, 'zone');
    }

    this.resolveGrenades(dt);
    this.resolvePickups();
    this.reportDeaths();

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.grenades = this.grenades.filter((g) => !g.dead);
    this.obstacles = this.obstacles.filter((o) => !o.destroyed);

    // 라운드 종료: 생존 ≤1 또는 인간 전원 사망
    const alive = this.entities.filter((e) => e.alive);
    const aliveHumans = alive.filter((e) => e.isHuman).length;
    if (alive.length <= 1 || aliveHumans === 0) {
      this.endRound(alive[0] ? alive[0].id : null);
    }
  }

  // 엔티티 간 겹침(원-원) 분리. 관전자(alive=false)는 제외.
  // 침투량의 절반씩 중심선을 따라 밀어내되, 밀어낸 자리가 장애물과 충돌하면 롤백(벽 속 매몰 방지).
  // 2회 반복으로 3체 이상 밀집 안정화. 엔티티 수가 적어 O(n²)도 저렴.
  resolveEntityCollisions() {
    const es = this.entities;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < es.length; i++) {
        const a = es[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < es.length; j++) {
          const b = es[j];
          if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          let ux, uy, overlap;
          if (d > 0.0001) { ux = dx / d; uy = dy / d; overlap = min - d; }
          else { ux = 1; uy = 0; overlap = min; d = 0; } // 완전 중첩: x축으로 임의 분리
          const half = overlap * 0.5;
          const aNx = a.x - ux * half, aNy = a.y - uy * half;
          const bNx = b.x + ux * half, bNy = b.y + uy * half;
          // 각자 새 위치가 장애물과 충돌하지 않을 때만 이동(벽 밀림 방지)
          if (!this._entHitsObstacle(aNx, aNy, a.radius)) { a.x = aNx; a.y = aNy; }
          if (!this._entHitsObstacle(bNx, bNy, b.radius)) { b.x = bNx; b.y = bNy; }
          a.x = clamp(a.x, a.radius, CONFIG.WORLD_SIZE - a.radius);
          a.y = clamp(a.y, a.radius, CONFIG.WORLD_SIZE - a.radius);
          b.x = clamp(b.x, b.radius, CONFIG.WORLD_SIZE - b.radius);
          b.y = clamp(b.y, b.radius, CONFIG.WORLD_SIZE - b.radius);
        }
      }
    }
  }

  _entHitsObstacle(x, y, r) {
    for (const o of this.obstacles) {
      if (o.solid && circleRect(x, y, r, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  }

  // 새로 사망한 엔티티를 한 번씩만 킬 피드에 보고(가해자 귀속).
  reportDeaths() {
    for (const e of this.entities) {
      if (!e.alive && !e._reportedDeath) {
        e._reportedDeath = true;
        e.deathTime = this.time; // placement 산출용 생존 종료 시각
        const killer = e.lastHitBy; // 발사자 id | 'zone' | null
        this.pendingEvents.push({
          type: 'kill',
          victimId: e.id, victimName: e.name, victimIsBot: e.isBot,
          killerId: (killer && killer !== 'zone') ? killer : null,
        });
      }
    }
  }

  resolveBulletCollisions() {
    for (const b of this.bullets) {
      if (b.dead) continue;

      for (const o of this.obstacles) {
        if (o.blocksBullets && circleRect(b.x, b.y, b.radius, o.x, o.y, o.w, o.h)) {
          b.dead = true;
          // 크레이트는 엄폐물로만 파괴 가능(루트 없음 — 아이템은 지상 스폰)
          if (o.destructible) {
            o.health -= b.damage;
            if (o.health <= 0) {
              o.destroyed = true;
              this.pendingEvents.push({ type: 'obstacleDestroyed', id: o.id });
            }
          }
          break;
        }
      }
      if (b.dead) continue;

      for (const e of this.entities) {
        if (!e.alive || e.id === b.ownerId) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy <= (b.radius + e.radius) * (b.radius + e.radius)) {
          b.dead = true;
          const wasAlive = e.alive;
          e.takeDamage(b.damage, b.ownerId);
          const shooter = this._getEntity(b.ownerId);
          if (shooter) { shooter.shotsHit++; shooter.damageDealt += b.damage; } // 적중/피해 집계(스탯)
          if (wasAlive && !e.alive) {
            if (shooter) { shooter.score += 10; shooter.kills++; shooter.coins += CONFIG.COINS.PER_KILL; }
          } else if (wasAlive) {
            // 적중 피드백(히트마커) — 가해자가 인간인 경우만 클라에서 표시 판단
            this.pendingEvents.push({ type: 'hit', shooterId: b.ownerId, victimId: e.id, damage: b.damage });
          }
          break;
        }
      }
    }
  }

  // 수류탄 업데이트 + 폭발 AoE 해상도(서버 권위적). 기폭: FUSE 소진 또는 장애물/월드 경계 충돌.
  resolveGrenades(dt) {
    if (this.grenades.length === 0) return;
    for (const g of this.grenades) {
      g.update(dt);
      if (!g.dead) {
        // 장애물(고체) 또는 월드 경계 충돌 시 즉시 기폭
        if (g.x < 0 || g.y < 0 || g.x > CONFIG.WORLD_SIZE || g.y > CONFIG.WORLD_SIZE) g.dead = true;
        else {
          for (const o of this.obstacles) {
            if (o.solid && circleRect(g.x, g.y, g.radius, o.x, o.y, o.w, o.h)) { g.dead = true; break; }
          }
        }
      }
      if (g.dead) this._explodeGrenade(g);
    }
  }

  // 수류탄 폭발: 반경 내 생존 엔티티에 감쇠 피해 + 폭발 이벤트(파티클/셰이크용).
  _explodeGrenade(g) {
    this.pendingEvents.push({ type: 'explosion', x: g.x, y: g.y, r: g.explodeRadius, ownerId: g.ownerId });
    const shooter = this._getEntity(g.ownerId);
    for (const e of this.entities) {
      if (!e.alive || e.id === g.ownerId) continue;
      const d = dist(g.x, g.y, e.x, e.y);
      if (d > g.explodeRadius + e.radius) continue;
      const falloff = clamp(1 - d / (g.explodeRadius + e.radius), 0.25, 1); // 중심일수록 강한 피해
      const wasAlive = e.alive;
      e.takeDamage(g.damage * falloff, g.ownerId);
      if (shooter) { shooter.shotsHit++; shooter.damageDealt += g.damage * falloff; } // 폭발도 적중/피해 집계
      if (wasAlive && !e.alive && shooter) {
        shooter.score += 10; shooter.kills++; shooter.coins += CONFIG.COINS.PER_KILL;
      }
    }
  }

  // 수류탄 투척(서버 호출). 플레이어 현재 각도(p.angle) 사용. 보유 수/생존 검증.
  throwGrenade(p) {
    if (!p || !p.alive || p.grenadeCount <= 0) return;
    p.grenadeCount--;
    const g = new Grenade(p.x, p.y, p.angle, p.id, CONFIG.GRENADE);
    this.grenades.push(g);
  }

  // 모든 인간 플레이어 대상 (봇은 픽업 안 함)
  resolvePickups() {
    this.pickups = this.pickups.filter((pk) => {
      for (const e of this.entities) {
        if (e.isHuman && e.alive && dist(e.x, e.y, pk.x, pk.y) < e.radius + PICKUP_PICKUP_RADIUS) {
          if (pk.type === 'health') e.health = Math.min(e.maxHealth, e.health + 40);
          else if (pk.type === 'smg') {
            e.ownedWeapons.add('smg');
            e.weaponKey = 'smg'; e.ammo = WEAPONS.smg.magSize; e.reloadTimer = 0;
          } else if (pk.type === 'shotgun') {
            e.ownedWeapons.add('shotgun');
            e.weaponKey = 'shotgun'; e.ammo = WEAPONS.shotgun.magSize; e.reloadTimer = 0;
          } else if (pk.type === 'pistol') {
            // 권총 탄약 보급(이미 기본 보유)
            e.ownedWeapons.add('pistol');
            if (e.weaponKey === 'pistol') { e.ammo = WEAPONS.pistol.magSize; e.reloadTimer = 0; }
          } else if (pk.type === 'grenade') {
            // 수류탄 보급(상한까지)
            e.grenadeCount = Math.min(CONFIG.GRENADE.MAX, e.grenadeCount + CONFIG.GRENADE.PICKUP_COUNT);
          }
          return false;
        }
      }
      return true;
    });
  }
}
