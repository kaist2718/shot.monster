// ============================================================
// i18n.js - 경량 다국어(EN/KO). (client)
// 기본 EN(해외 사용자 친화). localStorage('br_lang')에 선택 언어 저장.
// t(key, vars): 사전에서 현재 언어 문자열을 꺼내 {token}을 치환. 캔버스는 매 프레임 다시 그리므로 언어 전환 즉시 반영.
// ============================================================

const STORAGE_KEY = 'br_lang';
let lang = 'en'; // 기본 영문
const listeners = new Set(); // 언어 전환 옵저버(정적 DOM 갱신용)

const DICT = {
  // 시작 화면
  appTitle:        { en: 'shot.monster', ko: 'shot.monster' },
  devContact:      { en: 'Contact: kaist2718@gmail.com', ko: '문의: kaist2718@gmail.com' },
  startSubtitle:   { en: 'Real-time battle royale — pick a name and country', ko: '실시간 배틀로얄 — 이름과 국가를 선택하세요' },
  nickname:        { en: 'Nickname', ko: '닉네임' },
  namePlaceholder: { en: 'Name (up to 16)', ko: '이름 (최대 16자)' },
  country:         { en: 'Country', ko: '국가' },
  countrySelect:   { en: 'Select country', ko: '국가 선택' },
  start:           { en: 'Start', ko: '시작' },
  continue:        { en: 'Continue', ko: '계속' },
  startNote:       { en: 'Your progress is saved on this browser', ko: '같은 브라우저에서는 참여 상태가 유지됩니다' },
  langLabel:       { en: 'Language', ko: '언어' },
  muteTitle:       { en: 'Sound on/off', ko: '소리 켜기/끄기' },

  // 모드 선택
  modeSelectTitle: { en: 'Select Mode', ko: '모드 선택' },
  modeAI:          { en: 'AI Mode', ko: 'AI 모드' },
  modeAIDesc:      { en: 'Levels 1–9, fight AI bots in order', ko: '레벨 1~9, AI와 순차 대결' },
  modeMulti:       { en: 'Human Multi', ko: '인간 멀티' },
  modeMultiDesc:   { en: '9-player rooms, bots fill the rest', ko: '9인 방, 봇이 인원을 채움' },
  back:            { en: 'Back', ko: '뒤로' },

  // AI 모드
  aiLevel:         { en: 'Level {n} / 9', ko: '레벨 {n} / 9' },
  aiEnemies:       { en: 'Enemies {n}', ko: '남은 적 {n}' },
  aiLobbyTitle:    { en: 'Level {n} — {e} enemies', ko: '레벨 {n} — 적 {e}명' },
  aiLobbyStart:    { en: 'Starts in {n} sec', ko: '{n}초 후 시작' },
  aiClear:         { en: 'Level {n} cleared! ▶ Level {n2}', ko: '레벨 {n} 클리어! ▶ 레벨 {n2}' },
  aiChampion:      { en: 'All levels cleared! Champion', ko: '모든 레벨 클리어! 챔피언' },
  aiDefeat:        { en: 'Defeated — retry Level {n}', ko: '패배 — 레벨 {n} 재도전' },
  aiBestLevel:     { en: 'Best level reached: {n}', ko: '최고 도달 레벨: {n}' },
  aiTop:           { en: 'TOP · AI Level', ko: 'TOP · AI 레벨' },
  boardLevel:      { en: 'Lv {n}', ko: '{n}단계' },

  // 멀티 룸 브라우저
  roomBrowser:     { en: 'Multi Rooms', ko: '멀티 방 선택' },
  quickJoin:       { en: 'Quick Join', ko: '빠른 입장' },
  joinRoom:        { en: 'Join', ko: '입장' },
  roomFull:        { en: 'Full', ko: '만원' },
  roomWaiting:     { en: 'Waiting', ko: '대기중' },
  roomPlaying:     { en: 'Playing', ko: '플레이중' },
  playHere:        { en: 'Play here', ko: '이 방에서 플레이' },
  noRooms:         { en: 'No open rooms — a new one will be created', ko: '열린 방 없음 — 새 방이 생성됩니다' },
  humans:          { en: '{n}/{m}', ko: '{n}/{m}' },

  // HUD
  hintDesktop:     { en: 'WASD · Mouse · Click/Space fire · R · Shift · 1/2/3 · Gamepad OK', ko: 'WASD · 마우스 · 클릭/스페이스 사격 · R · Shift · 1/2/3 · 게임패드' },
  ping:            { en: 'Ping {n}ms', ko: '핑 {n}ms' },
  coins:           { en: 'Coins {n}', ko: '코인 {n}' },
  alive:           { en: 'Alive {n}', ko: '생존자 {n}' },
  reloading:       { en: 'Reloading…', ko: '재장전 중…' },
  killScore:       { en: 'Kills {n}', ko: '킬점수 {n}' },
  myRank:          { en: 'My rank #{n}', ko: '내 순위 {n}위' },
  connecting:      { en: 'Connecting to server…', ko: '서버 연결 중…' },
  reconnecting:    { en: 'Reconnecting…', ko: '재연결 중…' },
  me:              { en: 'me', ko: '나' },

  // 로비
  lobbyTitle:      { en: 'Next round starting soon', ko: '다음 라운드 준비' },
  lobbyCountdown:  { en: '{n} sec to start', ko: '{n}초 후 시작' },
  lobbyPlayers:    { en: 'Players {n} · bots fill the rest', ko: '참가자 {n}명 · 봇이 인원을 채웁니다' },
  mission:         { en: "Today's mission: kills {n}/{t}  (reward {r} coins)", ko: '오늘 미션: 킬 {n}/{t}  (보상 {r}코인)' },

  // 보드/패널
  top10Kills:      { en: 'TOP 10 (kills)', ko: 'TOP 10 (킬)' },
  top10:           { en: 'TOP 10', ko: 'TOP 10' },
  countryTitle:    { en: 'Country Ranking', ko: '국가 순위' },
  noRecords:       { en: 'No records yet', ko: '아직 기록이 없습니다' },
  boardKills:      { en: '{n} kills ({s})', ko: '{n}킬 ({s})' },
  scoreKills:      { en: '{k} kills · {s} pts', ko: '{k} 킬 · {s}점' },
  countryKills:    { en: '{k} kills · {p} players', ko: '{k}킬 · {p}명' },

  // 라운드 종료 / 관전
  winner:          { en: 'Winner: {n}', ko: '승자: {n}' },
  winnerNone:      { en: 'Winner: none', ko: '승자: 없음' },
  playerTag:       { en: 'Player', ko: '플레이어' },
  nextRoundIn:     { en: 'Next round in {n} sec', ko: '다음 라운드까지 {n}초' },
  myKillScore:     { en: 'My kills: {n}', ko: '내 킬점수: {n}' },
  spectating:      { en: 'Spectating', ko: '관전 중' },
  spectateHint:    { en: 'You will join automatically next round', ko: '다음 라운드가 시작되면 자동 참여합니다' },

  // 광고/부활
  reviveBtn:       { en: 'Revive (watch ad)', ko: '부활하기 (광고 시청)' },
  perkBtn:         { en: 'Start with SMG (ad)', ko: '광고 보고 SMG로 시작' },
  adPlaying:       { en: 'Ad playing… (demo)', ko: '광고 재생 중… (예시)' },
  adWait:          { en: 'Please wait…', ko: '잠시만요…' },
  adClose:         { en: 'Close ad ✓', ko: '광고 닫기 ✓' },

  // 모바일/조작 설정(⚙️ 패널)
  settingsTitle:   { en: 'Controls', ko: '조작 설정' },
  orientHint:      { en: 'Landscape mode recommended', ko: '가로 모드를 권장합니다' },
  stickMode:       { en: 'Move stick', ko: '이동 스틱' },
  stickDynamic:    { en: 'Dynamic', ko: '동적' },
  stickFixed:      { en: 'Fixed', ko: '고정' },
  fireButton:      { en: 'Fire button (separate)', ko: '사격 버튼(분리)' },
  autoFire:        { en: 'Auto-fire on drag', ko: '드래그 시 자동사격' },
  runButton:       { en: 'Sprint button', ko: '달리기 버튼' },
  lefty:           { en: 'Left-handed (mirror)', ko: '왼손잡이(좌우 반전)' },
  vibration:       { en: 'Vibration', ko: '진동' },
  zoomSens:        { en: 'Zoom sensitivity', ko: '줌 감도' },
  stickOpacity:    { en: 'Stick opacity', ko: '스틱 투명도' },
  aimAssist:       { en: 'Aim assist (soft)', ko: '에임 어시스트(소프트)' },
  aimAssistStr:    { en: 'Assist strength', ko: '어시스트 강도' },
  aimAssistStickiness: { en: 'Sticky duration', ko: '유지 시간' },
  gamepadEnabled:  { en: 'Gamepad', ko: '게임패드' },
  // 조작 체계 / 품질
  scheme:          { en: 'Control scheme', ko: '조작 체계' },
  stickDual:       { en: 'Dual stick', ko: '듀얼 스틱' },
  stickCasual:     { en: 'Casual (1-finger)', ko: '캐주얼 (원핑거)' },
  quality:         { en: 'Graphics quality', ko: '그래픽 품질' },
  qualityHigh:     { en: 'High', ko: '높음' },
  qualityMed:      { en: 'Medium', ko: '보통' },
  qualityLow:      { en: 'Low', ko: '낮음' },
  particles:       { en: 'Particles', ko: '파티클' },
  shadows:         { en: 'Shadows', ko: '그림자' },
  exportSettings:  { en: 'Export', ko: '내보내기' },
  importSettings:  { en: 'Import', ko: '가져오기' },
  importSettingsPaste: { en: 'Paste settings JSON', ko: '설정 JSON 붙여넣기' },
  settingsCopied:  { en: 'Copied!', ko: '복사됨!' },
  close:           { en: 'Close', ko: '닫기' },

  // 언어 버튼(시작/모드 화면 현지화)
  langEN:          { en: 'EN', ko: 'EN' },
  langKO:          { en: 'Korean', ko: '한국어' },

  // 수류탄
  grenade:         { en: 'Grenade', ko: '수류탄' },

  // 미니맵 핑 / 퀵챗
  pingHere:        { en: 'Here', ko: '여기' },
  pingEnemy:       { en: 'Enemy!', ko: '적!' },
  pingLoot:        { en: 'Loot', ko: '아이템' },
  quickChat:       { en: 'Quick chat', ko: '퀵챗' },
  emoteHello:      { en: 'Hello', ko: '안녕' },
  emoteThanks:     { en: 'Thanks', ko: '고마워' },
  emoteGG:         { en: 'GG', ko: 'GG' },
  emoteSorry:      { en: 'Sorry', ko: '미안' },
  emoteHelp:       { en: 'Help!', ko: '도와줘!' },

  // 튜토리얼/온보딩
  tutorialTitle:   { en: 'How to play', ko: '조작 방법' },
  tutorialMove:    { en: 'Move with the left stick (or WASD)', ko: '왼쪽 스틱(또는 WASD)으로 이동' },
  tutorialAim:     { en: 'Aim with the right stick (or mouse)', ko: '오른쪽 스틱(또는 마우스)으로 조준' },
  tutorialFire:    { en: 'Fire auto-aims when an enemy is near', ko: '적이 가까우면 자동 조준/사격' },
  tutorialGrenade: { en: 'Throw a grenade (G key / button)', ko: '수류탄 투척 (G 키 / 버튼)' },
  tutorialNext:    { en: 'Next', ko: '다음' },
  tutorialSkip:    { en: 'Skip', ko: '건너뛰기' },

  // 경기 후 스탯
  statsTitle:      { en: 'Match result', ko: '경기 결과' },
  statKills:       { en: 'Kills', ko: '킬' },
  statDeaths:      { en: 'Deaths', ko: '데스' },
  statKD:          { en: 'K/D', ko: 'K/D' },
  statDamage:      { en: 'Damage', ko: '데미지' },
  statAccuracy:    { en: 'Accuracy', ko: '정확도' },
  statTimeSurvived:{ en: 'Survived', ko: '생존시간' },
  statPlacement:   { en: 'Placement', ko: '순위' },
  statBest:        { en: 'Best', ko: '최고' },
  mapPreview:      { en: 'Arena', ko: '아레나' },

  // 넷/접속
  serverFull:      { en: 'Server full — try again later', ko: '서버가 가득 찼습니다 — 잠시 후 다시 시도하세요' },
  connectionStall: { en: 'Connection stalled…', ko: '연결이 멈춘 것 같습니다…' },
  roomNo:          { en: 'Room {n}', ko: '방 {n}' },
};

export const I18N = {
  init() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'en' || v === 'ko') lang = v;
    } catch { /* 무시 */ }
  },
  getLang() { return lang; },
  // 언어 전환 시 갱신이 필요한 정적 DOM(음소거 툴팁 등)을 위한 옵저버.
  // 캔버스는 매 프레임 다시 그리므로 자동 반영되어 별도 구독 불필요.
  onChange(fn) { if (typeof fn === 'function') listeners.add(fn); },
  offChange(fn) { listeners.delete(fn); },
  setLang(l) {
    lang = (l === 'ko') ? 'ko' : 'en';
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* 무시 */ }
    for (const fn of listeners) { try { fn(lang); } catch { /* 무시 */ } }
  },
  toggle() { this.setLang(lang === 'en' ? 'ko' : 'en'); return lang; },
  t(key, vars) {
    const e = DICT[key];
    let s = e ? (e[lang] || e.en) : key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  },
};
