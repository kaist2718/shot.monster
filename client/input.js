// ============================================================
// input.js - 키보드/마우스 입력 캡처 + 하이브리드 장치 활동 추적. (client)
// ============================================================

const GAME_KEYS = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'];

export function isFormEl(target) {
  // 닉네임 입력 / 국가 선택 등 폼 요소에 포커스 중에는 게임 키 처리를 건드리지 않는다
  // (스페이스로 공백 입력, Tab으로 이동, 화살표로 커서 이동이 막히는 버그 방지).
  const tag = target && target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || !!(target && target.isContentEditable);
}

/** 시작/모드/룸/설정 오버레이가 떠 있으면 게임 입력을 막는다. */
export function isUiBlocking() {
  return !!(
    document.getElementById('start-screen') ||
    document.getElementById('mode-screen') ||
    document.getElementById('room-screen') ||
    document.getElementById('settings-screen')
  );
}

export const Input = {
  keys: {},
  mouseX: 0, mouseY: 0,
  mouseDown: false,
  // 하이브리드: 최근 장치 활동 시각(ms, performance.now)
  lastTouchAt: 0,
  lastMouseAt: 0,
  lastKeyAt: 0,
  lastGamepadAt: 0,

  note(kind) {
    const now = performance.now();
    if (kind === 'touch') this.lastTouchAt = now;
    else if (kind === 'mouse') this.lastMouseAt = now;
    else if (kind === 'key') this.lastKeyAt = now;
    else if (kind === 'gamepad') this.lastGamepadAt = now;
  },

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (isFormEl(e.target)) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      this.note('key');
      if (GAME_KEYS.includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (isFormEl(e.target)) return;
      this.keys[e.key.toLowerCase()] = false;
    });

    // 창이 포커스를 잃거나 백그라운드로 가면 키/마우스 상태를 초기화한다.
    // (Alt+Tab / 홈 버튼 등으로 keyup·mouseup 이벤트가 누락되면 키가 눌린 채 고장 나는 것을 방지)
    const reset = () => { this.keys = {}; this.mouseDown = false; };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

    // 캔버스 밖에서도 조준 유지(포인터 leave 시 각도 고정 버그 방지)
    const onMove = (e) => {
      if (e.pointerType === 'touch') return; // 터치는 touch.js가 담당
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      if (e.buttons || e.type === 'mousedown') this.note('mouse');
    };
    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.note('mouse');
        onMove(e);
      }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  isDown(k) { return !!this.keys[k]; },

  resetAll() {
    this.keys = {};
    this.mouseDown = false;
  },
};
