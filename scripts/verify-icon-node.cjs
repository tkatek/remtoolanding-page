/* Rasterize assets/logos/remtoo-icon.svg (M/L/Q/Z path) with a scanline
   filler and diff against the original PNG icon's alpha mask. Pure Node. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");

/* ---- parse the SVG path into polygons (flattened) ---- */
const svg = fs.readFileSync(path.join(root, "assets", "logos", "remtoo-icon.svg"), "utf8");
const d = svg.match(/d="([^"]+)"/)[1];
const tokens = d.match(/[MLQZ]|-?\d+(?:\.\d+)?/g);

const polys = [];
let cur = [], cx = 0, cy = 0, startX = 0, startY = 0;
const at = (i) => parseFloat(tokens[i]);
let i = 0;
while (i < tokens.length) {
  const t = tokens[i];
  if (t === "M") { if (cur.length >= 3) polys.push(cur); cur = [[at(i + 1), at(i + 2)]]; startX = cx = at(i + 1); startY = cy = at(i + 2); i += 3; }
  else if (t === "L") { cur.push([at(i + 1), at(i + 2)]); cx = at(i + 1); cy = at(i + 2); i += 3; }
  else if (t === "Q") {
    const qx = at(i + 1), qy = at(i + 2), x = at(i + 3), y = at(i + 4);
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps, v = 1 - u;
      cur.push([
        v * v * cx + 2 * v * u * qx + u * u * x,
        v * v * cy + 2 * v * u * qy + u * u * y,
      ]);
    }
    cx = x; cy = y; i += 5;
  } else if (t === "Z") { cur.push([startX, startY]); i += 1; }
  else throw new Error("unexpected token " + t);
}
if (cur.length >= 3) polys.push(cur);

/* ---- scanline fill (nonzero winding) at scale SS, supersampled coverage ---- */
function rasterize(polys, W, H, SS) {
  // Edges scaled to supersample grid.
  const edges = [];
  for (const poly of polys) {
    for (let k = 0; k < poly.length - 1; k++) {
      const [x1, y1] = poly[k], [x2, y2] = poly[k + 1];
      if (y1 !== y2) edges.push([x1 * SS, y1 * SS, x2 * SS, y2 * SS]);
    }
  }
  const alpha = new Float32Array(W * H);
  for (let sy = 0; sy < H * SS; sy++) {
    // gather crossings
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      if (sy + 0.5 <= yMin || sy + 0.5 >= yMax) continue;
      xs.push(x1 + ((sy + 0.5) - y1) * (x2 - x1) / (y2 - y1));
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    // nonzero winding spans between crossing pairs by winding parity isn't enough;
    // for well-formed traced loops even-odd == nonzero, use pair spans.
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, xs[k]), to = Math.min(W * SS, xs[k + 1]);
      const i0 = Math.floor(from), i1 = Math.ceil(to);
      for (let sx = i0; sx < i1; sx++) {
        if (sx < 0 || sx >= W * SS) continue;
        const cov = Math.min(to, sx + 1) - Math.max(from, sx);
        alpha[Math.floor(sy / SS) * W + Math.floor(sx / SS)] += Math.max(0, cov);
      }
    }
  }
  // Accumulated coverage spans SS rows and columns; normalize back to 0..1.
  for (let i = 0; i < alpha.length; i++) alpha[i] /= SS * SS;
  return alpha;
}

/* ---- decode original PNG icon alpha ---- */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let j = 0; j < stride; j++) {
      const a = j >= 4 ? cur[j - 4] : 0, b = prev[j], c = j >= 4 ? prev[j - 4] : 0;
      let v = line[j];
      if (f === 1) v = (v + a) & 0xff;
      else if (f === 2) v = (v + b) & 0xff;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[j] = v;
    }
    prev = cur;
  }
  return { px, width, height };
}

const orig = decodePng(path.join(root, "assets", "logos", "remtoo-logo.png"));
// icon box: minX 10, minY 10, w 209, h 230
const IX = 10, IY = 10, IW = 209, IH = 230;
const origAlpha = (x, y) => orig.px[((IY + y) * orig.width + (IX + x)) * 4 + 3] / 255;

const SS = 4;
const mine = rasterize(polys, IW, IH, SS);

let sumDiff = 0, worst = 0, onlyO = 0, onlyM = 0, overlap = 0;
for (let y = 0; y < IH; y++) {
  for (let x = 0; x < IW; x++) {
    const a = origAlpha(x, y);
    const b = Math.min(1, mine[y * IW + x]);
    const dd = Math.abs(a - b);
    sumDiff += dd;
    if (dd > worst) worst = dd;
    if (a > 0.5 && b > 0.5) overlap++;
    else if (a > 0.5) onlyO++;
    else if (b > 0.5) onlyM++;
  }
}
const total = overlap + onlyO + onlyM || 1;
console.log(`mean alpha diff: ${(sumDiff / (IW * IH)).toFixed(4)}`);
console.log(`worst: ${worst.toFixed(3)}`);
console.log(`overlap: ${(overlap / total * 100).toFixed(2)}%  only-original: ${(onlyO / total * 100).toFixed(2)}%  only-svg: ${(onlyM / total * 100).toFixed(2)}%`);

/* ---- write side-by-side PNG (original | svg) on white for eyeballing ---- */
function writePng(file, width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rawOut = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawOut[y * (width * 4 + 1)] = 0;
    rgba.copy(rawOut, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rawOut)), chunk("IEND", Buffer.alloc(0))]));
}

const S = 2; // upscale for viewing
const W2 = IW * S, H2 = IH * S;
const out = Buffer.alloc((W2 * 2 + 24) * H2 * 4);
for (let y = 0; y < H2; y++) {
  for (let x = 0; x < W2 * 2 + 24; x++) {
    const oi = ((y * H2 / H2 | 0) * 1 + 0, 0); // noop
    let r = 255, g = 255, b = 255, aCov = 0;
    let srcX = 0, useMine = false;
    if (x < W2) { srcX = Math.floor(x / S); }
    else if (x >= W2 + 24) { srcX = Math.floor((x - W2 - 24) / S); useMine = true; }
    else { r = 230; g = 230; b = 230; }
    if (x < W2 || x >= W2 + 24) {
      const srcY = Math.floor(y / S);
      aCov = useMine ? Math.min(1, mine[srcY * IW + srcX]) : origAlpha(srcX, srcY);
      r = Math.round(0 * aCov + 255 * (1 - aCov));
      g = Math.round(92 * aCov + 255 * (1 - aCov));
      b = Math.round(252 * aCov + 255 * (1 - aCov));
    }
    const o = (y * (W2 * 2 + 24) + x) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
}
writePng(path.join(root, ".qa-screenshots", "icon-compare.png"), W2 * 2 + 24, H2, out);
console.log("side-by-side written to .qa-screenshots/icon-compare.png (left: original PNG, right: traced SVG)");
