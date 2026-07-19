// ============================================================
// gen-icons.cjs - 의존성 없는 순수 Node PNG 아이콘 생성기.
// node:zlib 로 PNG(IDAT)를 직접 인코딩해 192/512/마스커블/apple/favicon 아이콘을 생성.
// 디자인: 짙은 배경 + 골드 과녁(링 + 십자 조준선 + 중앙 점) — 배틀로얄 조준 이미지.
//   npm run icons  또는  node scripts/gen-icons.cjs
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
const BG = [32, 36, 43];        // #20242b (배경/하늘)
const GOLD = [255, 210, 63];    // #ffd23f (골드 액센트)
const SS = 2;                   // 슈퍼샘플링(계단현상 완화)

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const nameBuf = Buffer.from(name, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([nameBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, nameBuf, data, crcBuf]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  // 각 행 앞에 필터 바이트(0) 추가
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 픽셀 디자인 (contentScale 로 마스커블 안전영역 축소) ----
function drawRaw(S, contentScale = 1) {
  const big = S * SS;
  const cx = big / 2, cy = big / 2;
  const rIn = big * 0.205 * contentScale, rOut = big * 0.275 * contentScale;
  const halfTh = big * 0.022 * contentScale;
  const dStart = big * 0.33 * contentScale, dEnd = big * 0.46 * contentScale;
  const rDot = big * 0.055 * contentScale;
  const buf = Buffer.alloc(big * big * 4);
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const dx = x - cx, dy = y - cy;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const d = Math.hypot(dx, dy);
      const onRing = d >= rIn && d <= rOut;
      const onArm = Math.min(ax, ay) <= halfTh && Math.max(ax, ay) >= dStart && Math.max(ax, ay) <= dEnd;
      const onDot = d <= rDot;
      const o = (y * big + x) * 4;
      const c = (onRing || onArm || onDot) ? GOLD : BG;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    }
  }
  return buf;
}

// SS 다운샘플링(2x2 평균) → 부드러운 곡선
function downsample(buf, S) {
  const big = S * SS;
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const o = ((y * SS + j) * big + (x * SS + i)) * 4;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2];
        }
      }
      const n = SS * SS;
      const o = (y * S + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
  }
  return out;
}

function gen(name, size, contentScale = 1) {
  const raw = drawRaw(size, contentScale);
  const rgba = downsample(raw, size);
  const png = encodePNG(size, rgba);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`  ${name}  ${size}x${size}  ${png.length} bytes`);
}

fs.mkdirSync(OUT, { recursive: true });
console.log('아이콘 생성 →', path.relative(process.cwd(), OUT));
gen('icon-192.png', 192, 1.0);
gen('icon-512.png', 512, 1.0);
gen('icon-maskable-512.png', 512, 0.8); // 마스커블: 중앙 80% 안전영역 유지
gen('apple-touch-icon.png', 180, 1.0);
gen('favicon-32.png', 32, 1.0);
console.log('완료.');
