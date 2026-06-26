import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Build the 128x128 HCUweb plugin icon: the Modbus wordmark fitted onto a light
// rounded tile (the mark is dark, so a light tile keeps it legible). The source
// logo is committed so the build is offline-reproducible.
const SIZE = 128;
const PAD = 14;
const TILE = [244, 246, 250, 255]; // light tile so the dark wordmark stays readable
const RADIUS = 26;

const src = PNG.sync.read(readFileSync(resolve(root, 'src/plugin/dashboard/assets/modbus-src.png')));
const out = new PNG({ width: SIZE, height: SIZE });

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
function setOut(x, y, c) {
  const i = (y * SIZE + x) * 4;
  out.data[i] = c[0];
  out.data[i + 1] = c[1];
  out.data[i + 2] = c[2];
  out.data[i + 3] = c[3];
}

// 1) Rounded light tile (transparent outside the radius).
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x < RADIUS ? RADIUS - x : x >= SIZE - RADIUS ? x - (SIZE - RADIUS - 1) : 0;
    const dy = y < RADIUS ? RADIUS - y : y >= SIZE - RADIUS ? y - (SIZE - RADIUS - 1) : 0;
    setOut(x, y, dx > 0 && dy > 0 && dx * dx + dy * dy > RADIUS * RADIUS ? [0, 0, 0, 0] : TILE);
  }
}

// 2) Fit the logo (preserve aspect ratio) into the padded area.
const avail = SIZE - 2 * PAD;
const scale = Math.min(avail / src.width, avail / src.height);
const drawW = Math.round(src.width * scale);
const drawH = Math.round(src.height * scale);
const offX = Math.round((SIZE - drawW) / 2);
const offY = Math.round((SIZE - drawH) / 2);

// Area-average downscale with premultiplied alpha (scatter accumulation).
const acc = new Float64Array(drawW * drawH * 4);
const cnt = new Float64Array(drawW * drawH);
for (let sy = 0; sy < src.height; sy++) {
  for (let sx = 0; sx < src.width; sx++) {
    const tx = Math.min(drawW - 1, Math.floor((sx / src.width) * drawW));
    const ty = Math.min(drawH - 1, Math.floor((sy / src.height) * drawH));
    const [r, g, b, a] = px(src, sx, sy);
    const af = a / 255;
    const k = ty * drawW + tx;
    acc[k * 4] += r * af;
    acc[k * 4 + 1] += g * af;
    acc[k * 4 + 2] += b * af;
    acc[k * 4 + 3] += a;
    cnt[k] += 1;
  }
}

// 3) Composite the downscaled logo over the tile.
for (let y = 0; y < drawH; y++) {
  for (let x = 0; x < drawW; x++) {
    const k = y * drawW + x;
    const n = cnt[k] || 1;
    const a = acc[k * 4 + 3] / n; // 0..255
    if (a <= 0) continue;
    const af = a / 255;
    const sr = acc[k * 4] / n / af;
    const sg = acc[k * 4 + 1] / n / af;
    const sb = acc[k * 4 + 2] / n / af;
    const ox = offX + x;
    const oy = offY + y;
    if (ox < 0 || oy < 0 || ox >= SIZE || oy >= SIZE) continue;
    const d = px(out, ox, oy);
    const r = Math.round(sr * af + d[0] * (1 - af));
    const g = Math.round(sg * af + d[1] * (1 - af));
    const b = Math.round(sb * af + d[2] * (1 - af));
    setOut(ox, oy, [r, g, b, 255]);
  }
}

const png = PNG.sync.write(out, { colorType: 6 });
writeFileSync(resolve(root, 'src/plugin/dashboard/public/icon.png'), png);
const b64 = png.toString('base64');
writeFileSync(resolve(root, 'scripts/icon.b64.txt'), b64);
console.log(`icon.png ${png.length} bytes, base64 ${b64.length} chars (logo ${drawW}x${drawH})`);
