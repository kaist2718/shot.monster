// ============================================================
// main.js - 클라이언트 부트스트랩. (client)
// 입력 캡처(rAF 샘플) -> 30Hz 서버 송신 / 스냅샷 수신 -> 보간+자기 예측 렌더링.
// 입력 우선순위: gamepad > touch session > keyboard/mouse. Aim assist 클라 angle 보정.
// ============================================================

import { Input, isFormEl, isUiBlocking } from './input.js';
import { TouchCtrl } from './touch.js';
import { Camera } from './camera.js';
import { Net } from './net.js';
import { renderWorld } from './render.js';
import { drawHUD, drawLobby, drawRoundOver, drawSpectate, drawConnecting, drawVignette, drawScoreboard } from './ui.js';
import { showRewardedAd } from './ad.js';
import { StartScreen } from './start.js';
import { ModeSelect, RoomBrowser } from './mode.js';
import { DomUI } from './dom.js';
import { Sound } from './sound.js';
import { Particles } from './particles.js';
import { I18N } from './i18n.js';
import { MobileSettings } from './mobile.js';
import { hideBootSplash, initOrientationHint } from './boot.js';
import { GamepadCtrl } from './gamepad.js';
import { applyAimAssist, resetAimAssist } from './aimassist.js';
import { setButtonIcon } from './icons.js';
import { CONFIG, WEAPONS } from '../shared/config.js';
import { lerp, lerpAngle, dist, clamp, circleRect } from '../shared/utils.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const camera = new Camera();
const smoothed = new Map();

let latest = null;
let snapRecvAt = 0;
let self = null;
let last = 0;

let worldObstacles = [];
let predictedSelf = null;
let lastContract = { moveX: 0, moveY: 0, angle: 0, firing: false, reload: false, sprint: false };
let stickyReload = false;       // 전송될 때까지 유지
let stickyFireRise = false;     // 반자동 엣지 보완(참고용, server도 edge)
let prevFiringLocal = false;
let frameDt = 1 / 60;

let prevHealth = null;
let prevReload = 0;
let prevOwnedCount = 1;
let prevAlive = true;
let prevSelfAlive = null;
let prevPhase = null;
let camSnapped = false;
let shake = 0;
let hitMarker = 0;
let muzzle = 0;
let killFeed = [];
let lastAIResult = null;
let gameProfile = null;
let pageHidden = false;
let lastCursor = '';
let serverFullMsg = false;
let preferTouchUi = false;      // HUD/스틱 표시용(hysteresis)
let hintAge = 0;

const particles = new Particles();
const prevAmmo = new Map();
const HYBRID_MS = (CONFIG.CONTROLS && CONFIG.CONTROLS.HYBRID_MS) || 500;
const ZERO = () => ({ moveX: 0, moveY: 0, angle: 0, firing: false, reload: false, sprint: false });

// 음소거 버튼은 resize()보다 먼저 생성 (TDZ: layoutMute → muteBtn 참조)
const muteBtn = document.createElement('button');
const paintMute = () => {
  setButtonIcon(muteBtn, Sound.muted ? 'soundOff' : 'soundOn', 20);
  muteBtn.title = I18N.t('muteTitle');
  muteBtn.setAttribute('aria-label', I18N.t('muteTitle'));
};
function layoutMute() {
  if (!muteBtn) return;
  const touch = Input.touch && Input.touch.enabled;
  // cssText 대신 개별 속성 — paintMute SVG 자식 유지
  muteBtn.style.position = 'fixed';
  muteBtn.style.zIndex = '40';
  muteBtn.style.width = '40px';
  muteBtn.style.height = '40px';
  muteBtn.style.border = 'none';
  muteBtn.style.borderRadius = '12px';
  muteBtn.style.background = 'rgba(0,0,0,0.55)';
  muteBtn.style.color = '#fff';
  muteBtn.style.display = 'flex';
  muteBtn.style.alignItems = 'center';
  muteBtn.style.justifyContent = 'center';
  muteBtn.style.cursor = 'pointer';
  muteBtn.style.touchAction = 'none';
  muteBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,.35)';
  if (touch) {
    muteBtn.style.right = 'max(12px, env(safe-area-inset-right))';
    muteBtn.style.top = 'max(12px, env(safe-area-inset-top))';
    muteBtn.style.left = 'auto';
  } else {
    muteBtn.style.left = '12px';
    muteBtn.style.top = '78px';
    muteBtn.style.right = 'auto';
  }
}

