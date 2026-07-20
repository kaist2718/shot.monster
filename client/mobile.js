// ============================================================
// mobile.js - 조작 설정(localStorage 영속) + ⚙️ 설정 패널(DOM). (client)
// 모바일 컨트롤/UX + aim assist/`gamepad` 설정 단일 소스.
// ============================================================

import { I18N } from './i18n.js';
import { Sound } from './sound.js';
import { clamp } from '../shared/utils.js';

const STORAGE_KEY = 'br_mobile';
const t = (k) => I18N.t(k);

const DEFAULTS = {
  stickMode: 'dynamic', // 'dynamic' | 'fixed'
  scheme: 'dual',       // 'dual'(양손가락) | 'casual'(원핑거 탭이동+자동조준/사격)
  fireButton: false,
  autoFire: true,
  runButton: false,
  lefty: false,
  vibration: true,
  zoomSens: 1.0,        // 0.6~1.6
  stickOpacity: 0.85,   // 0.35~1
  aimAssist: true,      // soft pull (touch/gamepad)
  aimAssistStr: 0.55,   // 0~1 (기본 중간)
  aimAssistStickiness: 0.25, // 조준 유지 시간(ms로 변환) - 활주/잡기 방지용
  gamepadEnabled: true,
  quality: 'high',      // 'high' | 'med' | 'low' — 파티클/그림자 밀도
  particles: true,
  shadows: true,
};

const NUM_RANGE = {
  zoomSens: [0.6, 1.6],
  stickOpacity: [0.35, 1],
  aimAssistStr: [0, 1],
  aimAssistStickiness: [0, 1],
};

const listeners = new Set();

export const MobileSettings = {
  _vals: null,
  load() {
    if (this._vals) return;
    this._vals = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) {
          if (k in obj) this._vals[k] = obj[k];
        }
      }
    } catch { /* 무시 */ }
  },
  save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._vals)); } catch { /* 무시 */ } },
  get(k) { this.load(); return this._vals[k]; },
  getAll() { this.load(); return { ...this._vals }; },
  set(k, v) {
    this.load();
    if (!(k in DEFAULTS)) return;
    if (k === 'stickMode') v = (v === 'fixed') ? 'fixed' : 'dynamic';
    else if (typeof DEFAULTS[k] === 'boolean') v = !!v;
    else if (typeof DEFAULTS[k] === 'number') {
      const [lo, hi] = NUM_RANGE[k] || [0, 1];
      v = clamp(Number(v), lo, hi);
      if (!Number.isFinite(v)) v = DEFAULTS[k];
    }
    this._vals[k] = v;
    this.save();
    for (const fn of listeners) { try { fn(k, v); } catch { /* 무시 */ } }
  },
  onChange(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
};

