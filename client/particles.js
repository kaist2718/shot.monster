// ============================================================
// particles.js - 클라이언트 전용 시각 효과(월드 좌표). (client)
// 서버 권위에는 영향 없음. 카메라 줌에 맞춰 축소된다.
// 종류: muzzle(총구 불꽃/탄피), spark(탄 적중), blood(피격),
//      death(파편), pickup(픽업 반짝), damageText(뜬 데미지 숫자).
// 모바일은 파티클 수를 줄여 성능/과부하를 완화한다.
// ============================================================

import { Input } from './input.js';

// 모바일(터치) 여부에 따라 데스크탑/모바일 파티클 수 선택
function pcount(desktop, mobile) { return Input.touch.enabled ? mobile : desktop; }

export class Particles {
  constructor() { this.items = []; this._fontCache = new Map(); }

  clear() { this.items.length = 0; }

  // 데미지 숫자 폰트 스트링 캐시(크기별로 매 프레임 새 스트링 할당/비교하는 비용 절감)
  _font(px) {
    let f = this._fontCache.get(px);
    if (!f) { f = 'bold ' + px + 'px sans-serif'; this._fontCache.set(px, f); }
    return f;
  }

  // 총구 화염 + 탄피
  muzzle(x, y, angle) {
    for (let i = 0; i < pcount(5, 3); i++) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const sp = 90 + Math.random() * 160;
      this.items.push({
        t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.12 + Math.random() * 0.08, max: 0.2, size: 2 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#ffe27a' : '#ff9b3d', grav: 0,
      });
    }
    // 탄피
    const ea = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    this.items.push({
      t: 'shell', x, y, vx: Math.cos(ea) * (60 + Math.random() * 60),
      vy: Math.sin(ea) * (60 + Math.random() * 60) - 30,
      life: 0.6, max: 0.6, size: 2.4, color: '#d8a64a', grav: 520,
    });
  }

  // 탄이 벽/장애물에 맞을 때
  spark(x, y, angle) {
    for (let i = 0; i < pcount(7, 5); i++) {
      const a = angle + Math.PI + (Math.random() - 0.5) * 1.6;
      const sp = 70 + Math.random() * 180;
      this.items.push({
        t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.18 + Math.random() * 0.18, max: 0.36, size: 1.5 + Math.random() * 1.8,
        color: Math.random() < 0.5 ? '#ffd98a' : '#fff', grav: 0,
      });
    }
  }

  // 적/자신 피격
  blood(x, y, angle) {
    for (let i = 0; i < pcount(8, 5); i++) {
      const a = angle + (Math.random() - 0.5) * 1.2;
      const sp = 50 + Math.random() * 150;
      this.items.push({
        t: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.25, max: 0.5, size: 2 + Math.random() * 2.2,
        color: '#c83232', grav: 60,
      });
    }
  }

  // 사망 폭발(파편)
  death(x, y, color) {
    for (let i = 0; i < pcount(18, 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 260;
      this.items.push({
        t: 'gib', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.5, max: 1, size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? color : '#c83232', grav: 120,
      });
    }
  }

  // 픽업 획득 반짝임
  pickup(x, y, color) {
    for (let i = 0; i < pcount(10, 6); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 110;
      this.items.push({
        t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.3, max: 0.6, size: 2 + Math.random() * 2,
        color, grav: 0,
      });
    }
  }

  // 뜨는 데미지 숫자
  damageText(x, y, amount, isMe) {
    this.items.push({
      t: 'text', x, y, vx: (Math.random() - 0.5) * 24, vy: -52,
      life: 0.85, max: 0.85, text: String(Math.round(amount)),
      color: isMe ? '#ff5d5d' : '#ffe27a', size: isMe ? 18 : 14,
    });
  }

  update(dt) {
    const arr = this.items;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 2.2 * dt); // 감속
    }
  }

  draw(ctx, SX, SY, z) {
    for (const p of this.items) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      if (p.t === 'text') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.font = this._font(Math.round(p.size * Math.max(0.7, z)));
        ctx.textAlign = 'center';
        ctx.fillText(p.text, SX(p.x), SY(p.y));
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const r = (p.size || 2) * z;
      ctx.beginPath();
      ctx.arc(SX(p.x), SY(p.y), Math.max(0.6, r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
