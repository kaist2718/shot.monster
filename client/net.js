// ============================================================
// net.js - Socket.io 클라이언트 래퍼. (client)
// io 전역은 /socket.io/socket.io.js (index.html)가 제공.
// 영속 clientId(localStorage)로 재접속 시 신원 유지. 모드(ai/multi)는 auth 로 전송.
// ============================================================

import { CONFIG } from '../shared/config.js';

export const Net = {
  socket: null,
  yourId: null,
  mode: null,          // 'ai' | 'multi' (현재 룸 모드 — init/모드전환 시 갱신)
  roomId: null,        // 현재 소속 룸 id(룸 브라우저 표시용)
  level: 1,            // AI 모드 현재 레벨
  rtt: 0,              // 왕복 지연(ms)
  connected: false,    // 연결 상태(끊김/재연결 UI용)
  reconnectAttempts: 0, // 재연결 시도 횟수(연결 끊김 UI 피드백용)
  leaderboard: [],     // 오늘의 탑 10(멀티, 킬순) [{name, kills, country}]
  aiLeaderboard: [],   // 오늘의 AI 탑 10(최고 레벨순) [{name, maxLevel, country}]
  countryBoard: [],    // 오늘의 국가 순위 [{country, kills, players}]
  multiList: [],       // 멀티 룸 목록 [{roomId, no, humans, maxHumans, phase, phaseTimeLeft}]
  _clientId: null,
  _name: null,
  _country: null,
  _clientIdFallback: null, // localStorage 사용 불가 시 메모리 폴백(프라이빗 모드 등)
  _pingTimer: null,

  init(cb = {}, profile = {}, mode = 'multi') {
    this._clientId = this._loadClientId();
    this._name = profile.name || null;
    this._country = profile.country || null;
    this.mode = mode;
    // 같은 origin 서버에 auth(clientId + 이름/국가 + 모드)와 함께 연결.
    // 자동 재연결 명시(끊김 시 자동 복구).
    this.socket = io({
      auth: { clientId: this._clientId, name: this._name, country: this._country, mode },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => { this.connected = true; this.reconnectAttempts = 0; });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.log('서버 연결 끊김:', reason || 'unknown');
    });
    this.socket.on('connect_error', (err) => {
      this.connected = false;
      this.reconnectAttempts++;
      console.log('연결 오류:', err.message || err);
    });
    this.socket.on('serverFull', () => { cb.onServerFull && cb.onServerFull(); });

    this.socket.on('init', (d) => {
      this.yourId = d.yourId; this.mode = d.mode || mode; this.level = d.level || 1; this.roomId = d.roomId || null;
      cb.onInit && cb.onInit(d);
    });
    this.socket.on('snapshot', (s) => cb.onSnapshot && cb.onSnapshot(s));
    this.socket.on('roundStart', (d) => cb.onRoundStart && cb.onRoundStart(d));
    this.socket.on('kill', (e) => cb.onKill && cb.onKill(e));
    this.socket.on('hit', (e) => cb.onHit && cb.onHit(e));
    this.socket.on('revived', (e) => cb.onRevived && cb.onRevived(e));
    this.socket.on('obstacleDestroyed', (e) => cb.onObstacleDestroyed && cb.onObstacleDestroyed(e));
    this.socket.on('aiRoundOver', (e) => cb.onAIRoundOver && cb.onAIRoundOver(e));
    this.socket.on('playerResult', (e) => cb.onPlayerResult && cb.onPlayerResult(e));
    this.socket.on('explosion', (e) => cb.onExplosion && cb.onExplosion(e));
    this.socket.on('mapPing', (e) => cb.onMapPing && cb.onMapPing(e));
    this.socket.on('emote', (e) => cb.onEmote && cb.onEmote(e));
    this.socket.on('leaderboard', (lb) => { this.leaderboard = lb || []; cb.onLeaderboard && cb.onLeaderboard(lb); });
    this.socket.on('aiLeaderboard', (lb) => { this.aiLeaderboard = lb || []; cb.onAILeaderboard && cb.onAILeaderboard(lb); });
    this.socket.on('countryBoard', (data) => { this.countryBoard = data || []; });
    this.socket.on('multiList', (list) => { this.multiList = list || []; cb.onMultiList && cb.onMultiList(list); });

    if (this._pingTimer) clearInterval(this._pingTimer); // init 재호출 시 누적 방지
    this._pingTimer = setInterval(() => this._ping(), CONFIG.NET.PING_INTERVAL * 1000);
  },

  _ping() {
    if (!this.socket || !this.socket.connected) return;
    const t0 = performance.now();
    this.socket.timeout(2000).emit('ping', (err) => {
      if (!err) this.rtt = Math.round(performance.now() - t0);
    });
  },

  _loadClientId() {
    // localStorage 사용 가능 시 영속 id. 실패(프라이빗 모드 등) 시 메모리 폴백으로 재접속 유예 보장.
    try {
      let id = localStorage.getItem('br_clientId');
      if (!id) {
        id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { localStorage.setItem('br_clientId', id); }
        catch { this._clientIdFallback = id; }
      }
      return id;
    } catch {
      if (!this._clientIdFallback) {
        this._clientIdFallback = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
      return this._clientIdFallback;
    }
  },

  sendInput(c) {
    if (this.socket) this.socket.emit('input', c);
  },

  sendSwitchWeapon(key) {
    if (this.socket) this.socket.emit('switchWeapon', key);
  },

  // 부활(보상형 광고 보상 요청)
  requestRevive() {
    if (this.socket) this.socket.emit('revive');
  },

  // 보상형 광고 혜택(다음 라운드 SMG) 요청
  requestAdPerk() {
    if (this.socket) this.socket.emit('adPerk');
  },

  // 모드 전환(자발적) — 서버가 새 룸 배정 후 init 재송출
  joinAI() {
    if (this.socket) this.socket.emit('joinAI');
  },

  // 멀티 룸 입장. roomId 생략 시 빠른 입장(자동 배정/생성).
  joinMulti(roomId) {
    if (this.socket) this.socket.emit('joinMulti', roomId);
  },

  // 수류탄 투척 요청(서버가 현재 각도로 처리)
  throwGrenade() {
    if (this.socket) this.socket.emit('throwGrenade');
  },

  // 미니맵 핑(월드 좌표 + 타입) — 룸 브로드캐스트
  sendMapPing(x, y, type) {
    if (this.socket) this.socket.emit('mapPing', { x, y, type });
  },

  // 퀵챗 이모티콘 — 룸 브로드캐스트
  sendEmote(type) {
    if (this.socket) this.socket.emit('emote', { type });
  },

  // 멀티 룸 목록 새로고침(브라우저용)
  getMultiList() {
    if (this.socket) this.socket.emit('getMultiList');
  },
};
