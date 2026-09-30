/* Motion QA: entrance stagger with animation enabled + reduced-motion behaviour. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
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

  // Case 1: motion allowed — stagger must run, then settle to opacity 1 / rest transform.
  const ctx1 = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1600, height: 900 } });
  const p1 = await ctx1.newPage();
  await p1.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
  await p1.locator("#programs").scrollIntoViewIfNeeded();
  const midSample = await p1.evaluate(() => {
    const stage = document.querySelector(".cq-stage");
    const first = document.querySelector(".cq-book--a1");
    return { inview: stage.classList.contains("is-inview"), a1opacity: getComputedStyle(first).opacity };
  });
  await p1.waitForTimeout(1700);
  const finalState = await p1.evaluate(() => {
    const stage = document.querySelector(".cq-stage");
    const books = [...document.querySelectorAll(".cq-book")];
    return {
      settled: stage.classList.contains("is-settled"),
      allVisible: books.every((b) => getComputedStyle(b).opacity === "1"),
      transforms: books.map((b) => getComputedStyle(b).transform),
      revealVisible: [...document.querySelectorAll("#programs .reveal")].every((el) => el.classList.contains("is-visible")),
    };
  });
  console.log("[motion] during-entrance sample:", JSON.stringify(midSample));
  console.log("[motion] final settled:", finalState.settled, "| all opacity 1:", finalState.allVisible, "| reveals visible:", finalState.revealVisible);
  const identity = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
  const restTransformsOk = finalState.transforms.every((t) => {
    // rest transforms contain translateX/rotate — must NOT be identity-only mismatch; just confirm parseable + no NaN
    return t !== "" && !t.includes("nan");
  });
  console.log("[motion] transforms sane:", restTransformsOk, "| sample:", finalState.transforms[2]);
  await ctx1.close();

  // Case 2: reduced motion — everything visible immediately, no pending transitions.
  const ctx2 = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1600, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`http://127.0.0.1:${port}/schools.html`, { waitUntil: "domcontentloaded" });
  await p2.locator("#programs").scrollIntoViewIfNeeded();
  await p2.waitForTimeout(120);
  const reduced = await p2.evaluate(() => {
    const books = [...document.querySelectorAll(".cq-book")];
    return {
      allVisible: books.every((b) => Number(getComputedStyle(b).opacity) > 0.99),
      noTransition: books.every((b) => getComputedStyle(b).transitionDuration === "0s"),
    };
  });
  console.log("[reduced] all visible immediately:", reduced.allVisible, "| transitions disabled:", reduced.noTransition);
  await ctx2.close();

  await browser.close();
  server.close();
})();
