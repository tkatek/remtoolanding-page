const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");

const root = path.resolve(__dirname, "..");

async function snapshot(page, label) {
  const state = await page.evaluate(() => {
    const describe = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        name: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((item) => `.${item}`).join("")}`,
        left: Number(box.left.toFixed(2)),
        right: Number(box.right.toFixed(2)),
        rectWidth: Number(box.width.toFixed(2)),
        cssWidth: style.width,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        transform: style.transform,
        transition: style.transition,
        animation: style.animation,
        overflow: style.overflow,
      };
    };

    const offenders = [...document.querySelectorAll("body *")]
      .map(describe)
      .filter((item) => item && (item.right > innerWidth + 1 || item.left < -1))
      .sort((a, b) => Math.max(b.right - innerWidth, -b.left) - Math.max(a.right - innerWidth, -a.left));

    return {
      innerWidth,
      outerWidth,
      visualViewportWidth: visualViewport?.width,
      clientWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      desktopQuery: matchMedia("(min-width: 1121px)").matches,
      atmosphere: describe(document.querySelector(".hero-atmosphere--lavender")),
      decor: describe(document.querySelector(".hero-decor")),
      hero: describe(document.querySelector(".hero")),
      offenders: offenders.slice(0, 30),
    };
  });
  console.log(label, JSON.stringify(state, null, 2));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    const viewports = [
      [320, 760], [360, 800], [375, 812], [390, 844], [412, 915],
      [430, 932], [768, 1024], [820, 1180], [1024, 1366], [1180, 820],
      [1280, 800], [1366, 768], [1440, 900], [1600, 900], [1920, 1080],
    ];
    const url = pathToFileURL(path.join(root, "index.html")).href;
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(60);
    }
    await snapshot(page, "desktop");
    await page.setViewportSize({ width: 320, height: 900 });
    await snapshot(page, "mobile-immediate");
    await page.waitForTimeout(100);
    await snapshot(page, "mobile-after-100ms");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
