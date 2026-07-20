// ============================================================
// touch.js - 모바일 듀얼 가상 조이스틱 + 버튼. (client)
// 배정: 화면 좌/우 반 기준(lefty 시 반전). 버튼 히트 우선.
// 고정 스틱: move-half + 베이스 근접 시 고정 원점, 그 외 move-half는 동적 원점.
// 데드존/히스테리시스(이간·조준·스프린트). safe-area 회전 갱신.
// 캐주얼 모드: 원핑거 탭이동 + 자동조준/사격 (aimAssist와 연동).
// ============================================================

import { Input } from './input.js';
import { dist, TAU, clamp, circleRect } from '../shared/utils.js';
import { CONFIG, WEAPONS } from '../shared/config.js';
import { Net } from './net.js';
import { MobileSettings, SettingsPanel } from './mobile.js';
import { Sound } from './sound.js';
import { drawIcon } from './icons.js';

const ZOOM_STEP = 1.14;
const CTL = CONFIG.CONTROLS || {};
const MOVE_DZ = CTL.MOVE_DEADZONE != null ? CTL.MOVE_DEADZONE : 0.12;
const AIM_IN = CTL.AIM_DEADZONE_IN != null ? CTL.AIM_DEADZONE_IN : 0.22;
const AIM_OUT = CTL.AIM_DEADZONE_OUT != null ? CTL.AIM_DEADZONE_OUT : 0.14;
const SPR_IN = CTL.SPRINT_IN != null ? CTL.SPRINT_IN : 0.86;
const SPR_OUT = CTL.SPRINT_OUT != null ? CTL.SPRINT_OUT : 0.78;
const STICK_R = CTL.STICK_MAX_R != null ? CTL.STICK_MAX_R : 56;

// Input에 터치 상태 슬롯
Input.touch = {
  enabled: false,       // 하드웨어 터치 가능
  active: false,        // 손가락 다운 중
  sessionActive: false, // 하이브리드 계약용
  moveX: 0, moveY: 0,
  aimX: 0, aimY: 0,
  aiming: false,
  firing: false,
  reloadEdge: false,
  sprint: false,
  zoomIn: false,
  zoomOut: false,
  boardOpen: false,
  casualTarget: null,   // 캐주얼 모드: 이동 목표 월드 좌표 {x,y}
};

// Safe area 캐싱: 모바일에서 화면 전환 시 성능 최적화
let _safeInsetsCache = null;
let _safeInsetsLastTime = 0;
const SAFE_INSETS_CACHE_MS = 500; // 캐시 유지 시간

function getSafeInsets() {
  // 캐시 확인 (최근 500ms 이내이면 재사용)
  const now = performance.now();
  if (_safeInsetsCache && (now - _safeInsetsLastTime) < SAFE_INSETS_CACHE_MS) {
    return _safeInsetsCache;
  }
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;padding-top:env(safe-area-inset-top);' +
      'padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);' +
      'padding-left:env(safe-area-inset-left);visibility:hidden;pointer-events:none;';
    document.body.appendChild(d);
    const cs = getComputedStyle(d);
    const v = (s) => parseFloat(cs.getPropertyValue(s)) || 0;
    const ins = { top: v('padding-top'), right: v('padding-right'), bottom: v('padding-bottom'), left: v('padding-left') };
    document.body.removeChild(d);
    _safeInsetsCache = ins;
    _safeInsetsLastTime = now;
    return ins;
  } catch { return { top: 0, right: 0, bottom: 0, left: 0 }; }
}

