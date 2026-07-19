// ============================================================
// ui.js - HUD + 페이즈 오버레이(로비/라운드오버/관전). (client)
// ============================================================

import { CONFIG, WEAPONS } from '../shared/config.js';
import { TAU, roundRect, clamp } from '../shared/utils.js';
import { I18N } from './i18n.js';
import { drawIcon } from './icons.js';
const t = (k, v) => I18N.t(k, v);

// info = { self, snap, ping, killFeed, touch }
export function drawHUD(ctx, W, H, info) {
  const { self, snap } = info;
  const phase = snap ? snap.phase : 'lobby';
  const touch = !!info.touch;
  const minD = Math.min(W, H);
  // 모바일 미니맵 크기: 작은 화면에서는 더 작게 (세로모드 보정)
  const isLandscape = W > H;
  const minimapSize = touch ? (minD < 450 ? 80 : (isLandscape ? 96 : 104)) : 150;
  // 핑/코인 위치: 작은 화면에서는 더 위로
  const topStartY = minD < 500 ? 72 : 92;

  ctx.font = '12px sans-serif';
  if (touch) {
    // 모바일: 핑/코인/점수/순위 를 좌상단(보조 버튼 아래)에 세로로. 상단 중앙은 체력/탄약이 씀.
    ctx.textAlign = 'left';
    let ly = topStartY; // 보조 버튼 아래
    if (typeof info.ping === 'number') {
      const ping = info.ping;
      ctx.fillStyle = ping < 80 ? '#7fe08a' : ping < 160 ? '#ffd23f' : '#ff6a3d';
      ctx.font = '12px sans-serif';
      ctx.fillText(t('ping', { n: ping }), 16, ly); ly += 18;
    }
    if (self) {
      drawIcon(ctx, 'coin', 24, ly - 4, 14, '#ffd23f');
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(t('coins', { n: self.coins }), 36, ly); ly += 20;
    }
    if (self) {
      ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(t('killScore', { n: self.score }), 16, ly); ly += 18;
      const lb = (info.mode === 'ai') ? (info.aiLeaderboard || []) : (info.leaderboard || []);
      const idx = lb.findIndex((e) => e.id === info.myId);
      if (idx >= 0) {
        ctx.fillStyle = 'rgba(255,226,122,0.85)'; ctx.font = '12px sans-serif';
        ctx.fillText(t('myRank', { n: idx + 1 }), 16, ly);
      }
    }
  } else {
    // 데스크탑: 조작 힌트(초반만) + 핑/코인을 좌상단에.
    ctx.textAlign = 'left';
    if (info.showHint !== false) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(t('hintDesktop'), 20, 26);
    }
    if (typeof info.ping === 'number') {
      const ping = info.ping;
      ctx.fillStyle = ping < 80 ? '#7fe08a' : ping < 160 ? '#ffd23f' : '#ff6a3d';
      ctx.font = '12px sans-serif';
      ctx.fillText(t('ping', { n: ping }), 20, 44);
    }
    if (self) {
      drawIcon(ctx, 'coin', 28, 57, 14, '#ffd23f');
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(t('coins', { n: self.coins }), 40, 62);
    }
  }

  // 상단 중앙 카운터 - 플레이 중에만. AI: 레벨/남은 적, multi: 생존자
  if (phase === 'playing' && snap) {
    ctx.textAlign = 'center';
    if (info.mode === 'ai') {
      const bots = snap.entities.filter((e) => e.alive && e.isBot).length;
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ffd23f';
      ctx.fillText(t('aiLevel', { n: snap.level != null ? snap.level : info.level }), W / 2, touch ? 30 : 34);
      ctx.font = '13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText(t('aiEnemies', { n: bots }), W / 2, touch ? 48 : 54);
    } else {
      const alive = snap.entities.filter((e) => e.alive).length;
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(t('alive', { n: alive }), W / 2, touch ? 30 : 34);
    }
  }

  // 킬 피드(우상단, 미니맵 아래)
  if (info.killFeed && info.killFeed.length) drawKillFeed(ctx, W, info.killFeed, minimapSize);

  // 내 상태 (체력/탄약) - 살아있을 때만. 모바일은 상단 중앙(하단을 터치 컨트롤에 양보).
  if (self && self.alive) {
    if (touch) drawMobileStatus(ctx, W, self, snap);
    else drawDesktopStatus(ctx, W, H, self, snap);
  }

  if (snap) drawMinimap(ctx, W, snap, self, touch);
}

