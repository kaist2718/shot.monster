// ============================================================
// start.js - 접속 전 이름/국가 입력 시작 오버레이 + 언어(EN/KO) 토글. (client)
// localStorage(br_name/br_country/br_lang)에 저장. 제출 시 onSubmit({name, country}) 호출.
// 반환된 프로필로 main.js가 Net.init → 소켓 auth에 실어 전송.
// ============================================================

import { COUNTRIES } from '../shared/countries.js';
import { CONFIG } from '../shared/config.js';
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
      o.dataset.nameKo = c.name;
      o.dataset.nameEn = c.nameEn || c.code;
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

    // 진행 상황 복구 메시지 (이미 플레이어인 경우)
    const recoveryEl = document.createElement('div');
    recoveryEl.style.cssText = 'font-size:12px;color:#7fe08a;margin-top:8px;';
    recoveryEl.textContent = I18N.t('progressRestored');
    recoveryEl.style.display = returning ? 'block' : 'none';
    card.appendChild(recoveryEl);

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
      // 국가 옵션 표기: EN은 [KR] South Korea, KO는 [KR] 한국
      for (const o of sel.children) {
        if (!o.value) continue;
        const ko = o.dataset.nameKo;
        const en = o.dataset.nameEn || o.value;
        o.textContent = L === 'ko' ? '[' + o.value + '] ' + ko : '[' + o.value + '] ' + en;
      }
      if (savedCountry) sel.value = savedCountry;
      goBtn.textContent = returning ? I18N.t('continue') : I18N.t('start');
      noteEl.textContent = I18N.t('startNote');
      tutBtn.textContent = I18N.t('tutorialTitle');
      devEl.textContent = I18N.t('devContact');
      recoveryEl.style.display = returning ? 'block' : 'none';
    };

    // 튜토리얼 표시 (멀티페이지, 모드별 내용)
    const TUTORIAL_KEY = 'br_tutorial_v2';
    let _tutPage = 0;
    const showTutorial = () => {
      const existing = document.getElementById('tutorial-screen');
      if (existing) return;
      const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const tRoot = document.createElement('div');
      tRoot.id = 'tutorial-screen';
      tRoot.style.cssText =
        'position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.85);' +
        'display:flex;align-items:center;justify-content:center;color:#fff;' +
        'font-family:"Segoe UI","Malgun Gothic",system-ui,sans-serif;';
      const tCard = document.createElement('div');
      tCard.style.cssText =
        'width:min(92vw,500px);max-height:82vh;overflow-y:auto;padding:24px;border-radius:16px;' +
        'background:rgba(20,24,30,0.95);box-shadow:0 8px 32px rgba(0,0,0,.6);';

      // 페이지 콘텐츠 생성
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:20px;font-weight:800;color:#ffd23f;margin-bottom:4px;';
      const subtitleEl = document.createElement('div');
      subtitleEl.style.cssText = 'font-size:12px;color:rgba(255,255,255,.55);margin-bottom:14px;';
      const contentEl = document.createElement('div');
      contentEl.style.cssText = 'min-height:260px;';
      const pageDots = document.createElement('div');
      pageDots.style.cssText = 'display:flex;justify-content:center;gap:6px;margin:10px 0 4px;';
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:16px;';

      const pages = [
        // Page 0: 기본 조작
        () => {
          titleEl.textContent = I18N.t('tutorialPage1Title');
          subtitleEl.textContent = I18N.t('tutorialPage1Desc');
          contentEl.innerHTML = '';
          const items = [
            { key: 'tutorialMove', icon: '🎮' },
            { key: 'tutorialAim', icon: '🎯' },
            { key: 'tutorialFire', icon: '🔫' },
            { key: 'tutorialReload', icon: '🔄' },
            { key: 'tutorialWeapon', icon: '🔫' },
            { key: 'tutorialSprint', icon: '🏃' },
            { key: 'tutorialGrenade', icon: '💣' },
          ];
          const ul = document.createElement('div');
          ul.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
          for (const s of items) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.04);';
            const icon = document.createElement('div');
            icon.style.cssText = 'font-size:20px;width:28px;text-align:center;';
            icon.textContent = s.icon;
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:13px;line-height:1.5;opacity:.9;';
            desc.textContent = I18N.t(s.key);
            row.appendChild(icon);
            row.appendChild(desc);
            ul.appendChild(row);
          }
          contentEl.appendChild(ul);
        },
        // Page 1: 한손 모드 (모바일) / 게임팁 (데스크탑)
        () => {
          if (isMobile) {
            titleEl.textContent = I18N.t('tutorialPage2Title');
            subtitleEl.textContent = I18N.t('tutorialPage2Desc');
            contentEl.innerHTML = '';
            const items = [
              { key: 'tutorialOnehandIntro', icon: '🤖' },
              { key: 'tutorialOnehandTouch', icon: '👆' },
              { key: 'tutorialOnehandAim', icon: '🎯' },
              { key: 'tutorialOnehandMove', icon: '🚶' },
              { key: 'tutorialOnehandWeapon', icon: '🔄' },
              { key: 'tutorialOnehandGrenade', icon: '💣' },
              { key: 'tutorialOnehandAggro', icon: '⚡' },
            ];
            const ul = document.createElement('div');
            ul.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
            for (const s of items) {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.04);';
              const icon = document.createElement('div');
              icon.style.cssText = 'font-size:18px;width:26px;text-align:center;';
              icon.textContent = s.icon;
              const desc = document.createElement('div');
              desc.style.cssText = 'font-size:12px;line-height:1.5;opacity:.9;';
              desc.textContent = I18N.t(s.key);
              row.appendChild(icon);
              row.appendChild(desc);
              ul.appendChild(row);
            }
            contentEl.appendChild(ul);
            // 다른 모드 안내
            const modeNote = document.createElement('div');
            modeNote.style.cssText = 'font-size:11px;opacity:.6;margin-top:12px;padding:10px;background:rgba(255,221,122,.12);border-radius:8px;border:1px solid rgba(255,221,122,.25);';
            modeNote.textContent = I18N.t('tutorialMobile');
            contentEl.appendChild(modeNote);
          } else {
            // 데스크탑: 게임 시스템 (page 3을 page 2로)
            titleEl.textContent = I18N.t('tutorialPage3Title');
            subtitleEl.textContent = I18N.t('tutorialPage3Desc');
            contentEl.innerHTML = '';
            const items = [
              { key: 'tutorialZone', icon: '⚠️' },
              { key: 'tutorialPickup', icon: '🎒' },
              { key: 'tutorialCoins', icon: '🪙' },
              { key: 'tutorialMission', icon: '📋', vars: { n: CONFIG.COINS.MISSION_TARGET } },
              { key: 'tutorialRanking', icon: '🏅' },
              { key: 'tutorialRevive', icon: '💀' },
              { key: 'tutorialPing', icon: '📍' },
              { key: 'tutorialQuickChat', icon: '💬' },
            ];
            const ul = document.createElement('div');
            ul.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
            for (const s of items) {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.04);';
              const icon = document.createElement('div');
              icon.style.cssText = 'font-size:17px;width:26px;text-align:center;';
              icon.textContent = s.icon;
              const desc = document.createElement('div');
              desc.style.cssText = 'font-size:12px;line-height:1.5;opacity:.9;';
              desc.textContent = s.vars ? I18N.t(s.key, s.vars) : I18N.t(s.key);
              row.appendChild(icon);
              row.appendChild(desc);
              ul.appendChild(row);
            }
            contentEl.appendChild(ul);
          }
        },
        // Page 2: 게임 시스템 (모바일만 추가 페이지)
        isMobile ? () => {
          titleEl.textContent = I18N.t('tutorialPage3Title');
          subtitleEl.textContent = I18N.t('tutorialPage3Desc');
          contentEl.innerHTML = '';
          const items = [
            { key: 'tutorialZone', icon: '⚠️' },
            { key: 'tutorialPickup', icon: '🎒' },
            { key: 'tutorialCoins', icon: '🪙' },
            { key: 'tutorialMission', icon: '📋', vars: { n: CONFIG.COINS.MISSION_TARGET } },
            { key: 'tutorialRanking', icon: '🏅' },
            { key: 'tutorialRevive', icon: '💀' },
            { key: 'tutorialPing', icon: '📍' },
            { key: 'tutorialQuickChat', icon: '💬' },
          ];
          const ul = document.createElement('div');
          ul.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
          for (const s of items) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.04);';
            const icon = document.createElement('div');
            icon.style.cssText = 'font-size:17px;width:26px;text-align:center;';
            icon.textContent = s.icon;
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:12px;line-height:1.5;opacity:.9;';
            desc.textContent = s.vars ? I18N.t(s.key, s.vars) : I18N.t(s.key);
            row.appendChild(icon);
            row.appendChild(desc);
            ul.appendChild(row);
          }
          contentEl.appendChild(ul);
        } : null,
      ].filter(Boolean);

      const totalPages = pages.length;

      const renderPage = () => {
        _tutPage = Math.max(0, Math.min(totalPages - 1, _tutPage));
        // 페이지 내용 그리기
        contentEl.innerHTML = '';
        titleEl.innerHTML = '';
        subtitleEl.innerHTML = '';
        pageDots.innerHTML = '';
        if (pages[_tutPage]) pages[_tutPage]();
        // 페이지 도트
        for (let i = 0; i < totalPages; i++) {
          const dot = document.createElement('div');
          dot.style.cssText =
            'width:8px;height:8px;border-radius:50%;cursor:pointer;transition:all .2s;' +
            `background:${i === _tutPage ? '#ffd23f' : 'rgba(255,255,255,.2)'};` +
            (i === _tutPage ? 'transform:scale(1.3);' : '');
          (idx => {
            dot.addEventListener('click', () => { _tutPage = idx; renderPage(); });
          })(i);
          pageDots.appendChild(dot);
        }
        // 버튼
        btnRow.innerHTML = '';
        const isFirst = _tutPage === 0;
        const isLast = _tutPage === totalPages - 1;
        const prevBtn = document.createElement('button');
        prevBtn.style.cssText =
          'padding:8px 16px;border:none;border-radius:8px;background:' +
          (isFirst ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.12)') + ';' +
          'color:#fff;cursor:pointer;font-size:13px;' +
          'opacity:' + (isFirst ? '.4' : '1') + ';' +
          'transition:background .15s;';
        prevBtn.textContent = I18N.t('tutorialPrev');
        prevBtn.disabled = isFirst;
        prevBtn.addEventListener('click', () => { if (!isFirst) { _tutPage--; renderPage(); } });
        const skipBtn = document.createElement('button');
        skipBtn.style.cssText =
          'padding:8px 16px;border:none;border-radius:8px;background:rgba(255,255,255,.1);' +
          'color:rgba(255,255,255,.6);cursor:pointer;font-size:13px;transition:background .15s;';
        skipBtn.textContent = I18N.t('tutorialSkip');
        skipBtn.addEventListener('click', closeTutorial);
        const nextBtn = document.createElement('button');
        nextBtn.style.cssText =
          'padding:8px 20px;border:none;border-radius:8px;background:#ffd23f;color:#20242b;' +
          'cursor:pointer;font-weight:bold;font-size:13px;transition:background .15s;';
        nextBtn.textContent = isLast ? I18N.t('tutorialDone') : I18N.t('tutorialNext');
        nextBtn.addEventListener('click', () => {
          if (isLast) closeTutorial();
          else { _tutPage++; renderPage(); }
        });
        btnRow.appendChild(prevBtn);
        btnRow.appendChild(skipBtn);
        btnRow.appendChild(nextBtn);
      };

      tCard.appendChild(titleEl);
      tCard.appendChild(subtitleEl);
      tCard.appendChild(contentEl);
      tCard.appendChild(pageDots);
      tCard.appendChild(btnRow);
      tRoot.appendChild(tCard);

      const closeTutorial = () => {
        if (tRoot.parentNode) tRoot.parentNode.removeChild(tRoot);
        // 본 튜토리얼을 본 경우 더 이상 first hint 표시 안 함
        try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch {}
      };

      document.body.appendChild(tRoot);
      renderPage();
    };

    // 첫 방문 시 튜토리얼 자동 표시 (로컬스토리지 체크)
    const hasSeenTutorial = (() => { try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { return false; } })();
    if (!hasSeenTutorial) {
      // 약간 지연 후 표시 (화면이 먼저 그려지도록)
      setTimeout(() => {
        // 이미 시작 화면이 사라졌으면 표시하지 않음
        if (document.getElementById('start-screen')) showTutorial();
      }, 600);
    }

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
