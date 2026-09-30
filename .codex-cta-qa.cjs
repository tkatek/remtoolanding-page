const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'cta-showcase');
fs.mkdirSync(outDir, { recursive: true });

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif'
};

const server = http.createServer((req, res) => {
  const relative = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'schools.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root))) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const allSizes = [
  [320, 800], [360, 800], [375, 812], [390, 844], [412, 915], [430, 932],
  [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800],
  [1366, 768], [1440, 900], [1600, 1000], [1920, 1080]
];
const sizeByWidth = new Map(allSizes.map(size => [size[0], size]));
const sizes = process.env.QA_WIDTHS
  ? process.env.QA_WIDTHS.split(',').map(Number).map(width => sizeByWidth.get(width)).filter(Boolean)
  : allSizes;

(async () => {
  await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const results = [];
  const failures = [];

  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = [];
      const badResponses = [];
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

      await page.goto('http://127.0.0.1:4181/schools.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.cta-showcase').scrollIntoViewIfNeeded();
      await page.locator('.cta-showcase img').evaluateAll(images => {
        images.forEach(image => { image.loading = 'eager'; });
      });
      await page.waitForFunction(() => [...document.querySelectorAll('.cta-showcase img')].every(image => image.complete && image.naturalWidth > 0));
      await page.waitForTimeout(900);

      const metrics = await page.evaluate(() => {
        const box = selector => {
          const node = document.querySelector(selector);
          const rect = node.getBoundingClientRect();
          return { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1), right: +rect.right.toFixed(1), bottom: +rect.bottom.toFixed(1) };
        };
        const section = document.querySelector('.cta-showcase');
        const cards = [...document.querySelectorAll('.cta-destination')];
        const cardGrid = document.querySelector('.cta-showcase__cards');
        const buttons = [...document.querySelectorAll('.cta-destination__button')];
        return {
          viewport: innerWidth,
          documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          section: box('.cta-showcase'),
          heading: box('.cta-showcase__title'),
          leftSide: box('.cta-showcase__side--left'),
          rightSide: box('.cta-showcase__side--right'),
          rightEducator: (() => {
            const image = document.querySelector('.cta-showcase__educator--right');
            const rect = image.getBoundingClientRect();
            const style = getComputedStyle(image);
            return { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1), opacity: style.opacity, visibility: style.visibility, display: style.display, naturalWidth: image.naturalWidth };
          })(),
          walkthrough: (() => {
            const label = document.querySelector('.cta-showcase__walkthrough-label');
            const rect = label.getBoundingClientRect();
            const style = getComputedStyle(label);
            const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
            const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
            return {
              x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1),
              zIndex: style.zIndex, opacity: style.opacity,
              paintStack: document.elementsFromPoint(x, y).slice(0, 6).map(node => typeof node.className === 'string' ? `${node.tagName.toLowerCase()}.${node.className}` : node.tagName.toLowerCase())
            };
          })(),
          cards: cards.map(card => {
            const rect = card.getBoundingClientRect();
            return { x: +rect.x.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1), right: +rect.right.toFixed(1) };
          }),
          columns: getComputedStyle(cardGrid).gridTemplateColumns.split(' ').length,
          buttonHeights: buttons.map(button => +button.getBoundingClientRect().height.toFixed(1)),
          links: buttons.map(button => button.getAttribute('href')),
          visibleClass: section.classList.contains('is-visible'),
          brokenImages: [...section.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')),
          overflowing: [...document.querySelectorAll('body *')].map(node => {
            const rect = node.getBoundingClientRect();
            return { tag: node.tagName.toLowerCase(), id: node.id, className: typeof node.className === 'string' ? node.className : '', left: +rect.left.toFixed(1), right: +rect.right.toFixed(1), width: +rect.width.toFixed(1) };
          }).filter(item => item.left < -0.5 || item.right > innerWidth + 0.5).slice(0, 25),
          hashOnlyLinks: [...section.querySelectorAll('a[href="#"]')].length,
          compactCtaCount: document.querySelectorAll('.global-footer-cta').length,
          footerTargetCount: document.querySelectorAll('#site-footer').length
        };
      });

      if (metrics.documentOverflow > 0.5) failures.push(`${width}px: document overflow ${metrics.documentOverflow}px`);
      if (metrics.cards.some(card => card.x < -0.5 || card.right > width + 0.5)) failures.push(`${width}px: card outside viewport`);
      if (metrics.buttonHeights.some(value => value < 56)) failures.push(`${width}px: button below 56px`);
      if (metrics.brokenImages.length) failures.push(`${width}px: broken images ${metrics.brokenImages.join(', ')}`);
      if (metrics.links.join('|') !== 'schools.html#demo|free-sample.html') failures.push(`${width}px: incorrect links ${metrics.links.join('|')}`);
      if (!metrics.visibleClass) failures.push(`${width}px: reveal never activated`);
      if (metrics.hashOnlyLinks) failures.push(`${width}px: hash-only link found`);
      if (metrics.compactCtaCount) failures.push(`${width}px: duplicate compact CTA remains`);
      if (metrics.footerTargetCount !== 1) failures.push(`${width}px: footer target count ${metrics.footerTargetCount}`);
      const expectedColumns = width > 1180 ? 2 : 1;
      if (metrics.columns !== expectedColumns) failures.push(`${width}px: expected ${expectedColumns} CTA columns, got ${metrics.columns}`);
      if (errors.length) failures.push(`${width}px console: ${errors.join(' | ')}`);
      if (badResponses.length) failures.push(`${width}px responses: ${badResponses.join(' | ')}`);

      if ([390, 768, 1180, 1366, 1440, 1600, 1920].includes(width)) {
        await page.locator('.cta-showcase').screenshot({ path: path.join(outDir, `cta-${width}x${height}.png`) });
        if (width === 1366) await page.locator('.cta-showcase__side--left').screenshot({ path: path.join(outDir, 'left-side-1366.png') });
        if (width === 1440) await page.locator('.cta-showcase__educator--right').screenshot({ path: path.join(outDir, 'right-educator-1440.png') });
      }

      results.push({ width, height, errors, badResponses, ...metrics });
      await page.close();
    }

    const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await reducedPage.goto('http://127.0.0.1:4181/schools.html', { waitUntil: 'domcontentloaded' });
    await reducedPage.locator('.cta-showcase').scrollIntoViewIfNeeded();
    const reducedMotion = await reducedPage.evaluate(() => {
      const node = document.querySelector('.cta-destination');
      const style = getComputedStyle(node);
      return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration, visible: node.getClientRects().length > 0 };
    });
    if (!reducedMotion.visible) failures.push('reduced-motion content hidden');
    await reducedPage.close();

    const payload = { screenshotDirectory: outDir, results, reducedMotion, failures };
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(payload, null, 2));
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = failures.length ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
