/* Trace the Remtoo icon (blue circle mark) from assets/logos/remtoo-logo.png
   into a true vector assets/logos/remtoo-icon.svg.
   Pipeline: decode PNG -> 4x bilinear alpha supersample -> marching squares
   (iso 0.5) -> Douglas-Peucker simplify -> adaptive quadratic smoothing. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BLUE = "#005cfc";

/* ---- PNG decode (color type 6, 8-bit) ---- */
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
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (f === 1) v = (v + a) & 0xff;
      else if (f === 2) v = (v + b) & 0xff;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[i] = v;
    }
    prev = cur;
  }
  return { px, width, height };
}

/* ---- geometry helpers ---- */
const key = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let maxD = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const left = douglasPeucker(pts.slice(0, idx + 1), tol);
    const right = douglasPeucker(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function simplifyLoop(loop, tol) {
  // Rotate so the anchor is the point farthest from the centroid, then DP.
  const cx = loop.reduce((s, p) => s + p[0], 0) / loop.length;
  const cy = loop.reduce((s, p) => s + p[1], 0) / loop.length;
  let far = 0, fd = -1;
  loop.forEach((p, i) => {
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d > fd) { fd = d; far = i; }
  });
  const rotated = loop.slice(far).concat(loop.slice(0, far));
  rotated.push(rotated[0]);
  const simplified = douglasPeucker(rotated, tol);
  simplified.pop();
  return simplified;
}