let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layoutMute();
}
window.addEventListener('resize', resize);
resize();

Input.init(canvas);
Sound.init();
I18N.init();
MobileSettings.load();
GamepadCtrl.init();
// 터치 하드웨어면 mute를 우상단으로 재배치
layoutMute();
paintMute();
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  Sound.toggleMute(); paintMute();
  if (!Sound.muted) Sound.play('click');
});
document.body.appendChild(muteBtn);
I18N.onChange(paintMute);

const unlockAudio = () => Sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

DomUI.init({
  onRevive: () => showRewardedAd(() => Net.requestRevive()),
  onPerk: () => showRewardedAd(() => Net.requestAdPerk()),
});

function toggleOrientation() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } catch { /* 무시 */ }
  try {
    if (screen.orientation && screen.orientation.lock) {
      const t = screen.orientation.type || '';
      const want = (t.indexOf('landscape') >= 0) ? 'portrait' : 'landscape';
      screen.orientation.lock(want + '-primary').catch(() => {});
    }
  } catch { /* 무시 */ }
}

function switchWeaponByDelta(delta) {
  if (!self) return;
  const owned = self.ownedWeapons || ['pistol'];
  const order = ['pistol', 'smg', 'shotgun'].filter((k) => owned.includes(k));
  if (order.length < 2) return;
  const i = order.indexOf(self.weaponKey);
  const next = order[(i + (delta >= 0 ? 1 : order.length - 1)) % order.length];
  if (next && next !== self.weaponKey) { Net.sendSwitchWeapon(next); Sound.play('click'); }
}
function switchWeaponTouch() { switchWeaponByDelta(1); }

function buzz(ms) {
  if (Input.touch.enabled && MobileSettings.get('vibration') && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* 무시 */ }
  }
}
let lastBuzz = 0;

TouchCtrl.init(canvas, camera, {
  onOrient: toggleOrientation,
  onSwitchWeapon: switchWeaponTouch,
  onThrowGrenade: (clientX, clientY) => {
    // 화면 좌표를 월드 좌표로 변환하여 현재 각도로 수류탄 투척
    if (latest && self && self.alive) {
      const ang = self.angle;
      const wx = self.x + Math.cos(ang) * CONFIG.WORLD_SIZE;
      const wy = self.y + Math.sin(ang) * CONFIG.WORLD_SIZE;
      // 서버에 수류탄 투척 요청
      Net.throwGrenade();
    }
  }
});
layoutMute(); // 터치 capability 확정 후 mute 위치 재배치
initOrientationHint();

window.addEventListener('wheel', (e) => {
  if (isUiBlocking()) return;
  e.preventDefault();
  camera.adjustZoomBy(e.deltaY < 0 ? 1.12 : 0.89);
}, { passive: false });

StartScreen.show((profile) => {
  gameProfile = profile;
  initNet();
  openModeSelect();
});
hideBootSplash();

function openModeSelect() {
  RoomBrowser.hide();
  ModeSelect.show({
    onAI: () => { ModeSelect.hide(); Net.joinAI(); },
    onMulti: () => { ModeSelect.hide(); openRoomBrowser(); },
  });
}

function openRoomBrowser() {
  Net.getMultiList();
  RoomBrowser.show({
    onJoin: (roomId) => { Net.joinMulti(roomId); RoomBrowser.refresh(); },
    onQuickJoin: () => { Net.joinMulti(); RoomBrowser.refresh(); },
    onPlay: () => { RoomBrowser.hide(); },
    onBack: () => { RoomBrowser.hide(); openModeSelect(); },
  });
  RoomBrowser.refresh();
}

function resetTracking() {
  prevHealth = null; prevReload = 0; prevOwnedCount = 1; prevAlive = true;
  prevAmmo.clear();
  resetAimAssist();
}

