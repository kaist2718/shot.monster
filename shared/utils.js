// ============================================================
// utils.js - 수학/충돌 헬퍼. (shared: 서버+클라이언트 공용, DOM 무의존)
// ============================================================

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp  = (a, b, t)   => a + (b - a) * t;

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function rand(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 원-원 충돌
export function circleCircle(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

// 원-사각형(AABB) 충돌
export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return (dx * dx + dy * dy) <= cr * cr;
}

// 최단 부호 각도차 b-a ∈ (-π, π]
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return d;
}

// 최단호 보간 (각도가 ±π를 넘어갈 때 핑글뱅이 방지)
export function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

// 한 프레임에 maxStep(라디안) 이하로 target 쪽으로 각도를 접근
export function approachAngle(current, target, maxStep) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return current + d;
  return current + Math.sign(d) * maxStep;
}

// 둥근 사각형 경로 (렌더링용 - 클라이언트만 호출)
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
