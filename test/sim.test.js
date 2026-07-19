// ============================================================
// sim.test.js - GameSim 단위 테스트(B3 충돌분리 / B4 존 데미지).
// 실행: node test/sim.test.js
// ============================================================

import { GameSim } from '../shared/sim.js';
import { Zone } from '../shared/world.js';
import { dist } from '../shared/utils.js';
import { aggregateCountryBoard } from '../shared/countries.js';
import { CONFIG } from '../shared/config.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗ FAIL:', msg); failures++; }
}

// ---- B3: 플레이어 간 충돌 분리 ----
console.log('B3: 플레이어 간 충돌 분리');
{
  const sim = new GameSim();
  sim.startRound();
  const es = sim.entities.filter((e) => e.alive);
  if (es.length < 2) { console.error('  ✗ 엔티티 부족'); failures++; }
  else {
    // 맵 중앙(장애물 없음 보장)에 두 엔티티를 완전 겹침
    const cx = CONFIG.WORLD_SIZE / 2, cy = CONFIG.WORLD_SIZE / 2;
    for (const e of es.slice(0, 2)) { e.x = cx; e.y = cy; e._px = cx; e._py = cy; }
    const before = dist(es[0].x, es[0].y, es[1].x, es[1].y);
    sim.resolveEntityCollisions();
    const after = dist(es[0].x, es[0].y, es[1].x, es[1].y);
    const need = es[0].radius + es[1].radius;
    assert(before === 0, `분리 전 거리 0 (실제 ${before.toFixed(2)})`);
    assert(after >= need - 0.5, `분리 후 거리 ≥ 반경합(${need}) (실제 ${after.toFixed(2)})`);
  }
}

// ---- B4: 존 데미지 단계적 강화 ----
console.log('B4: 존 데미지 단계적 강화');
{
  const z = new Zone();
  const startDps = z.currentDps();
  assert(Math.abs(startDps - CONFIG.ZONE_DPS_START) < 0.01, `초반 DPS = ${CONFIG.ZONE_DPS_START} (실제 ${startDps.toFixed(2)})`);
  // 끝까지 수축
  z.elapsed = z.duration;
  z.update(0);
  const endDps = z.currentDps();
  assert(Math.abs(endDps - CONFIG.ZONE_DPS_END) < 0.01, `후반 DPS = ${CONFIG.ZONE_DPS_END} (실제 ${endDps.toFixed(2)})`);
  // 중간이 START~END 사이(단조)
  const z2 = new Zone();
  z2.elapsed = z2.duration / 2; z2.update(0);
  const midDps = z2.currentDps();
  assert(midDps > CONFIG.ZONE_DPS_START && midDps < CONFIG.ZONE_DPS_END, `중간 DPS가 START~END 사이 (실제 ${midDps.toFixed(2)})`);
}

// ---- B5: 국가 순위 집계 ----
console.log('B5: 국가 순위 집계');
{
  const entries = [
    { country: 'KR', kills: 5 }, { country: 'KR', kills: 3 },   // KR 8
    { country: 'JP', kills: 6 },                                 // JP 6
    { country: null, kills: 99 },                               // 국가 없음 → 제외
    { country: 'US', kills: 1 }, { country: 'US', kills: 1 },   // US 2
  ];
  const board = aggregateCountryBoard(entries);
  assert(board.length === 3, `국가 수 3 (실제 ${board.length})`);
  assert(board[0].country === 'KR' && board[0].kills === 8 && board[0].players === 2, `1위 KR 8킬 2명 (실제 ${board[0] && board[0].country} ${board[0] && board[0].kills})`);
  assert(board[1].country === 'JP' && board[1].kills === 6, `2위 JP 6킬 (실제 ${board[1] && board[1].country} ${board[1] && board[1].kills})`);
  assert(!board.some((e) => e.country === null), '국가 없는 엔트리 제외');
}

console.log(failures === 0 ? '\n모든 단위 테스트 통과 ✓' : `\n${failures}개 실패 ✗`);
process.exit(failures === 0 ? 0 : 1);
