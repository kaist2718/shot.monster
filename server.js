// ============================================================
// server.js - Express(정적 서빙, 화이트리스트) + Socket.io + 다중 룸 구동.
// 60Hz 시뮬레이션, 20Hz 스냅샷. 각 룸은 독립 GameSim.
//   - AI 룸: 인간 1명 + 봇 level 개(레벨 1~9 캠페인). 인간당 1개.
//   - multi 룸: 인간 최대 9명 + 봇 충원(총 9). 자동 생성, 10초 후 시작.
// 소켓은 자기 룸의 socket.io 룸에 조인해 io.to(roomId)로 송수신.
// 보안: 정적 서빙 격리(dotfiles deny), CORS 동일출처, helmet, 연결/입력 속도제한.
// Redis 영속화: multiBoard/aiBoard를 Redis에 저장하여 서버 재시작 시 보존.
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import { GameSim, sanitizeController } from './shared/sim.js';
import { CONFIG } from './shared/config.js';
import { COUNTRY_CODES, aggregateCountryBoard } from './shared/countries.js';
import { clamp } from './shared/utils.js';

// Redis 클라이언트 (옵션, Redis URL이 있을 때만 연결)
let redis = null;
let redisReady = false;
async function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { console.log('Redis URL 미설정 - 인메모리 보드 사용'); return; }
  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: redisUrl });
    redis.on('error', (e) => console.error('Redis error:', e.message));
    await redis.connect();
    redisReady = true;
    console.log('Redis 연결 성공');
    await loadBoardsFromRedis();
  } catch (e) {
    console.error('Redis 연결 실패, 인메모리 보드 사용:', e.message);
  }
}

// Redis에서 보드 로드
async function loadBoardsFromRedis() {
  if (!redisReady) return;
  try {
    const day = todayStr();
    const multiKey = `board:multi:${day}`;
    const aiKey = `board:ai:${day}`;
    const multiData = await redis.get(multiKey);
    const aiData = await redis.get(aiKey);
    if (multiData) {
      const parsed = JSON.parse(multiData);
      for (const [id, entry] of Object.entries(parsed)) multiBoard.set(id, entry);
    }
    if (aiData) {
      const parsed = JSON.parse(aiData);
      for (const [id, entry] of Object.entries(parsed)) aiBoard.set(id, entry);
    }
    console.log('Redis 보드 로드 완료');
  } catch (e) { console.error('Redis 보드 로드 실패:', e.message); }
}

// Redis에 보드 저장
async function saveBoardsToRedis() {
  if (!redisReady) return;
  try {
    const day = todayStr();
    const multiKey = `board:multi:${day}`;
    const aiKey = `board:ai:${day}`;
    const multiObj = Object.fromEntries([...multiBoard.entries()]);
    const aiObj = Object.fromEntries([...aiBoard.entries()]);
    await redis.set(multiKey, JSON.stringify(multiObj), { EX: 86400 }); // 24시간 TTL
    await redis.set(aiKey, JSON.stringify(aiObj), { EX: 86400 });
  } catch (e) { console.error('Redis 보드 저장 실패:', e.message); }
}