// ============================================================
// SettingsPanel
// ============================================================
export const SettingsPanel = {
  _root: null,
  _unsubLang: null,
  _segBtns: null,
  isOpen() { return !!this._root; },
  toggle() { this.isOpen() ? this.close() : this.open(); },

  open() {
    if (this._root) return;
    const s = MobileSettings.getAll();
    const root = document.createElement('div');
    root.id = 'settings-screen';
    root.style.cssText =
      'position:fixed;inset:0;z-index:110;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);color-scheme:dark;color:#fff;' +
      'font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    const card = document.createElement('div');
    card.style.cssText =
      'width:min(92vw,360px);max-height:88vh;overflow:auto;padding:22px 20px;border-radius:16px;' +
      'background:rgba(20,24,30,0.97);box-shadow:0 8px 32px rgba(0,0,0,.5);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:19px;font-weight:800;color:#ffd23f;margin-bottom:14px;text-align:center;';
    card.appendChild(title);

    const rows = [];
    this._segBtns = [];

    const stick = this._mkRow();
    const seg = this._mkSeg([
      { v: 'dynamic', labelKey: 'stickDynamic' },
      { v: 'fixed', labelKey: 'stickFixed' },
    ], s.stickMode, (v) => MobileSettings.set('stickMode', v));
    stick.bodyEl.appendChild(seg.el);
    card.appendChild(stick.row);
    rows.push({ label: stick.labelEl, key: 'stickMode' });

    // 조작 체계: 듀얼(양손가락) / 캐주얼(원핑거 탭이동+자동조준)
    const scheme = this._mkRow();
    const seg2 = this._mkSeg([
      { v: 'dual', labelKey: 'stickDual' },
      { v: 'casual', labelKey: 'stickCasual' },
    ], s.scheme, (v) => MobileSettings.set('scheme', v));
    scheme.bodyEl.appendChild(seg2.el);
    card.appendChild(scheme.row);
    rows.push({ label: scheme.labelEl, key: 'scheme' });

    // 그래픽 품질
    const q = this._mkRow();
    const seg3 = this._mkSeg([
      { v: 'high', labelKey: 'qualityHigh' },
      { v: 'med', labelKey: 'qualityMed' },
      { v: 'low', labelKey: 'qualityLow' },
    ], s.quality, (v) => {
      MobileSettings.set('quality', v);
      // 프리셋 느낌: low 는 파티클/그림자 자동 off, high 는 on
      if (v === 'low') { MobileSettings.set('particles', false); MobileSettings.set('shadows', false); }
      else if (v === 'high') { MobileSettings.set('particles', true); MobileSettings.set('shadows', true); }
    });
    q.bodyEl.appendChild(seg3.el);
    card.appendChild(q.row);
    rows.push({ label: q.labelEl, key: 'quality' });

    for (const k of ['fireButton', 'autoFire', 'runButton', 'lefty', 'vibration', 'aimAssist', 'gamepadEnabled', 'particles', 'shadows']) {
      const r = this._mkRow();
      const cb = this._mkCheck(s[k], (v) => MobileSettings.set(k, v));
      r.bodyEl.appendChild(cb);
      card.appendChild(r.row);
      rows.push({ label: r.labelEl, key: k });
    }

    // 슬라이더: zoomSens, stickOpacity, aimAssistStr, aimAssistStickiness
    for (const [k, min, max, step, fmt] of [
      ['zoomSens', 0.6, 1.6, 0.1, (v) => v.toFixed(1) + 'x'],
      ['stickOpacity', 0.35, 1, 0.05, (v) => Math.round(v * 100) + '%'],
      ['aimAssistStr', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
      ['aimAssistStickiness', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
    ]) {
      const zr = this._mkRow();
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.step = String(step);
      sl.value = String(s[k]);
      sl.style.cssText = 'flex:1;accent-color:#ffd23f;cursor:pointer;';
      const slVal = document.createElement('span');
      slVal.style.cssText = 'min-width:42px;text-align:right;font-size:12px;opacity:.85;';
      slVal.textContent = fmt(Number(s[k]));
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        MobileSettings.set(k, v);
        slVal.textContent = fmt(v);
      });
      zr.bodyEl.appendChild(sl);
      zr.bodyEl.appendChild(slVal);
      card.appendChild(zr.row);
      rows.push({ label: zr.labelEl, key: k });
    }

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText =
      'margin-top:18px;width:100%;padding:13px;border:none;border-radius:11px;' +
      'background:#ffd23f;color:#20242b;font-size:15px;font-weight:bold;cursor:pointer;';
    closeBtn.addEventListener('click', () => { Sound.play('click'); this.close(); });
    card.appendChild(closeBtn);
    rows.push({ label: closeBtn, key: 'close' });

    root.appendChild(card);
    document.body.appendChild(root);
    this._root = root;
    this._rows = rows;
    this._titleEl = title;
    this._repaint();
    this._unsubLang = () => {};
    const onLang = () => this._repaint();
    I18N.onChange(onLang);
    this._unsubLang = () => I18N.offChange(onLang);
  },

  close() {
    if (this._unsubLang) { try { this._unsubLang(); } catch { /* */ } this._unsubLang = null; }
    if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
    this._root = null; this._rows = null; this._titleEl = null; this._segBtns = null;
  },

  _repaint() {
    if (!this._root) return;
    this._titleEl.textContent = t('settingsTitle');
    for (const r of this._rows) r.label.textContent = t(r.key);
    if (this._segBtns) {
      for (const b of this._segBtns) {
        if (b._labelKey) b.textContent = t(b._labelKey);
      }
    }
  },

  _mkRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:14px;';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.appendChild(label); row.appendChild(body);
    return { row, labelEl: label, bodyEl: body };
  },

  _mkSeg(opts, cur, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;background:rgba(255,255,255,.08);border-radius:9px;padding:3px;';
    const btns = [];
    const paint = () => {
      btns.forEach((b) => {
        const on = b._v === cur;
        b.style.background = on ? '#ffd23f' : 'transparent';
        b.style.color = on ? '#20242b' : '#fff';
      });
    };
    for (const o of opts) {
      const b = document.createElement('button');
      b._v = o.v;
      b._labelKey = o.labelKey;
      b.style.cssText = 'border:none;padding:7px 14px;border-radius:7px;font-size:13px;font-weight:bold;cursor:pointer;color:#fff;';
      b.textContent = t(o.labelKey);
      b.addEventListener('click', () => { cur = o.v; onChange(o.v); paint(); Sound.play('click'); });
      wrap.appendChild(b);
      btns.push(b);
      if (!this._segBtns) this._segBtns = [];
      this._segBtns.push(b);
    }
    paint();
    return { el: wrap };
  },

  _mkCheck(val, onChange) {
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!val;
    cb.style.cssText = 'width:22px;height:22px;accent-color:#ffd23f;cursor:pointer;';
    cb.addEventListener('change', () => { onChange(cb.checked); Sound.play('click'); });
    return cb;
  },
};
