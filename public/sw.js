// ============================================================
// sw.js - 서비스워커(network-first). 오프라인 플레이 지원.
// 정책: 항상 네트워크 우선(개발 중에도 항상 최신 자산). 네트워크 실패 시에만
//       캐시로 폴백 → 불안정한 모바일 망에서도 앱 셸이 로드됨.
// Socket.io 폴링/웹소켓은 가로채지 않는다(실시간 통신 유지).
// ============================================================

const CACHE = 'surviv-br-v2';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  // 같은 origin만. Socket.io 실시간 통신은 건드리지 않는다.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // 유효한 기본 응답만 캐시(GET, 같은 origin, opaque 제외).
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('/'))
      )
  );
});
