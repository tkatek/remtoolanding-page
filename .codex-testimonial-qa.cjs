const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = process.cwd();
const port = 4193;
const cases = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png"
};

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent((request.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root))) return response.writeHead(403).end("Forbidden");
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end("Not found");
    response.writeHead(200, { "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(data);
  });
});

const readState = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll(".testimonial-card")];
  const active = document.querySelector(".testimonial-card.is-active");
  const previous = document.querySelector(".testimonial-card.is-previous");
  const next = document.querySelector(".testimonial-card.is-next");
  const track = document.querySelector("#testimonial-track");
  const arrows = [...document.querySelectorAll(".carousel-arrow")];
  const activeRect = active.getBoundingClientRect();
  const visibleWidth = (node) => {
    const rect = node.getBoundingClientRect();
    return Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
  };
  return {
    activeIndex: cards.indexOf(active),
    currentCards: cards.filter(card => card.getAttribute("aria-current") === "true").length,
    activeCount: cards.filter(card => card.classList.contains("is-active")).length,
    previousCount: cards.filter(card => card.classList.contains("is-previous")).length,
    nextCount: cards.filter(card => card.classList.contains("is-next")).length,
    activeOpacity: getComputedStyle(active).opacity,
    activeFilter: getComputedStyle(active).filter,
    previousOpacity: Number.parseFloat(getComputedStyle(previous).opacity),
    nextOpacity: Number.parseFloat(getComputedStyle(next).opacity),
    previousFilter: getComputedStyle(previous).filter,
    nextFilter: getComputedStyle(next).filter,
    activeCenterDelta: Math.abs((activeRect.left + activeRect.width / 2) - innerWidth / 2),
    activeWidth: activeRect.width,
    previousVisibleWidth: visibleWidth(previous),
    nextVisibleWidth: visibleWidth(next),
    trackHeight: track.getBoundingClientRect().height,
    tallestCard: Math.max(...cards.map(card => card.offsetHeight)),
    documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    arrowSizes: arrows.map(arrow => {
      const rect = arrow.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
    currentDot: [...document.querySelectorAll(".carousel-dots button")].findIndex(dot => dot.getAttribute("aria-current") === "true"),
    status: document.querySelector("#testimonial-status")?.textContent || ""
  };
});

(async () => {
  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const failures = [];
  const results = [];

  try {
    for (const colorScheme of ["light", "dark"]) {
      for (const viewport of cases) {
        const page = await browser.newPage({ viewport, colorScheme, reducedMotion: "no-preference", hasTouch: viewport.width <= 768 });
        const errors = [];
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          document.querySelectorAll(".reveal").forEach(node => node.classList.add("is-visible"));
          document.querySelector(".testimonials-section")?.scrollIntoView({ block: "center" });
        });
        await page.waitForTimeout(700);

        const initial = await readState(page);
        const label = `${colorScheme} ${viewport.width}x${viewport.height}`;
        if (initial.activeCount !== 1 || initial.previousCount !== 1 || initial.nextCount !== 1) failures.push(`${label}: invalid card state counts`);
        if (initial.currentCards !== 1 || initial.currentDot !== initial.activeIndex) failures.push(`${label}: aria-current state mismatch`);
        if (initial.activeOpacity !== "1" || initial.activeFilter !== "none") failures.push(`${label}: active card is not fully sharp`);
        if (initial.previousOpacity >= 0.56 || initial.nextOpacity >= 0.56) failures.push(`${label}: neighboring cards are too prominent`);
        if (!initial.previousFilter.includes("blur") || !initial.nextFilter.includes("blur")) failures.push(`${label}: neighboring cards are not blurred`);
        if (initial.activeCenterDelta > 1.5) failures.push(`${label}: active card is not centered (${initial.activeCenterDelta}px)`);
        if (initial.trackHeight + 1 < initial.tallestCard) failures.push(`${label}: track clips card height`);
        if (initial.documentOverflow > 1) failures.push(`${label}: document overflow ${initial.documentOverflow}px`);
        if (initial.arrowSizes.some(size => size.width < 44 || size.height < 44)) failures.push(`${label}: arrow target below 44px`);
        if (viewport.width <= 430 && initial.activeWidth > viewport.width - 38) failures.push(`${label}: mobile card is wider than the requested gutter`);
        if (viewport.width <= 768 && (initial.previousVisibleWidth > 70 || initial.nextVisibleWidth > 70)) failures.push(`${label}: mobile neighbor peek is too wide`);

        if (colorScheme === "light") {
          await page.click(".carousel-next");
          await page.waitForTimeout(500);
          let state = await readState(page);
          if (state.activeIndex !== 2 || state.currentDot !== 2 || state.status !== "Testimonial 3 of 3") failures.push(`${label}: next control failed`);

          await page.click(".carousel-prev");
          await page.waitForTimeout(500);
          state = await readState(page);
          if (state.activeIndex !== 1) failures.push(`${label}: previous control failed`);

          await page.click('.carousel-dots button[aria-label="Go to testimonial 1"]');
          await page.waitForTimeout(500);
          state = await readState(page);
          if (state.activeIndex !== 0 || state.currentDot !== 0) failures.push(`${label}: dot control failed`);

          await page.focus("#testimonial-track");
          await page.keyboard.press("End");
          await page.waitForTimeout(500);
          state = await readState(page);
          if (state.activeIndex !== 2) failures.push(`${label}: End key failed`);
          await page.keyboard.press("Home");
          await page.waitForTimeout(500);
          await page.keyboard.press("ArrowLeft");
          await page.waitForTimeout(500);
          state = await readState(page);
          if (state.activeIndex !== 2) failures.push(`${label}: keyboard wrapping failed`);

          await page.evaluate(() => {
            const track = document.querySelector("#testimonial-track");
            track.setPointerCapture = () => {};
            track.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: 290, clientY: 300 }));
            track.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: 110, clientY: 304 }));
          });
          await page.waitForTimeout(500);
          state = await readState(page);
          if (state.activeIndex !== 0) failures.push(`${label}: swipe navigation failed`);
        }

        if (errors.length) failures.push(`${label}: ${errors.join(" | ")}`);
        results.push({ label, initial });
        await page.close();
      }
    }

    const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
    await reducedPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
    await reducedPage.waitForTimeout(300);
    const reduced = await reducedPage.evaluate(() => ({
      cardDuration: getComputedStyle(document.querySelector(".testimonial-card")).transitionDuration,
      dotDuration: getComputedStyle(document.querySelector(".carousel-dots button") || document.body).transitionDuration
    }));
    if (reduced.cardDuration !== "0s") failures.push(`reduced motion: card transition is ${reduced.cardDuration}`);
    await reducedPage.close();

    console.log(JSON.stringify({ results, reduced, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