// 모바일: 상단 중앙 콤팩트 그룹(체력바 + 탄약). 무기 교체는 벡터 weapon 버튼.
function drawMobileStatus(ctx, W, self, snap) {
  const minD = Math.min(W, H);
  // 작은 화면에서는 더 작은 체력바, 큰 화면에서는 넉넉하게
  const hbW = Math.min(280, Math.max(180, W * (minD < 500 ? 0.45 : 0.55)));
  const hbH = minD < 500 ? 14 : 16;
  // 중앙 카운터(레벨/생존) 아래 - 작은 화면에서는 더 위로
  const bx = (W - hbW) / 2, by = minD < 500 ? 58 : 72;
  const hpct = clamp(self.health / self.maxHealth, 0, 1);
  const lowHP = hpct < 0.3;
  const pulse = lowHP ? (0.5 + 0.5 * Math.sin((snap.time || 0) * 8)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, bx - 6, by - 6, hbW + 12, hbH + 12, 8); ctx.fill();
  ctx.fillStyle = '#3a0d0d'; roundRect(ctx, bx, by, hbW, hbH, 5); ctx.fill();
  const hcol = hpct > 0.5 ? CONFIG.COLORS.healthGood : (hpct > 0.25 ? '#ffd23f' : CONFIG.COLORS.healthBad);
  if (lowHP) { ctx.save(); ctx.shadowColor = hcol; ctx.shadowBlur = 5 + 6 * pulse; }
  ctx.fillStyle = hcol; roundRect(ctx, bx, by, Math.max(0, hbW * hpct), hbH, 5); ctx.fill();
  if (lowHP) ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, bx, by, Math.max(0, hbW * hpct), hbH * 0.5, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(self.health) + ' / ' + self.maxHealth, bx + hbW / 2, by + hbH - 2);
  // 탄약(체력바 아래 중앙) — 무기 아이콘 + 수치
  const w = WEAPONS[self.weaponKey] || WEAPONS.pistol;
  const wkey = self.weaponKey || 'pistol';
  const wcol = wkey === 'smg' ? '#7fc4ff' : (wkey === 'shotgun' ? '#ff8a5d' : '#ffd23f');
  const ammoY = by + hbH + (minD < 500 ? 14 : 18);
  const label = self.reloadTimer > 0 ? t('reloading') : (self.ammo + '/' + w.magSize);
  ctx.font = 'bold 13px sans-serif';
  const tw = ctx.measureText(label).width;
  const iconX = W / 2 - tw / 2 - 12;
  drawIcon(ctx, (wkey === 'smg' || wkey === 'shotgun' || wkey === 'pistol') ? wkey : 'weapon', iconX, ammoY - 4, 15,
    self.reloadTimer > 0 ? '#ffd23f' : wcol);
  ctx.fillStyle = self.reloadTimer > 0 ? '#ffd23f' : '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(label, iconX + 11, ammoY);
  ctx.textAlign = 'center';
}