function initNet() {
  Net.init({
    onInit: () => {
      smoothed.clear(); predictedSelf = null; latest = null; prevPhase = null;
      resetTracking();
      serverFullMsg = false;
      if (Net.mode === 'ai') RoomBrowser.hide();
    },
    onSnapshot: (s) => { latest = s; snapRecvAt = performance.now(); },
    onRoundStart: (d) => {
      worldObstacles = d.obstacles || []; particles.clear();
      resetTracking();
      TouchCtrl.resetTransient();
    },
    onKill: (e) => {
      pushKill(e);
      if (e.killerId === Net.yourId) { buzz(20); Sound.play('kill'); }
      if (e.victimId === Net.yourId) Sound.play('death');
      if (latest) {
        const v = latest.entities.find((x) => x.id === e.victimId);
        if (v) particles.death(v.x, v.y, v.color);
      }
    },
    onHit: (e) => {
      const mine = e.shooterId === Net.yourId;
      if (mine) { hitMarker = CONFIG.FEEDBACK.HITMARKER_TTL; Sound.play('hit'); }
      if (latest) {
        const v = latest.entities.find((x) => x.id === e.victimId);
        if (v) {
          const s = latest.entities.find((x) => x.id === e.shooterId);
          const ang = s ? Math.atan2(v.y - s.y, v.x - s.x) : 0;
          particles.blood(v.x, v.y, ang);
          if (mine && typeof e.damage === 'number') particles.damageText(v.x, v.y - 18, e.damage, false);
        }
      }
    },
    onRevived: (e) => {
      if (e.yourId === Net.yourId) { predictedSelf = null; camSnapped = false; resetTracking(); }
    },
    onObstacleDestroyed: (e) => { worldObstacles = worldObstacles.filter((o) => o.id !== e.id); },
    onLeaderboard: () => {},
    onMultiList: () => { if (RoomBrowser._root) RoomBrowser.refresh(); },
    onAIRoundOver: (ev) => { lastAIResult = ev; },
    onServerFull: () => { serverFullMsg = true; },
  }, gameProfile, 'multi');
}

// 무기 키 — 폼/오버레이 가드
window.addEventListener('keydown', (e) => {
  if (isFormEl(e.target) || isUiBlocking()) return;
  const k = e.key.toLowerCase();
  if (k === '1') Net.sendSwitchWeapon('pistol');
  else if (k === '2') Net.sendSwitchWeapon('smg');
  else if (k === '3') Net.sendSwitchWeapon('shotgun');
});

function useTouchContract() {
  const t = Input.touch;
  if (!t || !t.enabled) return false;
  const scheme = MobileSettings.get('scheme') || 'dual';
  // 캐주얼 모드에서도 터치 입력으로 인식
  const now = performance.now();
  const touchRecent = t.active || t.reloadEdge || (now - Input.lastTouchAt < HYBRID_MS) ||
                      (scheme === 'casual' && typeof TouchCtrl._casualTarget === 'object');
  if (!touchRecent) return false;
  const mouseNewer = Input.lastMouseAt > Input.lastTouchAt + 30;
  const keyNewer = Input.lastKeyAt > Input.lastTouchAt + 30;
  if ((mouseNewer || keyNewer) && !t.active && scheme !== 'casual') return false;
  return true;
}

function wantAimAssist(source) {
  if (!MobileSettings.get('aimAssist')) return false;
  // 데스크탑 마우스 기본 off — touch/gamepad 경로에서만
  return source === 'touch' || source === 'gamepad';
}

function resolveAimAngle(raw, source) {
  let ang = raw;
  if (wantAimAssist(source) && latest && (predictedSelf || self)) {
    const origin = predictedSelf || self;
    ang = applyAimAssist(ang, {
      enabled: true,
      strength: MobileSettings.get('aimAssistStr'),
      stickiness: MobileSettings.get('aimAssistStickiness'), // sticky 시간 조절용
      origin,
      entities: latest.entities,
      myId: Net.yourId,
      dt: frameDt,
      obstacles: worldObstacles,
      now: performance.now(),
    });
  }
  return ang;
}