const turnAt = (prev, at, next) => {
  const a1 = Math.atan2(at[1] - prev[1], at[0] - prev[0]);
  const a2 = Math.atan2(next[1] - at[1], next[0] - at[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

const fmt = (v) => (Math.round(v * 100) / 100).toString();

function loopToPath(loop, scale) {
  const n = loop.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2 / scale, (a[1] + b[1]) / 2 / scale];
  const pt = (p) => [p[0] / scale, p[1] / scale];
  const sharp = loop.map((p, i) =>
    turnAt(loop[(i - 1 + n) % n], p, loop[(i + 1) % n]) > Math.PI / 6
  );
  let d = `M${fmt(mid(loop[0], loop[1])[0])} ${fmt(mid(loop[0], loop[1])[1])}`;
  for (let i = 1; i <= n; i++) {
    const p = loop[i % n];
    const m = mid(loop[i % n], loop[(i + 1) % n]);
    if (sharp[i % n]) {
      const vp = pt(p);
      d += `L${fmt(vp[0])} ${fmt(vp[1])}L${fmt(m[0])} ${fmt(m[1])}`;
    } else {
      const vp = pt(p);
      d += `Q${fmt(vp[0])} ${fmt(vp[1])} ${fmt(m[0])} ${fmt(m[1])}`;
    }
  }
  return d + "Z";
}

/* ---- main ---- */
const root = path.join(__dirname, "..");
const { px, width, height } = decodePng(path.join(root, "assets", "logos", "remtoo-logo.png"));

// Icon bounding box (recomputed: columns 10..218, rows 10..239).
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < 240; x++) {
    if (px[(y * width + x) * 4 + 3] > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const w = maxX - minX + 1, h = maxY - minY + 1;

const alpha = (x, y) =>
  px[((minY + Math.max(0, Math.min(h - 1, Math.round(y)))) * width + (minX + Math.max(0, Math.min(w - 1, Math.round(x))))) * 4 + 3] / 255;

// 4x bilinear supersample of the alpha channel.
const S = 4;
const GW = w * S, GH = h * S;
const grid = new Float32Array((GW + 1) * (GH + 1));
for (let gy = 0; gy <= GH; gy++) {
  for (let gx = 0; gx <= GW; gx++) {
    const fx = gx / S, fy = gy / S;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const a00 = alpha(x0, y0), a10 = alpha(x1, y0), a01 = alpha(x0, y1), a11 = alpha(x1, y1);
    grid[gy * (GW + 1) + gx] =
      a00 * (1 - tx) * (1 - ty) + a10 * tx * (1 - ty) + a01 * (1 - tx) * ty + a11 * tx * ty;
  }
}

// Marching squares, iso 0.5. Segments oriented so inside is on the right.
const ISO = 0.5;
const G = (x, y) => grid[y * (GW + 1) + x] >= ISO;
const segments = [];
for (let y = 0; y < GH; y++) {
  for (let x = 0; x < GW; x++) {
    const a = G(x, y), b = G(x + 1, y), c = G(x + 1, y + 1), d = G(x, y + 1);
    const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const T = [x + 0.5, y], R = [x + 1, y + 0.5], B = [x + 0.5, y + 1], L = [x, y + 0.5];
    const centerInside = (grid[y * (GW + 1) + x] + grid[y * (GW + 1) + x + 1] +
      grid[(y + 1) * (GW + 1) + x + 1] + grid[(y + 1) * (GW + 1) + x]) / 4 >= ISO;
    // All segments oriented so the inside stays on the right; each case is the
    // reverse of its complement (1<->14, 2<->13, 3<->12, 4<->11, 6<->9, 7<->8).
    const table = {
      1: [[L, T]],
      2: [[T, R]],
      3: [[L, R]],
      4: [[R, B]],
      5: centerInside ? [[T, R], [B, L]] : [[L, T], [R, B]],
      6: [[T, B]],
      7: [[L, B]],
      8: [[B, L]],
      9: [[B, T]],
      10: centerInside ? [[T, L], [B, R]] : [[T, R], [B, L]],
      11: [[B, R]],
      12: [[R, L]],
      13: [[R, T]],
      14: [[T, L]],
    };
    for (const [p, q] of table[code]) segments.push([p, q]);
  }
}

// Chain segments into closed loops.
const byStart = new Map();
for (const [p, q] of segments) {
  const k = key(p[0], p[1]);
  if (!byStart.has(k)) byStart.set(k, []);
  byStart.get(k).push(q);
}
const loops = [];
const used = new Set();
for (const [p, q] of segments) {
  const pk = key(p[0], p[1]);
  const uid = pk + ">" + key(q[0], q[1]);
  if (used.has(uid)) continue;
  used.add(uid);
  const loop = [p];
  let cur = p, next = q;
  let guard = 0;
  while (guard++ < segments.length + 2) {
    const nk = key(next[0], next[1]);
    if (nk === pk) break;
    loop.push(next);
    const candidates = (byStart.get(nk) || []).filter(
      (cand) => !used.has(nk + ">" + key(cand[0], cand[1]))
    );
    if (!candidates.length) break;
    // At saddle vertices two branches meet; keep going as straight as possible.
    let chosen = candidates[0];
    if (candidates.length > 1) {
      const inAngle = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
      chosen = candidates.reduce((best, cand) => {
        const outAngle = Math.atan2(cand[1] - next[1], cand[0] - next[0]);
        let turn = Math.abs(outAngle - inAngle);
        while (turn > Math.PI) turn = 2 * Math.PI - turn;
        const bestAngle = Math.abs(
          Math.atan2(best[1] - next[1], best[0] - next[0]) - inAngle
        );
        return turn < bestAngle ? cand : best;
      }, candidates[0]);
    }
    used.add(nk + ">" + key(chosen[0], chosen[1]));
    cur = next;
    next = chosen;
  }
  if (loop.length >= 3) loops.push(loop);
}

// Keep loops with meaningful area, simplify, emit path.
let dAll = "";
let kept = 0;
for (const loop of loops) {
  const area = Math.abs(loop.reduce((s, p, i) => {
    const q = loop[(i + 1) % loop.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2);
  if (area < 40) continue; // drop sub-pixel noise (values in 4x space: 40/16 = 2.5 px²)
  const simplified = simplifyLoop(loop, 1.4);
  if (simplified.length < 3) continue;
  dAll += loopToPath(simplified, S);
  kept++;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" focusable="false">\n  <path fill="${BLUE}" fill-rule="nonzero" d="${dAll}"/>\n</svg>\n`;
fs.writeFileSync(path.join(root, "assets", "logos", "remtoo-icon.svg"), svg);
console.log(`remtoo-icon.svg: ${w}x${h} viewBox, ${kept} contours, ${svg.length} bytes`);