// 데스크탑: 기존 하단 배치(체력바 좌하단 + 탄약/무기슬롯 우하단)
function drawDesktopStatus(ctx, W, H, self, snap) {
  const hbW = 270, hbH = 22, bx = 20, by = H - 44;
  const hpct = clamp(self.health / self.maxHealth, 0, 1);
  const lowHP = hpct < 0.3;
  const pulse = lowHP ? (0.5 + 0.5 * Math.sin((snap.time || 0) * 8)) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, bx - 6, by - 6, hbW + 12, hbH + 12, 9); ctx.fill();
  ctx.fillStyle = '#3a0d0d'; roundRect(ctx, bx, by, hbW, hbH, 6); ctx.fill();
  const hcol = hpct > 0.5 ? CONFIG.COLORS.healthGood : (hpct > 0.25 ? '#ffd23f' : CONFIG.COLORS.healthBad);
  if (lowHP) { ctx.save(); ctx.shadowColor = hcol; ctx.shadowBlur = 6 + 8 * pulse; }
  ctx.fillStyle = hcol; roundRect(ctx, bx, by, Math.max(0, hbW * hpct), hbH, 6); ctx.fill();
  if (lowHP) ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, bx, by, Math.max(0, hbW * hpct), hbH * 0.45, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let s = 1; s < 4; s++) { const tx = bx + (hbW * s) / 4; ctx.beginPath(); ctx.moveTo(tx, by + 4); ctx.lineTo(tx, by + hbH - 4); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(self.health) + ' / ' + self.maxHealth, bx + hbW / 2, by + hbH - 6);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, W - 200, H - 48, 190, 32, 8); ctx.fill();
  const w = WEAPONS[self.weaponKey] || WEAPONS.pistol;
  const wkey = self.weaponKey || 'pistol';
  const wcol = wkey === 'smg' ? '#7fc4ff' : (wkey === 'shotgun' ? '#ff8a5d' : '#ffd23f');
  const ammoLabel = self.reloadTimer > 0 ? t('reloading') : (w.name + '  ' + self.ammo + '/' + w.magSize);
  ctx.font = 'bold 16px sans-serif';
  const ammoTw = ctx.measureText(ammoLabel).width;
  drawIcon(ctx, (wkey === 'smg' || wkey === 'shotgun' || wkey === 'pistol') ? wkey : 'weapon',
    W - 28 - ammoTw - 14, H - 32, 18, self.reloadTimer > 0 ? '#ffd23f' : wcol);
  ctx.fillStyle = self.reloadTimer > 0 ? '#ffd23f' : '#fff';
  ctx.fillText(ammoLabel, W - 20, H - 27);

  // 보유 무기 슬롯(아이콘 + 단축키 숫자)
  const owned = self.ownedWeapons || ['pistol'];
  const order = ['pistol', 'smg', 'shotgun'].filter((k) => owned.includes(k));
  const slotW = 64, slotH = 30, gap = 6;
  let sx = W - 20 - order.length * (slotW + gap) + gap;
  const sy = H - 88;
  const slotCol = { pistol: '#ffd23f', smg: '#7fc4ff', shotgun: '#ff8a5d' };
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  order.forEach((k, i) => {
    const x = sx + i * (slotW + gap);
    const sel = k === self.weaponKey;
    ctx.fillStyle = sel ? 'rgba(255,210,63,0.92)' : 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, sy, slotW, slotH, 7); ctx.fill();
    ctx.strokeStyle = slotCol[k] || '#fff'; ctx.lineWidth = 2;
    roundRect(ctx, x, sy, slotW, slotH, 7); ctx.stroke();
    const ic = sel ? '#20242b' : (slotCol[k] || '#fff');
    drawIcon(ctx, k, x + 14, sy + slotH / 2, 16, ic);
    ctx.fillStyle = sel ? '#20242b' : 'rgba(255,255,255,0.9)';
    ctx.fillText(String(i + 1), x + 26, sy + 20);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText((WEAPONS[k] && WEAPONS[k].name) ? WEAPONS[k].name.slice(0, 3) : k.slice(0, 3), x + 36, sy + 20);
    ctx.font = 'bold 11px sans-serif';
  });

  // 점수/순위(우하단)
  ctx.textAlign = 'right'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#ffe27a';
  ctx.fillText(t('killScore', { n: self.score }), W - 20, H - 70);
}

function drawMinimap(ctx, W, snap, self, touch) {
  const worldSize = CONFIG.WORLD_SIZE;
  // 미니맵 크기는 drawHUD에서 이미 계산됨 (info.touch 활용)
  const minD = Math.min(W, H);
  const isLandscape = W > H;
  const size = touch ? (minD < 450 ? 80 : (isLandscape ? 96 : 104)) : 150;
  const pad = minD < 500 ? 12 : 16;
  const mx = W - size - pad, my = pad;
  const scale = size / worldSize;
  // 프레임
  ctx.fillStyle = 'rgba(10,14,20,0.7)'; roundRect(ctx, mx - 3, my - 3, size + 6, size + 6, 11); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, mx, my, size, size, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; roundRect(ctx, mx, my, size, size, 8); ctx.stroke();
  // 존(반투명 채우기 + 테두리)
  const zcx = mx + snap.zone.cx * scale, zcy = my + snap.zone.cy * scale, zr = snap.zone.r * scale;
  ctx.beginPath(); ctx.arc(zcx, zcy, Math.max(0.5, zr), 0, TAU);
  ctx.fillStyle = 'rgba(181,30,30,0.12)'; ctx.fill();
  ctx.strokeStyle = CONFIG.COLORS.zoneStroke; ctx.lineWidth = 1.5; ctx.stroke();
  // 엔티티(나=방향 화살표, 봇=주황 점, 인간=파랑 점)
  for (const e of snap.entities) {
    if (!e.alive) continue;
    const ex = mx + e.x * scale, ey = my + e.y * scale;
    if (self && e.id === self.id) {
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(self.angle || 0);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3.2); ctx.lineTo(-3, 3.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = e.isBot ? '#ff6a3d' : '#5db0ff';
      ctx.beginPath(); ctx.arc(ex, ey, 2.2, 0, TAU); ctx.fill();
    }
  }
}

