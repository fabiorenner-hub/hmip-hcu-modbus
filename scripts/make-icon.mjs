import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// 128x128 RGBA flat-colour logo for HCUweb (Modbus Bridge): dark rounded tile,
// two amber "device" blocks linked by a bus bar, with register dots.
const W = 128;
const H = 128;
const px = new Uint8Array(W * H * 4); // transparent by default

function rgba(hex, a = 255) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];
}
const BG = rgba('#0e1626');
const AMBER = rgba('#f59e0b');
const AMBER2 = rgba('#fbbf24');

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c[3];
}

function roundRect(x0, y0, w, h, r, c) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // corner rounding
      const dx = x < x0 + r ? x0 + r - x : x >= x0 + w - r ? x - (x0 + w - r - 1) : 0;
      const dy = y < y0 + r ? y0 + r - y : y >= y0 + h - r ? y - (y0 + h - r - 1) : 0;
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) continue;
      set(x, y, c);
    }
  }
}

function disc(cx, cy, r, c) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= r * r) set(x, y, c);
    }
  }
}

// Tile background (rounded square, transparent corners)
roundRect(0, 0, W, H, 28, BG);

// Two device blocks
roundRect(22, 40, 26, 48, 9, AMBER);
roundRect(80, 40, 26, 48, 9, AMBER);
// Bus bar linking them
roundRect(44, 57, 40, 14, 6, AMBER);
// "register" dots (brighter accent)
disc(35, 34, 5, AMBER2);
disc(93, 94, 5, AMBER2);
disc(64, 64, 6, BG); // notch in the bar for contrast
disc(64, 64, 3, AMBER2);

// ---- Encode PNG (RGBA, 8-bit) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
// filter 0 per scanline
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.subarray(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
    raw[y * (1 + W * 4) + 1 + i] = v;
  });
}
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);

writeFileSync(resolve(root, 'src/plugin/dashboard/public/icon.png'), png);
const b64 = png.toString('base64');
writeFileSync(resolve(root, 'scripts/icon.b64.txt'), b64);
console.log(`icon.png ${png.length} bytes, base64 ${b64.length} chars`);