function rawAimFromTouch() {
  const t = Input.touch;
  const scheme = MobileSettings.get('scheme') || 'dual';

  // 캐주얼 모드: 가장 가까운 적 자동조준
  if (scheme === 'casual' && self && self.alive && latest) {
    const nearest = latest.entities.find((e) => {
      if (e.id === Net.yourId || !e.alive || !e.isBot) return false;
      return dist(e.x, e.y, self.x, self.y) < 350;
    });
    if (nearest) return Math.atan2(nearest.y - self.y, nearest.x - self.x);
  }

  if (t.aiming) return Math.atan2(t.aimY, t.aimX);
  if (t.moveX || t.moveY) return Math.atan2(t.moveY, t.moveX);
  return predictedSelf ? predictedSelf.angle : (self ? self.angle : 0);
}

function rawAimFromMouse() {
  const origin = predictedSelf || self;
  if (!origin) return lastContract.angle || 0;
  const z = camera.zoom;
  const wmx = Input.mouseX / z + camera.x;
  const wmy = Input.mouseY / z + camera.y;
  return Math.atan2(wmy - origin.y, wmx - origin.x);
}

function buildContract() {
  if (isUiBlocking() || pageHidden) return ZERO();

  // 1) Gamepad
  if (GamepadCtrl.active()) {
    const fb = lastContract.angle || (self && self.angle) || 0;
    const gc = GamepadCtrl.toContract(fb);
    if (gc) {
      if (GamepadCtrl.weaponDelta) switchWeaponByDelta(GamepadCtrl.weaponDelta);
      const ang = resolveAimAngle(gc.angle, 'gamepad');
      if (gc.reload) stickyReload = true;
      return {
        moveX: gc.moveX, moveY: gc.moveY, angle: ang,
        firing: !!gc.firing, reload: !!(gc.reload || stickyReload), sprint: !!gc.sprint,
      };
    }
  }

  // 2) Touch
  if (useTouchContract()) {
    preferTouchUi = true;
    const t = Input.touch;
    const scheme = MobileSettings.get('scheme') || 'dual';

    // 캐주얼 모드: 이동 목표 기반 이동 + 자동 사격
    if (scheme === 'casual' && self && self.alive && latest) {
      const origin = predictedSelf || self;
      if (TouchCtrl._casualTarget) {
        const dx = TouchCtrl._casualTarget.x - origin.x;
        const dy = TouchCtrl._casualTarget.y - origin.y;
        const distToTarget = Math.hypot(dx, dy);
        if (distToTarget > 30) {
          t.moveX = clamp(dx / distToTarget, -1, 1);
          t.moveY = clamp(dy / distToTarget, -1, 1);
        } else {
          t.moveX = 0;
          t.moveY = 0;
        }
        // 자동 사격 (autoFire = true 기본)
        const shouldFire = MobileSettings.get('autoFire') &&
          distToTarget < 200 &&
          MobileSettings.get('aimAssist');
        if (shouldFire) {
          t.firing = true;
        }
      }
    }

    const ang = resolveAimAngle(rawAimFromTouch(), 'touch');
    if (t.reloadEdge) stickyReload = true;
    return {
      moveX: t.moveX, moveY: t.moveY, angle: ang,
      firing: !!t.firing, reload: !!(t.reloadEdge || stickyReload), sprint: !!t.sprint,
    };
  }

  // 3) Keyboard / mouse
  preferTouchUi = false;
  let dx = 0, dy = 0;
  if (Input.isDown('w') || Input.isDown('arrowup'))    dy -= 1;
  if (Input.isDown('s') || Input.isDown('arrowdown'))  dy += 1;
  if (Input.isDown('a') || Input.isDown('arrowleft'))  dx -= 1;
  if (Input.isDown('d') || Input.isDown('arrowright')) dx += 1;
  const firing = Input.mouseDown || Input.isDown(' ');
  const reload = Input.isDown('r') || stickyReload;
  const ang = resolveAimAngle(rawAimFromMouse(), 'mouse');
  return { moveX: dx, moveY: dy, angle: ang, firing, reload: !!reload, sprint: Input.isDown('shift') };
}

// 30Hz 송신 — rAF에서 채운 lastContract 사용. sticky edge는 송신 후 클리어.
const INPUT_HZ = (CONFIG.NET && CONFIG.NET.INPUT_HZ) || 30;
setInterval(() => {
  if (pageHidden) return;
  // 최신 계약을 interval 직전에도 한 번 갱신(프레임 멈춤 대비)
  lastContract = buildContract();
  Net.sendInput(lastContract);
  if (lastContract.firing && self && self.alive && self.ammo > 0) muzzle = CONFIG.FEEDBACK.MUZZLE_TTL;
  // sticky 소비
  stickyReload = false;
  TouchCtrl.endFrame();
  GamepadCtrl.endFrame();
}, 1000 / INPUT_HZ);

