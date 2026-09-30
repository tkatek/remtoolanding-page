/* Deterministic geometry check: does any book's cover overlap another book's TEXT? */
const http = require("node:http");
const fs = require("node:fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const relative = rawPath === "/" ? "schools.html" : rawPath.replace(/^\/+/, "");
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
      fs.readFile(file, (error, body) => {
        if (error) { res.writeHead(404).end(); return; }
        res.writeHead(200, { "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(body);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });

  for (const width of [1920, 1600, 1440, 1280, 1180, 1024, 820, 768]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => { if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]); });

    const report = await page.evaluate(() => {
      const books = [...document.querySelectorAll("#programs .cq-book")];
      const data = books.map((b) => {
        const r = b.getBoundingClientRect();
        const code = b.querySelector(".cq-book-code");
        const name = b.querySelector(".cq-book-name");
        const foot = b.querySelector(".cq-book-foot");
        const cr = code.getBoundingClientRect();
        const nr = name.getBoundingClientRect();
        const fr = foot.getBoundingClientRect();
        return {
          code: code.textContent,
          box: { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) },
          nameBox: { l: +nr.left.toFixed(1), r: +nr.right.toFixed(1), t: +nr.top.toFixed(1), b: +nr.bottom.toFixed(1) },
          footBox: { l: +fr.left.toFixed(1), r: +fr.right.toFixed(1) },
          nameTextFits: nr.left >= r.left + 1 && nr.right <= r.right - 1,
          footTextFits: fr.left >= r.left + 1 && fr.right <= r.right - 1,
        };
      });
      // cross-book text coverage: which foreign book rect covers this book's name/foot text?
      const coverings = [];
      data.forEach((d, i) => {
        books.forEach((other, j) => {
          if (i === j) return;
          const o = data[j].box;
          const hit = (seg) => seg.l < o.r - 0.5 && seg.r > o.l + 0.5;
          const nameHit = hit(d.nameBox) ? Math.min(d.nameBox.r, o.r) - Math.max(d.nameBox.l, o.l) : 0;
          const footHit = hit(d.footBox) ? Math.min(d.footBox.r, o.r) - Math.max(d.footBox.l, o.l) : 0;
          if (nameHit > 0.5 || footHit > 0.5) coverings.push(`${d.code}: ${data[j].code} covers name×${nameHit.toFixed(1)}px foot×${footHit.toFixed(1)}px`);
        });
      });
      const stage = document.querySelector("#programs .cq-stage").getBoundingClientRect();
      const wrap = document.querySelector("#programs .cq-wrap").getBoundingClientRect();
      const list = document.querySelector("#programs .cq-list").getBoundingClientRect();
      const visual = document.querySelector("#programs .cq-visual").getBoundingClientRect();
      return { coverings, stageW: +stage.width.toFixed(1), extent: { l: Math.min(...data.map(d => d.box.l)), r: Math.max(...data.map(d => d.box.r)) }, wrapL: +wrap.left.toFixed(1), wrapR: +wrap.right.toFixed(1), listRight: +list.right.toFixed(1), visualLeft: +visual.left.toFixed(1), gapBetweenCols: +(visual.left - list.right).toFixed(1) };
    });
    const extentPx = (report.extent.r - report.extent.l).toFixed(1);
    console.log(`\n== ${width}px == bookGroup=${extentPx}px  stageW=${report.stageW}  colGap=${report.gapBetweenCols}px`);
    console.log("  text coverage conflicts:", report.coverings.length ? report.coverings.join("; ") : "NONE");
    await page.close();
  }
  await browser.close();
  server.close();
})();
