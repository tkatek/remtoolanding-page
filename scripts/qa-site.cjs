const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");

const root = path.resolve(__dirname, "..");
const allPages = [
  "index.html",
  "curriculum.html",
  "whats-included.html",
  "schools.html",
  "teachers.html",
  "pricing.html",
  "free-sample.html",
  "legal.html",
];
const requestedPages = (process.env.QA_PAGES || "")
  .split(",")
  .map((page) => page.trim())
  .filter(Boolean);
const pages = requestedPages.length
  ? allPages.filter((page) => requestedPages.includes(page))
  : allPages;

const fullViewports = [
  [320, 760],
  [360, 800],
  [375, 812],
  [390, 844],
  [412, 915],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [1024, 1366],
  [1180, 820],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
];
const viewports = process.env.QA_RESIZE_ONLY === "1"
  ? [[1920, 1080]]
  : fullViewports;
const resizeWidths = Array.from({ length: 101 }, (_, index) => 320 + (index * 16));

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const relative = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
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

function expectedHeaderHeight(width) {
  return width <= 1120 ? 72 : 76;
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const failures = [];
  const warnings = [];
  const summaries = [];
  const shellReferenceByViewport = new Map();

  try {
    for (const pageName of pages) {
      const page = await context.newPage();
      const runtimeErrors = [];
      const badResponses = [];
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => runtimeErrors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "unknown"})`));
      page.on("response", (response) => {
        if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
      });

      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        await page.goto(`http://127.0.0.1:${port}/${pageName}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
          if (!document.fonts?.ready) return;
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 1500)),
          ]);
        });
        await page.waitForTimeout(60);

        const state = await page.evaluate(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              width: Number(box.width.toFixed(2)),
              height: Number(box.height.toFixed(2)),
              display: style.display,
              visibility: style.visibility,
            };
          };
          const visible = (element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
          };
          return {
            docWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: innerWidth,
            header: rect(".global-header"),
            headerInner: rect(".global-header__inner"),
            brandMark: rect(".global-header .global-brand__image"),
            desktopCta: rect(".global-header > .global-header__inner > .global-header-cta"),
            menuToggle: rect(".global-menu-toggle"),
            footerInner: rect(".global-footer__inner"),
            h1Count: document.querySelectorAll("h1").length,
            headerCount: document.querySelectorAll(".global-header").length,
            footerCount: document.querySelectorAll(".global-footer").length,
            prefooterCount: document.querySelectorAll(".global-footer-cta").length,
            showcaseCount: document.querySelectorAll(".cta-showcase").length,
            activeCount: document.querySelectorAll('.global-nav-link[aria-current="page"]').length,
            duplicateIds: [...document.querySelectorAll("[id]")]
              .map((element) => element.id)
              .filter((id, index, ids) => ids.indexOf(id) !== index),
            imageDimensionMisses: [...document.images]
              .filter((image) => !image.hasAttribute("width") || !image.hasAttribute("height"))
              .map((image) => image.currentSrc || image.src),
            visibleTinyCopy: [...document.querySelectorAll("p, li")]
              .filter(visible)
              .filter((element) => element.textContent.trim().length > 24)
              .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 14)
              .slice(0, 8)
              .map((element) => ({
                className: element.className,
                size: getComputedStyle(element).fontSize,
                text: element.textContent.trim().slice(0, 70),
              })),
          };
        });

        const key = `${pageName} @ ${width}x${height}`;
        if (state.docWidth > width + 1 || state.bodyWidth > width + 1) {
          failures.push(`${key}: horizontal overflow (document ${state.docWidth}, body ${state.bodyWidth})`);
        }
        if (!state.header || Math.abs(state.header.height - expectedHeaderHeight(width)) > 1) {
          failures.push(`${key}: header height ${state.header?.height ?? "missing"}, expected ${expectedHeaderHeight(width)}`);
        }
        const isSchoolsPage = pageName === "schools.html";
        const expectedShowcase = isSchoolsPage ? 1 : 0;
        const expectedPrefooter = isSchoolsPage ? 0 : 1;
        if (state.headerCount !== 1 || state.footerCount !== 1 || state.prefooterCount !== expectedPrefooter || state.showcaseCount !== expectedShowcase) {
          failures.push(`${key}: shell counts header=${state.headerCount}, prefooter=${state.prefooterCount}, footer=${state.footerCount}, showcase=${state.showcaseCount}`);
        }
        if (state.h1Count !== 1) failures.push(`${key}: H1 count ${state.h1Count}`);
        if (state.duplicateIds.length) failures.push(`${key}: duplicate IDs ${[...new Set(state.duplicateIds)].join(", ")}`);
        if (state.imageDimensionMisses.length) failures.push(`${key}: images missing dimensions (${state.imageDimensionMisses.length})`);
        if (width <= 1120 && state.menuToggle?.display === "none") failures.push(`${key}: mobile toggle hidden`);
        if (width > 1120 && state.desktopCta?.display === "none") failures.push(`${key}: desktop CTA hidden`);
        const shellMetric = {
          headerHeight: state.header?.height ?? 0,
          headerInnerHeight: state.headerInner?.height ?? 0,
          logoWidth: state.brandMark?.width ?? 0,
          logoHeight: state.brandMark?.height ?? 0,
          desktopCtaWidth: state.desktopCta?.width ?? 0,
          desktopCtaHeight: state.desktopCta?.height ?? 0,
          menuWidth: state.menuToggle?.width ?? 0,
          menuHeight: state.menuToggle?.height ?? 0,
        };
        const metricKey = `${width}x${height}`;
        const referenceMetric = shellReferenceByViewport.get(metricKey);
        if (!referenceMetric) {
          shellReferenceByViewport.set(metricKey, { pageName, ...shellMetric });
        } else {
          for (const [metric, value] of Object.entries(shellMetric)) {
            if (Math.abs(value - referenceMetric[metric]) > 0.5) {
              failures.push(`${key}: shared shell ${metric} ${value} differs from ${referenceMetric.pageName} (${referenceMetric[metric]})`);
            }
          }
        }
        if (state.visibleTinyCopy.length) warnings.push(`${key}: visible copy below 14px ${JSON.stringify(state.visibleTinyCopy)}`);
      }

      for (const width of resizeWidths) {
        await page.setViewportSize({ width, height: 900 });
        const resizeState = await page.evaluate(() => {
          const documentWidth = document.documentElement.scrollWidth;
          const bodyWidth = document.body.scrollWidth;
          const offenders = documentWidth > innerWidth + 1 || bodyWidth > innerWidth + 1
            ? [...document.querySelectorAll("body *")]
              .map((element) => {
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return {
                  element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((name) => `.${name}`).join("")}`,
                  left: Number(box.left.toFixed(1)),
                  right: Number(box.right.toFixed(1)),
                  width: Number(box.width.toFixed(1)),
                  cssWidth: style.width,
                  transform: style.transform,
                  overflow: style.overflow,
                };
              })
              .filter((item) => item.right > innerWidth + 1 || item.left < -1)
              .sort((a, b) => Math.max(b.right - innerWidth, -b.left) - Math.max(a.right - innerWidth, -a.left))
              .slice(0, 8)
            : [];
          return {
            documentWidth,
            bodyWidth,
            viewportWidth: innerWidth,
            headerHeight: document.querySelector(".global-header")?.getBoundingClientRect().height ?? 0,
            offenders,
          };
        });
        if (resizeState.documentWidth > width + 1 || resizeState.bodyWidth > width + 1) {
          failures.push(`${pageName} continuous resize @ ${width}px: horizontal overflow (document ${resizeState.documentWidth}, body ${resizeState.bodyWidth}); ${JSON.stringify(resizeState.offenders)}`);
        }
        if (Math.abs(resizeState.headerHeight - expectedHeaderHeight(width)) > 1) {
          failures.push(`${pageName} continuous resize @ ${width}px: header height ${resizeState.headerHeight}, expected ${expectedHeaderHeight(width)}`);
        }
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`http://127.0.0.1:${port}/${pageName}`, { waitUntil: "domcontentloaded" });
      await page.locator(".global-menu-toggle").click();
      const navOpen = await page.evaluate(() => ({
        expanded: document.querySelector(".global-menu-toggle")?.getAttribute("aria-expanded"),
        open: document.querySelector(".global-mobile-nav")?.classList.contains("is-open"),
        bodyLocked: document.body.classList.contains("site-shell-nav-open"),
        role: document.querySelector(".global-mobile-nav__panel")?.getAttribute("role"),
        modal: document.querySelector(".global-mobile-nav__panel")?.getAttribute("aria-modal"),
      }));
      if (navOpen.expanded !== "true" || !navOpen.open || !navOpen.bodyLocked || navOpen.role !== "dialog" || navOpen.modal !== "true") {
        failures.push(`${pageName}: mobile menu open state invalid ${JSON.stringify(navOpen)}`);
      }
      await page.keyboard.press("Escape");
      const navClosed = await page.evaluate(() => ({
        expanded: document.querySelector(".global-menu-toggle")?.getAttribute("aria-expanded"),
        open: document.querySelector(".global-mobile-nav")?.classList.contains("is-open"),
        bodyLocked: document.body.classList.contains("site-shell-nav-open"),
        focusReturned: document.activeElement === document.querySelector(".global-menu-toggle"),
      }));
      if (navClosed.expanded !== "false" || navClosed.open || navClosed.bodyLocked || !navClosed.focusReturned) {
        failures.push(`${pageName}: mobile menu close state invalid ${JSON.stringify(navClosed)}`);
      }

      await page.locator(".global-footer").scrollIntoViewIfNeeded();
      const firstAccordion = page.locator(".global-footer__accordion-trigger").first();
      const accordionBefore = await firstAccordion.getAttribute("aria-expanded");
      await firstAccordion.click();
      const accordionState = await firstAccordion.getAttribute("aria-expanded");
      if (accordionState === accordionBefore) failures.push(`${pageName}: footer accordion did not toggle`);

      const disabledLanguages = await page.locator(".global-footer__language option:disabled").count();
      if (disabledLanguages !== 2) failures.push(`${pageName}: expected two disabled coming-soon languages, found ${disabledLanguages}`);

      await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((resolve) => setTimeout(resolve, 120));
      });
      const brokenImages = await page.evaluate(() => [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src));
      if (brokenImages.length) failures.push(`${pageName}: broken images ${brokenImages.join(", ")}`);

      const expectedActive = ["index.html", "legal.html"].includes(pageName) ? 0 : 2;
      const actualActive = await page.locator('.global-nav-link[aria-current="page"]').count();
      if (actualActive !== expectedActive) failures.push(`${pageName}: active nav count ${actualActive}, expected ${expectedActive}`);

      if (runtimeErrors.length) failures.push(`${pageName}: runtime errors ${[...new Set(runtimeErrors)].join(" | ")}`);
      if (badResponses.length) failures.push(`${pageName}: bad responses ${[...new Set(badResponses)].join(" | ")}`);
      summaries.push(`${pageName}: ${viewports.length} fixed layouts + ${resizeWidths.length} resize samples + interactions checked`);
      console.log(summaries[summaries.length - 1]);
      await page.close();
    }

    if (!requestedPages.length) {
      const flowPage = await context.newPage();
      const flowRuntimeErrors = [];
      flowPage.on("console", (message) => {
        if (message.type() === "error") flowRuntimeErrors.push(`console: ${message.text()}`);
      });
      flowPage.on("pageerror", (error) => flowRuntimeErrors.push(`pageerror: ${error.message}`));

      const clickToPath = async (selector, pathname) => {
        await Promise.all([
          flowPage.waitForURL((url) => url.pathname.endsWith(pathname)),
          flowPage.locator(selector).first().click(),
        ]);
      };

      await flowPage.setViewportSize({ width: 1440, height: 900 });
      await flowPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
      await clickToPath('.global-desktop-nav a[data-nav-route="curriculum.html"]', "/curriculum.html");
      await clickToPath('.global-desktop-nav a[data-nav-route="free-sample.html"]', "/free-sample.html");
      await clickToPath('.global-desktop-nav a[data-nav-route="pricing.html"]', "/pricing.html");
      await clickToPath('.global-desktop-nav a[data-nav-route="schools.html"]', "/schools.html");
      await flowPage.locator('.schools-hero a[href="#demo"]').first().click();
      await flowPage.waitForFunction(() => window.location.hash === "#demo");
      if (await flowPage.locator("#demo").count() !== 1) failures.push("User flow: Schools demo target is missing");
      await clickToPath(".global-header .global-brand", "/index.html");
      await flowPage.goBack({ waitUntil: "domcontentloaded" });
      if (!flowPage.url().endsWith("/schools.html#demo")) failures.push(`User flow: browser Back returned to ${flowPage.url()}`);
      await flowPage.goForward({ waitUntil: "domcontentloaded" });
      if (!flowPage.url().endsWith("/index.html")) failures.push(`User flow: browser Forward returned to ${flowPage.url()}`);

      await flowPage.setViewportSize({ width: 390, height: 844 });
      await flowPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
      await flowPage.locator(".global-menu-toggle").click();
      await clickToPath('.global-mobile-nav a[data-nav-route="curriculum.html"]', "/curriculum.html");
      const bodyLockedAfterNavigation = await flowPage.evaluate(() => document.body.classList.contains("site-shell-nav-open"));
      if (bodyLockedAfterNavigation) failures.push("User flow: mobile navigation left body scroll locked after navigation");

      await flowPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
      await flowPage.locator(".global-footer").scrollIntoViewIfNeeded();
      await flowPage.locator('#global-footer-legal-trigger').click();
      await clickToPath('.global-footer__panel a[href="legal.html#privacy"]', "/legal.html");
      if (new URL(flowPage.url()).hash !== "#privacy") failures.push(`User flow: footer privacy link lost its fragment (${flowPage.url()})`);
      if (flowRuntimeErrors.length) failures.push(`User flow: runtime errors ${[...new Set(flowRuntimeErrors)].join(" | ")}`);
      await flowPage.close();
      console.log("Primary desktop/mobile/footer navigation and browser history flow checked");

      const noJsContext = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
      try {
        const noJsPage = await noJsContext.newPage();
        for (const pageName of pages) {
          for (const [width, height] of [[390, 844], [1440, 900]]) {
            await noJsPage.setViewportSize({ width, height });
            await noJsPage.goto(`http://127.0.0.1:${port}/${pageName}`, { waitUntil: "domcontentloaded" });
            // With JavaScript disabled, DOMContentLoaded can precede linked stylesheet
            // application. Wait on a shared CSS sentinel rather than the full load event,
            // which can be held up by non-critical remote font or image requests.
            await noJsPage.waitForFunction(() => getComputedStyle(document.querySelector(".global-header")).boxSizing === "border-box");
            await noJsPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const state = await noJsPage.evaluate(() => {
              const style = (selector) => {
                const element = document.querySelector(selector);
                return element ? getComputedStyle(element) : null;
              };
              const visibleRevealMisses = [...document.querySelectorAll("main .reveal")]
                .filter((element) => {
                  const computed = getComputedStyle(element);
                  return computed.display !== "none" && (computed.visibility === "hidden" || Number(computed.opacity) < 0.1);
                })
                .length;
              return {
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
                mainHeight: document.querySelector("main")?.getBoundingClientRect().height ?? 0,
                mainTextLength: document.querySelector("main")?.textContent.trim().length ?? 0,
                hiddenRevealCount: visibleRevealMisses,
                headerPosition: style(".global-header")?.position,
                headerHeight: document.querySelector(".global-header")?.getBoundingClientRect().height ?? 0,
                mobileNavDisplay: style(".global-mobile-nav")?.display,
                desktopNavDisplay: style(".global-desktop-nav")?.display,
                enabledAccordionCount: [...document.querySelectorAll(".global-footer__accordion-trigger")]
                  .filter((button) => !button.disabled).length,
                visibleFooterPanelCount: [...document.querySelectorAll(".global-footer__panel")]
                  .filter((panel) => {
                    const computed = getComputedStyle(panel);
                    const box = panel.getBoundingClientRect();
                    return computed.display !== "none" && computed.visibility !== "hidden" && box.height > 0;
                  }).length,
              };
            });
            const key = `${pageName} no-JS @ ${width}x${height}`;
            if (state.documentWidth > width + 1 || state.bodyWidth > width + 1) {
              failures.push(`${key}: horizontal overflow (document ${state.documentWidth}, body ${state.bodyWidth})`);
            }
            if (state.mainHeight <= 0 || state.mainTextLength < 100 || state.hiddenRevealCount) {
              failures.push(`${key}: main content fallback invalid ${JSON.stringify(state)}`);
            }
            if (width <= 1120) {
              if (state.headerPosition === "sticky" || state.headerPosition === "fixed") failures.push(`${key}: expanded fallback header overlays content`);
              if (state.mobileNavDisplay === "none") failures.push(`${key}: fallback mobile navigation hidden`);
              if (state.enabledAccordionCount || state.visibleFooterPanelCount !== 4) failures.push(`${key}: fallback footer accordion state invalid`);
            } else {
              if (Math.abs(state.headerHeight - 76) > 1 || state.desktopNavDisplay === "none") failures.push(`${key}: desktop header fallback invalid ${JSON.stringify(state)}`);
            }
          }
        }
        await noJsPage.close();
      } finally {
        await noJsContext.close();
      }
      console.log("No-JavaScript fallback checked at mobile and desktop on all routes");
    }
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const fixedLayouts = pages.length * viewports.length;
  const resizeSamples = pages.length * resizeWidths.length;
  console.log(`\nQA_SUMMARY pages=${pages.length} fixedLayouts=${fixedLayouts} resizeSamples=${resizeSamples} layoutChecks=${fixedLayouts + resizeSamples} failures=${failures.length} warnings=${warnings.length}`);
  if (warnings.length) console.log(`QA_WARNINGS\n${warnings.join("\n")}`);
  if (failures.length) {
    console.error(`QA_FAILURES\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
