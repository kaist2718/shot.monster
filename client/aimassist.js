// ============================================================
// aimassist.js - 소프트 전용 soft aim assist. (client)
// 서버 판정/탄도에는 관여하지 않고, 전송 angle 만 살짝 보정한다.
// 벽 뒤 표적 제외(간이 LOS), 콘/거리/프레임당 보정 클램프.
// ============================================================

import { angleDiff, approachAngle, dist, circleRect } from '../shared/utils.js';

const ASSIST_RANGE = 500;       // 사거리 확대 (기존 480)
const ASSIST_CONE = 0.85;       // ~49° half-angle (rad) - 더 넓은 콘
const MAX_DEG_PER_SEC = 130;     // strength=1 기준 초당 최대 보정(도) - 더 빠른 보정

// Sticky 시간: 설정에서 가져오거나 기본값 사용
// stickiness 값(0~1)은 200~800ms 범위로 매핑됨. 0을 선택하면 200ms가 최소값.
// 모바일 설정 패널 기본값(0.25) = 200 + 0.25 * 600 = 350ms
const MIN_STICKY_MS = 200;
const MAX_STICKY_MS = 800;
const DEFAULT_STICKY_MS = 500;  // 설정 없을 때 기본값
function getStickyMs(stickiness) {
  // stickiness가 0~1 범위이면 200~800ms로 매핑, 아니면 기본값 사용
  if (stickiness == null) return DEFAULT_STICKY_MS;
  const clamped = Math.max(0, Math.min(1, stickiness));
  return MIN_STICKY_MS + clamped * (MAX_STICKY_MS - MIN_STICKY_MS);
}

let stickyId = null;
let stickyUntil = 0;

/** 설정/세션 리셋(라운드 전환 등) */
export function resetAimAssist() {
  stickyId = null;
  stickyUntil = 0;
}

/**
 * @param {number} angle 원시 조준각
 * @param {object} ctx
 * @returns {number} 보정된 조준각
 */
export function applyAimAssist(angle, ctx) {
  if (!ctx || !ctx.enabled || !ctx.origin) return angle;
  const strength = Math.max(0, Math.min(1, ctx.strength == null ? 0.55 : ctx.strength));
  if (strength <= 0.01) return angle;

  const ents = ctx.entities || [];
  const ox = ctx.origin.x, oy = ctx.origin.y;
  const myId = ctx.myId;
  const now = ctx.now != null ? ctx.now : performance.now();
  const dt = Math.max(0.001, Math.min(0.05, ctx.dt || 0.016));
  const obstacles = ctx.obstacles || null;

  let best = null;
  let bestScore = Infinity;

  // sticky 유지 중이면 우선 재평가
  const preferId = (stickyId && now < stickyUntil) ? stickyId : null;

  for (const e of ents) {
    if (!e || !e.alive || e.id === myId) continue;
    const d = dist(ox, oy, e.x, e.y);
    if (d < 8 || d > ASSIST_RANGE) continue;
    const tAng = Math.atan2(e.y - oy, e.x - ox);
    const ad = Math.abs(angleDiff(angle, tAng));
    if (ad > ASSIST_CONE) continue;
    if (obstacles && !hasLOS(ox, oy, e.x, e.y, obstacles)) continue;
    // 각도 가중 + 거리. sticky 보너스.
    let score = ad * 160 + d * 0.035;
    if (preferId && e.id === preferId) score *= 0.45;
    if (typeof e.health === 'number' && typeof e.maxHealth === 'number' && e.maxHealth > 0) {
      score *= 0.80 + 0.20 * (e.health / e.maxHealth); // 저체력 더 선호
    }
    if (score < bestScore) { bestScore = score; best = e; }
  }

  if (!best) {
    if (now >= stickyUntil) stickyId = null;
    return angle;
  }

  stickyId = best.id;
  const stickiness = ctx.stickiness != null ? ctx.stickiness : null;
  stickyUntil = now + getStickyMs(stickiness);

  const target = Math.atan2(best.y - oy, best.x - ox);
  const falloff = 1 - Math.min(1, dist(ox, oy, best.x, best.y) / ASSIST_RANGE);
  const coneFall = 1 - Math.min(1, Math.abs(angleDiff(angle, target)) / ASSIST_CONE);
  // strength가 낮아도 어느 정도 보정이 들어가도록 하한 설정
  const effectiveStr = 0.15 + 0.85 * strength;
  const maxStep = (MAX_DEG_PER_SEC * effectiveStr * falloff * (0.3 + 0.7 * coneFall) * Math.PI / 180) * dt;
  return approachAngle(angle, target, maxStep);
}

// 원→표적 선분 샘플 vs 고체 장애물 AABB (벽 뒤 유도 방지)
function hasLOS(x0, y0, x1, y1, obstacles) {
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (const o of obstacles) {
      if (!o || !o.solid) continue;
      if (circleRect(x, y, 2, o.x, o.y, o.w, o.h)) return false;
    }
  }
  return true;
}

/** unit test helper: 순수 후보 점수 (DOM 무의존) */
export function _pickTarget(angle, origin, entities, myId, range = ASSIST_RANGE, cone = ASSIST_CONE) {
  let best = null, bestScore = Infinity;
  for (const e of entities) {
    if (!e || !e.alive || e.id === myId) continue;
    const d = dist(origin.x, origin.y, e.x, e.y);
    if (d < 8 || d > range) continue;
    const tAng = Math.atan2(e.y - origin.y, e.x - origin.x);
    const ad = Math.abs(angleDiff(angle, tAng));
    if (ad > cone) continue;
    const score = ad * 180 + d * 0.04;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