// 이름/국가 입력 정규화(기초 안티치트 — sanitizeController 철학과 동일)
const COUNTRY_SET = new Set(COUNTRY_CODES);
const NAME_STRIP = '<>"\'`';
function randSuffix() { return (Math.floor(Math.random() * 900) + 100); }
function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Player' + randSuffix();
  // 제어문자(C0 0x00-0x1f, DEL 0x7f)와 마크업/따옴표 제거 → trim → 길이 cap.
  // (정규식 제어문자 리터럴 이스케이프 오동작 방지를 위해 코드 기반 순회)
  let s = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    if (NAME_STRIP.indexOf(ch) >= 0) continue;
    s += ch;
  }
  s = s.trim().slice(0, 16);
  return s.length > 0 ? s : 'Player' + randSuffix();
}
function sanitizeCountry(raw) {
  return (typeof raw === 'string' && COUNTRY_SET.has(raw.toUpperCase())) ? raw.toUpperCase() : null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ---- 프로덕션 hardening ----
app.set('trust proxy', 1);                       // 리버스 프록시(Nginx 등) 뒤에서 신뢰
app.use(helmet({ contentSecurityPolicy: false })); // 캔버스 게임: CSP는 인라인/동일출처 범위, 완화
app.use(compression());
const STATIC_OPTS = { dotfiles: 'deny', maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 };

// ---- 정적 서빙 화이트리스트(루트 디렉토리 통째 서빙 금지 — 소스/설정/테스트 노출 방지) ----
app.use('/client', express.static(path.join(__dirname, 'client'), STATIC_OPTS));
app.use('/css', express.static(path.join(__dirname, 'css'), STATIC_OPTS));
app.use('/shared', express.static(path.join(__dirname, 'shared'), STATIC_OPTS));
// PWA 자산(좁은 명시적 라우트 — 화이트리스트 정책 유지). SW 는 루트 스코프(/)에서 동작해야 전 앱 제어.
app.get('/manifest.webmanifest', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest')));
app.get('/sw.js', (req, res) => { res.type('text/javascript'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.use('/icons', express.static(path.join(__dirname, 'public', 'icons'), STATIC_OPTS));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
// /server.js, /package.json, /test, /node_modules, /README.md, /.env 등은 모두 404.

// CORS: 명시된 출처만(미설정=false → 동일출처만). Socket.io 는 아래 io 옵션으로 전달.
const CORS_ORIGIN = (() => {
  const v = process.env.CORS_ORIGIN;
  if (!v) return false; // 동일출처만 허용
  return v === '*' ? true : v.split(',').map((s) => s.trim());
})();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5, // 100KB — 입력/컨트롤러 페이로드 제한(과도한 패킷 차단)
});

// ---- 속도제한 상수 ----
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 8;  // IP당 동시 연결
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 200;            // 전체 룸 상한(자원 고갈 방지)
const INPUT_MIN_MS = 20;                                           // 입력 최소 간격(50Hz 초과 무시, 정상 30Hz 통과)
const BOARD_EMIT_MS = 1000;                                        // 보드/국가 순위 브로드캐스트 간격
const LIST_EMIT_MS = 1000;                                         // 룸 목록 브로드캐스트 간격

// ---- 룸 관리 ----
const rooms = new Map();          // roomId -> { id, mode, sim, controllers:Map }
let roomSeq = 0;
const socketToPlayer = new Map(); // socket.id -> player
const clientPlayers = new Map();  // clientId -> identity-holder player (재접속 매칭용)
const removeTimers = new Map();   // player.id -> setTimeout 핸들 (player 단위 유예)

// ---- 오늘의 보드(모드별 분리, player.id 단위). 날짜가 바뀌면 초기화 ----
const multiBoard = new Map();     // player.id -> { name, kills, ... } (킬순)
const aiBoard = new Map();        // player.id -> { name, maxLevel }   (최고 레벨순)
let boardDay = todayStr();
let boardDirty = false;
let aiBoardDirty = false;
let multiListDirty = false;
let lastBoardEmit = 0;
let lastListEmit = 0;

function todayStr() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; // UTC 기준(예측 가능한 일일 리셋)
}

// ---- 룸 helpers ----
function createRoom(mode, opts = {}) {
  if (rooms.size >= MAX_ROOMS) return null; // 룸 상한 — 자원 고갈/DoS 방지
  const id = 'r' + (++roomSeq);
  const cfg = (mode === 'ai')
    ? { mode: 'ai', level: 1, lobbyTime: CONFIG.MODES.AI_LOBBY_TIME, roundOverTime: CONFIG.MODES.AI_ROUND_OVER_TIME }
    : { mode: 'multi', maxHumans: CONFIG.MODES.MULTI_MAX_HUMANS, targetEntities: CONFIG.MODES.MULTI_TOTAL, lobbyTime: CONFIG.MODES.MULTI_LOBBY_TIME };
  const room = { id, mode, sim: new GameSim({ ...cfg, ...opts }), controllers: new Map() };
  rooms.set(id, room);
  if (mode === 'multi') multiListDirty = true;
  return room;
}

// 라이브 인간(활성 소켓) 수 — 룸 cap/표시/정지 기준
function liveHumans(room) {
  let n = 0;
  for (const e of room.sim.entities) if (e.isHuman && e.socketId !== null) n++;
  return n;
}
// 룸 내 전체 인간(라이브 + 유예/grace) 수 — 용량 산정용. grace 인간도 자리를 차지하므로
// 중복 룸 생성 방지(findMultiLobby 가드).
function roomHumans(room) {
  let n = 0;
  for (const e of room.sim.entities) if (e.isHuman) n++;
  return n;
}
function hasLiveSocket(room) { return liveHumans(room) > 0; }

// 멀티 룸 중 입장 가능한(대기 중 + 여유 + 인간 1명 이상) 첫 룸. 없으면 null.
// 용량은 grace 인간을 포함해 세어, 유예 창에 새 룸이 무한 생성되는 걸 막는다.
function findMultiLobby() {
  for (const room of rooms.values()) {
    if (room.mode === 'multi' && room.sim.phase === 'lobby' &&
        roomHumans(room) > 0 && roomHumans(room) < room.sim.maxHumans) return room;
  }
  return null;
}
// roomId 지정 입장(여유 있을 때만) — 용량도 grace 포함 산정
function findMultiRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.mode === 'multi' && roomHumans(room) < room.sim.maxHumans) return room;
  return null;
}

