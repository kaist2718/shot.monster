// ============================================================
// mode.js - 모드 선택 + 멀티 룸 브라우저 DOM 오버레이. (client)
// StartScreen(이름/국가) 이후에 표시. start.js 시각 스타일 재사용(다크 카드/골드).
// ModeSelect.show({onAI,onMulti}) / RoomBrowser.show({onJoin,onQuickJoin,onPlay,onBack}).
// ============================================================

import { Net } from './net.js';
import { Sound } from './sound.js';
import { I18N } from './i18n.js';
import { iconSVG } from './icons.js';
const t = (k, v) => I18N.t(k, v);

const CARD_CSS =
  'width:min(92vw,420px);max-height:88vh;overflow:auto;padding:24px;border-radius:16px;' +
  'background:rgba(0,0,0,0.35);box-shadow:0 8px 32px rgba(0,0,0,.5);text-align:center;';
const ROOT_CSS =
  'position:fixed;inset:0;z-index:100;color-scheme:dark;' +
  'display:flex;align-items:center;justify-content:center;' +
  'font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif;color:#fff;';

function mkLangRow() {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px;';
  const btnEN = document.createElement('button');
  const btnKO = document.createElement('button');
  const css = 'padding:5px 10px;border:1px solid rgba(255,255,255,.2);border-radius:7px;font-size:12px;font-weight:bold;cursor:pointer;';
  btnEN.textContent = 'EN'; btnKO.textContent = '한국어';
  btnEN.style.cssText = btnKO.style.cssText = css;
  const paint = () => {
    const L = I18N.getLang();
    btnEN.style.background = L === 'en' ? '#ffd23f' : 'rgba(255,255,255,.06)';
    btnEN.style.color = L === 'en' ? '#20242b' : '#fff';
    btnKO.style.background = L === 'ko' ? '#ffd23f' : 'rgba(255,255,255,.06)';
    btnKO.style.color = L === 'ko' ? '#20242b' : '#fff';
  };
  btnEN.addEventListener('click', () => { I18N.setLang('en'); Sound.play('click'); if (row._repaint) row._repaint(); });
  btnKO.addEventListener('click', () => { I18N.setLang('ko'); Sound.play('click'); if (row._repaint) row._repaint(); });
  row.appendChild(btnEN); row.appendChild(btnKO);
  row._btnEN = btnEN; row._btnKO = btnKO; row._paint = paint;
  return row;
}

// ============================================================
// 모드 선택: AI / 인간 멀티
// ============================================================
export const ModeSelect = {
  _root: null,
  show(handlers = {}) {
    I18N.init();
    this.hide();
    const root = document.createElement('div');
    root.id = 'mode-screen';
    root.style.cssText = ROOT_CSS;
    const card = document.createElement('div');
    card.style.cssText = CARD_CSS;

    const langRow = mkLangRow();
    card.appendChild(langRow);

    const title = document.createElement('div');
    title.style.cssText = 'font-size:24px;font-weight:800;color:#ffd23f;letter-spacing:.5px;margin-bottom:18px;';
    card.appendChild(title);

    const mkModeBtn = (iconName, titleText, descText, color, onClick) => {
      const b = document.createElement('button');
      b.style.cssText =
        'display:flex;align-items:center;gap:14px;width:100%;padding:16px 16px;margin-bottom:12px;border:none;border-radius:14px;' +
        'background:' + color + ';color:#20242b;cursor:pointer;text-align:left;';
      const ic = document.createElement('div');
      ic.style.cssText = 'flex:0 0 40px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.12);border-radius:10px;';
      ic.innerHTML = iconSVG(iconName, 24, '#20242b');
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;min-width:0;';
      const tt = document.createElement('div');
      tt.style.cssText = 'font-size:18px;font-weight:bold;';
      const dd = document.createElement('div');
      dd.style.cssText = 'font-size:12px;opacity:.8;margin-top:3px;font-weight:normal;';
      col.appendChild(tt); col.appendChild(dd);
      b.appendChild(ic); b.appendChild(col);
      b._setTitle = () => { tt.textContent = titleText(); dd.textContent = descText(); };
      b.addEventListener('click', () => { Sound.play('click'); Sound.unlock(); onClick(); });
      card.appendChild(b);
      return b;
    };

    const aiBtn = mkModeBtn('ai', () => t('modeAI'), () => t('modeAIDesc'), '#ffd23f', () => handlers.onAI && handlers.onAI());
    const multiBtn = mkModeBtn('multi', () => t('modeMulti'), () => t('modeMultiDesc'), '#7fc4ff', () => handlers.onMulti && handlers.onMulti());

    root.appendChild(card);
    document.body.appendChild(root);
    this._root = root;

    const paint = () => {
      langRow._paint();
      title.textContent = t('modeSelectTitle');
      aiBtn._setTitle();
      multiBtn._setTitle();
    };
    langRow._repaint = paint;
    paint();
  },
  hide() { if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root); this._root = null; },
};

