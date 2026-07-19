// ============================================================
// render.js - 스냅샷 기반 월드 렌더링. (client)
// 시뮬레이션은 서버에서, 클라는 받은 스냅샷을 보간해 그리기만 한다.
// 고도화: 입체감(하이라이트)·존 글로우 펄스·픽업 부양·총알 잔광.
// ============================================================

import { CONFIG } from '../shared/config.js';
import { TAU, roundRect, clamp } from '../shared/utils.js';
import { I18N } from './i18n.js';
import { drawIcon } from './icons.js';
const t = (k, v) => I18N.t(k, v);

// ctx, snap: 서버 스냅샷, smoothed: Map(id->{x,y,angle}), camera, yourId,
// dtSince: 스냅샷 수신 후 경과(초), obstacles: 라운드 정적 장애물(roundStart 수신)
export function renderWorld(ctx, snap, smoothed, camera, yourId, dtSince, obstacles) {
  // DPR 스케일링된 캔버스에 대비해 뷰포트 크기는 CSS 픽셀로 읽는다(main.js 가 setTransform(dpr) 적용).
  const W = ctx.canvas.clientWidth || ctx.canvas.width;
  const H = ctx.canvas.clientHeight || ctx.canvas.height;
  const cam = camera, z = cam.zoom;
  const SX = (wx) => (wx - cam.x) * z;
  const SY = (wy) => (wy - cam.y) * z;
  const vx0 = cam.x, vy0 = cam.y;
  const vx1 = cam.x + W / z, vy1 = cam.y + H / z;
  const now = snap.time || 0;

  // 바닥 체커
  const tile = 120;
  const sx0 = Math.floor(vx0 / tile) * tile;
  const sy0 = Math.floor(vy0 / tile) * tile;
  for (let gx = sx0; gx < vx1; gx += tile) {
    for (let gy = sy0; gy < vy1; gy += tile) {
      const tone = ((gx / tile) + (gy / tile)) % 2 === 0;
      ctx.fillStyle = tone ? CONFIG.COLORS.grass : CONFIG.COLORS.grassDark;
      ctx.fillRect(SX(gx), SY(gy), tile * z, tile * z);
    }
  }
  // 월드 경계
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8;
  ctx.strokeRect(SX(0), SY(0), CONFIG.WORLD_SIZE * z, CONFIG.WORLD_SIZE * z);

  drawZoneOverlay(ctx, W, H, snap.zone, cam, z, now);

  // 고체 장애물 (나무는 위에)
  const obs = obstacles || [];
  for (const o of obs) {
    if (o.type === 'tree') continue;
    if (o.x > vx1 || o.y > vy1 || o.x + o.w < vx0 || o.y + o.h < vy0) continue;
    drawObstacle(ctx, o, SX, SY, z);
  }

  // 픽업(글로우 + 부양)
  for (const pk of snap.pickups) {
    const bob = Math.sin(now * 3 + pk.x * 0.1) * 3 * z;
    drawPickup(ctx, pk, SX(pk.x), SY(pk.y) + bob, z);
  }

  // 총알 (수신 후 속도로 외삽 -> 부드럽게). 잔광(outer) + 밝은 코어(inner).
  ctx.save();
  ctx.lineCap = 'round';
  const TRAIL = 0.035;
  const coreW = Math.max(2, CONFIG.BULLET_RADIUS * 2 * z);
  // outer 잔광
  ctx.strokeStyle = 'rgba(255,226,122,0.22)'; ctx.lineWidth = coreW * 2.4;
  ctx.beginPath();
  for (const b of snap.bullets) {
    const bx = b.x + b.vx * dtSince, by = b.y + b.vy * dtSince;
    ctx.moveTo(SX(bx - b.vx * TRAIL), SY(by - b.vy * TRAIL));
    ctx.lineTo(SX(bx), SY(by));
  }
  ctx.stroke();
  // 밝은 코어
  ctx.strokeStyle = CONFIG.COLORS.bullet; ctx.lineWidth = coreW;
  ctx.beginPath();
  for (const b of snap.bullets) {
    const bx = b.x + b.vx * dtSince, by = b.y + b.vy * dtSince;
    ctx.moveTo(SX(bx - b.vx * TRAIL), SY(by - b.vy * TRAIL));
    ctx.lineTo(SX(bx), SY(by));
  }
  ctx.stroke();
  ctx.restore();

  // 엔티티 (보간된 위치 사용)
  for (const e of snap.entities) {
    if (!e.alive) continue;
    const sm = smoothed.get(e.id);
    const px = sm ? sm.x : e.x, py = sm ? sm.y : e.y;
    if (px < vx0 - 40 || px > vx1 + 40 || py < vy0 - 40 || py > vy1 + 40) continue;
    drawEntity(ctx, e, px, py, sm ? sm.angle : e.angle, SX, SY, z, e.id === yourId);
  }

  // 나무 캐노피(반투명) 위에
  for (const o of obs) {
    if (o.type !== 'tree') continue;
    if (o.x > vx1 || o.y > vy1 || o.x + o.w < vx0 || o.y + o.h < vy0) continue;
    drawTree(ctx, o, SX, SY, z);
  }
}