// 라이브/유예 인간이 하나도 남지 않으면 룸 제거(재접속 창은 보장)
function destroyIfEmpty(room) {
  if (room.sim.entities.some((e) => e.isHuman)) return;
  rooms.delete(room.id);
  if (room.mode === 'multi') multiListDirty = true;
}

// 소켓을 모드에 맞는 룸에 배정(재사용 or 신규 생성). targetRoom=멀티 특정 룸 지정 입장.
function assignSocket(socket, mode, targetRoom = null) {
  const auth = socket.handshake.auth || {};
  const clientId = auth.clientId || null;
  const safeName = sanitizeName(auth.name);
  const safeCountry = sanitizeCountry(auth.country);

  // 모드 인식 재사용: 같은 clientId 후보가 유예 중(활성 소켓 없음) + 같은 모드 룸이면 동일 플레이어 재사용.
  // 2탭(같은 clientId)은 후보가 라이브 → 재사용 조건 불만족 → 별개 플레이어/룸.
  const candidate = clientId ? clientPlayers.get(clientId) : null;
  let player, room;
  if (candidate && !candidate.socketId && candidate.room && candidate.room.mode === mode) {
    player = candidate;
    room = player.room;
    if (!room.sim.entities.includes(player)) room.sim.entities.push(player); // 유예 중 제거됐다면 복구
  } else {
    // 같은 clientId가 '유예 중'이며 다른 모드 룸에 잔재 중이면 정리(한 clientId가 두 룸에 잔존 방지).
    // (라이브 candidate는 두 번째 탭 = 별개 플레이어로 두어 2탭 허용 정책 유지)
    if (candidate && !candidate.socketId && candidate.room && candidate.room.mode !== mode) leaveRoom(candidate);
    if (targetRoom) room = targetRoom;
    else if (mode === 'ai') room = createRoom('ai');
    else room = findMultiLobby() || createRoom('multi');
    if (!room) return { player: null, room: null }; // 룸 상한 초과
    player = room.sim.addPlayer();                 // 관전 상태로 추가, 다음 라운드 스폰
    player.clientId = clientId;
    player.room = room;
    if (clientId && !candidate) clientPlayers.set(clientId, player); // 첫 보유자만 등록(라이브 홀더 덮어쓰기 금지)
  }
  player.socketId = socket.id;
  player.name = safeName;        // 매 접속마다 최신 이름/국가 적용
  player.country = safeCountry;

  // 보류 중인 제거 타이머가 있으면 취소(재접속/재활성화)
  const t = removeTimers.get(player.id);
  if (t) { clearTimeout(t); removeTimers.delete(player.id); }

  socket.join(room.id);
  socketToPlayer.set(socket.id, player);
  room.controllers.set(player.id, zeroInput());

  // 멀티 로비 넛지: 첫 입장이면 카운트다운 리셋, 가득 차면 즉시 시작(페이즈 전환은 틱이 주도)
  if (mode === 'multi' && room.sim.phase === 'lobby') {
    const live = liveHumans(room);
    if (live === 1) room.sim.phaseTimer = room.sim.lobbyTime;
    else if (live >= room.sim.maxHumans) room.sim.phaseTimer = 0;
  }
  if (room.mode === 'multi') multiListDirty = true;
  return { player, room };
}

