// ============================================================
// config.js - 게임 상수와 밸런스. (shared: 서버+클라이언트 공용)
// ============================================================

export const CONFIG = {
  WORLD_SIZE: 2400,

  // 모드(단일 아레나 → 다중 룸). AI=1인용 캠페인, multi=공유 9인 룸.
  MODES: {
    AI_MAX_LEVEL: 9,        // AI 모드 최고 레벨(=AI 9명)
    MULTI_MAX_HUMANS: 9,    // 멀티 룸 인간 상한
    MULTI_TOTAL: 9,         // 멀티 룸 목표 인원(인간+봇). 부족분은 봇이 채움
    MULTI_LOBBY_TIME: 10,   // 인원 부족 시 10초 후 진행
    AI_LOBBY_TIME: 3,       // AI 레벨 시작 전 대기
    AI_ROUND_OVER_TIME: 5,  // AI 라운드 종료(클리어/패배) 표시
  },

  // 플레이어
  PLAYER_SPEED: 230,
  PLAYER_SPRINT_MULT: 1.55,
  PLAYER_RADIUS: 18,
  PLAYER_MAX_HEALTH: 100,

  // 봇
  BOT_COUNT: 7,
  BOT_SPEED: 205,
  BOT_VIEW_RANGE: 540,
  BOT_SHOOT_RANGE: 430,

  // 총알
  BULLET_RADIUS: 4,
  BULLET_LIFE: 1.1,

  // 수류탄(투척형 AoE) — 서버 권위적 해상도
  GRENADE: {
    THROW_SPEED: 560,    // 투척 초속(px/s)
    FUSE: 1.05,          // 기폭 지연(초)
    EXPLODE_RADIUS: 96,  // 폭발 피해 반경(px)
    DAMAGE: 60,          // 중심 피해(반경 밖으로 감쇠)
    START_COUNT: 1,      // 라운드 시작 보유 수
    MAX: 4,              // 최대 보유
    PICKUP_COUNT: 1,     // 픽업 시 증가량
  },

  // 재장전
  RELOAD_TIME: 1.4,

  // 전투 외 체력 재생(최근 피격 후 REGEN_DELAY 초 뒤 초당 REGEN_HP 회복)
  REGEN_DELAY: 5,
  REGEN_HP: 12,

  // 존(수축 원)
  ZONE_START_RATIO: 0.92,
  ZONE_FINAL_RATIO: 0.12,
  ZONE_SHRINK_DURATION: 65,
  ZONE_DPS_START: 10,   // 초반 존 바깥 초당 피해
  ZONE_DPS_END: 30,     // 반경이 가장 좁아졌을 때 초당 피해(단계적 강화)

  // 화면 줌(모바일 시야). 데스크탑은 1:1, 모바일은 더 넓게 축소.
  // 사용자가 슬라이더/핀치/휠로 수동 조정 가능(범위 내).
  VIEW: {
    MOBILE_TARGET_WIDTH: 1200,
    MIN_ZOOM: 0.18,
    MAX_ZOOM: 1.6,   // 데스크탑 휠/모바일 핀치로 확대(줌인) 가능 — 1.0이면 휠 업이 무반응
  },

  // 넷코드 / 복원력
  NET: {
    RECONNECT_GRACE: 20,   // 접속 끊김 후 플레이어 보관 유예(초) — 같은 clientId 재접속 시 유지
    PREDICT_RECONCILE: 110,// 클라 예측 위치가 서버와 이 거리(px) 이상 벌어지면 즉시 스냅
    PREDICT_SOFT: 28,      // 이 거리 이상이면 매 스냅샷 soft blend(고무줄 완화)
    PING_INTERVAL: 2,      // RTT 측정 주기(초)
    INPUT_HZ: 30,          // 클라 입력 송신 목표(Hz) — 문서/정렬용
  },

  // 소프트 조작(클라 전용 감각 파라미터 — 서버 시뮬에 영향 없음)
  CONTROLS: {
    MOVE_DEADZONE: 0.12,
    AIM_DEADZONE_IN: 0.22,
    AIM_DEADZONE_OUT: 0.14,
    SPRINT_IN: 0.86,
    SPRINT_OUT: 0.78,
    STICK_MAX_R: 56,
    HYBRID_MS: 500,
  },

  // 킬 피드
  KILLFEED_MAX: 5,
  KILLFEED_TTL: 5,         // 화면에 표시되는 시간(초)

  // 시각/피드백
  FEEDBACK: {
    SHAKE_ON_DAMAGE: 10,   // 데미지 받을 때 최대 흔들림(px)
    SHAKE_DECAY: 15,       // 흔들림 감쇠 속도
    HITMARKER_TTL: 0.32,   // 히트마커 표시 시간(초)
    MUZZLE_TTL: 0.06,      // 총구 화염 표시 시간(초)
    DAMAGE_NUMBERS_TTL: 0.4,// 데미지 숫자 표시 시간(초)
  },

  COLORS: {
    sky: '#20242b',
    grass: '#6f913f',
    grassDark: '#5f8235',
    player: '#3a7bd5',
    bot: '#d5633a',
    bullet: '#ffe27a',
    crate: '#b5824a',
    crateStroke: '#6e4a22',
    rock: '#8c8c8c',
    rockDark: '#6f6f6f',
    wall: '#4a4f57',
    healthGood: '#4dd055',
    healthBad: '#d54d4d',
    zoneStroke: '#b51e1e',
  },

  // 경제/보상(코인) — 킬·승리·일일미션으로 획득. 보상형 광고로 소비/보너스.
  COINS: {
    PER_KILL: 6,
    WIN: 60,
    MISSION: 120,        // 일일 미션 달성 보상
    MISSION_TARGET: 10,   // 오늘 누적 킬 목표
    REVIVE_HEALTH: 65,     // 부활 시 체력
  },
};

// 무기. fireRate=발당 간격(초), spread=탄퍼짐(라디안), pellets=단발 산탄 수(샷건)
export const WEAPONS = {
  pistol:  { name: 'Pistol',  fireRate: 0.30,  magSize: 12, bulletSpeed: 480, damage: 16, spread: 0.04, auto: false, pellets: 1, reloadTime: 1.3 },
  smg:     { name: 'SMG',     fireRate: 0.09,  magSize: 30, bulletSpeed: 580, damage: 8,  spread: 0.12, auto: true,  pellets: 1, reloadTime: 1.9 },
  shotgun: { name: 'Shotgun', fireRate: 0.65,  magSize: 6,  bulletSpeed: 460, damage: 10, spread: 0.15, auto: false, pellets: 7, reloadTime: 2.0 },
};