// ============================================================
// 멀티 룸 브라우저
// ============================================================
export const RoomBrowser = {
  _root: null,
  _listEl: null,
  _handlers: null,
  show(handlers = {}) {
    this.hide();
    this._handlers = handlers;
    const root = document.createElement('div');
    root.id = 'room-screen';
    root.style.cssText = ROOT_CSS;
    const card = document.createElement('div');
    card.style.cssText = CARD_CSS + 'width:min(94vw,520px);';

    // 언어 토글 (모드 선택 화면과 동일)
    const langRow = mkLangRow();
    card.appendChild(langRow);

    const title = document.createElement('div');
    title.style.cssText = 'font-size:22px;font-weight:800;color:#ffd23f;margin-bottom:4px;';
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:12px;opacity:.7;margin-bottom:14px;';
    card.appendChild(title); card.appendChild(sub);

    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;';
    card.appendChild(listEl);

    // 하단 액션 행
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;';
    const mkBtn = (labelFn, bg, onClick) => {
      const b = document.createElement('button');
      b.style.cssText = 'flex:1;padding:13px;border:none;border-radius:11px;background:' + bg +
        ';color:#20242b;font-size:14px;font-weight:bold;cursor:pointer;';
      b.addEventListener('click', () => { Sound.play('click'); onClick(); });
      b._setLabel = () => { b.textContent = labelFn(); };
      actions.appendChild(b);
      return b;
    };
    const quickBtn = mkBtn(() => t('quickJoin'), '#7fc4ff', () => handlers.onQuickJoin && handlers.onQuickJoin());
    const playBtn = mkBtn(() => t('playHere'), '#ffd23f', () => handlers.onPlay && handlers.onPlay());
    const backBtn = mkBtn(() => t('back'), 'rgba(255,255,255,.12)', () => { backBtn.style.color = '#fff'; handlers.onBack && handlers.onBack(); });
    backBtn.style.color = '#fff';
    card.appendChild(actions);

    root.appendChild(card);
    document.body.appendChild(root);
    this._root = root;
    this._listEl = listEl;
    this._titleEl = title;
    this._subEl = sub;
    this._btns = [quickBtn, playBtn, backBtn];

    this._paint = () => {
      langRow._paint();
      title.textContent = t('roomBrowser');
      sub.textContent = t('modeMultiDesc');
      this._btns.forEach((b) => b._setLabel && b._setLabel());
      this.refresh();
    };
    langRow._repaint = this._paint;
    this._paint();
  },
  // Net.multiList / Net.roomId 로 목록 재렌더
  refresh() {
    if (!this._root) return;
    const listEl = this._listEl;
    listEl.innerHTML = '';
    const list = Net.multiList || [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;font-size:13px;opacity:.6;';
      empty.textContent = t('noRooms');
      listEl.appendChild(empty);
      return;
    }
    for (const r of list) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;' +
        'background:rgba(255,255,255,.06);';
      const isCurrent = r.roomId === Net.roomId;
      if (isCurrent) row.style.outline = '2px solid #ffd23f';
      const no = document.createElement('div');
      no.style.cssText = 'font-weight:bold;font-size:15px;min-width:64px;text-align:left;';
      no.textContent = t('roomNo', { n: r.no });
      const cnt = document.createElement('div');
      cnt.style.cssText = 'flex:1;font-size:13px;text-align:left;';
      cnt.textContent = t('humans', { n: r.humans, m: r.maxHumans }) + ' · ' +
        (r.phase === 'lobby' ? t('roomWaiting') : t('roomPlaying'));
      row.appendChild(no); row.appendChild(cnt);

      const full = r.humans >= r.maxHumans;
      const joinBtn = document.createElement('button');
      joinBtn.style.cssText =
        'padding:8px 14px;border:none;border-radius:8px;font-size:12px;font-weight:bold;cursor:pointer;' +
        (isCurrent ? 'background:rgba(255,210,63,.3);color:#ffd23f;cursor:default;' :
         full ? 'background:rgba(255,255,255,.1);color:rgba(255,255,255,.4);cursor:default;' :
         'background:#ffd23f;color:#20242b;');
      joinBtn.textContent = isCurrent ? t('playHere') : (full ? t('roomFull') : t('joinRoom'));
      if (!isCurrent && !full) {
        joinBtn.addEventListener('click', () => { Sound.play('click'); this._handlers.onJoin && this._handlers.onJoin(r.roomId); });
      }
      row.appendChild(joinBtn);
      listEl.appendChild(row);
    }
  },
  hide() { if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root); this._root = null; this._listEl = null; },
};
