/* One-off analysis of assets/logos/remtoo-logo.png: decode the PNG with zlib,
   report content bounding segments and dominant colors so the icon can be cropped. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const file = path.join(__dirname, "..", "assets", "logos", "remtoo-logo.png");
const buf = fs.readFileSync(file);

let pos = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idat = [];

while (pos < buf.length) {
  const length = buf.readUInt32BE(pos);
  const type = buf.toString("ascii", pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + length);
  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === "IDAT") {
    idat.push(data);
  } else if (type === "IEND") break;
  pos += 12 + length;
}

if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
if (!channels) throw new Error(`unsupported color type ${colorType}`);

const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
const pixels = Buffer.alloc(width * height * channels);
const bpp = channels;

let prev = Buffer.alloc(stride);
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const cur = pixels.subarray(y * stride, (y + 1) * stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? cur[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    let v = line[i];
    switch (filter) {
      case 0: break;
      case 1: v = (v + a) & 0xff; break;
      case 2: v = (v + b) & 0xff; break;
      case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pred) & 0xff; break;
      }
      default: throw new Error(`bad filter ${filter} at row ${y}`);
    }
    cur[i] = v;
  }
  prev = cur;
}

const alphaAt = (channels === 4) ? (x, y) => pixels[(y * width + x) * 4 + 3]
  : channels === 2 ? (x, y) => pixels[(y * width + x) * 2 + 1]
  : () => 255;

const cols = new Array(width).fill(0);
const rows = new Array(height).fill(0);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (alphaAt(x, y) > 10) { cols[x]++; rows[y]++; }
  }
}

const segments = (arr) => {
  const out = [];
  let start = -1;
  arr.forEach((n, i) => {
    if (n > 0 && start < 0) start = i;
    if (n === 0 && start >= 0) { out.push([start, i - 1]); start = -1; }
  });
  if (start >= 0) out.push([start, arr.length - 1]);
  return out;
};

console.log(`size: ${width}x${height}, colorType=${colorType}, channels=${channels}`);
console.log("column segments:", JSON.stringify(segments(cols)));
console.log("row segments:", JSON.stringify(segments(rows)));

// Dominant opaque colors (quantized) within the first content segment (the icon).
const firstSeg = segments(cols)[0] || [0, 0];
const rowSeg = segments(rows);
const top = rowSeg[0][0], bottom = rowSeg[0][1];
const counts = new Map();
for (let y = top; y <= bottom; y++) {
  for (let x = firstSeg[0]; x <= Math.min(firstSeg[1], firstSeg[0] + 300); x++) {
    const i = (y * width + x) * channels;
    const [r, g, b, a] = channels >= 3
      ? [pixels[i], pixels[i + 1], pixels[i + 2], alphaAt(x, y)]
      : [pixels[i], pixels[i], pixels[i], alphaAt(x, y)];
    if (a < 200) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}
const top5 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [key, n] of top5) {
  const [r, g, b] = key.split("-").map((v) => parseInt(v, 16) << 4);
  console.log(`icon color ~#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}: ${n} px`);
}

// Text-region dominant color
const lastSeg = segments(cols).at(-1);
if (lastSeg) {
  const counts2 = new Map();
  for (let y = top; y <= bottom; y++) {
    for (let x = lastSeg[0]; x <= lastSeg[1]; x++) {
      const i = (y * width + x) * channels;
      const [r, g, b, a] = channels >= 3
        ? [pixels[i], pixels[i + 1], pixels[i + 2], alphaAt(x, y)]
        : [pixels[i], pixels[i], pixels[i], alphaAt(x, y)];
      if (a < 200) continue;
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      counts2.set(key, (counts2.get(key) || 0) + 1);
    }
  }
  const t5 = [...counts2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [key, n] of t5) {
    const [r, g, b] = key.split("-").map((v) => parseInt(v, 16) << 4);
    console.log(`text color ~#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}: ${n} px`);
  }
}
