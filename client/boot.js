// ============================================================
// boot.js - 부트 스플래시 제거 + 기기 감지. (client)
// index.html 의 #boot-splash 이 JS 로딩 중에 표시된다.
// hideBootSplash()는 시작 화면 표시 전에 호출해 페이드아웃.
// ============================================================

// orientation 락 보조(iOS/Android): 가로 모드 권장 힌트
export function initOrientationHint() {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) return;

  const hint = document.getElementById('orient-hint');
  if (!hint) return;

  const check = () => {
    const landscape = window.innerWidth > window.innerHeight;
    hint.classList.toggle('show', !landscape);
  };
  window.addEventListener('resize', check);
  check();
}

// 부트 스플래시 제거 — 시작 화면이 준비되면 페이드아웃 후 제거
export function hideBootSplash() {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }, 500);
}
