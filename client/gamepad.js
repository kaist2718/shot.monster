// ============================================================
// gamepad.js - 표준 게임패드 폴링. (client)
// LS 이동 / RS 조준 / RT 사격 / A 재장전 / LB·RB 무기 / L3·B 스프린트.
// buildContract 가 active 시 우선 소비. disconnect 안전.
// ============================================================

import { Input } from './input.js';
import { MobileSettings } from './mobile.js';

const AXIS_DZ = 0.18;
const AIM_DZ = 0.25;
const SPRINT_MAG = 0.86;

function applyDz(v, dz) {
  if (Math.abs(v) < dz) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - dz) / (1 - dz));
}

export const GamepadCtrl = {
  connected: false,
  _index: null,
  _angle: 0,
  _prevButtons: [],
  reloadEdge: false,
  weaponDelta: 0,   // -1 / +1 edge, consumer clears
  boardHold: false,
  _toastEl: null,
  _toastTimer: null,
  _inited: false,

  init() {
    if (this._inited) return;
    this._inited = true;
    window.addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      this._index = e.gamepad.index;
      // 첫 폴링 프레임 오엣지(연결 시 눌린 버튼을 엣지로 오인) 방지 — 현재 상태를 베이스로 스냅샷
      const gp = e.gamepad;
      this._prevButtons = [];
      for (let i = 0; i < gp.buttons.length; i++) this._prevButtons[i] = !!(gp.buttons[i] && gp.buttons[i].pressed);
      this._toast(true, e.gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this._index === e.gamepad.index) {
        this.connected = false;
        this._index = null;
        this._toast(false);
      }
    });
  },

  _toast(on, id) {
    try {
      if (!this._toastEl) {
        const el = document.createElement('div');
        el.style.cssText =
          'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:120;' +
          'padding:10px 16px;border-radius:999px;background:rgba(20,24,30,.92);color:#fff;' +
          'font:600 13px "Segoe UI",system-ui,sans-serif;border:1px solid rgba(255,210,63,.45);' +
          'box-shadow:0 4px 18px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .2s;';
        document.body.appendChild(el);
        this._toastEl = el;
      }
      const short = id ? String(id).slice(0, 36) : '';
      this._toastEl.textContent = on
        ? ((short || 'Gamepad') + ' connected')
        : 'Gamepad disconnected';
      this._toastEl.style.opacity = '1';
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        if (this._toastEl) this._toastEl.style.opacity = '0';
      }, 2200);
    } catch { /* 무시 */ }
  },

  _pad() {
    if (typeof navigator.getGamepads !== 'function') return null;
    const list = navigator.getGamepads();
    if (!list) return null;
    if (this._index != null && list[this._index]) return list[this._index];
    for (let i = 0; i < list.length; i++) {
      if (list[i]) { this._index = i; this.connected = true; return list[i]; }
    }
    return null;
  },

  /** 연결 + 설정 on + 최근 활동 */
  active() {
    if (!MobileSettings.get('gamepadEnabled')) return false;
    const gp = this._pad();
    if (!gp) { this.connected = false; return false; }
    this.connected = true;
    // 최근 활동 800ms
    return (performance.now() - Input.lastGamepadAt) < 800 || this._anyInput(gp);
  },

  _anyInput(gp) {
    for (let i = 0; i < gp.axes.length; i++) {
      if (Math.abs(gp.axes[i]) > AXIS_DZ) return true;
    }
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      if (b && (b.pressed || (typeof b.value === 'number' && b.value > 0.2))) return true;
    }
    return false;
  },

  _pressed(gp, i) {
    const b = gp.buttons[i];
    return !!(b && b.pressed);
  },
  _value(gp, i) {
    const b = gp.buttons[i];
    if (!b) return 0;
    return typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
  },
  _edge(gp, i) {
    const now = this._pressed(gp, i);
    const was = !!this._prevButtons[i];
    return now && !was;
  },

  /**
   * @param {number} fallbackAngle
   * @returns {{moveX,moveY,angle,firing,reload,sprint}|null}
   */
  toContract(fallbackAngle) {
    const gp = this._pad();
    if (!gp) return null;

    let mx = applyDz(gp.axes[0] || 0, AXIS_DZ);
    let my = applyDz(gp.axes[1] || 0, AXIS_DZ);
    // Y 축: 패드 위=-1 → 화면 위(감소) 이므로 그대로(게임 y+아래)
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) { mx /= mlen; my /= mlen; }

    const ax = applyDz(gp.axes[2] || 0, AIM_DZ);
    const ay = applyDz(gp.axes[3] || 0, AIM_DZ);
    const alen = Math.hypot(ax, ay);
    if (alen > 0.001) this._angle = Math.atan2(ay, ax);
    else if (fallbackAngle != null) this._angle = fallbackAngle;

    const rt = this._value(gp, 7);
    const firing = rt > 0.35 || this._pressed(gp, 7);
    // A=0 reload edge, B=1 or L3=10 sprint, LB=4 RB=5 weapons, Start=9 board, LT=6 sprint alt
    if (this._edge(gp, 0)) this.reloadEdge = true;
    if (this._edge(gp, 4)) this.weaponDelta = -1;
    if (this._edge(gp, 5)) this.weaponDelta = 1;
    this.boardHold = this._pressed(gp, 9);

    const sprintBtn = this._pressed(gp, 10) || this._pressed(gp, 1) || this._value(gp, 6) > 0.45;
    const sprint = sprintBtn || mlen >= SPRINT_MAG;

    // 활동 기록
    if (this._anyInput(gp)) Input.note('gamepad');

    // prev snapshot (length-safe)
    const pb = [];
    for (let i = 0; i < gp.buttons.length; i++) pb[i] = this._pressed(gp, i);
    this._prevButtons = pb;

    return {
      moveX: mx,
      moveY: my,
      angle: this._angle,
      firing,
      reload: !!this.reloadEdge,
      sprint,
    };
  },

  endFrame() {
    this.reloadEdge = false;
    this.weaponDelta = 0;
  },

  // 테스트 추출용
  _applyDz: applyDz,
};