// 즉시 퇴장(모드 전환용 — 유예 없음)
function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  const t = removeTimers.get(player.id);
  if (t) { clearTimeout(t); removeTimers.delete(player.id); }
  room.sim.removePlayer(player.id);
  room.controllers.delete(player.id);
  if (player.socketId) {
    const s = io.sockets.sockets.get(player.socketId);
    if (s) s.leave(room.id);
  }
  if (player.clientId && clientPlayers.get(player.clientId) === player) clientPlayers.delete(player.clientId);
  player.room = null;
  const wasMulti = room.mode === 'multi';
  destroyIfEmpty(room);
  if (wasMulti) multiListDirty = true;
}

// 소켓에 init/정적데이터/보드를 (재)송출
function emitBoot(socket, player, room) {
  socket.emit('init', { yourId: player.id, mode: room.mode, level: room.sim.level, roomId: room.id, ...room.sim.getInitData() });
  socket.emit('roundStart', room.sim.getRoundStartData());
  socket.emit('leaderboard', getMultiLeaderboard());
  socket.emit('aiLeaderboard', getAILeaderboard());
  socket.emit('countryBoard', getCountryBoard());
  socket.emit('multiList', getMultiList());
}

// 모드 전환: 현재 룸 퇴장 → 새 모드 룸 배정 → 부트 재송출
function switchMode(socket, mode, roomId) {
  const old = socketToPlayer.get(socket.id);
  // 같은 모드 재전환 no-op — AI 캠페인 레벨/룸이 보존됨(중복 클릭/터치로 진행도 날아가는 버그 방지).
  // 부작용(emitBoot 재송출 → 클라 상태 리셋)도 없도록 아무 것도 하지 않는다.
  if (old && old.room && old.room.mode === mode && !roomId) return;
  if (old) leaveRoom(old);
  let target = null;
  if (mode === 'multi' && typeof roomId === 'string') target = findMultiRoom(roomId);
  const { player, room } = assignSocket(socket, mode, target);
  if (player && room) emitBoot(socket, player, room);
}

// ---- 보드 집계(player.id = 세션 단위. 2탭은 별개 player.id → 독립 보드 엔트리, 덮어쓰기 충돌 없음) ----
function recordKill(sim, killerId) {
  const p = sim.entities.find((x) => x.id === killerId);
  if (!p || !p.isHuman) return;       // 인간 플레이어만 집계
  const key = p.id;
  const cur = multiBoard.get(key) || { id: key, name: p.name, country: p.country, kills: 0, score: 0, coins: 0, missionDone: false };
  cur.name = p.name; cur.country = p.country; cur.kills++; cur.score = p.score; cur.coins = p.coins;
  if (!cur.missionDone && cur.kills >= CONFIG.COINS.MISSION_TARGET) {
    cur.missionDone = true; cur.coins += CONFIG.COINS.MISSION; p.coins += CONFIG.COINS.MISSION;
  }
  multiBoard.set(key, cur);
  boardDirty = true;
}
function recordAILevel(sim, ev) {
  const human = sim.entities.find((e) => e.isHuman);
  if (!human) return;
  const key = human.id;
  const cur = aiBoard.get(key) || { id: key, name: human.name, country: human.country, maxLevel: 0 };
  cur.name = human.name; cur.country = human.country;
  cur.maxLevel = Math.max(cur.maxLevel, ev.maxLevelReached);
  aiBoard.set(key, cur);
  aiBoardDirty = true;
}
function getMultiLeaderboard() {
  return [...multiBoard.values()]
    .sort((a, b) => b.kills - a.kills || b.score - a.score)
    .slice(0, 10)
    .map((e) => ({ id: e.id, name: e.name, country: e.country, kills: e.kills, score: e.score, coins: e.coins }));
}
function getAILeaderboard() {
  return [...aiBoard.values()]
    .sort((a, b) => b.maxLevel - a.maxLevel)
    .slice(0, 10)
    .map((e) => ({ id: e.id, name: e.name, country: e.country, maxLevel: e.maxLevel }));
}
// 오늘의 국가 순위: multiBoard(킬)를 국가별 집계. AI는 킬이 없으므로 제외.
function getCountryBoard() {
  return aggregateCountryBoard([...multiBoard.values()]);
}
// 플레이어 코인(승리 보너스 등)을 multi 보드와 동기화 — 변동 시에만 갱신
function syncBoard(p) {
  const key = p.id;
  const cur = multiBoard.get(key);
  if (cur && cur.coins !== p.coins) { cur.coins = p.coins; boardDirty = true; }
}
// 멀티 룸 목록(브라우저용) — 대기 룸 우선, 인원 많은 순
function getMultiList() {
  const list = [];
  for (const room of rooms.values()) {
    if (room.mode !== 'multi') continue;
    list.push({
      roomId: room.id,
      no: parseInt(room.id.slice(1), 10),
      humans: liveHumans(room),
      maxHumans: room.sim.maxHumans,
      phase: room.sim.phase,
      phaseTimeLeft: Math.max(0, room.sim.phaseTimer),
    });
  }
  list.sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.humans - a.humans);
  return list;
}

