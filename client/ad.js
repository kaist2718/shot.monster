// ============================================================
// ad.js - 보상형 광고 래퍼(스터브). (client)
// 실제 광고 SDK(AdMob/GAM 등) 연동 지점. 현재는 예시 오버레이로 대체.
// showRewardedAd(onReward): 광고 시청 완료 시 onReward() 호출.
// ============================================================

import { I18N } from './i18n.js';
const t = (k) => I18N.t(k);

let _currentAd = null; // 진행 중 광고 — 중복 호출 시 누적/이중 보상 방지

/** 진행 중 광고 오버레이 해제(모드/룸 전환 시 생명주기 정리용) */
export function dismissAd() {
  if (_currentAd) _currentAd.finish();
}

export function showRewardedAd(onReward) {
  if (_currentAd) return; // 이미 재생 중 — 무시
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'color:#fff;font-family:sans-serif;user-select:none;';
  el.innerHTML =
    '<div style="font-size:18px;opacity:.8;margin-bottom:14px;">' + t('adPlaying') + '</div>' +
    '<div style="width:60%;max-width:320px;height:10px;background:rgba(255,255,255,.2);border-radius:5px;overflow:hidden;">' +
    '<div id="adfill" style="height:100%;width:0;background:#ffd23f;"></div></div>' +
    '<button id="adskip" style="margin-top:22px;padding:10px 22px;border:none;border-radius:8px;' +
    'background:#444;color:#fff;font-size:15px;" disabled>' + t('adWait') + '</button>';
  document.body.appendChild(el);

  const fill = el.querySelector('#adfill');
  const skip = el.querySelector('#adskip');
  const DURATION = 3000;
  const t0 = performance.now();
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    if (el.parentNode) el.parentNode.removeChild(el);
    _currentAd = null; // 다음 광고 허용
    if (onReward) onReward();
  };
  _currentAd = { finish };
  const timer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / DURATION);
    fill.style.width = (p * 100) + '%';
    if (p >= 0.5) {
      skip.disabled = false; skip.style.background = '#ffd23f'; skip.style.color = '#20242b';
      skip.textContent = t('adClose');
    }
    if (p >= 1) finish();
  }, 50);
  skip.addEventListener('click', () => { if (!skip.disabled) finish(); });
}