function drawZoneOverlay(ctx, W, H, zone, cam, z, now) {
  const cx = (zone.cx - cam.x) * z, cy = (zone.cy - cam.y) * z, r = zone.r * z;
  // 바깥 붉은 오버레이(evenodd)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, r, 0, TAU, true);
  ctx.fillStyle = 'rgba(180,30,30,0.22)';
  ctx.fill('evenodd');
  ctx.restore();
  // 펄스 글로우 테두리
  const pulse = 0.5 + 0.5 * Math.sin(now * 2.5);
  ctx.save();
  ctx.strokeStyle = CONFIG.COLORS.zoneStroke;
  ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(181,30,30,0.9)';
  ctx.shadowBlur = 8 + 10 * pulse;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawObstacle(ctx, o, SX, SY, z) {
  const x = SX(o.x), y = SY(o.y), w = o.w * z, h = o.h * z;
  if (o.type === 'rock') {
    ctx.fillStyle = CONFIG.COLORS.rock; roundRect(ctx, x, y, w, h, 8 * z); ctx.fill();
    ctx.fillStyle = CONFIG.COLORS.rockDark; roundRect(ctx, x + w * 0.5, y + h * 0.4, w * 0.4, h * 0.4, 5 * z); ctx.fill();
    gloss(ctx, x, y, w, h * 0.45);
  } else if (o.type === 'crate') {
    ctx.fillStyle = CONFIG.COLORS.crate; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CONFIG.COLORS.crateStroke; ctx.lineWidth = Math.max(1, 3 * z); ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
    ctx.stroke();
    gloss(ctx, x, y, w, h * 0.4);
  } else {
    ctx.fillStyle = CONFIG.COLORS.wall; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 5 * z, w, 5 * z);
    gloss(ctx, x, y, w, h * 0.35);
  }
}

// 위쪽 하이라이트(입체감). 색 연산 없이 흰 반투명 스트라이프.
function gloss(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(x, y, w, h);
}

function drawPickup(ctx, pk, x, y, z) {
  const sz = Math.max(14, 20 * z);
  const isHealth = pk.type === 'health';
  const col = isHealth ? '#ff5d5d' : (pk.type === 'smg' ? '#7fc4ff' : (pk.type === 'shotgun' ? '#ff8a5d' : '#ffd23f'));
  const icon = isHealth ? 'health' : (pk.type === 'smg' ? 'smg' : (pk.type === 'shotgun' ? 'shotgun' : 'pistol'));
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = Math.max(6, 10 * z);
  ctx.fillStyle = 'rgba(12,14,18,0.72)';
  roundRect(ctx, x - sz / 2, y - sz / 2, sz, sz, 5 * z); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, 2 * z);
  roundRect(ctx, x - sz / 2, y - sz / 2, sz, sz, 5 * z); ctx.stroke();
  ctx.restore();
  drawIcon(ctx, icon, x, y, sz * 0.72, col);
}

function drawTree(ctx, o, SX, SY, z) {
  const cx = SX(o.x + o.w / 2), cy = SY(o.y + o.h / 2);
  ctx.fillStyle = '#7a5230'; ctx.fillRect(cx - 5 * z, cy - 2 * z, 10 * z, 14 * z);
  ctx.fillStyle = 'rgba(46,94,40,0.92)';
  ctx.beginPath(); ctx.arc(cx, cy - 8 * z, o.w * 0.62 * z, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(28,58,25,0.9)'; ctx.lineWidth = Math.max(1, 2 * z); ctx.stroke();
}

function drawEntity(ctx, e, px, py, angle, SX, SY, z, isMy) {
  const x = SX(px), y = SY(py);
  const r = e.radius ? e.radius * z : CONFIG.PLAYER_RADIUS * z;

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.78, r * 0.95, r * 0.42, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  // 무기(금속)
  ctx.fillStyle = '#2a2a2a';
  roundRect(ctx, r * 0.35, -4 * z, r * 1.0, 8 * z, 2 * z); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(r * 0.35, -4 * z, r * 1.0, 3 * z);
  // 몸통
  ctx.fillStyle = e.color;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  // 입체 하이라이트(좌상)
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.32, r * 0.5, r * 0.36, -0.6, 0, TAU); ctx.fill();
  // 테두리(self: 흰색 글로우)
  ctx.lineWidth = Math.max(2, 3 * z);
  if (isMy) { ctx.shadowColor = 'rgba(255,255,255,0.85)'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ffffff'; }
  else { ctx.strokeStyle = 'rgba(0,0,0,0.45)'; }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 체력바(라운드 + 글로스) + 이름(그림자)
  const hbW = 46, hbH = 6;
  const hbx = x - hbW / 2, hby = y - r - 16;
  const hpct = clamp(e.health / e.maxHealth, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, hbx - 2, hby - 2, hbW + 4, hbH + 4, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, hbx, hby, hbW, hbH, 3); ctx.fill();
  const hc = hpct > 0.4 ? CONFIG.COLORS.healthGood : CONFIG.COLORS.healthBad;
  ctx.fillStyle = hc; roundRect(ctx, hbx, hby, Math.max(0, hbW * hpct), hbH, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; roundRect(ctx, hbx, hby, Math.max(0, hbW * hpct), hbH * 0.5, 3); ctx.fill();
  ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center';
  const label = (e.country ? '[' + e.country + '] ' : '') + e.name + (isMy ? ' (' + t('me') + ')' : '');
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(label, x + 1, hby - 3);
  ctx.fillStyle = isMy ? '#ffe27a' : 'rgba(255,255,255,0.95)'; ctx.fillText(label, x, hby - 4);
}