function zeroInput() {
  return { moveX: 0, moveY: 0, angle: 0, firing: false, reload: false, sprint: false };
}

// ---- 연결 속도제한(IP당 동시 연결 수 캡) ----
const ipConnCount = new Map();
function ipOf(socket) {
  // trust proxy 설정 시 x-forwarded-for 우선, 아니면 직접 원격 주소
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return socket.handshake.address || 'unknown';
}

io.use((socket, next) => {
  const ip = ipOf(socket);
  const n = (ipConnCount.get(ip) || 0) + 1;
  if (n > MAX_CONN_PER_IP) {
    return next(new Error('too_many_connections'));
  }
  ipConnCount.set(ip, n);
  socket._ip = ip;
  next();
});

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  const clientId = auth.clientId || null;
  // 모드: auth.mode 가 'ai' 면 AI, 그 외(부재 포함)는 multi — 무모드 접속(테스트)은 multi 기본.
  const mode = (auth.mode === 'ai') ? 'ai' : 'multi';

  const { player, room } = assignSocket(socket, mode);
  if (!player || !room) { socket.emit('serverFull'); socket.disconnect(true); return; }
  emitBoot(socket, player, room);

  // 모든 휴대 핸들러는 socketToPlayer 로 '현재' 플레이어/룸을 참조(모드 전환 후에도 정확).
  socket.on('input', (c) => {
    // 입력 속도제한: 정상 30Hz(33ms)는 통과, 악의적 과도 emit(>50Hz)은 드랍
    const now = performance.now();
    if (now - (socket._lastInput || 0) < INPUT_MIN_MS) return;
    socket._lastInput = now;
    const p = socketToPlayer.get(socket.id);
    if (p && p.room && c && typeof c === 'object') p.room.controllers.set(p.id, sanitizeController(c));
  });

  socket.on('switchWeapon', (key) => {
    // 무기 전환 스팸 가드(정상 클릭/패드 edge는 통과)
    const now = performance.now();
    if (now - (socket._lastSwitch || 0) < 80) return;
    socket._lastSwitch = now;
    const p = socketToPlayer.get(socket.id);
    if (p && typeof key === 'string') p.switchWeapon(key);
  });

  // 수류탄 투척 — 서버가 플레이어 현재 각도 사용. 80ms 스팸 가드(무기전환 패턴).
  socket.on('throwGrenade', () => {
    const now = performance.now();
    if (now - (socket._lastGrenade || 0) < 80) return;
    socket._lastGrenade = now;
    const p = socketToPlayer.get(socket.id);
    if (p && p.room) p.room.sim.throwGrenade(p);
  });

  // 미니맵 핑(위치 표시) — 룸 브로드캐스트(일회성, 영속 저장 없음)
  socket.on('mapPing', (d) => {
    const p = socketToPlayer.get(socket.id);
    if (!p || !p.room || typeof d !== 'object') return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    io.to(p.room.id).emit('mapPing', {
      x: clamp(num(d.x), 0, CONFIG.WORLD_SIZE),
      y: clamp(num(d.y), 0, CONFIG.WORLD_SIZE),
      type: (d.type === 'enemy' || d.type === 'loot') ? d.type : 'here',
      id: p.id, name: p.name,
    });
  });

  // 퀵챗 이모티콘 — 룸 브로드캐스트
  socket.on('emote', (d) => {
    const p = socketToPlayer.get(socket.id);
    if (!p || !p.room || typeof d !== 'object') return;
    const ok = ['hello', 'thanks', 'gg', 'sorry', 'help'];
    const type = ok.includes(d.type) ? d.type : 'hello';
    io.to(p.room.id).emit('emote', { id: p.id, name: p.name, type });
  });

  // 부활(보상형 광고 보상) — 생존 중 1회 (룸 범위로 송출)
  socket.on('revive', () => {
    const p = socketToPlayer.get(socket.id);
    if (p && p.room && p.room.sim.revivePlayer(p)) io.to(p.room.id).emit('revived', { yourId: p.id });
  });

  // 광고 보상 혜택(다음 라운드 SMG) — 라운드당 1회(adPerkUsed). spawn 시 리셋.
  socket.on('adPerk', () => {
    const p = socketToPlayer.get(socket.id);
    if (p && !p.adPerkUsed) { p.adSMG = true; p.adPerkUsed = true; }
  });

  // 모드 전환(자발적)
  socket.on('joinAI', () => switchMode(socket, 'ai'));
  socket.on('joinMulti', (roomId) => switchMode(socket, 'multi', roomId));
  socket.on('getMultiList', () => { socket.emit('multiList', getMultiList()); });

  socket.on('ping', (cb) => { if (typeof cb === 'function') cb(); });

  socket.on('disconnect', () => {
    const player = socketToPlayer.get(socket.id);
    // IP 연결 카운트 감소
    if (socket._ip) {
      const c = (ipConnCount.get(socket._ip) || 1) - 1;
      if (c <= 0) ipConnCount.delete(socket._ip); else ipConnCount.set(socket._ip, c);
    }
    if (!player) return;
    const room = player.room;
    if (room) room.controllers.set(player.id, zeroInput()); // 입력 정지(유예 중 멈춰있음)
    socketToPlayer.delete(socket.id);
    // 이 소켓이 여전히 이 플레이어의 활성 소켓일 때만 해제(동일 player로 재접속한 직후의 낡은 소켓 방지)
    if (player.socketId === socket.id) player.socketId = null;
    // 연결 끊김 즉시 alive=false(관전 취급). grace는 정체성/진행 보존용이지 전투 유지용이 아님 —
    // 끊긴 채 살아있으면 봇/상대가 '고정된 유령'을 무료 킬+점수 획득하는 부풀림이 발생.
    if (player.alive) player.alive = false;

    const removeNow = () => {
      const r = player.room;
      if (r) { r.sim.removePlayer(player.id); r.controllers.delete(player.id); }
      if (player.clientId && clientPlayers.get(player.clientId) === player) clientPlayers.delete(player.clientId);
      player.room = null;
      removeTimers.delete(player.id); // ★ 타이머 핸들 해제 — player 객체 클로저 GC 허용(누수 수정)
      if (r) { if (r.mode === 'multi') multiListDirty = true; destroyIfEmpty(r); }
    };

    // 유예(clientId 보유 + 활성 소켓 없음)일 때만 player 단위 타이머로 보관.
    if (clientId && player.clientId === clientId && player.socketId === null) {
      const ms = CONFIG.NET.RECONNECT_GRACE * 1000;
      const timer = setTimeout(removeNow, ms);
      removeTimers.set(player.id, timer);
    } else {
      removeNow();
    }
  });
});

