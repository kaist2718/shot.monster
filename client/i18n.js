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
  hintDesktop:     { en: 'WASD · Mouse · Click/Space fire · R · G grenade · Shift · 1/2/3 · Gamepad OK', ko: 'WASD · 마우스 · 클릭/스페이스 사격 · R · G 수류탄 · Shift · 1/2/3 · 게임패드' },
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
  stickOnehand:    { en: 'One-hand', ko: '한손' },
  onehandSettings: { en: '🎯 One-hand Mode Settings', ko: '🎯 한손 모드 설정' },
  onehandAutoAim:  { en: 'Auto aim', ko: '자동 조준' },
  onehandAutoMove: { en: 'Auto move (zone/obstacle avoid)', ko: '자동 이동 (존/장애물 회피)' },
  onehandAutoWeapon: { en: 'Auto weapon switch', ko: '자동 무기 전환' },
  onehandAutoGrenade: { en: 'Auto grenade throw', ko: '자동 수류탄 투척' },
  onehandAggressiveness: { en: 'Aggressiveness', ko: '공격성' },
  onehandModeIndicator: { en: 'AUTO MODE', ko: '자동 모드' },
  // 한손 모드 인게임 튜토리얼
  onehandTutorialTitle: { en: '📱 One-Hand Mode', ko: '📱 한손 모드' },
  onehandTutorialTouch: { en: '👆 Touch & hold screen to start auto-play', ko: '👆 화면을 터치 유지하면 자동 플레이 시작' },
  onehandTutorialRelease: { en: '✋ Lift finger to stop movement', ko: '✋ 손가락을 떼면 이동 정지' },
  onehandTutorialAim: { en: '🎯 Auto-aims at nearest enemy with lead prediction', ko: '🎯 가장 가까운 적을 자동 조준 (예측 리드)' },
  onehandTutorialFire: { en: '🔫 Auto-fires when enemy is in range', ko: '🔫 적이 사거리에 들어오면 자동 사격' },
  onehandTutorialMove: { en: '🚶 Auto-chases targets & avoids zone/obstacles', ko: '🚶 타겟 추적 + 존/장애물 자동 회피' },
  onehandTutorialTip: { en: '💡 Adjust aggressiveness in ⚙️ settings', ko: '💡 ⚙️ 설정에서 공격성 조절 가능' },
  onehandTutorialDismiss: { en: 'Tap anywhere to dismiss', ko: '어디든 탭하여 닫기' },
  schemeToggle: { en: 'Switch control mode', ko: '조작 모드 전환' },
  schemeOnehand: { en: 'ONE', ko: '한손' },
  schemeDual: { en: 'DUAL', ko: '듀얼' },
  schemeCasual: { en: 'CAS', ko: '캐주얼' },
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
  tutorialPage1Title: { en: '🎮 Basic Controls', ko: '🎮 기본 조작' },
  tutorialPage1Desc:  { en: 'Learn the essential controls to get started.', ko: '게임을 시작하기 위한 기본 조작을 알아보세요.' },
  tutorialMove:    { en: 'Desktop: WASD or Arrow keys. Mobile: Touch & hold for auto-move.', ko: '데스크탑: WASD or 방향키. 모바일: 터치 유지 시 자동 이동.' },
  tutorialAim:     { en: 'Desktop: Mouse to aim. Mobile: Auto-aims at nearest enemy.', ko: '데스크탑: 마우스로 조준. 모바일: 가장 가까운 적을 자동 조준.' },
  tutorialFire:    { en: 'Desktop: Left click or Space. Mobile: Auto-fires within range.', ko: '데스크탑: 좌클릭 또는 스페이스. 모바일: 사거리 내 자동 사격.' },
  tutorialReload:  { en: 'Press R (desktop) or tap R button (mobile) to reload.', ko: 'R 키(데스크탑) 또는 R 버튼(모바일)을 눌러 재장전.' },
  tutorialGrenade: { en: 'Press G (desktop) or 💣 button (mobile) to throw. AoE damage!', ko: 'G 키(데스크탑) 또는 💣 버튼(모바일)으로 투척. 범위 피해!' },
  tutorialSprint:  { en: 'Hold Shift (desktop) or push stick to edge (mobile) to sprint.', ko: 'Shift(데스크탑) 또는 스틱 끝까지(모바일)로 달리기.' },
  tutorialWeapon:  { en: 'Switch weapons with 1/2/3 keys (desktop) or 🔫 button (mobile).', ko: '1/2/3 키(데스크탑) 또는 🔫 버튼(모바일)으로 무기 교체.' },

  tutorialPage2Title: { en: '📱 One-Hand Mode (Default)', ko: '📱 한손 모드 (기본)' },
  tutorialPage2Desc:  { en: 'Mobile auto-play — just touch and hold!', ko: '모바일 완전 자동 플레이 — 터치만 유지하세요!' },
  tutorialOnehandIntro: { en: 'One-hand mode is the default mobile control scheme. It fully automates gameplay while you touch the screen.', ko: '한손 모드는 모바일 기본 조작 체계입니다. 화면을 터치하는 동안 모든 게임플레이를 자동 처리합니다.' },
  tutorialOnehandTouch:   { en: '👆 Touch & hold → auto-play starts. Release → stops.', ko: '👆 터치 유지 → 자동 플레이 시작. 해제 → 정지.' },
  tutorialOnehandAim:     { en: '🎯 Auto-aim: Prioritizes low-HP & approaching enemies with lead prediction.', ko: '🎯 자동 조준: 저체력·접근 적 우선, 예측 리드 사격.' },
  tutorialOnehandMove:    { en: '🚶 Auto-move: Zone avoidance #1, target chase/retreat, obstacle avoidance.', ko: '🚶 자동 이동: 존 회피 최우선, 추적/후퇴, 장애물 회피.' },
  tutorialOnehandWeapon:  { en: '🔄 Auto weapon switch: Shotgun(close) ↔ SMG(mid) ↔ Pistol(far).', ko: '🔄 자동 무기 전환: 샷건(근접) ↔ SMG(중거리) ↔ 권총(원거리).' },
  tutorialOnehandGrenade: { en: '💣 Auto grenade: Throws at optimal range with cooldown.', ko: '💣 자동 수류탄: 최적 거리에서 쿨다운 기반 투척.' },
  tutorialOnehandAggro:   { en: '⚡ Aggressiveness: 0%=passive ↔ 100%=aggressive. Adjust in ⚙️ settings.', ko: '⚡ 공격성: 0%=신중 ↔ 100%=공격적. ⚙️ 설정에서 조절.' },

  tutorialPage3Title: { en: '🏆 Game Systems', ko: '🏆 게임 시스템' },
  tutorialPage3Desc:  { en: 'Learn about zone, items, ranking, and missions.', ko: '존, 아이템, 랭킹, 미션 등을 알아보세요.' },
  tutorialZone:      { en: '⚠️ Zone shrinks over time — stay inside! Damage increases as it shrinks.', ko: '⚠️ 존이 점점 좁아집니다 — 안에 머무세요! 좁아질수록 피해 증가.' },
  tutorialPickup:    { en: '🎒 Pick up weapons, ammo, and grenades scattered around the map.', ko: '🎒 맵에 흩어진 무기, 탄약, 수류탄을 획득하세요.' },
  tutorialCoins:     { en: '🪙 Earn coins per kill (+6) and win (+60). Complete daily mission for +120!', ko: '🪙 킬(+6)·승리(+60) 코인 획득. 일일 미션 완료 시 +120!' },
  tutorialMission:   { en: "📋 Today's mission: reach {n} kills. Rewards bonus coins. Resets daily (UTC).", ko: '📋 오늘의 미션: {n}킬 달성. 보너스 코인 지급. 매일(UTC) 초기화.' },
  tutorialRanking:   { en: '🏅 Daily rankings: Multi (kills) & AI (level). Only humans are counted.', ko: '🏅 오늘의 랭킹: 멀티(킬) & AI(레벨). 인간만 집계.' },
  tutorialRevive:    { en: '💀 Die? Watch an ad to revive once per life. Also: watch ad to start with SMG!', ko: '💀 사망 시 광고 1회 시청으로 부활. SMG 시작 광고 혜택도 있음!' },
  tutorialPing:      { en: '📍 Long-press minimap to ping. Teammates see your marker.', ko: '📍 미니맵 길게 눌러 핑. 같은 룸 플레이어에게 표시됩니다.' },
  tutorialQuickChat: { en: '💬 Use quick chat emotes (👋👍👏🙏🆘) to communicate.', ko: '💬 퀵챗 이모티콘(👋👍👏🙏🆘)으로 소통하세요.' },

  tutorialMobile:  { en: 'Mobile: One-hand mode is default. Switch to Dual-stick or Casual in ⚙️ settings.', ko: '모바일: 한손 모드가 기본입니다. ⚙️ 설정에서 듀얼 스틱 또는 캐주얼로 변경 가능.' },
  tutorialNext:    { en: 'Next', ko: '다음' },
  tutorialPrev:    { en: 'Back', ko: '이전' },
  tutorialSkip:    { en: 'Skip', ko: '건너뛰기' },
  tutorialDone:    { en: 'Got it!', ko: '확인!' },
  tutorialFirstHint: { en: '💡 New to shot.monster? Click here for the tutorial!', ko: '💡 shot.monster가 처음이신가요? 튜토리얼을 확인하세요!' },

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
  reconnectAttempts: { en: 'Reconnect attempts: {n}', ko: '재연결 시도: {n}회' },
  roomNo:          { en: 'Room {n}', ko: '방 {n}' },
  progressRestored: { en: 'Progress restored from previous session', ko: '이전 세션의 진행 상황이 복구되었습니다' },
  coinsRecovered:  { en: 'Coins: {n}', ko: '코인: {n}' },
  levelRecovered:  { en: 'Level: {n}', ko: '레벨: {n}' },
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