function sendZeroNow() {
  const z = ZERO();
  z.angle = lastContract.angle || 0;
  lastContract = z;
  Net.sendInput(z);
}

document.addEventListener('visibilitychange', () => {
  pageHidden = document.hidden;
  if (pageHidden) {
    Input.resetAll();
    TouchCtrl.endFrame(); GamepadCtrl.endFrame(); // 잔존 edge(재장전/무기전환) 클리어 → 복귀 시 오작동 방지
    sendZeroNow();
  } else {
    camSnapped = false;
    lastContract = buildContract();
    Net.sendInput(lastContract);
  }
});
window.addEventListener('blur', () => {
  Input.resetAll();
  TouchCtrl.endFrame(); GamepadCtrl.endFrame();
  if (!pageHidden) sendZeroNow();
});

function collidesObs(x, y, r) {
  for (const o of worldObstacles) {
    if (o.solid && circleRect(x, y, r, o.x, o.y, o.w, o.h)) return true;
  }
  return false;
}

function integratePrediction(dt) {
  if (!predictedSelf || !self || !self.alive) return;
  const c = lastContract;
  const dx = c.moveX, dy = c.moveY;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    const nx = dx / len, ny = dy / len;
    const mag = Math.min(len, 1);
    let speed = CONFIG.PLAYER_SPEED * mag;
    if (c.sprint) speed *= CONFIG.PLAYER_SPRINT_MULT;
    const tryX = predictedSelf.x + nx * speed * dt;
    if (!collidesObs(tryX, predictedSelf.y, CONFIG.PLAYER_RADIUS)) predictedSelf.x = tryX;
    const tryY = predictedSelf.y + ny * speed * dt;
    if (!collidesObs(predictedSelf.x, tryY, CONFIG.PLAYER_RADIUS)) predictedSelf.y = tryY;
    predictedSelf.x = clamp(predictedSelf.x, CONFIG.PLAYER_RADIUS, CONFIG.WORLD_SIZE - CONFIG.PLAYER_RADIUS);
    predictedSelf.y = clamp(predictedSelf.y, CONFIG.PLAYER_RADIUS, CONFIG.WORLD_SIZE - CONFIG.PLAYER_RADIUS);
  }
  predictedSelf.angle = c.angle;
}

function syncPredicted() {
  if (!self) { predictedSelf = null; return; }
  if (!self.alive) { predictedSelf = null; return; }
  if (!predictedSelf) {
    predictedSelf = { x: self.x, y: self.y, angle: self.angle };
  } else {
    const err = dist(predictedSelf.x, predictedSelf.y, self.x, self.y);
    const hard = CONFIG.NET.PREDICT_RECONCILE;
    const soft = CONFIG.NET.PREDICT_SOFT != null ? CONFIG.NET.PREDICT_SOFT : 28;
    if (err > hard) {
      predictedSelf.x = self.x; predictedSelf.y = self.y;
    } else if (err > soft) {
      const a = 0.22;
      predictedSelf.x = lerp(predictedSelf.x, self.x, a);
      predictedSelf.y = lerp(predictedSelf.y, self.y, a);
    }
  }
  smoothed.set(self.id, predictedSelf);
}

function pushKill(e) {
  let killerName = null, killerCC = '';
  let victimName = e.victimName, victimCC = '';
  if (latest) {
    if (e.killerId) {
      const k = latest.entities.find((x) => x.id === e.killerId);
      if (k) { killerName = k.name; killerCC = k.country ? '[' + k.country + '] ' : ''; }
    }
    const v = latest.entities.find((x) => x.id === e.victimId);
    if (v && v.country) victimCC = '[' + v.country + '] ';
  }
  const text = killerName
    ? `${killerCC}${killerName} › ${victimCC}${victimName}`
    : `${victimCC}${victimName} · out`;
  killFeed.push({ text, ttl: CONFIG.KILLFEED_TTL });
  if (killFeed.length > CONFIG.KILLFEED_MAX) killFeed.shift();
}

