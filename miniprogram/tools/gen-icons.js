// 生成 tabBar 图标的临时脚本:node tools/gen-icons.js 生成后可删除
// 输出 81x81 PNG:home / cats(猫爪) / adopt(爱心) / about(信息),灰色与橙色各一
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 81;

// CRC32 表
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(file, pixels) {
  // pixels: SIZE*SIZE RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

// 简单抗锯齿:在 3 倍画布上画再采样
const SS = 3;
const W = SIZE * SS;
function makeCanvas() {
  return new Float64Array(W * W); // coverage 0..1
}
function fillCircle(cv, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = Math.min(1, Math.max(0, r + 0.5 - d));
      if (cover > 0) cv[y * W + x] = Math.max(cv[y * W + x], cover);
    }
  }
}
function fillRect(cv, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) cv[y * W + x] = 1;
}
function fillTriangle(cv, ax, ay, bx, by, cx, cy) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
      const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) cv[y * W + x] = 1;
    }
  }
}

function render(cv, color, file) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) cov += cv[(y * SS + sy) * W + x * SS + sx];
      cov /= SS * SS;
      const i = (y * SIZE + x) * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = Math.round(cov * 255);
    }
  }
  writePng(file, pixels);
}

// ---- 形状定义(3 倍坐标,243x243 画布)----
const s = (v) => v * SS;
const shapes = {
  home: (cv) => {
    // 屋顶三角 + 房身
    fillTriangle(cv, s(40.5), s(18), s(10), s(48), s(71), s(48));
    fillRect(cv, s(17), s(46), s(64), s(72));
    // 门
    for (let y = s(54); y < s(72); y++)
      for (let x = s(35); x < s(46); x++) cv[y * W + x] = 0;
    fillRect(cv, s(10), s(46), s(71), s(51));
  },
  cats: (cv) => {
    // 猫爪:大掌垫 + 4 趾
    fillCircle(cv, s(40.5), s(52), s(15)); // 掌垫
    fillCircle(cv, s(40.5), s(58), s(16));
    fillCircle(cv, s(22), s(30), s(8));
    fillCircle(cv, s(36), s(21), s(8));
    fillCircle(cv, s(50), s(21), s(8));
    fillCircle(cv, s(62), s(31), s(8));
  },
  adopt: (cv) => {
    // 爱心:两圆 + 三角
    fillCircle(cv, s(30), s(34), s(14));
    fillCircle(cv, s(51), s(34), s(14));
    fillTriangle(cv, s(17.5), s(42), s(63.5), s(42), s(40.5), s(72));
  },
  about: (cv) => {
    // 信息 i:圆点 + 竖条,外圈
    fillCircle(cv, s(40.5), s(40.5), s(28));
    // 镂空 i
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - s(40.5), y + 0.5 - s(40.5));
      if (d < s(23)) cv[y * W + x] = 0;
    }
    fillCircle(cv, s(40.5), s(28), s(4.5));
    fillRect(cv, s(36), s(38), s(45), s(58));
    // 补回外圈:重画描边(把 i 画回)
    fillCircle(cv, s(40.5), s(28), s(4.5));
  }
};

// about 形状换个实现:外圈圆环 + 实心 i
shapes.about = (cv) => {
  // 圆环
  const outer = s(29), inner = s(24);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - s(40.5), y + 0.5 - s(40.5));
      if (d <= outer + 0.5 && d >= inner - 0.5) {
        const cover = Math.min(outer + 0.5 - d, d - inner + 0.5, 1);
        cv[y * W + x] = Math.max(cv[y * W + x], Math.max(0, cover));
      }
    }
  fillCircle(cv, s(40.5), s(28.5), s(4.5));
  fillRect(cv, s(36.5), s(37), s(44.5), s(57));
};

const GRAY = [0x99, 0x99, 0x99];
const ORANGE = [0xf2, 0x96, 0x3d];
const outDir = path.join(__dirname, '..', 'miniprogram', 'images');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, draw] of Object.entries(shapes)) {
  for (const [suffix, color] of [['', GRAY], ['-active', ORANGE]]) {
    const cv = makeCanvas();
    draw(cv);
    render(cv, color, path.join(outDir, `tab-${name}${suffix}.png`));
    console.log(`tab-${name}${suffix}.png`);
  }
}
console.log('done');
