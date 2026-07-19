// ============================================================
// board.test.js - 보드 세션 분리(2탭) + 같은 모드 재전환 no-op 검증.
// 보드를 player.id 단위로 분리(HIGH-1)하고, 같은 모드 재전환 시
// AI 레벨/룸이 보존되는지(HIGH-3) 확인한다.
// 실행: node test/board.test.js
// ============================================================
import { io } from 'socket.io-client';

process.env.PORT = '3996';
await import('../server.js');

const URL = 'http://localhost:3996';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (auth) =>
  io(URL, { auth: { clientId: auth.clientId, name: auth.name, country: 'KR', mode: auth.mode }, transports: ['websocket'] });
const initOf = (sock) => new Promise((res) => sock.once('init', res));
const once = (sock, ev, ms = 1500) => new Promise((res) => {
  let done = false;
  const h = (d) => { if (!done) { done = true; sock.off(ev, h); res(d); } };
  sock.on(ev, h);
  setTimeout(() => { if (!done) { done = true; sock.off(ev, h); res(null); } }, ms);
});

let fail = 0;
const check = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); fail++; } };

// (1) 같은 clientId 2탭 → yourId 상이(별개 player.id). 보드가 player.id 단위이므로
//     두 탭이 같은 보드 엔트리에 덮어쓰지 않는다(분리의 전제 조건).
console.log('(1) 같은 clientId 2탭 → yourId 상이(보드 분리 전제)');
{
  const a = connect({ clientId: 'c-DUP', name: 'DUP1', mode: 'multi' });
  const ia = await initOf(a);
  const b = connect({ clientId: 'c-DUP', name: 'DUP2', mode: 'multi' });
  const ib = await initOf(b);
  check(ia.yourId !== ib.yourId, `2탭 yourId 상이: ${ia.yourId} / ${ib.yourId}`);
  a.disconnect(); b.disconnect();
}

// (2) 같은 모드 재전환(multi → 빠른입장 joinMulti) no-op — 룸 유지 + init 미재송출
console.log('(2) 같은 모드 재전환 no-op(multi)');
{
  const s = connect({ clientId: 'c-NOOP-M', name: 'NOOPM', mode: 'multi' });
  const i1 = await initOf(s);
  s.emit('joinMulti'); // 같은 모드, roomId 없음 → no-op
  const i2 = await once(s, 'init', 800); // no-op → init 미수신
  s.emit('getMultiList');
  const list = await once(s, 'multiList', 1500);
  const mine = list && list.find((r) => r.roomId === i1.roomId);
  check(i2 === null, '같은 모드 joinMulti → init 미재송출(no-op)');
  check(!!mine, `현재 룸 유지 (roomId ${i1.roomId})`);
  s.disconnect();
}

// (3) AI 모드 재전환 no-op — 첫 joinAI → AI 모드, 두 번째 joinAI → no-op(룸/레벨 유지)
console.log('(3) AI 모드 재전환 no-op(레벨 롤백 방지)');
{
  const s = connect({ clientId: 'c-NOOP-A', name: 'NOOPA', mode: 'multi' });
  await initOf(s);
  s.emit('joinAI');
  const i1 = await once(s, 'init', 1500);
  check(!!i1 && i1.mode === 'ai', `첫 joinAI → AI 모드 (roomId ${i1 && i1.roomId})`);
  s.emit('joinAI'); // 같은 AI 모드 → no-op
  const i2 = await once(s, 'init', 800);
  check(i2 === null, '같은 모드 joinAI 재호출 → no-op(init 미수신 → 레벨/룸 유지)');
  s.disconnect();
}

console.log(fail === 0 ? '\n보드 분리/no-op 테스트 전부 통과 ✓' : `\n${fail}개 실패 ✗`);
process.exit(fail === 0 ? 0 : 1);
