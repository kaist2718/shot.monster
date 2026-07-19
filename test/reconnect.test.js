// ============================================================
// reconnect.test.js - 재접속/2탭 clientId 처리 자동화 테스트(A1/A2).
// 실행: node test/reconnect.test.js
// 동일 프로세스에서 server.js를 임포트해 구동하고 socket.io-client로 시나리오 검증.
// ============================================================

import { io } from 'socket.io-client';
import { CONFIG } from '../shared/config.js';

// 테스트 속도를 위해 재접속 유예를 1초로 단축(server.js와 같은 CONFIG 객체 공유).
CONFIG.NET.RECONNECT_GRACE = 1;

process.env.PORT = '3999';
await import('../server.js'); // 서버 부팅(3999)

const URL = 'http://localhost:3999';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (clientId) => io(URL, { auth: { clientId }, transports: ['websocket'] });
const initOf = (sock) => new Promise((res) => sock.once('init', (d) => res(d)));

let fail = 0;
const check = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); fail++; } };

// (i) 다른 clientId 2소켓 → 다른 yourId
console.log('(i) 다른 clientId 2소켓');
{
  const a = connect('c-A'), b = connect('c-B');
  const [ia, ib] = await Promise.all([initOf(a), initOf(b)]);
  check(ia.yourId !== ib.yourId, `yourId 상이: ${ia.yourId} / ${ib.yourId}`);
  a.disconnect(); b.disconnect();
}

// (ii) 같은 clientId 동시 2소켓 → 다른 yourId (핵심 버그 수정)
console.log('(ii) 같은 clientId 동시 2소켓 (핵심)');
{
  const a = connect('c-SAME');
  const ia = await initOf(a); // a 완전히 확립된 뒤
  const b = connect('c-SAME');
  const ib = await initOf(b);
  check(ia.yourId !== ib.yourId, `동시 2탭 yourId 상이: ${ia.yourId} / ${ib.yourId}`);
  a.disconnect(); b.disconnect();
}

// (iii) disconnect → 유예 내 재접속 → 동일 yourId
console.log('(iii) disconnect → 유예 내 재접속 → 동일 yourId');
{
  const a = connect('c-RECONNECT');
  const ia = await initOf(a);
  a.disconnect();
  await wait(200); // 서버 disconnect 처리 + 유예 시작 대기
  const b = connect('c-RECONNECT');
  const ib = await initOf(b);
  check(ia.yourId === ib.yourId, `재접속 동일 yourId: ${ia.yourId} === ${ib.yourId}`);
  b.disconnect();
}

// (iv) disconnect → 유예 만료(1s) 후 재접속 → 신규 yourId
console.log('(iv) disconnect → 유예 만료 후 재접속 → 신규 yourId');
{
  const a = connect('c-EXPIRE');
  const ia = await initOf(a);
  a.disconnect();
  await wait(1500); // 유예 1초 초과 → player 제거
  const b = connect('c-EXPIRE');
  const ib = await initOf(b);
  check(ia.yourId !== ib.yourId, `만료 후 신규 yourId: ${ia.yourId} !== ${ib.yourId}`);
  b.disconnect();
}

console.log(fail === 0 ? '\n재접속 테스트 전부 통과 ✓' : `\n${fail}개 실패 ✗`);
process.exit(fail === 0 ? 0 : 1);
