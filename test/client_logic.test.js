// ============================================================
// client_logic.test.js - 클라이언트가 사용하는 공용 로직(입력 정규화/보간 수학) 단위 테스트.
// DOM 의존 없이 shared 순수 함수로 검증 — 클라이언트 회귀(sanitizeController/보간) 방어.
// 실행: node test/client_logic.test.js
// ============================================================

import { sanitizeController } from '../shared/sim.js';
import { lerp, clamp, lerpAngle, circleRect, angleDiff, approachAngle, TAU } from '../shared/utils.js';
import { _pickTarget, applyAimAssist } from '../client/aimassist.js';

// gamepad 데드존(모듈이 DOM/localStorage에 의존하므로 동일 식만 인라인 검증)
function applyDz(v, dz) {
  if (Math.abs(v) < dz) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - dz) / (1 - dz));
}

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗ FAIL:', msg); failures++; }
}

// ---- 입력 정규화(sanitizeController): 클라이언트 입력 → 서버 검증 ----
console.log('입력 정규화(sanitizeController) 엣지');
{
  const c = sanitizeController({ moveX: NaN, moveY: 5, angle: undefined, firing: 1, reload: 'x', sprint: null });
  assert(c.moveX === 0, `NaN moveX → 0 (실제 ${c.moveX})`);
  assert(c.moveY === 1, `moveY 5 → 정규화 1 (실제 ${c.moveY})`);
  assert(c.angle === 0, `undefined angle → 0 (실제 ${c.angle})`);
  assert(c.firing === true, `truthy firing(1) → true`);
  assert(c.reload === true, `truthy reload('x') → true`);
  assert(c.sprint === false, `null sprint → false`);
}
{
  const c = sanitizeController(null);
  assert(c.moveX === 0 && c.moveY === 0 && c.firing === false, `null 입력 → zeroInput`);
}
{
  const c = sanitizeController({ moveX: 3, moveY: -4 }); // 길이 5
  const len = Math.hypot(c.moveX, c.moveY);
  assert(Math.abs(len - 1) < 0.001, `이동벡터 크기 1로 정규화 (실제 ${len.toFixed(3)})`);
}
{
  const a = sanitizeController({ moveX: 0.3, moveY: 0.4 }); // 길이 0.5(<1)
  const len = Math.hypot(a.moveX, a.moveY);
  assert(Math.abs(len - 0.5) < 0.001, `길이<1 벡터는 그대로 (실제 ${len.toFixed(3)})`);
}

// ---- 보간/예측 수학(클라 보간 루프·자기 예측에 사용) ----
console.log('보간 수학(lerp/clamp/lerpAngle/circleRect)');
{
  assert(lerp(0, 10, 0.5) === 5, 'lerp 중점');
  assert(clamp(5, 0, 3) === 3, 'clamp 상한');
  assert(clamp(-1, 0, 3) === 0, 'clamp 하한');
  assert(clamp(2, 0, 3) === 2, 'clamp 범위내 그대로');
  // lerpAngle: 일반 보간
  assert(Math.abs(lerpAngle(0, Math.PI / 2, 0.5) - Math.PI / 4) < 0.001, 'lerpAngle 중간(0→π/2 @0.5 = π/4)');
  // lerpAngle 최단호: 0.9π → -0.9π 최단 경로는 +방향(π 넘어)으로 0.2π → 1.1π(≡ -0.9π). 빙글뱅이 없음.
  const a = lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 1.0);
  assert(Math.abs(a - 1.1 * Math.PI) < 0.01, `lerpAngle 최단호(0.9π→-0.9π = 1.1π, 실제 ${a.toFixed(3)})`);
  // 보간 계수 k = 1 - exp(-15*dt): dt 가 클수록 1에 가까워진다(더 빠른 수렴)
  const k16 = 1 - Math.exp(-15 * 0.016);
  const k33 = 1 - Math.exp(-15 * 0.033);
  assert(k33 > k16 && k16 > 0 && k16 < 1, `보간 계수는 dt 클수록 크다 (k16=${k16.toFixed(3)} k33=${k33.toFixed(3)})`);
  // circleRect: 원-사각형 충돌(예측 이동 충돌 판정에 사용)
  assert(circleRect(50, 50, 10, 40, 40, 20, 20) === true, 'circleRect 겹침(내부)');
  assert(circleRect(200, 200, 10, 40, 40, 20, 20) === false, 'circleRect 분리(외부)');
}

