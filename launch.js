// ============================================================
// launch.js - 원 클릭 실행기. (크로스플랫폼)
// 1) node_modules 누락 시 자동 npm install
// 2) 서버(server.js)를 자식 프로세스로 기동(로그는 이 콘솔로 스트리밍)
// 3) 헬스체크(GET /)가 200 응답하면 기본 브라우저를 자동 오픈
// 4) Ctrl-C / 서버 종료 시 자식 프로세스를 안전하게 정리
//
// 사용:
//   node launch.js            # 기본 PORT(3000) → 서버 실행 + 브라우저 오픈
//   node launch.js --no-open  # 브라우저 자동 오픈 생략(서버만)
//   PORT=4000 node launch.js  # 포트 지정
//   npm run launch            # 동일
// ============================================================

import { spawn, spawnSync, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- 인자/환경 파싱 ----
const argv = process.argv.slice(2);
const noOpen = argv.includes('--no-open') || /^(0|false|no)$/i.test(process.env.BROWSER || '');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const URL = `http://localhost:${PORT}/`;

function log(...a) { console.log('[launch]', ...a); }
function err(...a) { console.error('[launch]', ...a); }

// ---- 1) 의존성 확인(최초 실행 편의) ----
function ensureDeps() {
  if (existsSync(path.join(__dirname, 'node_modules'))) return;
  log('node_modules 가 없습니다 — npm install 실행(최초 1회)...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmCmd, ['install'], { cwd: __dirname, stdio: 'inherit' });
  if (r.status !== 0) { err('npm install 실패 — 직접 "npm install" 을 실행해 주세요.'); process.exit(1); }
  log('의존성 설치 완료.');
}

// ---- 2) 서버 기동(자식 프로세스) ----
function startServer() {
  const env = { ...process.env, PORT: String(PORT) };
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (serverReady) return; // 정상 종료 경로(아래에서 처리)
    // 헬스체크 성공 전에 자식이 죽었으면(예: EADDRINUSE) 즉시 보고
    if (code === 1) {
      err(`서버가 시작 중 종료됐습니다(코드 1). 이미 ${PORT} 번 포트를 쓰고 있을 수 있습니다 — 다른 포트: PORT=3001 node launch.js`);
    } else {
      err(`서버 프로세스 종료(code=${code}, signal=${signal}).`);
    }
    process.exit(code ?? 1);
  });
  return child;
}

// ---- 3) 헬스체크(GET /) ----
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkHealth()) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

// ---- 4) 기본 브라우저 오픈(플랫폼별) ----
function openBrowser(url) {
  try {
    switch (process.platform) {
      case 'win32':
        // 'start "" <url>' — 첫 빈 인자는 창 제목(필수). cmd /c 로 실행.
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
        break;
      case 'darwin':
        spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        break;
      default:
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    log(`브라우저를 열었습니다: ${url}`);
  } catch {
    err(`브라우저 자동 열기 실패 — 직접 열어 주세요: ${url}`);
  }
}

// ---- 메인 ----
let serverReady = false;
let serverChild = null;

function cleanup() {
  if (serverChild && !serverChild.killed) {
    try { serverChild.kill('SIGINT'); } catch { /* 무시 */ }
  }
}
process.on('SIGINT', () => { log('종료 중...'); cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

ensureDeps();
serverChild = startServer();

log(`서버가 http://localhost:${PORT} 에서 응답하기를 기다리는 중...`);
const ok = await waitForHealth();
serverReady = ok;

if (ok) {
  log(`✓ 서버 준비 완료 → ${URL}`);
  if (!noOpen) openBrowser(URL);
  log('종료하려면 Ctrl-C 를 누르세요.');
} else {
  err(`서버가 제한 시간 내 응답하지 않았습니다. 직접 확인해 주세요: ${URL}`);
}

// 서버가 살아있는 동안 런처도 함께 살아있는다(로그는 자식이 inherit 로 출력).
await new Promise((resolve) => {
  if (serverChild) serverChild.on('exit', () => resolve());
  else resolve();
});