export const TouchCtrl = {
  maxRadius: STICK_R,
  deadzone: AIM_IN,

  _canvas: null,
  _camera: null,
  _onOrient: null,
  _onSwitchWeapon: null,
  _combatEnabled: true, // 사망 시 스틱/사격 비활성
  _safe: { top: 0, right: 0, bottom: 0, left: 0 },
  _moveId: null, _moveOX: 0, _moveOY: 0, _moveCX: 0, _moveCY: 0,
  _aimId: null,  _aimOX: 0,  _aimOY: 0,  _aimCX: 0,  _aimCY: 0,
  _fireId: null,
  _autoFireToggle: true,  // 자동발사 토글 (화면 버튼으로 on/off)
  _runToggle: false,
  _zoomInId: null, _zoomOutId: null,
  buttonReload: null, buttonWeapon: null, buttonFire: null, buttonRun: null,
  buttonBoard: null, buttonOrient: null, buttonSettings: null,
  buttonZoomIn: null, buttonZoomOut: null,
  buttonAutoFire: null,
  _moveBase: null,
  _btnR: 26,
  _btnHitScale: 1.12,
  _lefty: false,
  _aimLatched: false,
  _sprintLatched: false,

  _pinchActive: false, _pinchDist: 0, _pinchId1: null, _pinchId2: null,
  _boardOpen: false,
  _casualTapActive: false,
  _casualTarget: null,
  _grenadeId: null, // 수류탄 버튼 터치 ID
  _quickChatId: null, // 퀵챗 버튼 터치 ID
  _quickChatOpen: false, // 퀵챗 패널 열림 상태
  _pingStartTime: 0, // 핑 롱프레스 시작 시간
  _pingStarted: false, // 핑 진행 중
  _pingTouchId: null, // 핑 터치 ID
  _layoutDirty: true, // 레이아웃 변경 필요 플래그 (매 프레임 재계산 방지)

  init(canvas, camera, opts = {}) {
    this._canvas = canvas;
    this._camera = camera;
    this._onOrient = opts.onOrient || null;
    this._onSwitchWeapon = opts.onSwitchWeapon || null;
    this._onThrowGrenade = opts.onThrowGrenade || null;
    this._onMapPing = opts.onMapPing || null;
    this._onEmote = opts.onEmote || null;
    Input.touch.enabled = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!Input.touch.enabled) return;
    this._refreshSafe();
    MobileSettings.load();
    this.maxRadius = STICK_R;
    const opt = { passive: false };
    canvas.addEventListener('touchstart',  (e) => this._onStart(e), opt);
    canvas.addEventListener('touchmove',   (e) => this._onMove(e), opt);
    canvas.addEventListener('touchend',    (e) => this._onEnd(e), opt);
    canvas.addEventListener('touchcancel', (e) => this._onEnd(e), opt);
    const refresh = () => this._refreshSafe();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('screenorientation', refresh); // orientation lock 변경 감지
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refresh);
      window.visualViewport.addEventListener('scroll', refresh);
    }
    document.body.classList.add('touch-capable');
  },

  _refreshSafe() { this._safe = getSafeInsets(); this._layoutDirty = true; },

  setCombatEnabled(on) {
    this._combatEnabled = !!on;
    if (!on) {
      this._moveId = null; this._aimId = null; this._fireId = null;
      this._aimLatched = false; this._sprintLatched = false;
      Input.touch.moveX = 0; Input.touch.moveY = 0;
      Input.touch.aiming = false; Input.touch.firing = false;
      Input.touch.sprint = !!(this._runToggle && MobileSettings.get('runButton'));
      Input.touch.active = false;
    }
  },

  resetTransient() {
    this._runToggle = false;
    this._boardOpen = false;
    Input.touch.boardOpen = false;
    this._fireId = null;
    this._aimLatched = false;
    this._sprintLatched = false;
    this._moveId = null; this._aimId = null;
    this._casualTapActive = false;
    this._casualTarget = null;
    Input.touch.moveX = 0; Input.touch.moveY = 0;
    Input.touch.aiming = false; Input.touch.firing = false; Input.touch.sprint = false;
    Input.touch.active = false;
    this._sync();
  },

  _zoom(ratio) { this._camera.adjustZoomBy(ratio * (MobileSettings.get('zoomSens') || 1)); },

  _layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const sa = this._safe;
    const minD = Math.min(W, H);
    const isLandscape = W > H;

    // 화면 크기별 버튼 크기 최적화 (작은 화면은 더 작게, 큰 화면은 기본)
    // 아주 작은 화면(≤400px): 최소값 낮춤, 큰 화면(≥800px): 기본값 유지
    const r1Min = minD <= 400 ? 24 : 28;  // 기본 버튼 최소값 (28→24)
    const r1Max = minD >= 800 ? 42 : 38;   // 기본 버튼 최대값 (38→42)
    const r2Min = minD <= 400 ? 12 : 16;  // 보조 버튼 최소값
    const r2Max = minD >= 800 ? 24 : 22;   // 보조 버튼 최대값

    const r1 = clamp(Math.round(minD * (isLandscape ? 0.055 : 0.058)), r1Min, r1Max);
    const r2 = clamp(Math.round(minD * 0.038), r2Min, r2Max);

    const lefty = !!MobileSettings.get('lefty');
    const fireBtn = !!MobileSettings.get('fireButton');
    const runBtn = !!MobileSettings.get('runButton');

    // 기본 버튼 위치 (오른쪽 또는 왼쪽 하단)
    const pX = lefty ? (r1 + 22 + sa.left) : (W - r1 - 22 - sa.right);
    // 작은 화면에서는 버튼 간격 더 좁게
    const gap = r1 * 2 + (minD < 500 ? 8 : 14);
    let y = H - r1 - 26 - sa.bottom;
    this.buttonFire = fireBtn ? { x: pX, y, r: r1 } : null; if (fireBtn) y -= gap;
    this.buttonReload = { x: pX, y, r: r1 }; y -= gap;
    this.buttonWeapon = { x: pX, y, r: r1 }; y -= gap;
    this.buttonRun = runBtn ? { x: pX, y, r: r1 } : null;

    // 이동 스틱 위치 (좌측 하단) - 가로모드에서는 더 넓게
    const baseRMin = minD <= 400 ? 48 : 54;
    const baseRMax = minD >= 800 ? 82 : 72;
    const baseR = Math.max(this.maxRadius, clamp(Math.round(minD * (isLandscape ? 0.12 : 0.11)), baseRMin, baseRMax));
    const moveSideX = lefty ? (W - baseR - 50 - sa.right) : (baseR + 50 + sa.left);
    this._moveBase = { x: moveSideX, y: H - baseR - 64 - sa.bottom, r: baseR };

    // 보조 버튼들 (상단 좌측) - 작은 화면에서는 더 좌측으로
    const sGap = r2 * 2 + (minD < 500 ? 6 : 8);
    const sX = r2 + (minD < 500 ? 10 : 12) + sa.left;
    const sY = r2 + (minD < 500 ? 10 : 12) + sa.top + (isLandscape ? 0 : 8);
    this.buttonZoomOut = { x: sX,            y: sY, r: r2 };
    this.buttonZoomIn  = { x: sX + sGap,     y: sY, r: r2 };
    this.buttonBoard   = { x: sX + sGap * 2, y: sY, r: r2 };
    this.buttonOrient  = { x: sX + sGap * 3, y: sY, r: r2 };
    this.buttonSettings= { x: sX + sGap * 4, y: sY, r: r2 };
    this.buttonAutoFire= { x: sX + sGap * 5, y: sY, r: r2 };
    // 퀵챗 버튼 (상단 우측 보조줄) - buttonAutoFire 다음에 배치
    this.buttonQuickChat = { x: sX + sGap * 6, y: sY, r: r2 };

    this._btnR = r1;
    this._lefty = lefty;
    this._auxBottom = sY + r2 + 8;
  },

  // move side = left half (lefty: right half)
  _isMoveSide(clientX) {
    const mid = window.innerWidth / 2;
    return this._lefty ? (clientX >= mid) : (clientX < mid);
  },

  _inButton(t, b) {
    if (!b) return false;
    const hr = b.r * this._btnHitScale;
    return dist(t.clientX, t.clientY, b.x, b.y) <= hr;
  },

  // move/aim 슬롯 배정 헬퍼(시작 또는 핀치 종료 시 재사용)
  _beginMove(t) {
    if (this._moveId !== null) return;
    this._moveId = t.identifier;
    const fixed = MobileSettings.get('stickMode') === 'fixed';
    if (fixed && this._moveBase) {
      const near = dist(t.clientX, t.clientY, this._moveBase.x, this._moveBase.y) <= this._moveBase.r * 1.35;
      if (near) {
        this._moveOX = this._moveCX = this._moveBase.x;
        this._moveOY = this._moveCY = this._moveBase.y;
      } else {
        this._moveOX = this._moveCX = t.clientX;
        this._moveOY = this._moveCY = t.clientY;
      }
    } else {
      this._moveOX = this._moveCX = t.clientX;
      this._moveOY = this._moveCY = t.clientY;
    }
  },
  _beginAim(t) {
    if (this._aimId !== null) return;
    this._aimId = t.identifier;
    this._aimOX = this._aimCX = t.clientX;
    this._aimOY = this._aimCY = t.clientY;
  },
  // 핀치 종료 등으로 move/aim 슬롯이 비었을 때 남은 터치로 재배정(조작 손실 방지)
  _reassignTouches(e) {
    for (const t of e.touches) {
      if (this._moveId === null && this._isMoveSide(t.clientX)) this._beginMove(t);
      else if (this._aimId === null && !this._isMoveSide(t.clientX)) this._beginAim(t);
    }
  },
  _findTouch(list, id) { return [...list].find((t) => t.identifier === id) || null; },

  _assignedIds() {
    return new Set([this._moveId, this._aimId, this._fireId,
      this._zoomInId, this._zoomOutId].filter((x) => x != null));
  },
  _pinchPair(e) {
    const excl = this._assignedIds();
    const cand = [...e.touches].filter((t) => !excl.has(t.identifier));
    return cand.length >= 2 ? [cand[0], cand[1]] : null;
  },

  _onStart(e) {
    e.preventDefault();
    Input.note('touch');
    this._layout();
    const fireBtn = !!MobileSettings.get('fireButton');
    const combat = this._combatEnabled;
    const scheme = MobileSettings.get('scheme') || 'dual';

    for (const t of e.changedTouches) {
      // 보조 버튼은 항상
      if (this._inButton(t, this.buttonZoomIn))  { this._zoomInId = t.identifier; Input.touch.zoomIn = true;  this._zoom(ZOOM_STEP); continue; }
      if (this._inButton(t, this.buttonZoomOut)) { this._zoomOutId = t.identifier; Input.touch.zoomOut = true; this._zoom(1 / ZOOM_STEP); continue; }
      if (this._inButton(t, this.buttonSettings)){ SettingsPanel.toggle(); continue; }
      if (this._inButton(t, this.buttonOrient))  { if (this._onOrient) this._onOrient(); continue; }
      if (this._inButton(t, this.buttonBoard))   { this._boardOpen = !this._boardOpen; Input.touch.boardOpen = this._boardOpen; continue; }
      if (this._inButton(t, this.buttonQuickChat)) {
        this._toggleQuickChat();
        continue;
      }

      // 미니맵 영역 확인 (우상단) - 롱프레스로 핑
      if (this._onMapPing && this._isInMinimap(t.clientX, t.clientY)) {
        this._pingTouchId = t.identifier;
        this._pingStartTime = performance.now();
        this._pingStarted = false;
        continue;
      }

      if (!combat) continue; // 사망 중 전투 입력 무시

      // 캐주얼 모드: 스틱 없이 화면 탭만으로 이동 목표 설정
      if (scheme === 'casual') {
        if (this._inButton(t, this.buttonReload)) { Input.touch.reloadEdge = true; continue; }
        if (this._inButton(t, this.buttonWeapon)) { if (this._onSwitchWeapon) this._onSwitchWeapon(); continue; }
        if (this._inButton(t, this.buttonRun))    { this._runToggle = !this._runToggle; continue; }

        // 수류탄 버튼 (듀얼/캐주얼 공통) — _getGrenadeBtn()으로 위치 일원화
        if (this._inButton(t, this._getGrenadeBtn()) && this._onThrowGrenade) {
          this._grenadeId = t.identifier;
          this._onThrowGrenade(t.clientX, t.clientY);
          continue;
        }

        // 화면 탭 → 이동 목표 설정 + 햅틱 피드백
        this._casualTapActive = true;
        this._setCasualTarget(t.clientX, t.clientY, this._camera);
        // 캐주얼 모드 탭 시 짧게 진동
        if (MobileSettings.get('vibration') && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(15); } catch { /* 무시 */ }
        }
        continue;
      }

      // 한손 모드: 화면 아무 곳이나 터치 시 자동 플레이 활성화
      if (scheme === 'onehand') {
        if (this._inButton(t, this.buttonReload)) { Input.touch.reloadEdge = true; continue; }
        if (this._inButton(t, this.buttonWeapon)) { if (this._onSwitchWeapon) this._onSwitchWeapon(); continue; }

        // 수류탄 버튼
        if (this._inButton(t, this._getGrenadeBtn()) && this._onThrowGrenade) {
          this._grenadeId = t.identifier;
          this._onThrowGrenade(t.clientX, t.clientY);
          continue;
        }

        // 화면 아무 곳 터치 → 자동 모드 활성화 (moveId 설정하여 active=true로)
        this._beginMove(t);
        // 활성 상태를 즉시 설정 — _syncOnehand는 rAF 루프에서 self/entities와 함께 값을 설정
        Input.touch.active = true;
        Input.note('touch');
        // 햅틱 피드백
        if (MobileSettings.get('vibration') && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(15); } catch { /* 무시 */ }
        }
        continue;
      }

      // 듀얼 스틱 모드
      if (this._inButton(t, this.buttonReload))  { Input.touch.reloadEdge = true; continue; }
      if (this._inButton(t, this.buttonWeapon))  { if (this._onSwitchWeapon) this._onSwitchWeapon(); continue; }
      if (fireBtn && this._inButton(t, this.buttonFire)) { this._fireId = t.identifier; continue; }
      if (this._inButton(t, this.buttonRun))     { this._runToggle = !this._runToggle; continue; }
      // 수류탄 버튼 (듀얼/캐주얼 모두)
      if (this._inButton(t, this._getGrenadeBtn()) && this._onThrowGrenade) {
        this._grenadeId = t.identifier;
        this._onThrowGrenade(t.clientX, t.clientY);
        continue;
      }
      // 자동발사 토글 버튼
      if (this._inButton(t, this.buttonAutoFire)) {
        MobileSettings.set('autoFire', !MobileSettings.get('autoFire'));
        Sound.play('click');
        continue;
      }

      // 좌/우 반 스틱 배정(헬퍼)
      const moveSide = this._isMoveSide(t.clientX);
      if (moveSide) this._beginMove(t);
      else this._beginAim(t);
      // 슬롯 점유/반대 반 → 무시 (순서 배정으로 뺏지 않음)
    }

    if (!this._pinchActive) {
      const pair = this._pinchPair(e);
      if (pair) this._beginPinch(pair);
    }
    // 캐주얼/한손 모드: _sync 생략 (main.js step()의 rAF에서 self 포함 호출)
    // _onStart에서 _sync를 호출하면 self/entities/mydId가 전달되지 않아
    // _syncOnehand가 self=undefined로 움직임을 0으로 초기화함
    if (scheme !== 'casual' && scheme !== 'onehand') this._sync();
  },

  _onMove(e) {
    e.preventDefault();
    Input.note('touch');
    if (this._pinchActive) { this._updatePinch(e); return; }
    const scheme = MobileSettings.get('scheme') || 'dual';
    for (const t of e.changedTouches) {
      if (t.identifier === this._moveId) { this._moveCX = t.clientX; this._moveCY = t.clientY; }
      else if (t.identifier === this._aimId) { this._aimCX = t.clientX; this._aimCY = t.clientY; }
      // 핑 롱프레스 체크
      else if (t.identifier === this._pingTouchId && !this._pingStarted) {
        if (performance.now() - this._pingStartTime > 300) {
          this._pingStarted = true;
          this._doPing(t.clientX, t.clientY);
          if (typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(20); } catch { /* 무시 */ }
          }
        }
      }
    }
    // 캐주얼 모드 & 한손 모드: _sync 생략 (main.js step()의 rAF에서 처리)
    if (scheme !== 'casual' && scheme !== 'onehand') this._sync();
  },

  _onEnd(e) {
    e.preventDefault();
    if (this._pinchActive) {
      const a = this._findTouch(e.touches, this._pinchId1);
      const b = this._findTouch(e.touches, this._pinchId2);
      if (!a || !b) {
        this._pinchActive = false;
        this._pinchId1 = this._pinchId2 = null;
        this._moveId = null; this._aimId = null; // 핀치 중 해제된 슬롯 → 남은 터치로 재배정
        this._aimLatched = false; this._sprintLatched = false;
        this._reassignTouches(e);
      }
      return;
    }
    for (const t of e.changedTouches) {
      if (t.identifier === this._zoomInId)       { this._zoomInId = null;  Input.touch.zoomIn = false; }
      else if (t.identifier === this._zoomOutId) { this._zoomOutId = null; Input.touch.zoomOut = false; }
      else if (t.identifier === this._fireId)    { this._fireId = null; }
      else if (t.identifier === this._moveId)    { this._moveId = null; this._sprintLatched = false; }
      else if (t.identifier === this._aimId)     { this._aimId = null; this._aimLatched = false; }
      else if (t.identifier === this._pingTouchId) {
        if (!this._pingStarted && this._onMapPing) {
          // 짧은 탭 = 여기 핑
          this._doPing(t.clientX, t.clientY);
        }
        this._pingTouchId = null;
        this._pingStarted = false;
      }
      // 수류탄 버튼 터치 종료 (루프 내부에서 처리)
      if (t.identifier === this._grenadeId) {
        this._grenadeId = null;
      }
    }

    // 캐주얼 모드: 터치 종료 → 이동 목표 유지 (움직임 지속)
    const scheme = MobileSettings.get('scheme') || 'dual';
    if (scheme === 'casual') {
      this._casualTapActive = false;
      // _sync 호출 생략 — main.js step()의 rAF 루프에서 _sync(latest.entities, Net.yourId, self)로
      // 올바른 self 파라미터로 업데이트되므로, 여기서 호출하면 self=undefined로 firing이 false가 됨
      return;
    }
    // 한손 모드: 터치 종료 시 자동 모드 해제 (다음 프레임에서 _syncOnehand가 정지 처리)
    if (scheme === 'onehand') {
      this._sync(); // 이동/발사 정지
      return;
    }
    this._sync();
  },

  _beginPinch(pair) {
    this._pinchActive = true;
    this._pinchId1 = pair[0].identifier; this._pinchId2 = pair[1].identifier;
    this._pinchDist = Math.hypot(pair[1].clientX - pair[0].clientX, pair[1].clientY - pair[0].clientY);
    this._moveId = null; this._aimId = null;
    this._aimLatched = false; this._sprintLatched = false;
    Input.touch.moveX = 0; Input.touch.moveY = 0;
    Input.touch.aiming = false; Input.touch.firing = false;
  },
  _updatePinch(e) {
    const a = this._findTouch(e.touches, this._pinchId1);
    const b = this._findTouch(e.touches, this._pinchId2);
    if (!a || !b) return;
    const d = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    if (this._pinchDist > 0 && d > 0) {
      this._zoom(clamp(d / this._pinchDist, 0.6, 1.6));
      this._pinchDist = d;
    }
  },

  _sync(entities, myId, self) {
    const t = Input.touch;
    const scheme = MobileSettings.get('scheme') || 'dual';

    // 캐주얼 모드: 원핑거 탭이동 + 자동조준/사격
    if (scheme === 'casual') {
      this._syncCasual(t, entities, myId, self);
      return;
    }

    // 한손 모드: 완전 자동화 (터치 중일 때만 작동)
    if (scheme === 'onehand') {
      this._syncOnehand(t, entities, myId, self);
      return;
    }

    // 듀얼 스틱 모드 (기존 로직)
    t.active = (this._moveId !== null || this._aimId !== null || this._fireId !== null);
    t.sessionActive = t.active || t.reloadEdge;
    if (t.active) Input.note('touch');

    const runToggleOn = this._runToggle && !!MobileSettings.get('runButton');
    if (this._moveId !== null && this._combatEnabled) {
      let dx = this._moveCX - this._moveOX, dy = this._moveCY - this._moveOY;
      const d = Math.hypot(dx, dy), cap = Math.min(d, this.maxRadius);
      const mag = cap / this.maxRadius;
      if (mag < MOVE_DZ) {
        t.moveX = 0; t.moveY = 0;
      } else {
        const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
        // 데드존 재매핑
        const adj = (mag - MOVE_DZ) / (1 - MOVE_DZ);
        t.moveX = nx * adj; t.moveY = ny * adj;
      }
      // sprint 히스테리시스
      if (this._sprintLatched) this._sprintLatched = mag >= SPR_OUT;
      else this._sprintLatched = mag >= SPR_IN;
      t.sprint = runToggleOn || this._sprintLatched;
    } else {
      t.moveX = 0; t.moveY = 0; t.sprint = runToggleOn;
      this._sprintLatched = false;
    }

    if (this._aimId !== null && this._combatEnabled) {
      const dx = this._aimCX - this._aimOX, dy = this._aimCY - this._aimOY;
      const frac = Math.hypot(dx, dy) / this.maxRadius;
      if (this._aimLatched) {
        if (frac < AIM_OUT) this._aimLatched = false;
      } else {
        if (frac > AIM_IN) this._aimLatched = true;
      }
      if (this._aimLatched) { t.aiming = true; t.aimX = dx; t.aimY = dy; }
      else t.aiming = false;
    } else {
      t.aiming = false;
      this._aimLatched = false;
    }

    const separateFire = !!MobileSettings.get('fireButton') && !MobileSettings.get('autoFire');
    t.firing = this._combatEnabled && ((t.aiming && !separateFire) || (this._fireId !== null));
  },

  // 한손 모드: 완전 자동화 플레이 (화면 터치 중일 때만 작동)
  // 자동 조준/이동/사격/무기전환/수류탄 — 한손가락만으로도 게임 플레이 가능
  _syncOnehand(t, entities, myId, self) {
    const validEntities = Array.isArray(entities) ? entities : [];
    // 터치가 있는지 확인 — 화면을 손가락으로 누르고 있는 동안 자동 모드
    t.active = !!(this._moveId !== null || this._aimId !== null || this._fireId !== null);
    t.sessionActive = t.active || t.reloadEdge;

    if (!self || !self.alive || !t.active) {
      // 터치가 없거나 플레이어가 죽었으면 정지
      // 속도/크기 초기화 (angular smoothing+speed envelope 방식)
      this._moveSpeed = 0;
      this._smoothMag = 0;
      t.moveX = 0; t.moveY = 0; t.aiming = false; t.firing = false; t.sprint = false;
      return;
    }

    const ONEHAND = CONFIG.CONTROLS.ONEHAND;
    const aggression = MobileSettings.get('onehandAggressiveness') || 0.7;
    const now = performance.now();

    // 1. 최적 타겟 선택 (위협도 기반) — 타겟 락으로 빠른 전환 방지
    let target = null;
    if (MobileSettings.get('onehandAutoAim')) {
      target = this._findBestTarget(validEntities, myId, self);
      // 타겟 락: 현재 락된 타겟이 여전히 유효하고 멀지 않으면 유지
      if (this._lockedTargetId != null) {
        const locked = validEntities.find((e) => e.id === this._lockedTargetId && e.alive);
        if (locked) {
          const dToLocked = dist(locked.x, locked.y, self.x, self.y);
          const dToBest = target ? dist(target.x, target.y, self.x, self.y) : Infinity;
          // 베스트가 현재 락보다 20% 이상 가깝지 않으면 락 유지
          if (dToLocked < dToBest * 1.2 && dToLocked < 500) {
            target = locked;
          }
        }
      }
      this._lockedTargetId = target ? target.id : null;
    } else {
      this._lockedTargetId = null;
    }

    // 2. 자동 조준 — 타겟이 있으면 예측 조준 (부드러운 보간 적용)
    let rawAimX = 0, rawAimY = 0;
    let shouldAim = false;
    if (target && MobileSettings.get('onehandAutoAim')) {
      const d = dist(target.x, target.y, self.x, self.y);
      const weapon = WEAPONS[self.weaponKey] || WEAPONS.pistol;
      const tof = d / weapon.bulletSpeed;
      const leadFactor = ONEHAND.PREDICT_LEAD_FACTOR;
      const px = target.x + (target.vx || 0) * tof * leadFactor;
      const py = target.y + (target.vy || 0) * tof * leadFactor;
      const aimAng = Math.atan2(py - self.y, px - self.x);
      rawAimX = Math.cos(aimAng);
      rawAimY = Math.sin(aimAng);
      shouldAim = true;
    } else if (target) {
      const aimAng = Math.atan2(target.y - self.y, target.x - self.x);
      rawAimX = Math.cos(aimAng);
      rawAimY = Math.sin(aimAng);
      shouldAim = true;
    }
    // 조준 방향 지수 평활화 (높은 계수로 빠른 반응 + 미세지터 제거)
    const AIM_SMOOTH_K = 0.50;
    if (this._smoothAimX === undefined) {
      this._smoothAimX = rawAimX || Math.cos(self.angle);
      this._smoothAimY = rawAimY || Math.sin(self.angle);
    }
    if (shouldAim) {
      this._smoothAimX += (rawAimX - this._smoothAimX) * AIM_SMOOTH_K;
      this._smoothAimY += (rawAimY - this._smoothAimY) * AIM_SMOOTH_K;
      const aimLen = Math.hypot(this._smoothAimX, this._smoothAimY);
      if (aimLen > 0.01) {
        t.aimX = this._smoothAimX / aimLen;
        t.aimY = this._smoothAimY / aimLen;
      } else {
        t.aimX = rawAimX;
        t.aimY = rawAimY;
      }
      t.aiming = true;
    } else {
      const moveLen = Math.hypot(t.moveX || 0, t.moveY || 0);
      if (moveLen > 0.1) {
        t.aimX = t.moveX; t.aimY = t.moveY;
      } else {
        t.aimX = Math.cos(self.angle); t.aimY = Math.sin(self.angle);
      }
      t.aiming = moveLen > 0.1;
    }

    // 3. 자동 이동 — 존/장애물 회피, 타겟 추적/회피
    let rawMoveX = 0, rawMoveY = 0;
    let shouldSprint = false;

    if (MobileSettings.get('onehandAutoMove')) {
      // 3-1. 존 회피 (최우선) — 히스테리시스로 플립플랍 방지
      const zoneCenter = {
        x: this._zoneCenterX != null ? this._zoneCenterX : CONFIG.WORLD_SIZE / 2,
        y: this._zoneCenterY != null ? this._zoneCenterY : CONFIG.WORLD_SIZE / 2,
      };
      const distToZoneCenter = dist(self.x, self.y, zoneCenter.x, zoneCenter.y);
      const estimatedZoneRadius = this._latestZoneRadius || (CONFIG.WORLD_SIZE * 0.4);
      const zoneEdgeDist = estimatedZoneRadius - distToZoneCenter;
      const ZONE_AVOID_IN = ONEHAND.OBSTACLE_AVOID_DIST * 2;      // 진입 (120px)
      const ZONE_AVOID_OUT = ONEHAND.OBSTACLE_AVOID_DIST * 3;     // 이탈 (180px) — 히스테리시스

      if (this._zoneAvoidActive === undefined) this._zoneAvoidActive = false;
      if (!this._zoneAvoidActive && zoneEdgeDist < ZONE_AVOID_IN) this._zoneAvoidActive = true;
      else if (this._zoneAvoidActive && zoneEdgeDist > ZONE_AVOID_OUT) this._zoneAvoidActive = false;

      if (this._zoneAvoidActive) {
        // 존 경계에 가까우면 존 중심으로 이동
        const toCenterX = zoneCenter.x - self.x;
        const toCenterY = zoneCenter.y - self.y;
        const toCenterLen = Math.hypot(toCenterX, toCenterY);
        if (toCenterLen > 10) {
          rawMoveX = toCenterX / toCenterLen;
          rawMoveY = toCenterY / toCenterLen;
          shouldSprint = true;
        }
      } else if (target) {
        // 3-2. 타겟 기반 이동 (공격성에 따라 거리 결정)
        const d = dist(target.x, target.y, self.x, self.y);
        const weapon = WEAPONS[self.weaponKey] || WEAPONS.pistol;
        const optimalRange = this._getOptimalRange(weapon, aggression);

        const dx = target.x - self.x;
        const dy = target.y - self.y;
        const toTargetLen = Math.hypot(dx, dy);

        if (d > optimalRange * 1.2) {
          // 너무 멀면 접근
          rawMoveX = dx / toTargetLen;
          rawMoveY = dy / toTargetLen;
          shouldSprint = aggression > 0.5;
        } else if (d < optimalRange * 0.5) {
          // 너무 가까우면 후퇴 + 스트레이프
          const retreatX = -dx / toTargetLen;
          const retreatY = -dy / toTargetLen;
          // 스트레이프 방향: target.id 기반 시드 + 프레임 카운터로 부드럽게
          // 스트레이프: 랜덤 지속시간 (2~6초)으로 예측 불가능하게
          if (this._strafeDuration === undefined) this._strafeDuration = 120 + Math.random() * 240;
          if (this._strafeFlipFrame === undefined) this._strafeFlipFrame = 0;
          this._strafeFlipFrame++;
          if (this._strafeFlipFrame >= this._strafeDuration) {
            this._strafeDuration = 120 + Math.random() * 240;
            this._strafeFlipFrame = 0;
          }
          const strafeSeed = target.id != null ? target.id : 0;
          const strafePhase = Math.floor(this._strafeFlipFrame / (this._strafeDuration / 2)) % 2 === 0 ? 1 : -1;
          const perpX = -dy / toTargetLen * strafePhase;
          const perpY = dx / toTargetLen * strafePhase;
          rawMoveX = retreatX * 0.3 + perpX * 0.7;
          rawMoveY = retreatY * 0.3 + perpY * 0.7;
          shouldSprint = true;
        } else {
          // 적정 거리: 스트레이프 (좌우 움직이며 회피) — 프레임 카운터 기반
          // 스트레이프: 랜덤 지속시간 (2~6초)으로 예측 불가능하게
          if (this._strafeDuration === undefined) this._strafeDuration = 120 + Math.random() * 240;
          if (this._strafeFlipFrame === undefined) this._strafeFlipFrame = 0;
          this._strafeFlipFrame++;
          if (this._strafeFlipFrame >= this._strafeDuration) {
            this._strafeDuration = 120 + Math.random() * 240;
            this._strafeFlipFrame = 0;
          }
          const strafeSeed = target.id != null ? target.id : 0;
          const strafePhase = Math.floor(this._strafeFlipFrame / (this._strafeDuration / 2)) % 2 === 0 ? 1 : -1;
          const perpX = -dy / toTargetLen * strafePhase;
          const perpY = dx / toTargetLen * strafePhase;
          rawMoveX = perpX;
          rawMoveY = perpY;
        }

        // 장애물 회피: 장애물 근처일 때만 회피 방향 캐싱 (프레임당 지터 방지)
        if (rawMoveX !== 0 || rawMoveY !== 0) {
          const avoidDir = this._getCachedAvoidDir(self.x, self.y, rawMoveX, rawMoveY, now);
          rawMoveX = avoidDir.nx;
          rawMoveY = avoidDir.ny;
        }
      } else if (MobileSettings.get('onehandAutoAim') === false) {
        rawMoveX = 0; rawMoveY = 0;
      } else {
        // 타겟 없음 — 존 중심으로 천천히 이동하며 대기
        const toCenterX = zoneCenter.x - self.x;
        const toCenterY = zoneCenter.y - self.y;
        const toCenterLen = Math.hypot(toCenterX, toCenterY);
        if (toCenterLen > 100) {
          rawMoveX = (toCenterX / toCenterLen) * 0.5;
          rawMoveY = (toCenterY / toCenterLen) * 0.5;
        }
      }
    }

    // === 각도 기반 이동 평활화 (Angular Smoothing) + 속도 포락선 (Speed Envelope) ===
    // Component-wise smoothing은 방향 전환 시 magnitude가 줄어드는 문제가 있음.
    // Angular smoothing은 각도를 부드럽게 변화시키면서 magnitude를 보존하여 자연스러운 움직임 구현.
    
    const rawAngle = Math.atan2(rawMoveY, rawMoveX);
    const rawMag = Math.hypot(rawMoveX, rawMoveY);
    
    // Smooth state 초기화
    if (this._smoothMoveAngle === undefined) {
      this._smoothMoveAngle = rawMag > 0.01 ? rawAngle : (self ? Math.atan2(self.vy || 0, self.vx || 0) : 0);
      this._smoothMag = 0;
      this._moveSpeed = 0;
    }
    
    // 각도 평활화 (Angular lerp with shortest arc)
    const ANGLE_SMOOTH_K = 0.20; // 20% per frame → ~5 frames to converge
    if (rawMag > 0.01) {
      const diff = Math.atan2(Math.sin(rawAngle - this._smoothMoveAngle), Math.cos(rawAngle - this._smoothMoveAngle));
      this._smoothMoveAngle += diff * ANGLE_SMOOTH_K;
    }
    // rawMag=0이면 마지막 각도 유지 (방향 기억)
    
    // 크기 평활화
    const MAG_SMOOTH_K = 0.30;
    this._smoothMag += (rawMag - this._smoothMag) * MAG_SMOOTH_K;
    if (this._smoothMag < 0.01 && rawMag === 0) this._smoothMag = 0;
    
    // 속도 포락선: 가속/감속 (급정지/급발진 방지)
    const ACCEL = 0.06;  // 초당 3.6 → 약 16프레임 만에 최고속도
    const DECEL = 0.12;  // 초당 7.2 → 약 8프레임 만에 정지 (감속 빠르게)
    const targetSpeed = clamp(this._smoothMag, 0, 1);
    if (targetSpeed > this._moveSpeed) {
      this._moveSpeed = Math.min(this._moveSpeed + ACCEL, targetSpeed);
    } else if (targetSpeed < this._moveSpeed) {
      this._moveSpeed = Math.max(this._moveSpeed - DECEL, targetSpeed);
    }
    if (this._moveSpeed < 0.005) this._moveSpeed = 0;
    
    // 최종 출력: (각도 × 속도)로 벡터 구성
    const finalMag = this._moveSpeed;
    t.moveX = Math.cos(this._smoothMoveAngle) * finalMag;
    t.moveY = Math.sin(this._smoothMoveAngle) * finalMag;
    t.sprint = shouldSprint;

    // 4. 자동 무기 전환 (거리 기반)
    if (MobileSettings.get('onehandAutoWeapon') && target && self.ownedWeapons) {
      const d = dist(target.x, target.y, self.x, self.y);
      const owned = Array.isArray(self.ownedWeapons) ? self.ownedWeapons : [...self.ownedWeapons];

      // 거리별 최적 무기
      if (d < 150 && owned.includes('shotgun')) {
        this._switchToWeapon('shotgun');
      } else if (d < 350 && owned.includes('smg')) {
        this._switchToWeapon('smg');
      } else if (d >= 350 && owned.includes('pistol')) {
        this._switchToWeapon('pistol');
      }
    }

    // 5. 자동 사격 — 히스테리시스로 사거리 경계에서 stutter 방지
    if (target && t.aiming && MobileSettings.get('autoFire') !== false) {
      const d = dist(target.x, target.y, self.x, self.y);
      const effectiveRange = this._getEffectiveRange(self.weaponKey);
      const FIRE_IN = effectiveRange * 0.92;  // 92%: 사격 시작
      const FIRE_OUT = effectiveRange * 1.03; // 103%: 사격 중단 (히스테리시스)
      if (this._firingLatched === undefined) this._firingLatched = false;
      if (!this._firingLatched && d < FIRE_IN) this._firingLatched = true;
      else if (this._firingLatched && d > FIRE_OUT) this._firingLatched = false;
      t.firing = this._firingLatched;
    } else {
      this._firingLatched = false;
      t.firing = false;
    }

    // 6. 자동 수류탄 (쿨다운 기반)
    if (MobileSettings.get('onehandAutoGrenade') && self.grenadeCount > 0 && target) {
      const d = dist(target.x, target.y, self.x, self.y);
      const now = performance.now() * 0.001;
      if (!this._lastGrenadeTime) this._lastGrenadeTime = 0;
      if (d >= ONEHAND.AUTO_GRENADE_MIN_DIST && d <= ONEHAND.AUTO_GRENADE_MAX_DIST
          && now - this._lastGrenadeTime > ONEHAND.AUTO_GRENADE_COOLDOWN
          && self.health > self.maxHealth * 0.3) {
        this._onThrowGrenade && this._onThrowGrenade(0, 0);
        this._lastGrenadeTime = now;
      }
    }
  },

  // 한손/캐주얼 모드용 무기 최적 사거리 (공격성 반영)
  _getOptimalRange(weapon, aggression) {
    const baseRange = this._getEffectiveRange(weapon.name ? weapon.name.toLowerCase() : 'pistol');
    // 공격성이 높으면 근접, 낮으면 원거리 유지
    return baseRange * (1.2 - 0.4 * aggression);
  },

  // 무기 전환 헬퍼 (한손 모드용) — 서버에 특정 무기로 전환 요청
  _switchToWeapon(key) {
    if (this._lastWeaponSwitch !== key) {
      Net.sendSwitchWeapon(key);
      this._lastWeaponSwitch = key;
    }
  },

  // 존 정보 업데이트 (main.js에서 zone snapshot 수신 시 호출)
  _zoneCenterX: null,
  _zoneCenterY: null,
  _obstacles: [],
  updateZoneInfo(cx, cy, r) {
    this._zoneCenterX = cx;
    this._zoneCenterY = cy;
    this._latestZoneRadius = r;
  },
  // 장애물 정보 업데이트 (main.js step()에서 월드 장애물 전달)
  updateObstacles(obs) {
    this._obstacles = obs || [];
  },

  // 장애물 회피: (x,y)에서 방향 (nx,ny)로 이동 시 장애물과 충돌하는지 확인
  _isBlocked(x, y, nx, ny) {
    const lookahead = CONFIG.PLAYER_RADIUS * 3;
    const testX = x + nx * lookahead;
    const testY = y + ny * lookahead;
    for (const o of this._obstacles) {
      if (o.solid && circleRect(testX, testY, CONFIG.PLAYER_RADIUS, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  },

  // 장애물 회피 방향 탐색: 선호 방향 → 직각 방향 → 원래 방향 (서버 충돌 해결에 의존)
  _findAvoidanceDir(x, y, nx, ny) {
    if (!nx && !ny) return { nx: 0, ny: 0 };
    // 선호 방향 먼저 시도
    if (!this._isBlocked(x, y, nx, ny)) return { nx, ny };
    // 좌/우 스트레이프 시도
    for (const sign of [1, -1]) {
      const strafeNx = -ny * sign;
      const strafeNy = nx * sign;
      if (!this._isBlocked(x, y, strafeNx, strafeNy)) {
        return { nx: strafeNx, ny: strafeNy };
      }
    }
    // 반대 방향 시도
    if (!this._isBlocked(x, y, -nx, -ny)) return { nx: -nx, ny: -ny };
    // 모두 막혀도 원래 방향으로 진행 — 서버/클라 예측의 충돌 해결이 wall sliding 처리
    return { nx, ny };
  },

  // 장애물 회피 방향 캐싱: 마지막 결과를 캐싱하여 프레임당 지터 방지
  // 위치가 크게 변했거나 쿨다운이 지나면 재계산, 그렇지 않으면 캐시된 방향 유지
  _getCachedAvoidDir(x, y, nx, ny, now) {
    if (!this._avoidCache) this._avoidCache = { nx: 0, ny: 0, lastX: 0, lastY: 0, lastTime: 0 };
    const c = this._avoidCache;
    const moved = Math.hypot(x - c.lastX, y - c.lastY) > 15; // 15px 이상 이동 시 재계산
    const expired = now - c.lastTime > 200; // 200ms 마다 재계산
    if (moved || expired) {
      const result = this._findAvoidanceDir(x, y, nx, ny);
      c.nx = result.nx;
      c.ny = result.ny;
      c.lastX = x;
      c.lastY = y;
      c.lastTime = now;
    }
    return { nx: c.nx, ny: c.ny };
  },

  // 캐주얼 모드: 탭한 지점으로 이동 목표 설정, 자동으로 적 추적 + 사격 (고도화 v2)
  // 개선: 위협도 기반 타겟팅, 무기별 최적 사거리, 예측 조준, 자동 무기 전환
  _syncCasual(t, entities, myId, self) {
    // 방어적 체크: entities 배열이 유효한 경우에만 처리
    const validEntities = Array.isArray(entities) ? entities : [];
    t.active = this._casualTapActive || (this._casualTarget !== null);
    t.sessionActive = t.active || t.reloadEdge;

    if (this._casualTarget && self && self.alive) {
      // 이동 목표로부터 이동 벡터 계산
      const dx = this._casualTarget.x - self.x;
      const dy = this._casualTarget.y - self.y;
      const distToTarget = Math.hypot(dx, dy);

      if (distToTarget > 25) {
        t.moveX = clamp(dx / distToTarget, -1, 1);
        t.moveY = clamp(dy / distToTarget, -1, 1);
      } else {
        t.moveX = 0;
        t.moveY = 0;
        this._casualTarget = null;
      }

      // 자동 조준: 위협도 기반 최적 타겟 선정 + 예측 조준
      if (MobileSettings.get('aimAssist')) {
        const target = this._findBestTarget(validEntities, myId, self);
        if (target) {
          // 예측 조준: 타겟 속도 기반으로 선도 사격
          const d = dist(target.x, target.y, self.x, self.y);
          const weapon = WEAPONS[self.weaponKey] || WEAPONS.pistol;
          const tof = d / weapon.bulletSpeed; // 탄 비행 시간
          const leadFactor = 0.6; // 캐주얼 보정 (완벽하지 않게)
          const px = target.x + (target.vx || 0) * tof * leadFactor;
          const py = target.y + (target.vy || 0) * tof * leadFactor;

          const aimAng = Math.atan2(py - self.y, px - self.x);
          t.aimX = Math.cos(aimAng);
          t.aimY = Math.sin(aimAng);
          t.aiming = true;

          // 무기별 최적 사거리로 자동 사격 판정
          const effectiveRange = this._getEffectiveRange(self.weaponKey);
          if (MobileSettings.get('autoFire') && d < effectiveRange) {
            t.firing = true;
          } else {
            t.firing = false;
          }
        } else {
          t.aiming = false;
          t.firing = false;
        }
      } else {
        // aimAssist 없을 때: 이동 방향으로 조준
        const moveLen = Math.hypot(t.moveX, t.moveY);
        if (moveLen > 0.1) {
          t.aimX = t.moveX;
          t.aimY = t.moveY;
          t.aiming = true;
        } else {
          t.aiming = false;
        }
        t.firing = false;
      }
    } else if (self && self.alive) {
      // 이동 목표 없지만 생존 중 — 자동 탐색 모드 (적 발견 시 자동 교전)
      if (MobileSettings.get('autoFire') && MobileSettings.get('aimAssist')) {
        const target = this._findBestTarget(validEntities, myId, self);
        if (target) {
          const d = dist(target.x, target.y, self.x, self.y);
          const effectiveRange = this._getEffectiveRange(self.weaponKey);
          const weapon = WEAPONS[self.weaponKey] || WEAPONS.pistol;
          const tof = d / weapon.bulletSpeed;
          const px = target.x + (target.vx || 0) * tof * 0.5;
          const py = target.y + (target.vy || 0) * tof * 0.5;
          const aimAng = Math.atan2(py - self.y, px - self.x);
          t.aimX = Math.cos(aimAng);
          t.aimY = Math.sin(aimAng);
          t.aiming = true;
          t.firing = d < effectiveRange * 0.8; // 더 보수적 사거리 (이동 중)
        } else {
          t.moveX = 0; t.moveY = 0;
          t.aiming = false; t.firing = false;
        }
      } else {
        t.moveX = 0; t.moveY = 0;
        t.aiming = false; t.firing = false;
      }
    } else {
      t.moveX = 0;
      t.moveY = 0;
      t.aiming = false;
      t.firing = false;
    }

    // 런 버튼 상태 반영
    t.sprint = !!(this._runToggle && MobileSettings.get('runButton'));
  },

  // 무기별 유효 사거리 (자동발사 사거리 판정용)
  _getEffectiveRange(weaponKey) {
    switch (weaponKey) {
      case 'shotgun': return 200;  // 샷건: 근거리
      case 'smg': return 350;      // SMG: 중거리
      case 'pistol': return 430;   // 권총: 원거리
      default: return 430;
    }
  },

  // 위협도 기반 타겟팅: 거리 + 체력 + 이동방향 종합 평가
  _findBestTarget(entities, myId, self) {
    let bestTarget = null;
    let bestScore = Infinity;
    const validEntities = Array.isArray(entities) ? entities : [];
    const maxRange = 500; // 탐색 범위

    for (const e of validEntities) {
      if (e.id === myId || !e.alive) continue;
      const d = dist(e.x, e.y, self.x, self.y);
      if (d > maxRange) continue;

      // 위협도 스코어: 낮을수록 우선 타겟
      let score = d;
      // 저체력 적 선호 (처치하기 쉬운)
      if (e.health < e.maxHealth * 0.4) score *= 0.7;
      // 나를 향해 이동하는 적 가산 (직접적 위협)
      if (e.vx || e.vy) {
        const moveAng = Math.atan2(e.vy || 0, e.vx || 0);
        const toSelfAng = Math.atan2(self.y - e.y, self.x - e.x);
        const angDiff = Math.abs(Math.atan2(Math.sin(moveAng - toSelfAng), Math.cos(moveAng - toSelfAng)));
        if (angDiff < 0.5) score *= 0.8;
      }
      if (score < bestScore) { bestScore = score; bestTarget = e; }
    }
    return bestTarget;
  },

  // 하위 호환용 (기존 _findNearestEnemy 유지)
  _findNearestEnemy(entities, myId, self) {
    return this._findBestTarget(entities, myId, self);
  },

  // 캐주얼 모드 타겟 설정
  _setCasualTarget(clientX, clientY, camera) {
    if (!camera) return;
    const z = camera.zoom;
    this._casualTarget = {
      x: clientX / z + camera.x,
      y: clientY / z + camera.y
    };
  },

  // 미니맵 영역 확인 (우상단)
  _isInMinimap(clientX, clientY) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const minD = Math.min(W, H);
    const isLandscape = W > H;
    const size = minD < 450 ? 80 : (isLandscape ? 96 : 104);
    const pad = minD < 500 ? 12 : 16;
    const mx = W - size - pad;
    const my = pad;
    return clientX >= mx && clientX <= mx + size &&
           clientY >= my && clientY <= my + size;
  },

  // 미니맵 좌표 → 월드 좌표로 변환하여 핑 전송
  _doPing(clientX, clientY) {
    if (!this._camera || !this._onMapPing) return;
    const W = window.innerWidth;
    const minD = Math.min(W, window.innerHeight);
    const isLandscape = W > window.innerHeight;
    const size = minD < 450 ? 80 : (isLandscape ? 96 : 104);
    const pad = minD < 500 ? 12 : 16;
    const mx = W - size - pad;
    const my = pad;
    const scale = size / CONFIG.WORLD_SIZE;
    const wx = (clientX - mx) / scale;
    const wy = (clientY - my) / scale;
    this._onMapPing(wx, wy, 'here');
  },

  // 퀵챗 패널 토글
  _toggleQuickChat() {
    this._quickChatOpen = !this._quickChatOpen;
    if (this._quickChatOpen) this._showQuickChatPanel();
    else this._removeQuickChatPanel();
  },

  _removeQuickChatPanel() {
    const el = document.getElementById('quickchat-panel');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  _showQuickChatPanel() {
    this._removeQuickChatPanel();
    const panel = document.createElement('div');
    panel.id = 'quickchat-panel';
    panel.style.cssText =
      'position:fixed;bottom:50%;left:50%;transform:translate(-50%,50%);z-index:105;' +
      'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:240px;' +
      'padding:14px;background:rgba(20,24,30,0.95);border-radius:14px;' +
      'border:1px solid rgba(255,255,255,0.12);box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const emotes = ['hello', 'thanks', 'gg', 'sorry', 'help'];
    const emojiMap = { hello: '👋', thanks: '👍', gg: '👏', sorry: '🙏', help: '🆘' };
    for (const type of emotes) {
      const btn = document.createElement('button');
      btn.style.cssText =
        'width:44px;height:44px;border:none;border-radius:10px;' +
        'background:rgba(255,255,255,0.08);color:#fff;font-size:22px;cursor:pointer;' +
        'transition:background 0.1s;';
      btn.textContent = emojiMap[type] || '👋';
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Net.sendEmote 호출 (main.js import 필요 - 직접 호출)
        this._onEmote && this._onEmote(type);
        this._toggleQuickChat();
      });
      panel.appendChild(btn);
    }

    document.body.appendChild(panel);
  },

  // 퀵챗 그리기 (보조 버튼 영역)
  _drawQuickChat(ctx, button) {
    if (!button) return;
    const r = button.r;
    ctx.save();
    ctx.fillStyle = this._quickChatOpen ? 'rgba(255,210,63,0.8)' : 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.arc(button.x, button.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // 채팅 아이콘 (말풍선)
    drawIcon(ctx, 'chat', button.x, button.y, r * 1.2, this._quickChatOpen ? '#20242b' : '#fff');
  },

  // 자동발사 토글 버튼 그리기
  _drawAutoFireBtn(ctx, button) {
    if (!button) return;
    const r = button.r;
    const autoOn = MobileSettings.get('autoFire');
    ctx.save();
    ctx.fillStyle = autoOn ? 'rgba(255,210,63,0.8)' : 'rgba(100,100,100,0.5)';
    ctx.beginPath(); ctx.arc(button.x, button.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // A / M 텍스트
    ctx.save();
    ctx.fillStyle = autoOn ? '#20242b' : '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(autoOn ? 'A' : 'M', button.x, button.y);
    ctx.restore();
  },

  endFrame() { Input.touch.reloadEdge = false; },

  // 수류탄 버튼 위치 계산 (화면 좌표) — 반응형으로 다른 버튼과 겹침 방지
  _getGrenadeBtn() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safeRight = this._safe?.right || 0;
    const safeBottom = this._safe?.bottom || 0;
    const minD = Math.min(W, H);
    // 작은 화면에서는 더 작은 버튼
    const r = minD < 500 ? 28 : 34;
    // 듀얼 스틱 모드: action 버튼 상단에 배치 (겹침 방지)
    // 캐주얼 모드: 우하단 고정
    const scheme = MobileSettings.get('scheme') || 'dual';
    if (scheme === 'dual') {
      // action 버튼들 위쪽에 위치 (리로드 버튼 위로)
      const y = H - r - 26 - safeBottom - (r * 2 + (minD < 500 ? 8 : 14)) * 2.5;
      return { x: W - r - 16 - safeRight, y: Math.min(y, H - r * 5 - safeBottom), r };
    }
    return { x: W - r - 16 - safeRight, y: H - r - 16 - safeBottom, r };
  },

  draw(ctx, opts = {}) {
    if (!Input.touch.enabled) return;
    // dirty 플래그로 _layout() 호출 최소화 — 매 프레임 계산 대신 이벤트 기반 갱신
    if (this._layoutDirty || !this._moveBase) { this._layout(); this._layoutDirty = false; }
    const opa = clamp(Number(MobileSettings.get('stickOpacity')) || 0.85, 0.35, 1);
    const showCombat = opts.combat !== false && this._combatEnabled;
    const showAux = opts.aux !== false;
    const scheme = MobileSettings.get('scheme') || 'dual';
    const self = opts.self; // 수류탄 버튼 표시용

    ctx.save();
    ctx.globalAlpha = opa;

    // 한손 모드: 대부분의 버튼 숨김 (설정, 줌, 수류탄만 남김)
    if (scheme === 'onehand') {
      if (showAux) {
        this._drawButton(ctx, this.buttonZoomOut, 'zoomOut', Input.touch.zoomOut, 'minor');
        this._drawButton(ctx, this.buttonZoomIn,  'zoomIn',  Input.touch.zoomIn, 'minor');
        this._drawButton(ctx, this.buttonSettings,'settings', SettingsPanel.isOpen(), 'minor');
      }
      // 수류탄 버튼 (생존자 + 보유 수류탄 있음)
      if (showCombat && self && self.alive && self.grenadeCount > 0) {
        this._drawGrenadeButton(ctx, true);
      }
      // 자동 모드 인디케이터
      if (showCombat) {
        this._drawOnehandIndicator(ctx, showCombat && self && self.alive && Input.touch.active);
      }
      ctx.restore();
      return;
    }

    if (showAux) {
      this._drawButton(ctx, this.buttonZoomOut, 'zoomOut', Input.touch.zoomOut, 'minor');
      this._drawButton(ctx, this.buttonZoomIn,  'zoomIn',  Input.touch.zoomIn, 'minor');
      this._drawButton(ctx, this.buttonBoard,   'board',   this._boardOpen, 'minor');
      this._drawButton(ctx, this.buttonOrient,  'orient',  false, 'minor');
      this._drawButton(ctx, this.buttonSettings,'settings', SettingsPanel.isOpen(), 'minor');
      this._drawQuickChat(ctx, this.buttonQuickChat);
      // 자동발사 토글 버튼
      this._drawAutoFireBtn(ctx, this.buttonAutoFire);
    }

    // 수류탄 버튼 (생존자 + 보유 수류탄 있음)
    if (showCombat && self && self.alive && self.grenadeCount > 0) {
      this._drawGrenadeButton(ctx, true);
    }

    if (showCombat && scheme === 'dual') {
      // 고정 스틱 고스트
      if (MobileSettings.get('stickMode') === 'fixed' && this._moveBase && this._moveId === null) {
        this._drawStickBase(ctx, this._moveBase.x, this._moveBase.y, this._moveBase.r, 0.22);
      }
      // 비활성 반 힌트(옅은 고스트 — 동적 미사용 시 하단 코너)
      if (MobileSettings.get('stickMode') === 'dynamic' && this._moveId === null && this._moveBase) {
        this._drawStickBase(ctx, this._moveBase.x, this._moveBase.y, this.maxRadius, 0.12);
      }

      if (this._moveId !== null) this._drawStick(ctx, this._moveOX, this._moveOY, this._moveCX, this._moveCY, 'move');
      if (this._aimId !== null)  this._drawStick(ctx, this._aimOX,  this._aimOY,  this._aimCX,  this._aimCY, 'aim');

      this._drawButton(ctx, this.buttonWeapon, 'weapon', false, 'normal');
      this._drawButton(ctx, this.buttonReload, 'reload', Input.touch.reloadEdge, 'normal');
      if (this.buttonFire) this._drawButton(ctx, this.buttonFire, 'fire', this._fireId !== null, 'fire');
      if (this.buttonRun)  this._drawButton(ctx, this.buttonRun, 'run', this._runToggle, 'run');
    }

    // 캐주얼 모드: 타겟 마커
    if (showCombat && scheme === 'casual' && this._casualTarget) {
      this._drawCasualTarget(ctx, this._casualTarget);
    }

    // 한손 모드: 자동 플레이 표시 + 활성 터치 표시
    if (showCombat && scheme === 'onehand') {
      this._drawOnehandIndicator(ctx, showCombat && self && self.alive && Input.touch.active);
    }

    ctx.restore();
  },

  // 한손 모드 시각적 표시
  _drawOnehandIndicator(ctx, isActive) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safeBottom = this._safe.bottom || 0;

    // 화면 하단 중앙에 인디케이터
    const cx = W / 2;
    const cy = H - 32 - safeBottom;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.005);

    ctx.save();

    // 배경 캡슐
    const capsuleW = 80;
    const capsuleH = 20;
    ctx.fillStyle = isActive ? `rgba(255, 210, 63, ${0.15 * pulse})` : 'rgba(100, 100, 100, 0.15)';
    ctx.beginPath();
    ctx.roundRect(cx - capsuleW / 2, cy - capsuleH / 2, capsuleW, capsuleH, capsuleH / 2);
    ctx.fill();

    // 테두리
    ctx.strokeStyle = isActive ? `rgba(255, 210, 63, ${0.5 * pulse})` : 'rgba(150, 150, 150, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 텍스트
    ctx.fillStyle = isActive ? `rgba(255, 210, 63, ${pulse})` : 'rgba(200, 200, 200, 0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isActive ? 'AUTO' : 'TOUCH', cx, cy);

    // 활성 상태 점 표시 (좌측)
    if (isActive) {
      ctx.fillStyle = `rgba(100, 255, 100, ${pulse})`;
      ctx.beginPath();
      ctx.arc(cx - capsuleW / 2 + 10, cy, 3, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  },

  // 수류탄 버튼 (캐주얼/듀얼 모두) — _getGrenadeBtn()으로 위치 일원화
  _drawGrenadeButton(ctx, hasGrenade) {
    if (!hasGrenade) return;
    const btn = this._getGrenadeBtn();

    ctx.save();
    ctx.fillStyle = 'rgba(220,60,50,0.75)';
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 아이콘
    drawIcon(ctx, 'grenade', btn.x, btn.y, btn.r * 0.7, '#fff');
  },

  // 캐주얼 모드 타겟 마커 (스크린 좌표로 변환)
  _drawCasualTarget(ctx, target) {
    if (!this._camera || !target) return;
    const z = this._camera.zoom;
    const x = (target.x - this._camera.x) * z;
    const y = (target.y - this._camera.y) * z;
    const radius = Math.max(18, 22 * z);

    // 펄스 글로우
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.005);
    ctx.save();
    ctx.shadowColor = 'rgba(255,210,63,0.6)';
    ctx.shadowBlur = 8 + 6 * pulse;

    // 외부 링
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // 내부 링
    ctx.strokeStyle = 'rgba(255,210,63,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.6, 0, TAU);
    ctx.stroke();

    // 중심 점
    ctx.fillStyle = 'rgba(255,210,63,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();

    // 크로스 헤어
    ctx.strokeStyle = 'rgba(255,210,63,0.5)';
    ctx.lineWidth = 1.5;
    const ch = radius + 6;
    ctx.beginPath();
    ctx.moveTo(x, y - ch); ctx.lineTo(x, y - radius + 4);
    ctx.moveTo(x, y + ch); ctx.lineTo(x, y + radius - 4);
    ctx.moveTo(x - ch, y); ctx.lineTo(x - radius + 4, y);
    ctx.moveTo(x + ch, y); ctx.lineTo(x + radius - 4, y);
    ctx.stroke();
    ctx.restore();
  },

  _drawStickBase(ctx, ox, oy, rad, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, rad, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(ox, oy, rad * 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  },

  _drawStick(ctx, ox, oy, cx, cy, kind) {
    let dx = cx - ox, dy = cy - oy;
    const d = Math.hypot(dx, dy), cap = Math.min(d, this.maxRadius);
    const k = d > 0 ? cap / d : 0;
    const hx = ox + dx * k, hy = oy + dy * k;
    const mag = cap / this.maxRadius;
    const sprinting = (kind === 'move') && (this._sprintLatched || (this._runToggle && MobileSettings.get('runButton')));
    const isMove = kind === 'move';
    const baseColor = sprinting ? '#ffd23f' : 'rgba(255,255,255,0.55)';
    const activeColor = sprinting ? '#ffd23f' : 'rgba(255,255,255,0.85)';

    // 외부 링 (베이스)
    ctx.save();
    if (sprinting) { ctx.shadowColor = 'rgba(255,210,63,0.9)'; ctx.shadowBlur = 12; }
    ctx.strokeStyle = sprinting ? 'rgba(255,210,63,0.75)' : 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ox, oy, this.maxRadius, 0, TAU); ctx.stroke();
    ctx.restore();

    // 방향 호 표시 (움직임 방향)
    if (mag > 0.02) {
      ctx.save();
      const ang = Math.atan2(dy, dx);
      ctx.strokeStyle = sprinting ? 'rgba(255,210,63,0.5)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ox, oy, this.maxRadius, ang - 0.5, ang + 0.5); ctx.stroke();
      ctx.restore();
    }

    // 내부 조이스틱 노브
    const padR = this.maxRadius * 0.44;
    const grad = ctx.createRadialGradient(hx - padR * 0.3, hy - padR * 0.3, padR * 0.1, hx, hy, padR);
    grad.addColorStop(0, sprinting ? 'rgba(255,210,63,0.95)' : 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, sprinting ? 'rgba(255,210,63,0.55)' : 'rgba(255,255,255,0.40)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(hx, hy, padR, 0, TAU); ctx.fill();

    // 방향 화살표 (조이스틱 내부)
    if (mag > 0.12) {
      const a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
      ctx.fillStyle = sprinting ? '#20242b' : 'rgba(40,44,52,0.85)';
      ctx.beginPath(); ctx.moveTo(padR * 0.5, 0); ctx.lineTo(-padR * 0.25, -padR * 0.32); ctx.lineTo(-padR * 0.25, padR * 0.32); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // 이동 스틱: 강도 표시 링 (데드존 이상에서만)
    if (isMove && mag > 0.05) {
      ctx.save();
      ctx.strokeStyle = sprinting ? 'rgba(255,210,63,0.3)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, this.maxRadius * 0.3 + this.maxRadius * 0.55 * mag, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  },

  _drawButton(ctx, b, iconName, pressed, kind = 'normal') {
    if (!b) return;
    const r = b.r;
    const isMinor = kind === 'minor';
    const isFire = kind === 'fire';
    const isRun = kind === 'run';
    ctx.save();
    // 프레스 시 글로우 효과
    if (pressed) {
      ctx.shadowColor = isFire ? 'rgba(255,80,60,0.9)' : 'rgba(255,210,63,0.9)';
      ctx.shadowBlur = 12;
    }
    const baseCol = isFire ? 'rgba(220,60,50,0.85)'
      : isRun ? (pressed ? 'rgba(255,210,63,0.85)' : 'rgba(80,150,90,0.7)')
      : isMinor ? (pressed ? 'rgba(255,210,63,0.8)' : 'rgba(0,0,0,0.42)')
      : (pressed ? 'rgba(255,210,63,0.85)' : 'rgba(20,24,30,0.6)');
    const pr = pressed ? r * 1.06 : r;
    const grad = ctx.createRadialGradient(b.x - pr * 0.3, b.y - pr * 0.3, pr * 0.1, b.x, b.y, pr);
    grad.addColorStop(0, isFire ? 'rgba(255,120,100,0.95)' : (pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'));
    grad.addColorStop(1, baseCol);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(b.x, b.y, pr, 0, TAU); ctx.fill();
    ctx.strokeStyle = pressed ? (isFire ? 'rgba(255,180,160,0.8)' : 'rgba(255,210,63,0.7)') : 'rgba(255,255,255,0.40)';
    ctx.lineWidth = pressed ? 2.5 : 2;
    ctx.stroke();
    ctx.restore();
    // 벡터 아이콘
    const iconCol = pressed
      ? (isRun || isFire ? '#20242b' : '#20242b')
      : (isFire ? '#fff' : '#fff');
    drawIcon(ctx, iconName, b.x, b.y, r * 1.15, iconCol);
  },
};
