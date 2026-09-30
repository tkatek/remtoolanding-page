/* Visual QA for the "Same Quality in Every Classroom" (#programs) section. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".qa-screenshots", "cq");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const relative = rawPath === "/" ? "schools.html" : rawPath.replace(/^\/+/, "");
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      fs.readFile(file, (error, body) => {
        if (error) {
          res.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
          return;
        }
        res.writeHead(200, { "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(body);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const shots = (process.env.CQ_SHOTS || "light").split(",");

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  fs.mkdirSync(outDir, { recursive: true });

  const viewports = [
    [1920, 1080],
    [1600, 900],
    [1440, 900],
    [1366, 768],
    [1280, 800],
    [1180, 820],
    [1100, 800],
    [1080, 820],
    [1024, 1366],
    [1000, 700],
    [900, 700],
    [834, 1112],
    [820, 1180],
    [768, 1024],
    [740, 900],
    [700, 900],
    [560, 800],
    [480, 800],
    [430, 932],
    [390, 844],
    [375, 812],
    [360, 800],
    [320, 700],
  ];

  for (const mode of shots) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      colorScheme: mode === "dark" ? "dark" : "light",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const problems = [];

    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => {
        if (!document.fonts?.ready) return;
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
      });
      await page.waitForTimeout(80);

      const checks = await page.evaluate(() => {
        const section = document.querySelector("#programs");
        if (!section) return { missing: true };
        const stage = section.querySelector(".cq-stage");
        const books = [...section.querySelectorAll(".cq-book")];
        const rect = section.getBoundingClientRect();
        const bookRects = books.map((b) => {
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), text: b.querySelector(".cq-book-code")?.textContent };
        });
        const overflowers = [];
        document.querySelectorAll("body *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1)) {
            const cs = getComputedStyle(el);
            if (cs.position === "fixed") return;
            // ignore elements inside clipped containers (decor is fine if section clips)
            let p = el.parentElement, clipped = false;
            while (p) {
              const pcs = getComputedStyle(p);
              if (pcs.overflowX === "hidden" || pcs.overflow === "hidden" || pcs.overflowX === "clip" || pcs.overflow === "clip") { clipped = true; break; }
              p = p.parentElement;
            }
            if (!clipped) overflowers.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
          }
        });
        return {
          missing: false,
          sectionHeight: Math.round(rect.height),
          docScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          booksVisible: books.filter((b) => getComputedStyle(b).opacity !== "0").length,
          stageH: stage ? Math.round(stage.getBoundingClientRect().height) : 0,
          bookRects,
          overflowers: overflowers.slice(0, 6),
        };
      });

      const tag = `${mode}-${width}`;
      if (checks.missing) { problems.push(`${tag}: section missing`); continue; }
      if (checks.hOverflow) problems.push(`${tag}: PAGE horizontal overflow ${checks.docScrollWidth}>${checks.clientWidth} :: ${checks.overflowers.join(" | ")}`);
      if (checks.booksVisible !== 5) problems.push(`${tag}: ${checks.booksVisible}/5 books visible`);

      const section = page.locator("#programs");
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      await section.screenshot({ path: path.join(outDir, `section-${tag}.png`) });
    }
    await context.close();
    console.log(`[${mode}] problems:`, problems.length ? "\n  " + problems.join("\n  ") : "none");
  }

  await browser.close();
  server.close();
  console.log("done ->", outDir);
})();
