// ============================================================
// start.js - 접속 전 이름/국가 입력 시작 오버레이 + 언어(EN/KO) 토글. (client)
// localStorage(br_name/br_country/br_lang)에 저장. 제출 시 onSubmit({name, country}) 호출.
// 반환된 프로필로 main.js가 Net.init → 소켓 auth에 실어 전송.
// ============================================================

import { COUNTRIES } from '../shared/countries.js';
import { Sound } from './sound.js';
import { I18N } from './i18n.js';

const KEY_NAME = 'br_name';
const KEY_COUNTRY = 'br_country';
const MAX_LEN = 16;

function load(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch { /* 무시 */ } }

export const StartScreen = {
  show(onSubmit) {
    I18N.init();
    const savedName = load(KEY_NAME);
    const savedCountry = load(KEY_COUNTRY);
    const returning = !!(savedName && savedCountry);

    const root = document.createElement('div');
    root.id = 'start-screen';
    // color-scheme:dark → 네이티브 <select> 드롭다운이 어두운 테마로 그려짐(흰 바탕+흰 글자 버그 수정)
    root.style.cssText =
      'position:fixed;inset:0;z-index:100;color-scheme:dark;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif;color:#fff;';

    const card = document.createElement('div');
    card.style.cssText =
      'width:min(92vw,380px);padding:26px 24px;border-radius:16px;' +
      'background:rgba(0,0,0,0.35);box-shadow:0 8px 32px rgba(0,0,0,.5);text-align:center;';

    // 언어 토글(우측 상단)
    const langRow = document.createElement('div');
    langRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px;';
    const btnEN = document.createElement('button');
    const btnKO = document.createElement('button');
    const langBtnCss = 'padding:5px 10px;border:1px solid rgba(255,255,255,.2);border-radius:7px;' +
      'font-size:12px;font-weight:bold;cursor:pointer;';
    btnEN.textContent = 'EN'; btnKO.textContent = '한국어';
    langRow.appendChild(btnEN); langRow.appendChild(btnKO);
    card.appendChild(langRow);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:26px;font-weight:800;color:#ffd23f;letter-spacing:.5px;';
    card.appendChild(titleEl);

    const subEl = document.createElement('div');
    subEl.style.cssText = 'font-size:13px;opacity:.7;margin:6px 0 20px;';
    card.appendChild(subEl);

    const mkLabel = (t) => {
      const l = document.createElement('label');
      l.style.cssText = 'display:block;font-size:12px;opacity:.8;text-align:left;margin-bottom:6px;';
      l.textContent = t;
      return l;
    };
    const inputCss = 'width:100%;padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:10px;' +
      'color-scheme:dark;background:#2a2f37;color:#fff;font-size:15px;outline:none;box-sizing:border-box;';

    const nameLabel = mkLabel('');
    card.appendChild(nameLabel);
    const nameEl = document.createElement('input');
    nameEl.maxLength = MAX_LEN;
    nameEl.style.cssText = inputCss;
    if (savedName) nameEl.value = savedName;
    card.appendChild(nameEl);

    const countryLabel = mkLabel('');
    countryLabel.style.cssText += 'margin-top:18px;';
    card.appendChild(countryLabel);
    const sel = document.createElement('select');
    sel.style.cssText = inputCss;
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.disabled = true;
    sel.appendChild(opt0);
    for (const c of COUNTRIES) {
      const o = document.createElement('option');
      o.value = c.code;
      o.style.cssText = 'background:#2a2f37;color:#fff;';
      o.dataset.nameKo = c.name;
      sel.appendChild(o);
    }
    if (savedCountry) sel.value = savedCountry;
    card.appendChild(sel);

    const goBtn = document.createElement('button');
    goBtn.style.cssText =
      'margin-top:22px;width:100%;padding:14px;border:none;border-radius:12px;' +
      'background:#ffd23f;color:#20242b;font-size:16px;font-weight:bold;cursor:pointer;';
    card.appendChild(goBtn);

    const noteEl = document.createElement('div');
    noteEl.style.cssText = 'font-size:11px;opacity:.5;margin-top:12px;';
    card.appendChild(noteEl);

    // 개발자 이메일 표시
    const devEl = document.createElement('div');
    devEl.style.cssText = 'font-size:10px;opacity:.4;margin-top:6px;';
    card.appendChild(devEl);

    // 튜토리얼 버튼
    const tutBtn = document.createElement('button');
    tutBtn.style.cssText =
      'margin-top:8px;width:100%;padding:10px;border:none;border-radius:10px;' +
      'background:rgba(255,255,255,.08);color:#fff;font-size:13px;cursor:pointer;';
    card.appendChild(tutBtn);

    root.appendChild(card);
    document.body.appendChild(root);

    // 현재 언어로 모든 텍스트 갱신(토글 시 재호출)
    const paint = () => {
      const L = I18N.getLang();
      btnEN.style.background = L === 'en' ? '#ffd23f' : 'rgba(255,255,255,.06)';
      btnEN.style.color = L === 'en' ? '#20242b' : '#fff';
      btnKO.style.background = L === 'ko' ? '#ffd23f' : 'rgba(255,255,255,.06)';
      btnKO.style.color = L === 'ko' ? '#20242b' : '#fff';
      btnEN.style.borderColor = btnKO.style.borderColor = 'rgba(255,255,255,.2)';
      titleEl.textContent = I18N.t('appTitle');
      subEl.textContent = I18N.t('startSubtitle');
      nameLabel.textContent = I18N.t('nickname');
      nameEl.placeholder = I18N.t('namePlaceholder');
      countryLabel.textContent = I18N.t('country');
      opt0.textContent = I18N.t('countrySelect');
      // 국가 옵션 표기: EN은 코드+영문(코드만 간결히), KO는 코드+한국어
      for (const o of sel.children) {
        if (!o.value) continue;
        const ko = o.dataset.nameKo;
        o.textContent = L === 'ko' ? '[' + o.value + '] ' + ko : '[' + o.value + '] ' + o.value;
      }
      if (savedCountry) sel.value = savedCountry;
      goBtn.textContent = returning ? I18N.t('continue') : I18N.t('start');
      noteEl.textContent = I18N.t('startNote');
      tutBtn.textContent = I18N.t('tutorialTitle');
      devEl.textContent = I18N.t('devContact');
    };

    // 튜토리얼 표시 (상세 버전)
    const showTutorial = () => {
      const existing = document.getElementById('tutorial-screen');
      if (existing) return;
      const tRoot = document.createElement('div');
      tRoot.id = 'tutorial-screen';
      tRoot.style.cssText =
        'position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.85);' +
        'display:flex;align-items:center;justify-content:center;color:#fff;' +
        'font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif;';
      const tCard = document.createElement('div');
      tCard.style.cssText =
        'width:min(92vw,480px);max-height:80vh;overflow:auto;padding:24px;border-radius:16px;' +
        'background:rgba(20,24,30,0.95);box-shadow:0 8px 32px rgba(0,0,0,.6);';
      const tTitle = document.createElement('div');
      tTitle.style.cssText = 'font-size:22px;font-weight:800;color:#ffd23f;margin-bottom:16px;';
      tTitle.textContent = I18N.t('tutorialTitle');
      tCard.appendChild(tTitle);

      const steps = [
        { key: 'tutorialMove', icon: '🎮', label: '이동 조작' },
        { key: 'tutorialAim', icon: '🎯', label: '조준' },
        { key: 'tutorialFire', icon: '🔫', label: '사격' },
        { key: 'tutorialGrenade', icon: '💣', label: '수류탄' },
        { key: 'aimAssist', icon: '⚡', label: '에임 어시스트' },
      ];
      const ul = document.createElement('div');
      ul.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
      for (const s of steps) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:24px;';
        icon.textContent = s.icon;
        const text = document.createElement('div');
        text.style.cssText = 'font-size:14px;line-height:1.5;opacity:.9;';
        const label = document.createElement('div');
        label.style.cssText = 'font-weight:600;color:#ffd23f;';
        label.textContent = s.label;
        const desc = document.createElement('div');
        desc.textContent = I18N.t(s.key);
        text.appendChild(label);
        text.appendChild(desc);
        row.appendChild(icon);
        row.appendChild(text);
        ul.appendChild(row);
      }
      tCard.appendChild(ul);

      // 모바일/데스크탑 구분 안내
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:12px;opacity:.6;margin-top:16px;padding:12px;background:rgba(255,255,255,.05);border-radius:8px;';
      hint.textContent = I18N.t('hintDesktop');
      tCard.appendChild(hint);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:20px;';
      const skipBtn = document.createElement('button');
      skipBtn.style.cssText =
        'padding:8px 16px;border:none;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;';
      skipBtn.textContent = I18N.t('tutorialSkip');
      const nextBtn = document.createElement('button');
      nextBtn.style.cssText =
        'padding:8px 16px;border:none;border-radius:8px;background:#ffd23f;color:#20242b;cursor:pointer;';
      nextBtn.textContent = I18N.t('tutorialNext');
      btnRow.appendChild(skipBtn);
      btnRow.appendChild(nextBtn);
      tCard.appendChild(btnRow);
      tRoot.appendChild(tCard);

      const closeTutorial = () => { if (tRoot.parentNode) tRoot.parentNode.removeChild(tRoot); };
      skipBtn.addEventListener('click', closeTutorial);
      nextBtn.addEventListener('click', closeTutorial);

      document.body.appendChild(tRoot);
    };

    btnEN.addEventListener('click', () => { I18N.setLang('en'); paint(); });
    btnKO.addEventListener('click', () => { I18N.setLang('ko'); paint(); });
    tutBtn.addEventListener('click', () => { showTutorial(); });
    paint();

    const ready = () => nameEl.value.trim().length > 0 && sel.value;
    const sync = () => { goBtn.disabled = !ready(); goBtn.style.opacity = ready() ? '1' : '.5'; };
    nameEl.addEventListener('input', sync);
    sel.addEventListener('change', sync);
    sync();

    const submit = () => {
      const name = nameEl.value.trim().slice(0, MAX_LEN);
      const country = sel.value;
      if (!name || !country) return;
      save(KEY_NAME, name);
      save(KEY_COUNTRY, country);
      Sound.unlock(); // 첫 사용자 제스처 → 오디오 컨텍스트 해금
      if (root.parentNode) root.parentNode.removeChild(root);
      if (onSubmit) onSubmit({ name, country });
    };
    goBtn.addEventListener('click', submit);
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    nameEl.focus();
  },
};
