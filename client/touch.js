// ============================================================
// touch.js - 모바일 듀얼 가상 조이스틱 + 버튼. (client)
// 배정: 화면 좌/우 반 기준(lefty 시 반전). 버튼 히트 우선.
// 고정 스틱: move-half + 베이스 근접 시 고정 원점, 그 외 move-half는 동적 원점.
// 데드존/히스테리시스(이간·조준·스프린트). safe-area 회전 갱신.
// 캐주얼 모드: 원핑거 탭이동 + 자동조준/사격 (aimAssist와 연동).
// ============================================================

import { Input } from './input.js';
import { dist, TAU, clamp } from '../shared/utils.js';
import { CONFIG } from '../shared/config.js';
import { MobileSettings, SettingsPanel } from './mobile.js';
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

function getSafeInsets() {
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
  _runToggle: false,
  _zoomInId: null, _zoomOutId: null,
  buttonReload: null, buttonWeapon: null, buttonFire: null, buttonRun: null,
  buttonBoard: null, buttonOrient: null, buttonSettings: null,
  buttonZoomIn: null, buttonZoomOut: null,
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
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refresh);
      window.visualViewport.addEventListener('scroll', refresh);
    }
    document.body.classList.add('touch-capable');
  },

  _refreshSafe() { this._safe = getSafeInsets(); },

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
    // 퀵챗 버튼 (상단 우측 보조줄)
    this.buttonQuickChat = { x: sX + sGap * 5, y: sY, r: r2 };

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

      // 듀얼 스틱 모드
      if (this._inButton(t, this.buttonReload))  { Input.touch.reloadEdge = true; continue; }
      if (this._inButton(t, this.buttonWeapon))  { if (this._onSwitchWeapon) this._onSwitchWeapon(); continue; }
      if (fireBtn && this._inButton(t, this.buttonFire)) { this._fireId = t.identifier; continue; }
      if (this._inButton(t, this.buttonRun))     { this._runToggle = !this._runToggle; continue; }

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
    // 캐주얼 모드: _sync 생략 (main.js step()의 rAF에서 self 포함 호출)
    // _onStart에서 _sync를 호출하면 self=undefined로 firing이 초기화됨
    if (scheme !== 'casual') this._sync();
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
    // 캐주얼 모드: _sync 생략 (main.js step()의 rAF에서 처리)
    if (scheme !== 'casual') this._sync();
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

  // 캐주얼 모드: 탭한 지점으로 이동 목표 설정, 자동으로 적 추적 + 사격
  _syncCasual(t, entities, myId, self) {
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
        // 목표 도달 시 타겟 클리어 (main.js 에서도 처리하지만 여기서도 처리)
        this._casualTarget = null;
      }

      // 자동 조준: 가장 가까운 적 찾기 (봇/인간 모두)
      if (MobileSettings.get('aimAssist')) {
        const nearest = this._findNearestEnemy(entities, myId, self);
        if (nearest) {
          const aimAng = Math.atan2(nearest.y - self.y, nearest.x - self.x);
          t.aimX = Math.cos(aimAng);
          t.aimY = Math.sin(aimAng);
          t.aiming = true;

          // 자동 사격: 적이 사거리 내에 있으면 사격
          const shootRange = 430;
          if (MobileSettings.get('autoFire') && dist(nearest.x, nearest.y, self.x, self.y) < shootRange) {
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
    } else {
      t.moveX = 0;
      t.moveY = 0;
      t.aiming = false;
      t.firing = false;
    }

    // 런 버튼 상태 반영
    t.sprint = !!(this._runToggle && MobileSettings.get('runButton'));
  },

  _findNearestEnemy(entities, myId, self) {
    let nearest = null;
    let minDist = Infinity;

    // 사거리 내 모든 적 (봇 + 인간 모두 타겟)
    const shootRange = 430;
    for (const e of entities) {
      if (e.id === myId || !e.alive) continue;
      // 모든 생존 엔티티를 적으로 간주 (봇/인간 구분 없음)
      const d = dist(e.x, e.y, self.x, self.y);
      if (d < minDist && d < shootRange) {
        minDist = d;
        nearest = e;
      }
    }
    return nearest;
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
    const worldSize = 2400;
    const scale = size / worldSize;
    const wx = (clientX - mx) / scale;
    const wy = (clientY - my) / scale;
    this._onMapPing(wx, wy, 'here');
  },

  // 퀵챗 패널 토글
  _toggleQuickChat() {
    this._quickChatOpen = !this._quickChatOpen;
    if (!this._quickChatOpen) {
      this._removeQuickChatPanel();
    }
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

  endFrame() { Input.touch.reloadEdge = false; },

  // 수류탄 버튼 위치 계산 (화면 좌표)
  _getGrenadeBtn() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safeRight = this._safe?.right || 0;
    const safeBottom = this._safe?.bottom || 0;
    const r = 34;
    return { x: W - r - 16 - safeRight, y: H - r - 16 - safeBottom, r };
  },

  draw(ctx, opts = {}) {
    if (!Input.touch.enabled) return;
    this._layout();
    const opa = clamp(Number(MobileSettings.get('stickOpacity')) || 0.85, 0.35, 1);
    const showCombat = opts.combat !== false && this._combatEnabled;
    const showAux = opts.aux !== false;
    const scheme = MobileSettings.get('scheme') || 'dual';
    const self = opts.self; // 수류탄 버튼 표시용

    ctx.save();
    ctx.globalAlpha = opa;

    if (showAux) {
      this._drawButton(ctx, this.buttonZoomOut, 'zoomOut', Input.touch.zoomOut, 'minor');
      this._drawButton(ctx, this.buttonZoomIn,  'zoomIn',  Input.touch.zoomIn, 'minor');
      this._drawButton(ctx, this.buttonBoard,   'board',   this._boardOpen, 'minor');
      this._drawButton(ctx, this.buttonOrient,  'orient',  false, 'minor');
      this._drawButton(ctx, this.buttonSettings,'settings', SettingsPanel.isOpen(), 'minor');
      this._drawQuickChat(ctx, this.buttonQuickChat);
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
