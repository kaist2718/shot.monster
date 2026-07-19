// ============================================================
// smoke.test.js - 다중 룸/모드 라우팅 엔드투엔드 스모크(임시).
// 서버 부팅 + AI/multi 룸 배정 + multiList + 룸별 스냅샷 분리 확인.
// ============================================================
import { io } from 'socket.io-client';

process.env.PORT = '3997';
await import('../server.js');

const URL = 'http://localhost:3997';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (auth) => io(URL, { auth: { clientId: auth.clientId, name: auth.name, country: 'KR', mode: auth.mode }, transports: ['websocket'] });
const initOf = (sock) => new Promise((res) => sock.once('init', res));
const once = (sock, ev, ms = 3000) => new Promise((res) => {
  const h = (d) => { sock.off(ev, h); res(d); };
  sock.on(ev, h);
  setTimeout(() => { sock.off(ev, h); res(null); }, ms);
});

let fail = 0;
const check = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); fail++; } };

// (1) AI 모드 접속 → 전용 룸, init.mode='ai', level=1
console.log('(1) AI 모드 룸 배정');
{
  const s = connect({ clientId: 'c-AI1', name: 'AIer', mode: 'ai' });
  const aiP = once(s, 'aiLeaderboard'); // 리스너를 init 이전에 붙임(emitBoot 동시 송출 대비)
  const init = await initOf(s);
  check(init.mode === 'ai', `init.mode='ai' (실제 ${init.mode})`);
  check(init.level === 1, `init.level=1 (실제 ${init.level})`);
  check(typeof init.roomId === 'string', `roomId 제공 (실제 ${init.roomId})`);
  const aib = await aiP;
  check(Array.isArray(aib), 'aiLeaderboard 수신');
  s.disconnect();
}

// (2) multi 2소켓 → 같은 룸 배정(자동), multiList 에 인원 반영
console.log('(2) multi 자동 룸 배정 + 인원 표시');
{
  const a = connect({ clientId: 'c-M1', name: 'M1', mode: 'multi' });
  const ia = await initOf(a);
  const b = connect({ clientId: 'c-M2', name: 'M2', mode: 'multi' });
  const ib = await initOf(b);
  check(ia.mode === 'multi' && ib.mode === 'multi', '둘 다 multi');
  check(ia.roomId === ib.roomId, `같은 룸 자동 배정 (실제 ${ia.roomId} / ${ib.roomId})`);
  // multiList 갱신 대기
  await wait(150);
  const list = await new Promise((res) => { a.emit('getMultiList'); a.once('multiList', res); setTimeout(() => res(null), 2000); });
  check(!!list && list.length > 0, `multiList 룸 존재 (실제 ${list && list.length}개)`);
  const mine = list && list.find((r) => r.roomId === ia.roomId);
  check(!!mine && mine.humans === 2, `현재 룸 인원 2 (실제 ${mine && mine.humans})`);
  check(!!mine && mine.maxHumans === 9, `maxHumans 9 (실제 ${mine && mine.maxHumans})`);
  a.disconnect(); b.disconnect();
}

// (3) 룸별 스냅샷 분리: AI 소켓은 AI 룸의 엔티티만, multi 소켓은 multi 룸만
console.log('(3) 룸별 스냅샷 분리');
{
  const ai = connect({ clientId: 'c-AI2', name: 'AI2', mode: 'ai' });
  const mu = connect({ clientId: 'c-M3', name: 'M3', mode: 'multi' });
  await initOf(ai); await initOf(mu);
  await wait(400); // 라운드 시작 대기(AI 3s/multi 10s) — 로비 스냅샷이라도 수신
  const aiSnap = await new Promise((res) => { ai.once('snapshot', res); setTimeout(() => res(null), 2000); });
  const muSnap = await new Promise((res) => { mu.once('snapshot', res); setTimeout(() => res(null), 2000); });
  check(!!aiSnap && aiSnap.mode === 'ai', `AI 스냅샷 mode='ai' (실제 ${aiSnap && aiSnap.mode})`);
  check(!!muSnap && muSnap.mode === 'multi', `multi 스냅샷 mode='multi' (실제 ${muSnap && muSnap.mode})`);
  ai.disconnect(); mu.disconnect();
}

// (4) 모드 전환: multi → joinAI → AI 룸
console.log('(4) 모드 전환(multi→AI)');
{
  const s = connect({ clientId: 'c-SW', name: 'SW', mode: 'multi' });
  const i1 = await initOf(s);
  s.emit('joinAI');
  const i2 = await once(s, 'init');
  check(i2.mode === 'ai', `전환 후 mode='ai' (실제 ${i2 && i2.mode})`);
  check(i2.roomId !== i1.roomId, `다른 룸으로 전환 (실제 ${i1.roomId}→${i2 && i2.roomId})`);
  s.disconnect();
}

console.log(fail === 0 ? '\n스모크 테스트 전부 통과 ✓' : `\n${fail}개 실패 ✗`);
process.exit(fail === 0 ? 0 : 1);