function drawKillFeed(ctx, W, feed, minimapSize) {
  const pad = 16, top = (minimapSize || 150) + 16 + 10; // 미니맵 아래
  ctx.font = '13px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i < feed.length; i++) {
    const kf = feed[i];
    const alpha = Math.min(1, kf.ttl);
    const tw = ctx.measureText(kf.text).width;
    const y = top + i * 22;
    ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
    roundRect(ctx, W - pad - tw - 12, y - 13, tw + 16, 19, 5); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.45 * alpha})`;
    ctx.fillText(kf.text, W - pad - 4, y);
  }
}

export function drawConnecting(ctx, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(t('connecting'), W / 2, H / 2);
}

// 저체력 위험 비네팅(빨간 가장자리) — 그라디언트를 W/H/alpha 기준으로 캐싱해 매 프레임 재생성 방지
let _vigCache = null;
export function drawVignette(ctx, W, H, alpha) {
  alpha = Math.max(0, Math.min(1, alpha));
  if (!_vigCache || _vigCache.W !== W || _vigCache.H !== H || _vigCache.alpha !== alpha) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(200,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${alpha})`);
    _vigCache = { W, H, alpha, g };
  }
  ctx.fillStyle = _vigCache.g; ctx.fillRect(0, 0, W, H);
}

// 반투명 둥근 카드 패널(오버레이 구조용)
function drawCard(ctx, x, y, w, h, r = 16) {
  ctx.fillStyle = 'rgba(16,20,27,0.82)';
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

// AI 레벨 진행 바(1~9). cur=현재(도달) 레벨. 현재 세그먼트는 펄스 강조.
function drawAILevelProgress(ctx, cx, cy, cur, time) {
  const max = CONFIG.MODES.AI_MAX_LEVEL;
  const segW = 30, gap = 6, segH = 14;
  const totalW = max * segW + (max - 1) * gap;
  const x0 = cx - totalW / 2;
  const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 5);
  for (let i = 1; i <= max; i++) {
    const x = x0 + (i - 1) * (segW + gap);
    const reached = i <= cur;
    const isCur = i === cur;
    if (isCur) { ctx.save(); ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 6 + 8 * pulse; }
    ctx.fillStyle = reached ? 'rgba(255,210,63,0.92)' : 'rgba(255,255,255,0.10)';
    roundRect(ctx, x, cy, segW, segH, 4); ctx.fill();
    if (isCur) ctx.restore();
    ctx.fillStyle = reached ? '#20242b' : 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(i), x + segW / 2, cy + segH - 3);
  }
}

