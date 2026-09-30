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
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  for (const block of [false, true]) {
    const context = await browser.newContext({ reducedMotion: "reduce", colorScheme: "dark" });
    await (block ? context.route("**/quality-section.css", (r) => r.abort()) : Promise.resolve());
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const res = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const nav = [...document.querySelectorAll(".global-nav-link")].map((a) => Math.round(a.getBoundingClientRect().right));
      return { scrollW: document.documentElement.scrollWidth, vw, maxNavRight: Math.max(...nav) };
    });
    console.log(`${block ? "WITHOUT" : "WITH "} my css: scrollW=${res.scrollW}/${res.vw}, maxNavRight=${res.maxNavRight}`);
    await context.close();
  }
  await browser.close(); server.close();
})();
