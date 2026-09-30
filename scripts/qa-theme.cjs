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

const requestedPages = (process.env.THEME_QA_PAGES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const pages = requestedPages.length
  ? allPages.filter((pageName) => requestedPages.includes(pageName))
  : allPages;

const viewports = [
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 1366],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

const schemes = ["light", "dark"];
const geometryTolerance = 0.75;

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
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rawPath;
      try {
        rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      } catch {
        res.writeHead(400).end("Bad request");
        return;
      }

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
        res.writeHead(200, {
          "cache-control": "no-store",
          "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
        });
        res.end(body);
      });
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

function expectedHeaderHeight(width) {
  return width <= 1120 ? 72 : 76;
}

function finiteDifference(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : Infinity;
}

function compareNavGeometry(light, dark, label, fail) {
  const selectors = new Set([
    ...Object.keys(light || {}),
    ...Object.keys(dark || {}),
  ]);

  for (const selector of selectors) {
    const lightBox = light?.[selector] ?? null;
    const darkBox = dark?.[selector] ?? null;
    if (!lightBox || !darkBox) {
      if (lightBox !== darkBox) {
        fail(`${label}: nav geometry differs for ${selector} (missing in one theme)`);
      }
      continue;
    }

    if (lightBox.display !== darkBox.display || lightBox.visibility !== darkBox.visibility) {
      fail(
        `${label}: nav visibility differs for ${selector} ` +
          `(light ${lightBox.display}/${lightBox.visibility}, dark ${darkBox.display}/${darkBox.visibility})`
      );
    }

    for (const property of ["x", "y", "width", "height"]) {
      if (finiteDifference(lightBox[property], darkBox[property]) > geometryTolerance) {
        fail(
          `${label}: nav ${selector} ${property} shifts between themes ` +
            `(light ${lightBox[property]}, dark ${darkBox[property]})`
        );
      }
    }
  }
}

async function settlePage(page) {
  await page.evaluate(async () => {
    document.querySelectorAll("img[loading='lazy']").forEach((image) => {
      image.loading = "eager";
    });

    const step = Math.max(320, Math.floor(innerHeight * 0.8));
    const pageHeight = document.documentElement.scrollHeight;
    for (let y = 0; y < pageHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    window.scrollTo(0, 0);

    const imagesReady = Promise.all(
      [...document.images].map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          })
      )
    );
    const fontsReady = document.fonts?.ready || Promise.resolve();
    await Promise.race([
      Promise.all([imagesReady, fontsReady]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function collectState(page) {
  return page.evaluate(() => {
    const parseColor = (value) => {
      if (!value || value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
      const match = value.match(
        /^rgba?\(\s*([\d.]+)(?:\s+|\s*,\s*)([\d.]+)(?:\s+|\s*,\s*)([\d.]+)(?:\s*\/\s*|\s*,\s*)?([\d.]*)\s*\)$/i
      );
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === "" ? 1 : Number(match[4]),
      };
    };

    const composite = (top, bottom) => {
      if (!top) return bottom;
      const alpha = top.a + bottom.a * (1 - top.a);
      if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
        a: alpha,
      };
    };

    const effectiveBackground = (element) => {
      const layers = [];
      for (let node = element; node instanceof Element; node = node.parentElement) {
        layers.push(parseColor(getComputedStyle(node).backgroundColor));
      }
      let result = { r: 255, g: 255, b: 255, a: 1 };
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        result = composite(layers[index], result);
      }
      return result;
    };

    const luminance = (color) => {
      if (!color) return null;
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };

    const contrast = (foreground, background) => {
      if (!foreground || !background) return null;
      const renderedForeground = composite(foreground, background);
      const a = luminance(renderedForeground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        box.width > 0 &&
        box.height > 0
      );
    };

    const identify = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        display: style.display,
        visibility: style.visibility,
      };
    };

    const navSelectors = [
      ".global-header",
      ".global-header__inner",
      ".global-header .global-brand",
      ".global-header .global-brand__icon",
      ".global-desktop-nav",
      ".global-header__inner > .global-header-cta",
      ".global-menu-toggle",
    ];

    const controls = [...document.querySelectorAll("input, textarea, select")]
      .filter(visible)
      .map((element) => {
        const style = getComputedStyle(element);
        const background = effectiveBackground(element);
        const foreground = parseColor(style.color);
        const placeholderStyle = element.matches("input, textarea")
          ? getComputedStyle(element, "::placeholder")
          : null;
        const placeholder = placeholderStyle ? parseColor(placeholderStyle.color) : null;
        const border = parseColor(style.borderTopColor);
        return {
          selector: identify(element),
          color: style.color,
          background: style.backgroundColor,
          colorScheme: style.colorScheme,
          textContrast: contrast(foreground, background),
          placeholderContrast: element.hasAttribute("placeholder")
            ? contrast(placeholder, background)
            : null,
          borderContrast: parseFloat(style.borderTopWidth) > 0
            ? contrast(border, background)
            : null,
        };
      });

    const bodyStyle = getComputedStyle(document.body);
    const bodyBackground = effectiveBackground(document.body);
    const colorSchemeMeta = [...document.querySelectorAll('meta[name="color-scheme"]')].map(
      (meta) => meta.content
    );
    const themeColorMeta = [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (meta) => ({
        content: meta.content,
        media: meta.media || "",
        validColor: CSS.supports("color", meta.content),
      })
    );

    const logoState = (selector) => {
      const image = document.querySelector(selector);
      if (!image) return null;
      const rect = image.getBoundingClientRect();
      return {
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: Number(rect.width.toFixed(2)),
        renderedHeight: Number(rect.height.toFixed(2)),
        src: image.currentSrc || image.src,
      };
    };

    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundLuminance: luminance(bodyBackground),
      rootColorScheme: getComputedStyle(document.documentElement).colorScheme,
      darkMatches: matchMedia("(prefers-color-scheme: dark)").matches,
      lightMatches: matchMedia("(prefers-color-scheme: light)").matches,
      colorSchemeMeta,
      themeColorMeta,
      navGeometry: Object.fromEntries(navSelectors.map((selector) => [selector, box(selector)])),
      headerLogo: logoState(".global-header .global-brand__icon"),
      footerLogo: logoState(".global-footer .global-brand__icon"),
      brokenImages: [...document.images]
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src || "[image without src]"),
      controls,
      overflowers: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.position === "fixed") return false;
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        })
        .slice(0, 8)
        .map((element) => ({
          selector: identify(element),
          left: Number(element.getBoundingClientRect().left.toFixed(1)),
          right: Number(element.getBoundingClientRect().right.toFixed(1)),
        })),
    };
  });
}

