/* Crop the icon out of remtoo-logo.png into .qa-screenshots/icon-crop.png and
   report exact colors + tight bounds. Reuses the same tiny PNG decoder. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const buf = fs.readFileSync(path.join(__dirname, "..", "assets", "logos", "remtoo-logo.png"));

let pos = 8;
let width = 0, height = 0;
const idat = [];
while (pos < buf.length) {
  const length = buf.readUInt32BE(pos);
  const type = buf.toString("ascii", pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + length);
  if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
  else if (type === "IDAT") idat.push(data);
  else if (type === "IEND") break;
  pos += 12 + length;
}

const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * 4;
const pixels = Buffer.alloc(width * height * 4);
let prev = Buffer.alloc(stride);
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const cur = pixels.subarray(y * stride, (y + 1) * stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= 4 ? cur[i - 4] : 0;
    const b = prev[i];
    const c = i >= 4 ? prev[i - 4] : 0;
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
    }
    cur[i] = v;
  }
  prev = cur;
}

// Icon-only bounding box: scan columns 0..240 for opaque pixels.
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < 240; x++) {
    const i = (y * width + x) * 4;
    if (pixels[i + 3] > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log("icon bounds:", { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });

// Exact dominant colors inside the icon box.
const counts = new Map();
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const i = (y * width + x) * 4;
    if (pixels[i + 3] < 200) continue;
    const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}
console.log("top exact colors:");
for (const [key, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  const [r, g, b] = key.split(",").map(Number);
  console.log(`  #${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}: ${n}`);
}

// Write the cropped icon as a PNG (color type 6, no filtering) for visual inspection.
const cw = maxX - minX + 1;
const chh = maxY - minY + 1;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(cw, 0);
ihdr.writeUInt32BE(chh, 4);
ihdr[8] = 8; ihdr[9] = 6;
const rawOut = Buffer.alloc((cw * 4 + 1) * chh);
for (let y = 0; y < chh; y++) {
  rawOut[y * (cw * 4 + 1)] = 0;
  pixels.copy(rawOut, y * (cw * 4 + 1) + 1, ((minY + y) * width + minX) * 4, ((minY + y) * width + minX + cw) * 4);
}
const outPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(rawOut)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync(path.join(__dirname, "..", ".qa-screenshots"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", ".qa-screenshots", "icon-crop.png"), outPng);
console.log("wrote .qa-screenshots/icon-crop.png", outPng.length, "bytes");

// Also report a coarse 24x26 alpha map of the icon so the geometry is visible as ASCII.
const colsN = 26, rowsN = 26;
let map = "";
for (let ry = 0; ry < rowsN; ry++) {
  for (let rx = 0; rx < colsN; rx++) {
    const x0 = Math.floor((rx / colsN) * cw), x1 = Math.floor(((rx + 1) / colsN) * cw);
    const y0 = Math.floor((ry / rowsN) * chh), y1 = Math.floor(((ry + 1) / rowsN) * chh);
    let opaque = 0, blueish = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = ((minY + y) * width + (minX + x)) * 4;
      if (pixels[i + 3] > 128) {
        opaque++;
        if (pixels[i + 2] > 150 && pixels[i + 1] < 150) blueish++;
      }
    }
    map += opaque === 0 ? " " : blueish > opaque / 2 ? "#" : ".";
  }
  map += "\n";
}
console.log(map);
