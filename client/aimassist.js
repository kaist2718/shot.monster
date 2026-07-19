// ============================================================
// aimassist.js - 소프트 전용 soft aim assist. (client)
// 서버 판정/탄도에는 관여하지 않고, 전송 angle 만 살짝 보정한다.
// 벽 뒤 표적 제외(간이 LOS), 콘/거리/프레임당 보정 클램프.
// ============================================================

import { angleDiff, approachAngle, dist, circleRect } from '../shared/utils.js';

const ASSIST_RANGE = 480;       // 사거리 확대
const ASSIST_CONE = 0.75;       // ~43° half-angle (rad) - 더 넓은 콘
const MAX_DEG_PER_SEC = 110;     // strength=1 기준 초당 최대 보정(도) - 더 빠른 보정

// Sticky 시간: 설정에서 가져오거나 기본값 사용 (aimAssistStickiness는 라디안 각도, 여기서는 시간으로 변환)
const DEFAULT_STICKY_MS = 400;  // 기본 sticky 유지 시간(ms)
function getStickyMs(stickiness) {
  // stickiness 값(0~1)에 따라 200~600ms 범위로 매핑
  const ms = stickiness != null ? 200 + stickiness * 400 : DEFAULT_STICKY_MS;
  return ms;
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
    let score = ad * 180 + d * 0.04;
    if (preferId && e.id === preferId) score *= 0.55;
    if (typeof e.health === 'number' && typeof e.maxHealth === 'number' && e.maxHealth > 0) {
      score *= 0.85 + 0.15 * (e.health / e.maxHealth); // 저체력 약간 선호
    }
    if (score < bestScore) { bestScore = score; best = e; }
  }

  if (!best) {
    if (now >= stickyUntil) stickyId = null;
    return angle;
  }

  stickyId = best.id;
  // stickiness는 main.js에서 aimAssistStickiness 설정을 전달 (없으면 기본값)
  const stickiness = ctx.stickiness != null ? ctx.stickiness : null;
  stickyUntil = now + getStickyMs(stickiness);

  const target = Math.atan2(best.y - oy, best.x - ox);
  const falloff = 1 - Math.min(1, dist(ox, oy, best.x, best.y) / ASSIST_RANGE);
  const coneFall = 1 - Math.min(1, Math.abs(angleDiff(angle, target)) / ASSIST_CONE);
  const maxStep = (MAX_DEG_PER_SEC * strength * falloff * (0.4 + 0.6 * coneFall) * Math.PI / 180) * dt;
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
