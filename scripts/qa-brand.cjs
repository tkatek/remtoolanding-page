/* Brand component QA: geometry + theming across viewports and color schemes.
   Serves the site on 127.0.0.1:8137 (via .serve.mjs) and checks:
   - icon renders, is not stretched, no CSS filters, no white box behind it
   - wordmark is real text, never wraps, follows prefers-color-scheme
   - header height stable, no horizontal overflow
   - drawer brand sits top-left, close button stays aligned
   - footer brand on navy has near-white wordmark */
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const shots = path.join(root, ".qa-screenshots", "brand");
fs.mkdirSync(shots, { recursive: true });

const viewports = [320, 375, 390, 430, 768, 1440, 1920];
const pagesToCheck = ["", "pricing.html", "free-sample.html"];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(root, ".serve.mjs")], { stdio: "ignore" });
  await wait(600);

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  const failures = [];
  const fail = (msg) => failures.push(msg);

  const collect = async (page, label) => page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1) };
    };
    const headerBrand = document.querySelector(".global-header .global-brand");
    const icon = document.querySelector(".global-header .global-brand__icon");
    const wordmark = document.querySelector(".global-header .global-brand__wordmark");
    const header = document.querySelector(".global-header");
    const toggle = document.querySelector(".global-menu-toggle");
    const footerBrand = document.querySelector(".global-footer__brand .global-brand");
    const footerIcon = document.querySelector(".global-footer__brand .global-brand__icon");
    const footerWordmark = document.querySelector(".global-footer__brand .global-brand__wordmark");
    const cs = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop) : null;
    return {
      header: rect(header),
      headerBrand: rect(headerBrand),
      icon: rect(icon),
      wordmark: rect(wordmark),
      toggle: rect(toggle),
      iconFilter: cs(icon, "filter"),
      iconObjectFit: cs(icon, "object-fit"),
      brandBackground: cs(headerBrand, "background-color"),
      wordmarkColor: cs(wordmark, "color"),
      wordmarkText: wordmark ? wordmark.textContent : null,
      wordmarkRects: wordmark ? wordmark.getClientRects().length : 0,
      wordmarkFont: cs(wordmark, "font-weight") + " " + cs(wordmark, "font-size"),
      iconNatural: icon ? [icon.naturalWidth, icon.naturalHeight, icon.complete] : null,
      footerBrand: rect(footerBrand),
      footerIcon: rect(footerIcon),
      footerWordmark: rect(footerWordmark),
      footerWordmarkColor: cs(footerWordmark, "color"),
      footerBrandBackground: cs(footerBrand, "background-color"),
      footerWordmarkText: footerWordmark ? footerWordmark.textContent : null,
      docWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyFontLoaded: document.fonts.check("800 22px \"Plus Jakarta Sans\""),
    };
  }).then((data) => ({ ...data, label }));

  for (const vp of viewports) {
    for (const scheme of ["light", "dark"]) {
      for (const route of pagesToCheck) {
        const page = await browser.newPage({ viewport: { width: vp, height: 900 } });
        await page.emulateMedia({ colorScheme: scheme });
        const url = `http://127.0.0.1:8137/${route}`;
        await page.goto(url, { waitUntil: "networkidle" });
        try { await page.evaluate(() => document.fonts.ready); } catch {}
        const tag = `${vp}-${scheme}-${route || "home"}`;
        const s = await collect(page, tag);

        // Icon renders and keeps proportions.
        if (!s.iconNatural || s.iconNatural[0] !== 209 || s.iconNatural[1] !== 230) {
          fail(`${tag}: icon asset wrong: ${JSON.stringify(s.iconNatural)}`);
        }
        if (s.iconFilter && s.iconFilter !== "none") fail(`${tag}: icon has filter ${s.iconFilter}`);
        if (s.iconObjectFit !== "contain") fail(`${tag}: icon object-fit ${s.iconObjectFit}`);
        if (s.icon.w / s.icon.h < 0.9 || s.icon.w / s.icon.h > 1.11) fail(`${tag}: icon aspect off: ${s.icon.w}x${s.icon.h}`);

        // Wordmark is real text and single-line.
        if (s.wordmarkText !== "REMTOO") fail(`${tag}: wordmark text "${s.wordmarkText}"`);
        if (s.wordmarkRects !== 1) fail(`${tag}: wordmark wrapped (${s.wordmarkRects} rects)`);
        if (!/800/.test(s.wordmarkFont)) fail(`${tag}: wordmark weight ${s.wordmarkFont}`);

        // Theme adaptation.
        const rgb = (str) => (str || "").match(/\d+/g)?.map(Number) || [0, 0, 0];
        const [wr, wg, wb] = rgb(s.wordmarkColor);
        const wordLum = (0.2126 * wr + 0.7152 * wg + 0.0722 * wb) / 255;
        if (scheme === "dark" && wordLum < 0.75) fail(`${tag}: header wordmark not near-white: ${s.wordmarkColor}`);
        if (scheme === "light" && wordLum > 0.35) fail(`${tag}: header wordmark not dark navy: ${s.wordmarkColor}`);
        const [fr, fg, fb] = rgb(s.footerWordmarkColor);
        const footLum = (0.2126 * fr + 0.7152 * fg + 0.0722 * fb) / 255;
        if (footLum < 0.75) fail(`${tag}: footer wordmark not near-white: ${s.footerWordmarkColor}`);

        // No white box behind the brand (alpha must be 0 in header).
        if (s.brandBackground && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(s.brandBackground)) {
          fail(`${tag}: header brand has background ${s.brandBackground}`);
        }
        if (s.footerBrandBackground && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(s.footerBrandBackground)) {
          fail(`${tag}: footer brand has background ${s.footerBrandBackground}`);
        }

        // Layout: no overflow, header height stable, brand clear of toggle.
        if (s.docWidth > s.innerWidth + 1) fail(`${tag}: horizontal overflow ${s.docWidth}>${s.innerWidth}`);
        const expectedHeader = vp < 1121 ? 72 : 76;
        if (Math.abs(s.header.h - expectedHeader) > 1.5) fail(`${tag}: header height ${s.header.h} (expected ~${expectedHeader})`);
        if (s.headerBrand.right > s.toggle.x - 4 && vp < 1121) {
          fail(`${tag}: brand overlaps toggle (${s.headerBrand.right} vs ${s.toggle.x})`);
        }

        // Footer brand geometry.
        if (s.footerIcon && (s.footerIcon.h < 30 || s.footerIcon.h > 44)) {
          fail(`${tag}: footer icon size ${s.footerIcon.h}`);
        }
        if (s.footerWordmarkText !== "REMTOO") fail(`${tag}: footer wordmark "${s.footerWordmarkText}"`);

        // Mobile drawer checks.
        if (vp < 1121) {
          await page.click("[data-mobile-nav-toggle]");
          await page.waitForSelector(".global-mobile-nav.is-open", { timeout: 3000 });
          await wait(450);
          const drawer = await page.evaluate(() => {
            const brand = document.querySelector(".global-mobile-nav__head .global-brand");
            const icon = document.querySelector(".global-mobile-nav__head .global-brand__icon");
            const wordmark = document.querySelector(".global-mobile-nav__head .global-brand__wordmark");
            const close = document.querySelector(".global-mobile-nav__close");
            const head = document.querySelector(".global-mobile-nav__head");
            const panel = document.querySelector(".global-mobile-nav__panel");
            const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), cy: +((r.top + r.bottom) / 2).toFixed(1) }; };
            return {
              brand: rect(brand), icon: rect(icon), wordmark: rect(wordmark), close: rect(close),
              head: rect(head), panel: rect(panel),
              wordmarkColor: getComputedStyle(wordmark).color,
              brandBackground: getComputedStyle(brand).backgroundColor,
              brandIsFirst: head.firstElementChild === brand,
              wordmarkText: wordmark.textContent,
            };
          });
          if (!drawer.brandIsFirst) fail(`${tag}: drawer brand not first element in head`);
          if (drawer.wordmarkText !== "REMTOO") fail(`${tag}: drawer wordmark "${drawer.wordmarkText}"`);
          if (drawer.icon.h < 30 || drawer.icon.h > 42) fail(`${tag}: drawer icon size ${drawer.icon.h}`);
          if (Math.abs(drawer.brand.cy - drawer.close.cy) > 3) fail(`${tag}: drawer brand/close misaligned (${drawer.brand.cy} vs ${drawer.close.cy})`);
          if (drawer.close.right > drawer.panel.right - 10) fail(`${tag}: close button touches panel edge`);
          if (drawer.brand.x < 8) fail(`${tag}: drawer brand too close to edge (${drawer.brand.x})`);
          const darkDrawer = scheme === "dark";
          const [dr, dg, db] = rgb(drawer.wordmarkColor);
          const dl = (0.2126 * dr + 0.7152 * dg + 0.0722 * db) / 255;
          if (darkDrawer && dl < 0.75) fail(`${tag}: drawer wordmark not near-white: ${drawer.wordmarkColor}`);
          if (!darkDrawer && dl > 0.35) fail(`${tag}: drawer wordmark too light for light theme: ${drawer.wordmarkColor}`);
          if (!/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(drawer.brandBackground)) {
            fail(`${tag}: drawer brand background ${drawer.brandBackground}`);
          }
          if (vp === 375) {
            await page.screenshot({ path: path.join(shots, `drawer-${vp}-${scheme}.png`) });
          }
          await page.keyboard.press("Escape");
          await wait(350);
        }

        // Key screenshots.
        if (route === "" && (vp === 320 || vp === 375 || vp === 1440)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          const header = await page.locator(".global-header").screenshot({ path: path.join(shots, `header-${vp}-${scheme}.png`) }).catch(() => null);
          await page.locator(".global-footer__brand").scrollIntoViewIfNeeded().catch(() => {});
          await page.locator(".global-footer__brand").screenshot({ path: path.join(shots, `footer-brand-${vp}-${scheme}.png`) }).catch(() => null);
        }
        await page.close();
      }
    }
  }

  await browser.close();
  server.kill();

  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log("  ✗ " + f));
    process.exit(1);
  } else {
    console.log("All brand QA checks passed.");
  }
})().catch((e) => { console.error(e); process.exit(1); });