function loop(ts) {
  try { step(ts); }
  catch (err) { console.error('렌더 루프 오류:', err); }
  requestAnimationFrame(loop);
}

function step(ts) {
  if (!last) last = ts;
  let dt = (ts - last) / 1000; last = ts;
  dt = Math.min(dt, 0.1);
  frameDt = dt;
  hintAge += dt;

  // rAF마다 최신 입력으로 예측/조준 — 30Hz 샘플 지연 제거
  if (!pageHidden) {
    lastContract = buildContract();
    // fire rise 추적(향후 로컬 건 고스트용)
    if (lastContract.firing && !prevFiringLocal) stickyFireRise = true;
    prevFiringLocal = !!lastContract.firing;
  }

  const W = window.innerWidth, H = window.innerHeight;

  // touch UI 선호 히스테리시스
  const now = performance.now();
  if (Input.touch && Input.touch.enabled) {
    if (useTouchContract()) preferTouchUi = true;
    else if (now - Input.lastTouchAt > HYBRID_MS * 1.5) preferTouchUi = false;
  } else preferTouchUi = false;

  if (latest) {
    const liveIds = new Set();
    for (const e of latest.entities) {
      liveIds.add(e.id);
      if (e.id === Net.yourId) continue;
      let cur = smoothed.get(e.id);
      if (!cur) { smoothed.set(e.id, { x: e.x, y: e.y, angle: e.angle }); continue; }
      if (dist(cur.x, cur.y, e.x, e.y) > 400) { cur.x = e.x; cur.y = e.y; cur.angle = e.angle; continue; }
      const k = 1 - Math.exp(-15 * dt);
      cur.x = lerp(cur.x, e.x, k);
      cur.y = lerp(cur.y, e.y, k);
      cur.angle = lerpAngle(cur.angle, e.angle, k);
    }
    for (const id of smoothed.keys()) if (!liveIds.has(id)) smoothed.delete(id);

    self = latest.entities.find((e) => e.id === Net.yourId) || null;

    // 전투 입력 활성(생존 플레이 중)
    const combatOn = !!(self && self.alive && latest.phase === 'playing');
    TouchCtrl.setCombatEnabled(combatOn);

    // 캐주얼 모드: aimX/aimY 업데이트 (조준선/히트마커 위치 정확성)
    if (latest && self && self.alive) {
      TouchCtrl._sync(latest.entities, Net.yourId, self);
    }

    DomUI.showRevive(!!(self && !self.alive && latest.phase === 'playing' && !self.revivedThisLife));
    DomUI.showPerk(latest.phase === 'lobby');

    for (const e of latest.entities) {
      if (!e.alive) { prevAmmo.delete(e.id); continue; }
      const pe = prevAmmo.get(e.id);
      if (pe && e.weaponKey === pe.weapon && e.ammo < pe.ammo) {
        const ang = e.angle;
        const mx = e.x + Math.cos(ang) * CONFIG.PLAYER_RADIUS * 1.4;
        const my = e.y + Math.sin(ang) * CONFIG.PLAYER_RADIUS * 1.4;
        particles.muzzle(mx, my, ang);
        const panX = clamp(((mx - camera.x) * camera.zoom) / (W / 2), -1, 1);
        let vol = 1;
        if (self && self.alive) vol = clamp(1 - dist(self.x, self.y, mx, my) / 1300, 0.12, 1);
        Sound.play(e.weaponKey || 'pistol', panX, vol);
      }
      prevAmmo.set(e.id, { ammo: e.ammo, weapon: e.weaponKey });
    }

    if (latest.phase !== prevPhase) {
      if (latest.phase === 'playing') camSnapped = false;
      prevPhase = latest.phase;
    }
    if (self) {
      if (prevSelfAlive !== null && prevSelfAlive !== self.alive) {
        camSnapped = false;
        if (!self.alive) TouchCtrl.resetTransient();
      }
      prevSelfAlive = self.alive;
    } else prevSelfAlive = null;

    // 캐주얼 모드: 타겟에 도달하면 타겟 클리어
    const scheme = MobileSettings.get('scheme') || 'dual';
    if (scheme === 'casual' && TouchCtrl._casualTarget && self && self.alive) {
      const dx = TouchCtrl._casualTarget.x - self.x;
      const dy = TouchCtrl._casualTarget.y - self.y;
      const distToTarget = Math.hypot(dx, dy);
      if (distToTarget < 25) {
        TouchCtrl._casualTarget = null;
      }
    }

    syncPredicted();
    if (predictedSelf) integratePrediction(dt);

    if (hitMarker > 0) hitMarker -= dt;
    if (muzzle > 0) muzzle -= dt;
    if (shake > 0) shake = Math.max(0, shake - CONFIG.FEEDBACK.SHAKE_DECAY * dt);
    for (let i = killFeed.length - 1; i >= 0; i--) {
      killFeed[i].ttl -= dt;
      if (killFeed[i].ttl <= 0) killFeed.splice(i, 1);
    }

    particles.update(dt);
    if (self && self.alive && self.reloadTimer > 0 && prevReload <= 0) Sound.play('reload');
    prevReload = self ? self.reloadTimer : 0;

    const focus = (self && self.alive) ? (predictedSelf || self)
                : (latest.entities.find((e) => e.alive) || self)
                || { x: latest.zone.cx, y: latest.zone.cy };
    if (!camSnapped) { camera.snap(focus, W, H); camSnapped = true; }
    else camera.follow(focus, dt, W, H);
  }

  if (self && self.alive && prevHealth !== null) {
    if (self.health < prevHealth) {
      const dmg = prevHealth - self.health;
      shake = Math.min(CONFIG.FEEDBACK.SHAKE_ON_DAMAGE, shake + Math.min(1, dmg / 25) * CONFIG.FEEDBACK.SHAKE_ON_DAMAGE);
      const tnow = performance.now();
      if (tnow - lastBuzz > 180) { buzz(15); lastBuzz = tnow; }
      Sound.play('hurt', 0, clamp(0.4 + dmg / 40, 0.4, 1));
      const hx = predictedSelf ? predictedSelf.x : self.x;
      const hy = predictedSelf ? predictedSelf.y : self.y;
      particles.blood(hx, hy, self.angle + Math.PI);
      particles.damageText(hx, hy - 18, dmg, true);
    } else if (self.health > prevHealth + 15) {
      Sound.play('pickup');
      particles.pickup(self.x, self.y, '#ff5d5d');
    }
    const oc = self.ownedWeapons ? self.ownedWeapons.length : 1;
    if (oc > prevOwnedCount) { Sound.play('pickup'); particles.pickup(self.x, self.y, '#9ecbff'); }
    prevOwnedCount = oc;
  }
  if (self && !self.alive && prevAlive) buzz([60, 40, 60]);
  prevAlive = self ? self.alive : true;
  prevHealth = self ? self.health : null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, W, H);

  if (serverFullMsg) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText(I18N.t('serverFull'), W / 2, H / 2);
    return;
  }

  if (!latest) { drawConnecting(ctx, W, H); return; }

  const dtSince = Math.min((performance.now() - snapRecvAt) / 1000, 0.1);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  renderWorld(ctx, latest, smoothed, camera, Net.yourId, dtSince, worldObstacles);
  {
    const z = camera.zoom;
    const SX = (wx) => (wx - camera.x) * z;
    const SY = (wy) => (wy - camera.y) * z;
    particles.draw(ctx, SX, SY, z);
  }
  ctx.restore();

  // 끊김: 마지막 프레임 유지 + 반투명 배너
  if (!Net.connected) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText(I18N.t('reconnecting'), W / 2, H / 2);
    return;
  }

  // snapshot stall watchdog
  if (Net.connected && snapRecvAt && (performance.now() - snapRecvAt) > 4000) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 36);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.font = '13px sans-serif';
    ctx.fillText(I18N.t('connectionStall'), W / 2, 22);
  }

  if (muzzle > 0 && predictedSelf && self && self.alive) drawMuzzle(ctx, predictedSelf);

  if (self && self.alive) {
    const hr = self.health / self.maxHealth;
    if (hr < 0.3) drawVignette(ctx, W, H, ((0.3 - hr) / 0.3) * 0.55);
  }

  const touchUi = !!(Input.touch && Input.touch.enabled && preferTouchUi);
  const info = {
    self, snap: latest, ping: Net.rtt, killFeed, leaderboard: Net.leaderboard,
    aiLeaderboard: Net.aiLeaderboard, countryBoard: Net.countryBoard, myId: Net.yourId,
    mode: Net.mode, level: Net.level, lastAIResult, touch: touchUi,
    showHint: !touchUi && hintAge < 12,
  };
  if (latest.phase === 'playing') {
    drawHUD(ctx, W, H, info);
    if (Input.touch && Input.touch.enabled) {
      // 보조 버튼은 사망/관전에도, 스틱은 생존 플레이만
      TouchCtrl.draw(ctx, { combat: !!(self && self.alive), aux: true, self });
    }
    if (!(self && self.alive)) drawSpectate(ctx, W, H);
  } else if (latest.phase === 'lobby') {
    drawHUD(ctx, W, H, info);
    drawLobby(ctx, W, H, info);
    if (Input.touch && Input.touch.enabled) TouchCtrl.draw(ctx, { combat: false, aux: true, self: null });
  } else if (latest.phase === 'roundover') {
    drawHUD(ctx, W, H, info);
    drawRoundOver(ctx, W, H, info);
    if (Input.touch && Input.touch.enabled) TouchCtrl.draw(ctx, { combat: false, aux: true, self: null });
  }

  const boardHold = Input.isDown('tab')
    || (Input.touch && Input.touch.enabled && Input.touch.boardOpen)
    || (GamepadCtrl.boardHold);
  if (boardHold && latest.phase !== 'lobby') {
    const sbBoard = (Net.mode === 'ai') ? Net.aiLeaderboard : Net.leaderboard;
    drawScoreboard(ctx, W, H, sbBoard, self, Net.mode, Net.yourId);
  }

  if (hitMarker > 0) drawHitMarker(ctx, W, H);

  // 조준선: 터치 UI가 아닐 때 (하이브리드 복구 포함). 게임패드만 쓸 때는 화면 중앙.
  const showCross = !touchUi && self && self.alive && latest.phase === 'playing';
  const wantCursor = showCross ? 'none' : '';
  if (wantCursor !== lastCursor) { canvas.style.cursor = wantCursor; lastCursor = wantCursor; }
  if (showCross) {
    if (GamepadCtrl.active() && (performance.now() - Input.lastMouseAt > 400)) {
      drawCrosshair(ctx, W / 2, H / 2, self);
    } else {
      drawCrosshair(ctx, Input.mouseX, Input.mouseY, self);
    }
  }
}

