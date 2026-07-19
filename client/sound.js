// ============================================================
// sound.js - WebAudio 합성 SFX(자산 없이 생성). (client)
// 최초 사용자 제스처에서 AudioContext를 만든다(브라우저 정책).
// 음소거 상태는 localStorage('br_mute')에 저장.
// ============================================================

const SOUNDS = {
  pistol:    { freq: 320, type: 'square',   dur: 0.10, sweep: -180, vol: 0.22, noise: 0.5 },
  smg:       { freq: 360, type: 'square',   dur: 0.07, sweep: -150, vol: 0.16, noise: 0.5 },
  shotgun:   { freq: 180, type: 'sawtooth', dur: 0.20, sweep: -90,  vol: 0.30, noise: 1.0 },
  hit:       { freq: 700, type: 'triangle', dur: 0.07, sweep: 300,  vol: 0.20, noise: 0 },
  kill:      { freq: 520, type: 'triangle', dur: 0.22, sweep: 520,  vol: 0.26, noise: 0 },
  reload:    { freq: 240, type: 'square',   dur: 0.06, sweep: 0,    vol: 0.14, noise: 0 },
  pickup:    { freq: 600, type: 'sine',     dur: 0.16, sweep: 600,  vol: 0.22, noise: 0 },
  hurt:      { freq: 160, type: 'sawtooth', dur: 0.18, sweep: -60,  vol: 0.26, noise: 0.3 },
  death:     { freq: 220, type: 'sawtooth', dur: 0.5,  sweep: -180, vol: 0.30, noise: 0.2 },
  click:     { freq: 480, type: 'square',   dur: 0.04, sweep: 0,    vol: 0.12, noise: 0 },
};

export const Sound = {
  _ctx: null,
  _master: null,
  _muted: false,
  _noiseBuf: null, // 노이즈 버퍼 캐시(매 재생마다 버퍼를 새로 할당하던 GC 부하 제거)

  init() {
    try { this._muted = localStorage.getItem('br_mute') === '1'; } catch { /* 무시 */ }
  },

  get muted() { return this._muted; },

  // 사용자 제스처에서 호출해 컨텍스트를 미리 풀어두면 이후 play가 즉시 소리 남.
  unlock() { this._ensure(); },

  toggleMute() {
    this._muted = !this._muted;
    try { localStorage.setItem('br_mute', this._muted ? '1' : '0'); } catch { /* 무시 */ }
    if (this._master) this._master.gain.value = this._muted ? 0 : 0.9;
    return this._muted;
  },

  // 사용자 제스처에서 호출해 컨텍스트를 풀어야 소리가 남.
  _ensure() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch { /* 무시 */ } }
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this._ctx = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : 0.9;
      this._master.connect(this._ctx.destination);
      // 노이즈 층용 버퍼 미리 생성(감쇠는 재생 시 gain envelope로 처리)
      const dur = 1.0;
      const buf = this._ctx.createBuffer(1, Math.max(1, Math.floor(this._ctx.sampleRate * dur)), this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      this._noiseBuf = buf;
      return true;
    } catch { return false; }
  },

  play(name, panX = 0, vol = 1) {
    if (this._muted) return;
    const cfg = SOUNDS[name];
    if (!cfg) return;
    if (!this._ensure()) return;
    const v = Math.max(0, Math.min(1, vol)); // 거리 감쇠 등 외부 볼륨 스케일
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 톤
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.freq, now);
    osc.frequency.linearRampToValueAtTime(Math.max(40, cfg.freq + cfg.sweep), now + cfg.dur);
    gain.gain.setValueAtTime(cfg.vol * v, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + cfg.dur);

    // 패닝(좌우 위치감)
    let out = gain;
    try {
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, panX));
        gain.connect(pan); out = pan;
      }
    } catch { /* 무시 */ }

    osc.connect(gain);
    out.connect(this._master);
    osc.start(now);
    osc.stop(now + cfg.dur + 0.02);

    // 노이즈 층(탄성 느낌) — 캐시된 버퍼 재사용, 감쇠는 gain envelope로
    if (cfg.noise > 0 && this._noiseBuf) {
      const dur = cfg.dur * 0.9;
      const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(cfg.vol * 0.5 * cfg.noise * v, now);
      ng.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      src.connect(ng); ng.connect(this._master);
      src.start(now);
      src.stop(now + dur + 0.02);
    }
  },
};
