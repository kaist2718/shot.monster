// ============================================================
// camera.js - 플레이어 추종 카메라 + 줌. (client)
// 줌은 기본값(모바일=시야확보/데스크탑=1:1)이나, 사용자가 버튼·핀치·휠로
// 수동 조정 가능(userZoom). 조정값은 기기 클래스별(touch/mouse) localStorage 키에
// 저장되어 유지된다 — 한 기기의 설정이 다른 기기 클래스를 덮어쓰지 않도록.
// 현재 zoom 은 목표치로 부드럽게 보간되어 급격한 도약을 줄인다.
// ============================================================

import { clamp, lerp } from '../shared/utils.js';
import { Input } from './input.js';
import { CONFIG } from '../shared/config.js';

// 기기 클래스별 저장 키 — 모바일(터치)과 데스크탑(마우스) 줌 설정 분리
function zoomKey() {
  return Input.touch.enabled ? 'br_zoom_touch' : 'br_zoom_mouse';
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.userZoom = null;
    this._zoomLoaded = false; // lazy 로드 — 기기 판별(TouchCtrl.init) 후 첫 사용 시
  }

  // lazy 로드: 생성 시점엔 기기(toucher) 판별이 안 끝났을 수 있어 실제 사용 시 읽는다.
  _ensureLoaded() {
    if (this._zoomLoaded) return;
    this._zoomLoaded = true;
    try {
      const v = parseFloat(localStorage.getItem(zoomKey()));
      if (Number.isFinite(v)) this.userZoom = clamp(v, CONFIG.VIEW.MIN_ZOOM, CONFIG.VIEW.MAX_ZOOM);
    } catch { /* 무시 */ }
  }

  setUserZoom(z) {
    this._ensureLoaded();
    this.userZoom = clamp(z, CONFIG.VIEW.MIN_ZOOM, CONFIG.VIEW.MAX_ZOOM);
    try { localStorage.setItem(zoomKey(), String(this.userZoom)); } catch { /* 무시 */ }
  }

  // 현재 줌에 비율 적용(핀치/휠/버튼). userZoom이 null이면 현재 줌에서 시작.
  adjustZoomBy(ratio) {
    this._ensureLoaded();
    const base = this.userZoom != null ? this.userZoom
      : (Input.touch.enabled ? this.zoom : 1);
    this.setUserZoom(base * ratio);
  }

  // 자동 줌 계산(userZoom 미설정 시)
  _autoZoom(viewW) {
    if (Input.touch.enabled) {
      return clamp(viewW / CONFIG.VIEW.MOBILE_TARGET_WIDTH,
                   CONFIG.VIEW.MIN_ZOOM, CONFIG.VIEW.MAX_ZOOM);
    }
    return 1;
  }
  targetZoom(viewW) {
    this._ensureLoaded();
    return this.userZoom != null ? this.userZoom : this._autoZoom(viewW);
  }

  follow(target, dt, viewW, viewH) {
    // 줌을 목표치로 빠르게 보간(버튼/핀치 도약 → 부드러운 전환)
    const tz = this.targetZoom(viewW);
    this.zoom = lerp(this.zoom, tz, 1 - Math.pow(0.0009, dt));
    const tx = target.x - viewW / (2 * this.zoom);
    const ty = target.y - viewH / (2 * this.zoom);
    const t = 1 - Math.pow(0.002, dt);
    this.x = lerp(this.x, tx, t);
    this.y = lerp(this.y, ty, t);
  }

  snap(target, viewW, viewH) {
    this.zoom = this.targetZoom(viewW);
    this.x = target.x - viewW / (2 * this.zoom);
    this.y = target.y - viewH / (2 * this.zoom);
  }
}
