// ============================================================
// balance_sim.js - AI 모드 레벨별 밸런스 측정(스크래치/개발 도구).
// GameSim을 직접 구동하고 "중간 실력 플레이어 AI"로 레벨 1~9를 플레이해
// 승률 / 평균 피해 / 평균 생존시간 / 평균 킬을 측정한다.
// 실행: node test/balance_sim.js
// ============================================================

import { GameSim } from '../shared/sim.js';
import { CONFIG } from '../shared/config.js';
import { dist, clamp, TAU } from '../shared/utils.js';

// 중간 실력 플레이어 AI 정책 -> 컨트롤러 계약 반환.
// aimError 가 작을수록 숙련(고도). 반응/조준/거리유지/존 회피/탭사격 모방.
function makePlayerPolicy(aimError = 0.07) {
  let fireCD = 0; // 반자동 무기 탭(엣지) 모방용 쿨다운
  return function (human, state, dt) {
    fireCD -= dt;
    const c = { moveX: 0, moveY: 0, angle: human.angle, firing: false, reload: false, sprint: false };
    // 최근 적 탐색
    let target = null, bestD = Infinity;
    for (const e of state.entities) {
      if (e === human || !e.alive || !e.isBot) continue;
      const d = dist(human.x, human.y, e.x, e.y);
      if (d < bestD) { bestD = d; target = e; }
    }
    // 존 회피(가장자리면 중심으로)
    const zc = state.zone.center;
    const zd = dist(human.x, human.y, zc.x, zc.y);
    let zoneMove = null;
    if (zd > state.zone.radius * 0.72) {
      zoneMove = Math.atan2(zc.y - human.y, zc.x - human.x);
    }
    if (!target) {
      if (zoneMove !== null) { c.moveX = Math.cos(zoneMove); c.moveY = Math.sin(zoneMove); }
      return c;
    }
    const d = bestD;
    // 표적 리드 조준 + 에러
    const tof = d / human.weapon.bulletSpeed;
    const px = target.x + (target.vx || 0) * tof * 0.7;
    const py = target.y + (target.vy || 0) * tof * 0.7;
    let aim = Math.atan2(py - human.y, px - human.x);
    aim += (Math.random() - 0.5) * 2 * aimError;
    c.angle = aim;
    // 거리 유지(이상거리 ~320) + 스트레이프
    const ideal = 320;
    let moveAng;
    if (d > ideal + 60) moveAng = Math.atan2(py - human.y, px - human.x);
    else if (d < ideal - 60) moveAng = Math.atan2(human.y - py, human.x - px);
    else moveAng = aim + (Math.PI / 2) * (Math.sin(state.time * 1.4 + human.id.length) > 0 ? 1 : -1);
    if (zoneMove !== null) moveAng = zoneMove;
    c.moveX = Math.cos(moveAng); c.moveY = Math.sin(moveAng);
    // 사격: 자동무기는 홀드, 반자동은 탭(엣지) — 그렇지 않으면 한 발만 나감.
    const w = human.weapon;
    const wantFire = d <= CONFIG.BOT_SHOOT_RANGE && human.ammo > 0;
    if (w.auto) {
      c.firing = wantFire;
    } else {
      c.firing = wantFire && fireCD <= 0;
      if (c.firing) fireCD = w.fireRate + 0.04;
    }
    if (human.ammo <= 0) c.reload = true;
    return c;
  };
}

function runTrial(level, policy, maxSec = 100) {
  const sim = new GameSim({ mode: 'ai', level, lobbyTime: 0.001, roundOverTime: 0.001 });
  const h = sim.addPlayer();
  h.socketId = 'bench'; // 활성 인간으로 스폰(서버 assignSocket이 socketId 설정 후 라운드 시작을 모방)
  sim.startRound(); // phase=playing, 인간 리스폰 + 봇 level 개 스폰
  const controllers = new Map();
  const STEP = 1 / 60;
  const maxSteps = Math.floor(maxSec / STEP);
  let dmgTaken = 0;
  let prevHP = h.health;
  for (let i = 0; i < maxSteps; i++) {
    if (sim.phase !== 'playing') break;
    controllers.set(h.id, policy(h, sim, STEP));
    sim.step(STEP, controllers);
    if (h.alive && h.health < prevHP) { dmgTaken += (prevHP - h.health); }
    prevHP = h.alive ? h.health : 0;
    if (!h.alive) break;
  }
  return { won: h.alive, time: sim.time, dmgTaken, kills: h.kills, botsTotal: level };
}

function measure(level, trials, policy) {
  let wins = 0, tSum = 0, dmgSum = 0, killSum = 0;
  for (let i = 0; i < trials; i++) {
    const r = runTrial(level, policy);
    if (r.won) wins++;
    tSum += r.time; dmgSum += r.dmgTaken; killSum += r.kills;
  }
  return {
    level, trials, botsTotal: level,
    winRate: wins / trials,
    avgTime: tSum / trials,
    avgDmg: dmgSum / trials,
    avgKills: killSum / trials,
  };
}

const TRIALS = Number(process.env.TRIALS) || 24;
const AIM = Number(process.env.AIM) || 0.07;
const policy = makePlayerPolicy(AIM);

console.log(`# AI 모드 밸런스 측정 (플레이어 숙련도 aimError=${AIM}, 트라이얼/레벨=${TRIALS})\n`);
console.log('Lv | 승률   | 평균생존(s) | 평균피해 | 평균킬/봇수');
console.log('---+--------+------------+----------+----------');
const rows = [];
for (let lvl = 1; lvl <= 9; lvl++) {
  const m = measure(lvl, TRIALS, policy);
  rows.push(m);
  console.log(
    `${String(lvl).padStart(2)} | ${(m.winRate * 100).toFixed(0).padStart(3)}% | ` +
    `${m.avgTime.toFixed(1).padStart(10)} | ${m.avgDmg.toFixed(0).padStart(8)} | ` +
    `${m.avgKills.toFixed(1)}/${m.botsTotal}`
  );
}
const avgWin = rows.reduce((a, r) => a + r.winRate, 0) / rows.length;
console.log(`\n전체 평균 승률: ${(avgWin * 100).toFixed(0)}%`);