function drawCrosshair(ctx, mx, my, self) {
  const w = (self && self.weaponKey && WEAPONS[self.weaponKey]) ? WEAPONS[self.weaponKey] : WEAPONS.pistol;
  const gap = 6 + (w.spread || 0.04) * 90;
  const len = 8;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
  ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
  ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
  ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMuzzle(ctx, p) {
  const z = camera.zoom;
  const x = (p.x - camera.x) * z, y = (p.y - camera.y) * z;
  const tx = x + Math.cos(p.angle) * CONFIG.PLAYER_RADIUS * z * 1.4;
  const ty = y + Math.sin(p.angle) * CONFIG.PLAYER_RADIUS * z * 1.4;
  ctx.save();
  ctx.globalAlpha = Math.min(1, muzzle / CONFIG.FEEDBACK.MUZZLE_TTL + 0.3);
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.arc(tx, ty, Math.max(3, 7 * z), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,180,60,0.8)';
  ctx.beginPath();
  ctx.arc(tx, ty, Math.max(5, 12 * z), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHitMarker(ctx, W, H) {
  const a = Math.min(1, hitMarker / CONFIG.FEEDBACK.HITMARKER_TTL + 0.2);
  const cx = W / 2, cy = H / 2, s = 9;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + 5, cy - s + 5);
  ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s - 5, cy - s + 5);
  ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s + 5, cy + s - 5);
  ctx.moveTo(cx + s, cy + s); ctx.lineTo(cx + s - 5, cy + s - 5);
  ctx.stroke();
  ctx.restore();
}

requestAnimationFrame(loop);