async function inspectCombination(context, url, pageName, scheme, width, height) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const failedImageRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const detail = `${request.url()} (${request.failure()?.errorText || "unknown"})`;
    failedRequests.push(detail);
    if (request.resourceType() === "image") failedImageRequests.push(detail);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const detail = `${response.status()} ${response.url()}`;
      badResponses.push(detail);
      if (response.request().resourceType() === "image") failedImageRequests.push(detail);
    }
  });

  try {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const mainResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await settlePage(page);
    const state = await collectState(page);
    return {
      pageName,
      scheme,
      width,
      height,
      mainStatus: mainResponse?.status() ?? null,
      state,
      consoleErrors: [...new Set(consoleErrors)],
      pageErrors: [...new Set(pageErrors)],
      failedRequests: [...new Set(failedRequests)],
      badResponses: [...new Set(badResponses)],
      failedImageRequests: [...new Set(failedImageRequests)],
    };
  } finally {
    await page.close();
  }
}

async function inspectLiveSwitch(context, url, pageName) {
  const page = await context.newPage();
  let navigationsAfterLoad = 0;

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await settlePage(page);

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigationsAfterLoad += 1;
    });

    const token = `${pageName}-${Date.now()}-${Math.random()}`;
    const before = await page.evaluate((documentToken) => {
      window.__themeQaDocumentToken = documentToken;
      window.__themeQaChangeEvents = [];
      window.__themeQaMedia = matchMedia("(prefers-color-scheme: dark)");
      window.__themeQaMedia.addEventListener("change", (event) => {
        window.__themeQaChangeEvents.push(event.matches);
      });
      return {
        token: window.__themeQaDocumentToken,
        url: location.href,
        darkMatches: window.__themeQaMedia.matches,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      };
    }, token);

    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    // Large illustration-heavy pages can take more than one frame to finish a
    // full media-query style recalc in headless Chromium. Allow the browser to
    // settle while still proving that no navigation or refresh is involved.
    await page.waitForTimeout(1600);

    const after = await page.evaluate(() => ({
      token: window.__themeQaDocumentToken,
      url: location.href,
      darkMatches: matchMedia("(prefers-color-scheme: dark)").matches,
      lightMatches: matchMedia("(prefers-color-scheme: light)").matches,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      changeEvents: window.__themeQaChangeEvents || [],
    }));

    return { before, after, navigationsAfterLoad };
  } finally {
    await page.close();
  }
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const failures = new Set();
  const summaries = [];
  const fail = (message) => failures.add(message);

  try {
    for (const pageName of pages) {
      const url = `http://127.0.0.1:${port}/${pageName}`;

      for (const [width, height] of viewports) {
        const results = {};

        for (const scheme of schemes) {
          const label = `${pageName} [${scheme}] @ ${width}x${height}`;
          let result;
          try {
            result = await inspectCombination(
              context,
              url,
              pageName,
              scheme,
              width,
              height
            );
          } catch (error) {
            fail(`${label}: inspection failed: ${error.stack || error.message || error}`);
            continue;
          }
          results[scheme] = result;
          const { state } = result;

          if (result.mainStatus !== 200) {
            fail(`${label}: main document returned ${result.mainStatus ?? "no response"}`);
          }
          if (result.badResponses.length) {
            fail(`${label}: HTTP failures: ${result.badResponses.join(" | ")}`);
          }
          if (result.failedRequests.length) {
            fail(`${label}: request failures: ${result.failedRequests.join(" | ")}`);
          }
          if (result.failedImageRequests.length) {
            fail(`${label}: image request failures: ${result.failedImageRequests.join(" | ")}`);
          }
          if (result.consoleErrors.length) {
            fail(`${label}: console errors: ${result.consoleErrors.join(" | ")}`);
          }
          if (result.pageErrors.length) {
            fail(`${label}: page errors: ${result.pageErrors.join(" | ")}`);
          }

          if (
            state.documentWidth > state.viewportWidth + 1 ||
            state.bodyWidth > state.viewportWidth + 1
          ) {
            fail(
              `${label}: horizontal overflow (document ${state.documentWidth}, body ${state.bodyWidth}, ` +
                `viewport ${state.viewportWidth}); candidates ${JSON.stringify(state.overflowers)}`
            );
          }

          const headerHeight = state.navGeometry[".global-header"]?.height;
          const expectedHeight = expectedHeaderHeight(width);
          if (finiteDifference(headerHeight, expectedHeight) > 1) {
            fail(`${label}: header height ${headerHeight ?? "missing"}, expected ${expectedHeight}`);
          }

          const schemeMetaValid = state.colorSchemeMeta.some(
            (content) => /\blight\b/i.test(content) && /\bdark\b/i.test(content)
          );
          const lightThemeMeta = state.themeColorMeta.filter((meta) =>
            /prefers-color-scheme\s*:\s*light/i.test(meta.media)
          );
          const darkThemeMeta = state.themeColorMeta.filter((meta) =>
            /prefers-color-scheme\s*:\s*dark/i.test(meta.media)
          );
          const unscopedThemeMeta = state.themeColorMeta.filter((meta) => !meta.media.trim());
          if (!schemeMetaValid) fail(`${label}: missing valid light/dark color-scheme metadata`);
          if (lightThemeMeta.length !== 1 || darkThemeMeta.length !== 1) {
            fail(
              `${label}: expected one light and one dark media theme-color tag; found ` +
                `${lightThemeMeta.length}/${darkThemeMeta.length}`
            );
          }
          if (unscopedThemeMeta.length) fail(`${label}: unscoped theme-color metadata remains`);
          if (state.themeColorMeta.some((meta) => !meta.validColor)) {
            fail(`${label}: invalid theme-color value ${JSON.stringify(state.themeColorMeta)}`);
          }

          if (scheme === "dark" && (!state.darkMatches || state.lightMatches)) {
            fail(`${label}: prefers-color-scheme media state is not dark`);
          }
          if (scheme === "light" && (!state.lightMatches || state.darkMatches)) {
            fail(`${label}: prefers-color-scheme media state is not light`);
          }
          if (!state.rootColorScheme.toLowerCase().includes(scheme)) {
            fail(`${label}: computed root color-scheme is ${state.rootColorScheme}`);
          }

          for (const [location, logo] of [
            ["header", state.headerLogo],
            ["footer", state.footerLogo],
          ]) {
            if (
              !logo ||
              !logo.complete ||
              logo.naturalWidth <= 0 ||
              logo.naturalHeight <= 0 ||
              logo.renderedWidth <= 0 ||
              logo.renderedHeight <= 0
            ) {
              fail(`${label}: ${location} logo is missing or failed to render: ${JSON.stringify(logo)}`);
            } else if (!/\/assets\/logos\/remtoo-icon\.svg(?:$|\?)/i.test(logo.src)) {
              fail(`${label}: ${location} logo uses unexpected source ${logo.src}`);
            }
          }
          if (state.brokenImages.length) {
            fail(`${label}: broken or incomplete images: ${state.brokenImages.join(" | ")}`);
          }

          for (const control of state.controls) {
            if (control.textContrast === null || control.textContrast < 4.5) {
              fail(
                `${label}: ${control.selector} text contrast ${
                  control.textContrast?.toFixed(2) ?? "unreadable"
                } (${control.color} on ${control.background})`
              );
            }
            if (
              control.placeholderContrast !== null &&
              control.placeholderContrast < 3
            ) {
              fail(
                `${label}: ${control.selector} placeholder contrast ` +
                  `${control.placeholderContrast.toFixed(2)}`
              );
            }
            if (control.borderContrast !== null && control.borderContrast < 1.2) {
              fail(
                `${label}: ${control.selector} border contrast ` +
                  `${control.borderContrast.toFixed(2)}`
              );
            }
            if (!control.colorScheme.toLowerCase().includes(scheme)) {
              fail(
                `${label}: ${control.selector} computed color-scheme is ${control.colorScheme}`
              );
            }
          }
        }

        const pairLabel = `${pageName} theme parity @ ${width}x${height}`;
        if (!results.light || !results.dark) {
          fail(`${pairLabel}: could not compare themes because one inspection failed`);
          continue;
        }

        const lightState = results.light.state;
        const darkState = results.dark.state;
        compareNavGeometry(lightState.navGeometry, darkState.navGeometry, pairLabel, fail);

        if (lightState.bodyBackgroundColor === darkState.bodyBackgroundColor) {
          fail(
            `${pairLabel}: body background does not change (${lightState.bodyBackgroundColor})`
          );
        }
        if (
          lightState.bodyBackgroundLuminance === null ||
          darkState.bodyBackgroundLuminance === null ||
          lightState.bodyBackgroundLuminance - darkState.bodyBackgroundLuminance < 0.15
        ) {
          fail(
            `${pairLabel}: body backgrounds are not meaningfully light/dark ` +
              `(light ${lightState.bodyBackgroundColor}, dark ${darkState.bodyBackgroundColor})`
          );
        }
      }

      let live;
      try {
        live = await inspectLiveSwitch(context, url, pageName);
      } catch (error) {
        fail(`${pageName} live switch: inspection failed: ${error.stack || error.message || error}`);
      }
      if (!live) {
        const summary = `${pageName}: ${viewports.length * schemes.length} themed layouts checked; live switch failed to run`;
        summaries.push(summary);
        console.log(summary);
        continue;
      }
      if (!live.before.darkMatches) {
        fail(`${pageName} live switch: initial dark emulation did not match`);
      }
      if (live.after.darkMatches || !live.after.lightMatches) {
        fail(`${pageName} live switch: light emulation did not take effect`);
      }
      if (!live.after.changeEvents.includes(false)) {
        fail(`${pageName} live switch: matchMedia change event was not observed`);
      }
      if (
        live.navigationsAfterLoad !== 0 ||
        live.after.token !== live.before.token ||
        live.after.url !== live.before.url
      ) {
        fail(`${pageName} live switch: document reloaded or navigated unexpectedly`);
      }
      if (live.after.bodyBackground === live.before.bodyBackground) {
        fail(
          `${pageName} live switch: body background did not update ` +
            `(${live.before.bodyBackground})`
        );
      }

      const summary = `${pageName}: ${viewports.length * schemes.length} themed layouts + live switch checked`;
      summaries.push(summary);
      console.log(summary);
    }
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const totalCombinations = pages.length * schemes.length * viewports.length;
  console.log(
    `\nTHEME_QA_SUMMARY pages=${pages.length} viewports=${viewports.length} ` +
      `schemes=${schemes.length} combinations=${totalCombinations} ` +
      `liveSwitches=${pages.length} failures=${failures.size}`
  );
  if (failures.size) {
    console.error(`THEME_QA_FAILURES\n${[...failures].join("\n")}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
