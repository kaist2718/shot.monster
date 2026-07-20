// ============================================================
// icons.js - 플랫폼 중립 벡터 아이콘. (client)
// 이모지 대신 line-art 글리프로 OS/폰트 의존·가독성 문제를 없앤다.
// Canvas: drawIcon(ctx, name, x, y, size, color)
// DOM: iconSVG(name, size) → inline SVG 문자열
// ============================================================

/** @typedef {'zoomIn'|'zoomOut'|'board'|'orient'|'settings'|'weapon'|'reload'|'fire'|'run'|'soundOn'|'soundOff'|'health'|'pistol'|'smg'|'shotgun'|'coin'|'swipe'|'gamepad'|'ai'|'multi'|'play'|'trophy'|'grenade'|'chat'} IconName */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {IconName|string} name
 * @param {number} x center
 * @param {number} y center
 * @param {number} size outer box
 * @param {string} [color]
 */
export function drawIcon(ctx, name, x, y, size, color = '#fff') {
  const s = size * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (name) {
    case 'zoomIn':
      drawPlus(ctx, s * 0.85);
      ring(ctx, s * 0.55);
      break;
    case 'zoomOut':
      drawMinus(ctx, s * 0.85);
      ring(ctx, s * 0.55);
      break;
    case 'board':
      // leaderboard bars
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.55); ctx.lineTo(s * 0.7, -s * 0.55);
      ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.45, 0);
      ctx.moveTo(-s * 0.7, s * 0.55); ctx.lineTo(s * 0.2, s * 0.55);
      ctx.stroke();
      // medal dot
      ctx.beginPath(); ctx.arc(-s * 0.85, -s * 0.55, s * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    case 'orient':
      // phone rotate arrows
      ctx.strokeRect(-s * 0.35, -s * 0.55, s * 0.7, s * 1.1);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.95, -0.8, 0.9, false);
      ctx.stroke();
      // arrow head
      ctx.beginPath();
      ctx.moveTo(s * 0.55, s * 0.55); ctx.lineTo(s * 0.95, s * 0.35); ctx.lineTo(s * 0.75, s * 0.05);
      ctx.stroke();
      break;
    case 'settings': {
      // gear
      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2 - 0.18;
        const a1 = ((i + 0.45) / teeth) * Math.PI * 2;
        const a2 = ((i + 0.55) / teeth) * Math.PI * 2;
        const a3 = ((i + 1) / teeth) * Math.PI * 2 - 0.18;
        const rOut = s * 0.85, rIn = s * 0.58;
        if (i === 0) ctx.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
        ctx.lineTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
        ctx.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
        ctx.lineTo(Math.cos(a2) * rIn, Math.sin(a2) * rIn);
        ctx.lineTo(Math.cos(a3) * rIn, Math.sin(a3) * rIn);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'weapon':
      // dual chevron swap + gun silhouette
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, -s * 0.15); ctx.lineTo(-s * 0.35, -s * 0.55); ctx.lineTo(-s * 0.35, -s * 0.3);
      ctx.lineTo(s * 0.15, -s * 0.3); ctx.lineTo(s * 0.15, -s * 0.55); ctx.lineTo(s * 0.65, -s * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.85, s * 0.15); ctx.lineTo(s * 0.35, s * 0.55); ctx.lineTo(s * 0.35, s * 0.3);
      ctx.lineTo(-s * 0.15, s * 0.3); ctx.lineTo(-s * 0.15, s * 0.55); ctx.lineTo(-s * 0.65, s * 0.15);
      ctx.stroke();
      break;
    case 'reload':
      // circular arrow
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0.4, Math.PI * 2 - 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.55, -s * 0.55); ctx.lineTo(s * 0.85, -s * 0.15); ctx.lineTo(s * 0.35, -s * 0.05);
      ctx.stroke();
      // bullet
      roundBullet(ctx, -s * 0.08, s * 0.05, s * 0.22);
      break;
    case 'fire':
      // filled crosshair + center
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85); ctx.lineTo(0, -s * 0.25);
      ctx.moveTo(0, s * 0.25); ctx.lineTo(0, s * 0.85);
      ctx.moveTo(-s * 0.85, 0); ctx.lineTo(-s * 0.25, 0);
      ctx.moveTo(s * 0.25, 0); ctx.lineTo(s * 0.85, 0);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    case 'run':
      // simple runner
      ctx.beginPath(); ctx.arc(-s * 0.15, -s * 0.55, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.3); ctx.lineTo(s * 0.05, s * 0.05); ctx.lineTo(-s * 0.15, s * 0.55); // torso+leg
      ctx.moveTo(s * 0.05, s * 0.05); ctx.lineTo(s * 0.45, s * 0.55); // other leg
      ctx.moveTo(-s * 0.2, -s * 0.15); ctx.lineTo(-s * 0.55, s * 0.1); // arm back
      ctx.moveTo(-s * 0.2, -s * 0.15); ctx.lineTo(s * 0.4, -s * 0.35); // arm forward
      ctx.stroke();
      break;
    case 'soundOn':
      drawSpeaker(ctx, s);
      // waves
      ctx.beginPath();
      ctx.arc(s * 0.15, 0, s * 0.35, -0.7, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.15, 0, s * 0.58, -0.7, 0.7);
      ctx.stroke();
      break;
    case 'soundOff':
      drawSpeaker(ctx, s);
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -s * 0.45); ctx.lineTo(s * 0.7, s * 0.45);
      ctx.moveTo(s * 0.7, -s * 0.45); ctx.lineTo(s * 0.15, s * 0.45);
      ctx.stroke();
      break;
    case 'health':
      // medical cross in rounded square
      ctx.lineWidth = Math.max(1.2, size * 0.07);
      roundBox(ctx, s * 0.9, s * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45);
      ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.stroke();
      break;
    case 'pistol':
      drawPistol(ctx, s);
      break;
    case 'smg':
      drawSmg(ctx, s);
      break;
    case 'shotgun':
      drawShotgun(ctx, s);
      break;
    case 'coin':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.font = 'bold ' + Math.round(s * 0.9) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
      break;
    case 'swipe':
      // finger swipe horizontal
      ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.1, s * 0.22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.1); ctx.lineTo(-s * 0.15, -s * 0.35);
      ctx.lineTo(s * 0.55, -s * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -s * 0.55); ctx.lineTo(s * 0.7, -s * 0.35); ctx.lineTo(s * 0.35, -s * 0.15);
      ctx.stroke();
      break;
    case 'gamepad':
      roundBox(ctx, s * 0.95, s * 0.55);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.35, 0, s * 0.14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.55, 0.1 * s, s * 0.1, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ai':
      // bot head
      roundBox(ctx, s * 0.75, s * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, -s * 0.8);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.88, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-s * 0.25, -s * 0.05, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.25, -s * 0.05, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.25, s * 0.25); ctx.lineTo(s * 0.25, s * 0.25);
      ctx.stroke();
      break;
    case 'multi':
      // two users
      ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.35, s * 0.22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.2, s * 0.18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, s * 0.55); ctx.quadraticCurveTo(-s * 0.28, s * 0.05, s * 0.15, s * 0.55);
      ctx.moveTo(s * 0.05, s * 0.55); ctx.quadraticCurveTo(s * 0.35, s * 0.15, s * 0.75, s * 0.55);
      ctx.stroke();
      break;
    case 'play':
      ctx.beginPath();
      ctx.moveTo(-s * 0.25, -s * 0.55); ctx.lineTo(s * 0.55, 0); ctx.lineTo(-s * 0.25, s * 0.55);
      ctx.closePath(); ctx.fill();
      break;
    case 'trophy':
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.5); ctx.lineTo(s * 0.45, -s * 0.5);
      ctx.lineTo(s * 0.35, s * 0.15); ctx.lineTo(-s * 0.35, s * 0.15);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.15); ctx.lineTo(-s * 0.15, s * 0.4);
      ctx.lineTo(s * 0.15, s * 0.4); ctx.lineTo(s * 0.15, s * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, s * 0.55); ctx.lineTo(s * 0.35, s * 0.55);
      ctx.stroke();
      break;
    case 'chat':
      // 말풍선
      ctx.beginPath();
      ctx.arc(0, -s * 0.12, s * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.15);
      ctx.lineTo(s * 0.5, s * 0.5);
      ctx.lineTo(s * 0.3, s * 0.15);
      ctx.closePath();
      ctx.stroke();
      // 말풍선 내부 점 세 개
      ctx.beginPath();
      ctx.arc(-s * 0.15, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.arc(0, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.arc(s * 0.15, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    case 'grenade':
      // 수류탄: 둥근 몸통 + 핀
      ctx.beginPath();
      ctx.arc(0, s * 0.1, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // 핀
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.45);
      ctx.lineTo(0, -s * 0.75);
      ctx.stroke();
      // 핀 링
      ctx.beginPath();
      ctx.arc(0, -s * 0.85, s * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      // 퓨즈 라인
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.45);
      ctx.quadraticCurveTo(s * 0.2, -s * 0.3, s * 0.2, -s * 0.1);
      ctx.stroke();
      break;
    default:
      // fallback diamond
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.6, 0);
      ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function ring(ctx, r) {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
}
function drawPlus(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45);
  ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
  ctx.stroke();
}
function drawMinus(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
  ctx.stroke();
}
function roundBox(ctx, hw, hh) {
  const r = Math.min(hw, hh) * 0.35;
  ctx.beginPath();
  ctx.moveTo(-hw + r, -hh);
  ctx.arcTo(hw, -hh, hw, hh, r);
  ctx.arcTo(hw, hh, -hw, hh, r);
  ctx.arcTo(-hw, hh, -hw, -hh, r);
  ctx.arcTo(-hw, -hh, hw, -hh, r);
  ctx.closePath();
}
function roundBullet(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.5);
  ctx.lineTo(x + s * 0.4, y - s * 0.5);
  ctx.quadraticCurveTo(x + s * 1.1, y, x + s * 0.4, y + s * 0.5);
  ctx.lineTo(x - s, y + s * 0.5);
  ctx.closePath();
  ctx.stroke();
}
function drawSpeaker(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.25);
  ctx.lineTo(-s * 0.2, -s * 0.25);
  ctx.lineTo(s * 0.15, -s * 0.55);
  ctx.lineTo(s * 0.15, s * 0.55);
  ctx.lineTo(-s * 0.2, s * 0.25);
  ctx.lineTo(-s * 0.55, s * 0.25);
  ctx.closePath();
  ctx.stroke();
}
function drawPistol(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.15);
  ctx.lineTo(s * 0.55, -s * 0.15);
  ctx.lineTo(s * 0.55, s * 0.1);
  ctx.lineTo(-s * 0.15, s * 0.1);
  ctx.lineTo(-s * 0.05, s * 0.55);
  ctx.lineTo(-s * 0.4, s * 0.55);
  ctx.lineTo(-s * 0.55, s * 0.1);
  ctx.lineTo(-s * 0.7, s * 0.1);
  ctx.closePath();
  ctx.stroke();
}
function drawSmg(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.75, -s * 0.2);
  ctx.lineTo(s * 0.7, -s * 0.2);
  ctx.lineTo(s * 0.7, s * 0.05);
  ctx.lineTo(s * 0.15, s * 0.05);
  ctx.lineTo(s * 0.25, s * 0.55);
  ctx.lineTo(-s * 0.05, s * 0.55);
  ctx.lineTo(-s * 0.2, s * 0.05);
  ctx.lineTo(-s * 0.75, s * 0.05);
  ctx.closePath();
  ctx.stroke();
  // stock
  ctx.beginPath();
  ctx.moveTo(-s * 0.75, -s * 0.2); ctx.lineTo(-s * 0.95, s * 0.35);
  ctx.stroke();
}
function drawShotgun(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, -s * 0.12);
  ctx.lineTo(s * 0.75, -s * 0.12);
  ctx.lineTo(s * 0.75, s * 0.08);
  ctx.lineTo(-s * 0.2, s * 0.08);
  ctx.lineTo(-s * 0.05, s * 0.5);
  ctx.lineTo(-s * 0.35, s * 0.5);
  ctx.lineTo(-s * 0.55, s * 0.08);
  ctx.lineTo(-s * 0.9, s * 0.08);
  ctx.closePath();
  ctx.stroke();
  // double barrel hint
  ctx.beginPath();
  ctx.moveTo(s * 0.2, -s * 0.22); ctx.lineTo(s * 0.75, -s * 0.22);
  ctx.stroke();
}