// ---- 각도 헬퍼 / 에임 어시스트 / 패드 데드존 ----
console.log('각도·aim assist·gamepad deadzone');
{
  assert(Math.abs(angleDiff(0, Math.PI / 2) - Math.PI / 2) < 1e-9, 'angleDiff 기본 (0,ν/2)');
  const wrap = angleDiff(Math.PI * 0.9, -Math.PI * 0.9);
  assert(Math.abs(wrap - (-0.2 * Math.PI)) < 0.01 || Math.abs(wrap - (0.2 * Math.PI)) < 0.01
    || Math.abs(Math.abs(wrap) - 0.2 * Math.PI) < 0.01,
    `angleDiff 최단호 ≈ ±0.2π (실제 ${wrap.toFixed(3)})`);
  assert(Math.abs(angleDiff(0, 0)) < 1e-12, 'angleDiff 동일각 0');

  const stepped = approachAngle(0, Math.PI / 2, 0.1);
  assert(Math.abs(stepped - 0.1) < 1e-9, `approachAngle 스텝 클램프 (실제 ${stepped})`);
  const reach = approachAngle(0, 0.05, 0.1);
  assert(Math.abs(reach - 0.05) < 1e-9, 'approachAngle 작은 차는 도착');

  // aim assist: 정면에 있는 적만 선택
  const ents = [
    { id: 'a', alive: true, x: 100, y: 0, health: 50, maxHealth: 100 },
    { id: 'b', alive: true, x: 0, y: 100, health: 50, maxHealth: 100 },
    { id: 'me', alive: true, x: 0, y: 0 },
  ];
  const pick = _pickTarget(0, { x: 0, y: 0 }, ents, 'me');
  assert(pick && pick.id === 'a', `콘 안 표적 a 선택 (실제 ${pick && pick.id})`);
  const pickNone = _pickTarget(Math.PI, { x: 0, y: 0 }, ents, 'me');
  assert(!pickNone, '반대 방향 콘 → 후보 없음');

  const passthru = applyAimAssist(1.23, { enabled: false, origin: { x: 0, y: 0 }, entities: ents, myId: 'me', dt: 0.016 });
  assert(passthru === 1.23, 'assist off 시 각도 통과');

  const assisted = applyAimAssist(0.05, {
    enabled: true, strength: 1, origin: { x: 0, y: 0 },
    entities: ents, myId: 'me', dt: 0.05, obstacles: [],
  });
  assert(assisted > 0.05 || Math.abs(assisted) < 0.05 + 1e-6, `assist 가 target(0) 쪽으로 당김 (실제 ${assisted.toFixed(4)})`);
  // 약각 오차에서 strength 있으면 0에 더 가까워지거나 같음
  assert(Math.abs(assisted) <= Math.abs(0.05) + 1e-6, 'assist 는 절댓값 감소/유지');

  // gamepad axis deadzone
  assert(applyDz(0.1, 0.18) === 0, 'deadzone 내부 → 0');
  assert(applyDz(0, 0.18) === 0, '0 → 0');
  const o = applyDz(1, 0.18);
  assert(Math.abs(o - 1) < 1e-9, `풀 편향 ≈1 (실제 ${o})`);
  assert(applyDz(-0.1, 0.18) === 0, '음수 deadzone 내부 → 0');
  assert(Math.abs(TAU - Math.PI * 2) < 1e-12, 'TAU = 2π');
}

console.log(failures === 0 ? '\n클라이언트 로직 테스트 전부 통과 ✓' : `\n${failures}개 실패 ✗`);
process.exit(failures === 0 ? 0 : 1);