// info = { snap, self, mode, level, aiLeaderboard }
export function drawLobby(ctx, W, H, info) {
  const snap = info.snap;
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  if (info.mode === 'ai') {
    // AI: 중앙 카드에 레벨 안내 + 진행 바 + 최고 도달 + (넓은 화면) AI 랭킹
    const lvl = (snap.level != null) ? snap.level : info.level;
    const cx = W / 2, cy = H / 2;
    const cardW = Math.min(460, W - 40), cardH = 230;
    drawCard(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText(t('aiLobbyTitle', { n: lvl, e: lvl }), cx, cy - 64);
    ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
    ctx.fillText(t('aiLobbyStart', { n: Math.ceil(snap.phaseTimeLeft) }), cx, cy - 28);
    drawAILevelProgress(ctx, cx, cy - 4, lvl, snap.time);
    const myBest = (snap.maxLevelReached != null) ? snap.maxLevelReached : lvl;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '14px sans-serif';
    ctx.fillText(t('aiBestLevel', { n: myBest }), cx, cy + 52);
    if (W > 760) drawAILeaderboardPanel(ctx, W - 24 - 280, H / 2 - 40, info.aiLeaderboard, info.myId);
    return;
  }

  // multi: 기존 로비
  const humans = snap.entities.filter((e) => !e.isBot).length;
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 46px sans-serif';
  ctx.fillText(t('lobbyTitle'), W / 2, H / 2 - 50);
  ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
  ctx.fillText(t('lobbyCountdown', { n: Math.ceil(snap.phaseTimeLeft) }), W / 2, H / 2);
  ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(t('lobbyPlayers', { n: humans }), W / 2, H / 2 + 36);

  // 오늘의 일일 미션 진행
  const me = (info.leaderboard || []).find((e) => e.id === info.myId);
  const myKills = me ? me.kills : 0;
  const tgt = CONFIG.COINS.MISSION_TARGET;
  ctx.fillStyle = '#ffd23f'; ctx.font = '15px sans-serif';
  ctx.fillText(t('mission', { n: Math.min(myKills, tgt), t: tgt, r: CONFIG.COINS.MISSION }), W / 2, H / 2 + 64);

  // 오늘의 탑 10 (좌측)
  drawLeaderboardPanel(ctx, 24, H / 2 - 40, info.leaderboard, info.self);
  // 오늘의 국가 순위 (우측)
  drawCountryPanel(ctx, W - 24 - 280, H / 2 - 40, info.countryBoard);
}

// 오늘의 AI 최고 레벨 랭킹 패널(AI 모드 로비/결과)
function drawAILeaderboardPanel(ctx, x, y, board, myId) {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, 280, 320, 10); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(t('aiTop'), x + 16, y + 30);
  ctx.font = '15px sans-serif';
  if (!board || !board.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(t('noRecords'), x + 16, y + 60);
    return;
  }
  for (let i = 0; i < board.length; i++) {
    const e = board[i];
    const isMe = e.id === myId;
    ctx.fillStyle = isMe ? '#ffe27a' : 'rgba(255,255,255,0.9)';
    ctx.font = isMe ? 'bold 15px sans-serif' : '15px sans-serif';
    const cc = e.country ? '[' + e.country + '] ' : '';
    const name = e.name.length > 13 ? e.name.slice(0, 13) : e.name;
    ctx.fillText(`${i + 1}. ${cc}${name}`, x + 16, y + 60 + i * 26);
    ctx.textAlign = 'right';
    ctx.fillText(t('boardLevel', { n: e.maxLevel }), x + 264, y + 60 + i * 26);
    ctx.textAlign = 'left';
  }
}

// 오늘의 킬 리더보드 패널(공용) — "나" 강조는 id 우선, 없으면 name
function drawLeaderboardPanel(ctx, x, y, board, self) {
  const meName = self ? self.name : null;
  const meId = self ? self.id : null;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, 280, 320, 10); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(t('top10Kills'), x + 16, y + 30);
  ctx.font = '15px sans-serif';
  if (!board || !board.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(t('noRecords'), x + 16, y + 60);
    return;
  }
  for (let i = 0; i < board.length; i++) {
    const e = board[i];
    const isMe = (meId != null && e.id === meId) || (!!meName && e.name === meName);
    ctx.fillStyle = isMe ? '#ffe27a' : 'rgba(255,255,255,0.9)';
    ctx.font = isMe ? 'bold 15px sans-serif' : '15px sans-serif';
    const rank = i + 1;
    const cc = e.country ? '[' + e.country + '] ' : '';
    const name = e.name.length > 13 ? e.name.slice(0, 13) : e.name;
    ctx.fillText(`${rank}. ${cc}${name}`, x + 16, y + 60 + i * 26);
    ctx.textAlign = 'right';
    ctx.fillText(t('boardKills', { n: e.kills, s: e.score }), x + 264, y + 60 + i * 26);
    ctx.textAlign = 'left';
  }
}