// 60Hz 시뮬레이션 / 20Hz 스냅샷. 고정 타임스텝 누적기(단일 클럭, 모든 룸 lockstep).
const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
let acc = 0;
let prevTick = performance.now();
let snapCounter = 0;

const tickHandle = setInterval(() => {
  // 날짜가 바뀌면 양 보드 초기화
  if (boardDay !== todayStr()) { boardDay = todayStr(); multiBoard.clear(); aiBoard.clear(); boardDirty = aiBoardDirty = true; }

  const now = performance.now();
  let frame = now - prevTick;
  prevTick = now;
  if (frame < 0) frame = 0;                                   // 시계 역행 방지
  if (frame > MAX_STEPS * STEP_MS) frame = MAX_STEPS * STEP_MS; // 스파이크 클램프

  acc += frame;
  let steps = 0;
  while (acc >= STEP_MS && steps < MAX_STEPS) {
    for (const room of rooms.values()) {
      // 라이브 인간이 없는 룸(전원 유예/빈 룸)은 정지 — 1인용 정지 & 빈 룸 CPU 절약
      if (!hasLiveSocket(room)) continue;
      room.sim.step(STEP_MS / 1000, room.controllers);
    }
    acc -= STEP_MS;
    steps++;
  }
  if (steps === MAX_STEPS) acc = 0; // 스파이크 시 잔여 버림(회복 우선)

  // ---- 룸별 브로드캐스트(다중 스텝 결과를 한 번에 송출) ----
  for (const room of rooms.values()) {
    if (!hasLiveSocket(room)) continue; // 유예/빈 룸은 송출 생략

    // 라운드 시작 정적 데이터(장애물) — 한 번만
    if (room.sim.roundStartEvent) {
      room.sim.roundStartEvent = false;
      io.to(room.id).emit('roundStart', room.sim.getRoundStartData());
    }

    // 킬/히트/aiRoundOver 이벤트 브로드캐스트 + 보드 집계(모드별)
    const evs = room.sim.drainEvents();
    if (evs) for (const ev of evs) {
      if (ev.type === 'kill' && room.mode === 'multi') recordKill(room.sim, ev.killerId);
      if (ev.type === 'aiRoundOver' && room.mode === 'ai') recordAILevel(room.sim, ev);
      io.to(room.id).emit(ev.type, ev);
    }

    // 인간 플레이어 코인 동기화는 multi 만(승리 보너스 등 반영)
    if (room.mode === 'multi') for (const e of room.sim.entities) if (e.isHuman) syncBoard(e);
  }

  // ---- 글로벌 보드/룸목록(룸 간 공통) — 시간 기반 throttle로 트래픽/CPU 절약 ----
  if (boardDirty && (now - lastBoardEmit) >= BOARD_EMIT_MS) {
    io.emit('leaderboard', getMultiLeaderboard());
    io.emit('countryBoard', getCountryBoard());
    boardDirty = false; lastBoardEmit = now;
  }
  if (aiBoardDirty) { // AI 보드는 빈도 낮아 즉시 송출(레벨 전환 시만)
    io.emit('aiLeaderboard', getAILeaderboard()); aiBoardDirty = false;
  }
  if (multiListDirty && (now - lastListEmit) >= LIST_EMIT_MS) {
    io.emit('multiList', getMultiList()); multiListDirty = false; lastListEmit = now;
  }

  // 스냅샷은 시뮬 스텝 수에 비례해 누적 → ~20Hz(0-스텝 틱에선 미송출)
  snapCounter += steps;
  if (snapCounter >= 3) {
    snapCounter -= 3;
    for (const room of rooms.values()) {
      if (!hasLiveSocket(room)) continue;
      io.to(room.id).emit('snapshot', room.sim.getSnapshot());
    }
  }
}, STEP_MS);

// ---- 그레이스풀 셧다운(PM2/컨테이너 재시작 시 안전 종료) ----
let shuttingDown = false;
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${sig} 수신 — 서버 종료 중...`);
  clearInterval(tickHandle);
  // 진행 중인 유예 타이머 정리
  for (const t of removeTimers.values()) clearTimeout(t);
  removeTimers.clear();
  // Redis 보드 저장
  await saveBoardsToRedis();
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  // 강제 종료 안전망(5초)
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
httpServer.on('error', (err) => {
  console.error('HTTP 서버 에러:', err.message);
  if (err.code === 'EADDRINUSE') process.exit(1);
});

// Redis 초기화 후 서버 시작
initRedis().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`shot.monster server on http://localhost:${PORT}`);
  });
}).catch((e) => {
  console.error('서버 시작 실패:', e.message);
  process.exit(1);
});
