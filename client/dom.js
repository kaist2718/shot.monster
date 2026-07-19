// ============================================================
// dom.js - 보상형 광고 유도 DOM 버튼(부활/혜택). (client)
// 캔버스 위에 DOM 버튼을 띄워 모바일 탭도 확실히 동작하도록 함.
// 표시 상태가 바뀔 때만 DOM 에 쓴다(매 프레임 중복 쓰기 방지).
// 언어 전환 시 텍스트는 I18N 옵저버로 갱신.
// ============================================================

import { I18N } from './i18n.js';
const t = (k) => I18N.t(k);

export const DomUI = {
  _revive: null,
  _perk: null,
  _onRevive: null,
  _onPerk: null,
  _reviveVis: undefined, // 직전 표시 상태(캐싱)
  _perkVis: undefined,

  init({ onRevive, onPerk }) {
    this._onRevive = onRevive;
    this._onPerk = onPerk;
    this._revive = this._makeBtn('#ffd23f', '#20242b');
    this._perk = this._makeBtn('rgba(58,123,213,0.95)', '#fff');
    this._revive.addEventListener('click', () => this._onRevive && this._onRevive());
    this._perk.addEventListener('click', () => this._onPerk && this._onPerk());
    this.showRevive(false);
    this.showPerk(false);
    // 언어 전환 시 버튼 텍스트 갱신(캐싱된 표시 상태 유지)
    I18N.onChange(() => this._repaintText());
  },

  _repaintText() {
    if (this._revive) this._revive.textContent = t('reviveBtn');
    if (this._perk) this._perk.textContent = t('perkBtn');
  },

  _makeBtn(bg, fg) {
    const b = document.createElement('button');
    b.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);z-index:40;' +
      'padding:14px 26px;border:none;border-radius:12px;background:' + bg + ';color:' + fg + ';' +
      'font-size:16px;font-weight:bold;box-shadow:0 4px 16px rgba(0,0,0,.4);display:none;';
    document.body.appendChild(b);
    return b;
  },

  showRevive(show) {
    if (!this._revive) return;
    const vis = !!show;
    if (this._reviveVis === vis) return; // 변경 시에만 DOM 쓰기
    this._reviveVis = vis;
    this._revive.textContent = t('reviveBtn');
    this._revive.style.display = vis ? 'block' : 'none';
    // 터치 엄지존(하단)과 분리 + safe-area
    this._revive.style.bottom = 'calc(32% + env(safe-area-inset-bottom, 0px))';
  },

  showPerk(show) {
    if (!this._perk) return;
    const vis = !!show;
    if (this._perkVis === vis) return; // 변경 시에만 DOM 쓰기
    this._perkVis = vis;
    this._perk.textContent = t('perkBtn');
    this._perk.style.display = vis ? 'block' : 'none';
    this._perk.style.bottom = 'calc(150px + env(safe-area-inset-bottom, 0px))';
  },
};