// 오늘의 국가 순위 패널(킬 합산). 로비 우측.
function drawCountryPanel(ctx, x, y, board) {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, 280, 320, 10); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(t('countryTitle'), x + 16, y + 30);
  ctx.font = '15px sans-serif';
  if (!board || !board.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(t('noRecords'), x + 16, y + 60);
    return;
  }
  for (let i = 0; i < board.length; i++) {
    const e = board[i];
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${i + 1}. [${e.country}]`, x + 16, y + 60 + i * 26);
    ctx.textAlign = 'right';
    ctx.fillText(t('countryKills', { k: e.kills, p: e.players }), x + 264, y + 60 + i * 26);
    ctx.textAlign = 'left';
  }
}

// 플레이 중 Tab 점수판(전체 화면 오버레이). mode 에 따라 킬(multi)/레벨(ai) 표시.
export function drawScoreboard(ctx, W, H, board, self, mode, myId) {
  const isAI = mode === 'ai';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  const w = 360, h = 420, x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(20,24,30,0.92)';
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(isAI ? t('aiTop') : t('top10'), W / 2, y + 40);

  ctx.textAlign = 'left'; ctx.font = '16px sans-serif';
  const meName = self ? self.name : null;
  const meId = myId != null ? myId : (self ? self.id : null);
  if (!board || !board.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(t('noRecords'), W / 2, y + 200);
    return;
  }
  for (let i = 0; i < board.length; i++) {
    const e = board[i];
    const isMe = (meId != null && e.id === meId) || (!!meName && e.name === meName);
    ctx.fillStyle = isMe ? '#ffe27a' : 'rgba(255,255,255,0.92)';
    ctx.font = isMe ? 'bold 16px sans-serif' : '16px sans-serif';
    const cc = e.country ? '[' + e.country + '] ' : '';
    const name = e.name.length > 16 ? e.name.slice(0, 16) : e.name;
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}.  ${cc}${name}`, x + 24, y + 80 + i * 32);
    ctx.textAlign = 'right';
    ctx.fillText(isAI ? t('boardLevel', { n: e.maxLevel }) : t('scoreKills', { k: e.kills, s: e.score }), x + w - 24, y + 80 + i * 32);
  }
}

export function drawRoundOver(ctx, W, H, info) {
  const snap = info.snap;
  ctx.fillStyle = 'rgba(0,0,0,0.76)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  const cx = W / 2, cy = H / 2;

  if (info.mode === 'ai') {
    // AI 결과: 챔피언 / 클리어 / 패배(재도전) — 카드 + 진행 바
    const r = info.lastAIResult;
    const won = !!(r && r.humanWon);
    const champion = won && r.playedLevel >= CONFIG.MODES.AI_MAX_LEVEL;
    let line;
    if (champion) line = t('aiChampion');
    else if (won) line = t('aiClear', { n: r.playedLevel, n2: r.level });
    else line = t('aiDefeat', { n: r ? r.playedLevel : (snap.level || info.level) });
    const cardW = Math.min(520, W - 40), cardH = 250;
    drawCard(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH);
    ctx.fillStyle = champion ? '#7fe08a' : (won ? '#ffd23f' : '#ff6a3d');
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(line, cx, cy - 60);
    drawAILevelProgress(ctx, cx, cy - 22, snap.level || info.level, snap.time);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
    ctx.fillText(t('nextRoundIn', { n: Math.ceil(snap.phaseTimeLeft) }), cx, cy + 40);
    if (W > 820) drawAILeaderboardPanel(ctx, W - 24 - 280, H / 2 - 40, info.aiLeaderboard, info.myId);
    return;
  }

  // multi: 승자 카드
  const cardW = Math.min(560, W - 40), cardH = 200;
  drawCard(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH);
  let winnerLine = t('winnerNone');
  if (snap.winnerId) {
    const w = snap.entities.find((e) => e.id === snap.winnerId);
    if (w) {
      const nm = w.isBot ? w.name : w.name + ' (' + t('playerTag') + ')';
      winnerLine = t('winner', { n: nm });
    }
  }
  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 46px sans-serif';
  ctx.fillText(winnerLine, cx, cy - 20);
  ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
  ctx.fillText(t('nextRoundIn', { n: Math.ceil(snap.phaseTimeLeft) }), W / 2, H / 2 + 20);
  if (info.self) {
    ctx.fillStyle = '#ffe27a'; ctx.font = '18px sans-serif';
    ctx.fillText(t('myKillScore', { n: info.self.score }), W / 2, H / 2 + 52);
  }
}

export function drawSpectate(ctx, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif';
  ctx.fillText(t('spectating'), W / 2, 60);
  ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(t('spectateHint'), W / 2, 88);
}
