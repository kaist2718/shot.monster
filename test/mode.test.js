// ============================================================
// mode.test.js - AI 모드 레벨 진행 / 멀티 봇 충원 단위 테스트.
// 실행: node test/mode.test.js (npm test 에 포함)
// ============================================================

import { GameSim } from '../shared/sim.js';
import { CONFIG } from '../shared/config.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗ FAIL:', msg); failures++; }
}

// ---- M1: AI 모드 — 레벨 N 이면 봇 N ----
console.log('M1: AI 모드 시작 시 봇 수 = 레벨');
{
  const sim = new GameSim({ mode: 'ai', level: 4 });
  sim.addPlayer();            // 인간 1
  sim.startRound();
  const bots = sim.entities.filter((e) => e.isBot).length;
  const humans = sim.entities.filter((e) => e.isHuman).length;
  assert(humans === 1, `인간 1명 (실제 ${humans})`);
  assert(bots === 4, `봇 4명(=레벨) (실제 ${bots})`);
}

// ---- M2: AI 모드 — 승리 시 다음 레벨 진행 + aiRoundOver 이벤트 ----
console.log('M2: AI 승리 → 레벨업 + 이벤트');
{
  const sim = new GameSim({ mode: 'ai', level: 3 });
  const h = sim.addPlayer();
  sim.startRound();
  sim.endRound(h.id);         // 인간 승리
  const evs = sim.drainEvents() || [];
  const ai = evs.find((e) => e.type === 'aiRoundOver');
  assert(sim.level === 4, `레벨 3→4 진행 (실제 ${sim.level})`);
  assert(sim.maxLevelReached === 4, `최고 도달 레벨 4 (실제 ${sim.maxLevelReached})`);
  assert(!!ai && ai.humanWon === true, 'aiRoundOver 이벤트 humanWon=true');
  assert(!!ai && ai.playedLevel === 3 && ai.level === 4, `이벤트 playedLevel=3/level=4 (실제 ${ai && ai.playedLevel}/${ai && ai.level})`);
}

// ---- M3: AI 모드 — 패배 시 같은 레벨 재도전 ----
console.log('M3: AI 패배 → 레벨 유지(재도전)');
{
  const sim = new GameSim({ mode: 'ai', level: 5 });
  sim.addPlayer();
  sim.startRound();
  sim.endRound(null);         // 인간 사망(승자 없음)
  const evs = sim.drainEvents() || [];
  const ai = evs.find((e) => e.type === 'aiRoundOver');
  assert(sim.level === 5, `레벨 5 유지 (실제 ${sim.level})`);
  assert(!!ai && ai.humanWon === false, 'aiRoundOver humanWon=false');
  assert(!!ai && ai.playedLevel === 5, `playedLevel=5 (실제 ${ai && ai.playedLevel})`);
}

// ---- M4: AI 모드 — 레벨 9 클리어 시 캡 유지 + 챔피언 조건 ----
console.log('M4: AI 레벨 9 클리어 → 캡 + 챔피언');
{
  const sim = new GameSim({ mode: 'ai', level: 9 });
  const h = sim.addPlayer();
  sim.startRound();
  const bots = sim.entities.filter((e) => e.isBot).length;
  assert(bots === 9, `레벨 9 = 봇 9 (실제 ${bots})`);
  sim.endRound(h.id);
  const ai = (sim.drainEvents() || []).find((e) => e.type === 'aiRoundOver');
  assert(sim.level === CONFIG.MODES.AI_MAX_LEVEL, `레벨 9 캡 유지 (실제 ${sim.level})`);
  assert(!!ai && ai.humanWon && ai.playedLevel >= CONFIG.MODES.AI_MAX_LEVEL, '챔피언 조건(humanWon && playedLevel>=9)');
}

// ---- M5: 멀티 모드 — 봇이 목표 인원(9)을 채움 ----
console.log('M5: 멀티 봇 충원(총 9)');
{
  const sim = new GameSim({ mode: 'multi', targetEntities: 9 });
  for (let i = 0; i < 3; i++) { const h = sim.addPlayer(); h.socketId = 't' + i; } // 활성 인간 3
  sim.startRound();
  const bots = sim.entities.filter((e) => e.isBot).length;
  const humans = sim.entities.filter((e) => e.isHuman).length;
  assert(humans === 3 && bots === 6, `인간 3 + 봇 6 = 9 (실제 ${humans}+${bots}=${humans + bots})`);
}
// ---- M6: 멀티 모드 — 9인 가득 시 봇 0 ----
console.log('M6: 멀티 9인 가득 → 봇 0');
{
  const sim = new GameSim({ mode: 'multi', targetEntities: 9 });
  for (let i = 0; i < 9; i++) { const h = sim.addPlayer(); h.socketId = 't' + i; } // 활성 인간 9
  sim.startRound();
  const bots = sim.entities.filter((e) => e.isBot).length;
  assert(bots === 0, `9인 시 봇 0 (실제 ${bots})`);
}

console.log(failures === 0 ? '\n모드 테스트 전부 통과 ✓' : `\n${failures}개 실패 ✗`);
process.exit(failures === 0 ? 0 : 1);