/**
 * DOM용 SVG 문자열 (mute 버튼 등)
 * @param {IconName|string} name
 * @param {number} [size=22]
 * @param {string} [color='currentColor']
 */
export function iconSVG(name, size = 22, color = 'currentColor') {
  // Keep SVG paths simple and consistent with canvas icons.
  const common = `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  switch (name) {
    case 'soundOn':
      return `<svg ${common}><path d="M3 10v4h4l5 4V6L7 10H3z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 7a7 7 0 0 1 0 10"/></svg>`;
    case 'soundOff':
      return `<svg ${common}><path d="M3 10v4h4l5 4V6L7 10H3z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>`;
    case 'settings':
      return `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
    case 'swipe':
      return `<svg ${common}><path d="M8 13v-6"/><circle cx="8" cy="15" r="2"/><path d="M8 7h9"/><path d="M14 4l4 3-4 3"/></svg>`;
    case 'play':
      return `<svg ${common}><path d="M8 5v14l11-7z" fill="${color}" stroke="none"/></svg>`;
    case 'ai':
      return `<svg ${common}><rect x="6" y="8" width="12" height="10" rx="2"/><path d="M12 4v4M9 12h.01M15 12h.01M9 16h6"/></svg>`;
    case 'multi':
      return `<svg ${common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4.5-3.5S23 17 23 19"/></svg>`;
    case 'grenade':
      return `<svg ${common}><circle cx="12" cy="15" r="6"/><path d="M12 9v-4M12 5l-2-2M12 5l2-2"/><path d="M16 12c0-2.5-2-4-4-4s-4 1.5-4 4"/></svg>`;
    default:
      return `<svg ${common}><circle cx="12" cy="12" r="8"/></svg>`;
  }
}

/** Mute 등 버튼에 SVG를 안전하게 주입 */
export function setButtonIcon(btn, name, size = 20) {
  if (!btn) return;
  btn.innerHTML = iconSVG(name, size, '#fff');
  btn.style.display = 'flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.querySelector('svg')?.style && (btn.querySelector('svg').style.display = 'block');
}
