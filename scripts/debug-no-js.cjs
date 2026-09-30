const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");

const root = path.resolve(__dirname, "..");
const pages = ["schools.html", "pricing.html", "free-sample.html", "legal.html"];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    for (const pageName of pages) {
      for (const [width, height] of [[390, 844], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        await page.goto(pathToFileURL(path.join(root, pageName)).href, { waitUntil: "domcontentloaded" });
        const state = await page.evaluate(() => {
          const describe = (element) => {
            if (!element) return null;
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((name) => `.${name}`).join("")}`,
              left: Number(box.left.toFixed(1)),
              right: Number(box.right.toFixed(1)),
              width: Number(box.width.toFixed(1)),
              height: Number(box.height.toFixed(1)),
              display: style.display,
              position: style.position,
              overflow: style.overflow,
              transform: style.transform,
            };
          };
          const offenders = [...document.querySelectorAll("body *")]
            .map(describe)
            .filter((item) => item && (item.right > innerWidth + 1 || item.left < -1))
            .sort((a, b) => Math.max(b.right - innerWidth, -b.left) - Math.max(a.right - innerWidth, -a.left))
            .slice(0, 20);
          return {
            innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            header: describe(document.querySelector(".global-header")),
            headerInner: describe(document.querySelector(".global-header__inner")),
            desktopNav: describe(document.querySelector(".global-desktop-nav")),
            mobileNav: describe(document.querySelector(".global-mobile-nav")),
            offenders,
          };
        });
        console.log(`${pageName} ${width}x${height}\n${JSON.stringify(state, null, 2)}`);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
