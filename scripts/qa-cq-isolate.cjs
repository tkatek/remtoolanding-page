/* Isolate: does ANY #programs element exceed the viewport at the failing widths? */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const relative = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
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
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const width of [1366, 1280, 1180]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const res = await page.evaluate(() => {
      const out = { sectionOffenders: [], pageOffenders: [] };
      const vw = document.documentElement.clientWidth;
      document.querySelectorAll("#programs, #programs *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) out.sectionOffenders.push(`${el.tagName}.${String(el.className).split(" ")[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
      });
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) {
          const cs = getComputedStyle(el);
          if (cs.position === "fixed") return;
          let p = el.parentElement, clipped = false;
          while (p) { const pcs = getComputedStyle(p); if (pcs.overflowX === "hidden" || pcs.overflow === "hidden" || pcs.overflowX === "clip" || pcs.overflow === "clip") { clipped = true; break; } p = p.parentElement; }
          if (!clipped && !el.closest("#programs")) out.pageOffenders.push(`${el.tagName}.${String(el.className).split(" ")[0]} right=${Math.round(r.right)}`);
        }
      });
      return { scrollW: document.documentElement.scrollWidth, vw, ...out };
    });
    console.log(`[${width}] scrollW=${res.scrollW}/${res.vw} | #programs offenders: ${res.sectionOffenders.length ? res.sectionOffenders.join(", ") : "NONE"} | non-section offenders: ${res.pageOffenders.slice(0, 4).join(", ") || "none"}`);
    await page.close();
  }
  await browser.close(); server.close();
})();
