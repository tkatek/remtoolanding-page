const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'curriculum-hero');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const relative = pathname === '/' ? 'curriculum.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise(resolve => server.listen(41743, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXE,
    headless: true
  });
  const widths = (process.env.QA_WIDTHS || '320,360,375,390,412,430,768,820,1024,1180,1280,1366,1440,1600,1920')
    .split(',')
    .map(Number);
  const results = [];
  const failures = [];

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 1100 : 1000 } });
    const page = await context.newPage();
    const badResponses = [];
    const consoleErrors = [];
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('http://127.0.0.1:41743/curriculum.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelectorAll('.hero .reveal').forEach(node => node.classList.add('is-visible')));
    await page.waitForTimeout(1000);
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector('.hero');
      const inner = document.querySelector('.hero-inner');
      const image = document.querySelector('.hero-photo-frame > img');
      const heading = document.querySelector('.hero-title');
      const visual = document.querySelector('.hero-visual');
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const box = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
          width: +rect.width.toFixed(1), height: +rect.height.toFixed(1),
          opacity: style.opacity, display: style.display
        };
      };
      return {
        width: innerWidth,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        heroHeight: +hero.getBoundingClientRect().height.toFixed(1),
        innerWidth: +inner.getBoundingClientRect().width.toFixed(1),
        columnCount: getComputedStyle(inner).gridTemplateColumns.split(' ').filter(Boolean).length,
        headingSize: getComputedStyle(heading).fontSize,
        headingHeight: +heading.getBoundingClientRect().height.toFixed(1),
        visualHeight: +visual.getBoundingClientRect().height.toFixed(1),
        imageLoaded: image.complete && image.naturalWidth > 0,
        imageWidth: +image.getBoundingClientRect().width.toFixed(1),
        featureCardVisible: visible(document.querySelector('.ch-feature-card')),
        videoCardVisible: visible(document.querySelector('.ch-video-card')),
        noteCardVisible: visible(document.querySelector('.ch-note-card')),
        featureCard: box(document.querySelector('.ch-feature-card')),
        videoCard: box(document.querySelector('.ch-video-card')),
        noteCard: box(document.querySelector('.ch-note-card')),
        activeNav: document.querySelector('.site-header [aria-current="page"]')?.textContent.trim(),
        primaryHref: document.querySelector('.hero-actions a:first-child')?.getAttribute('href'),
        secondaryHref: document.querySelector('.hero-actions a:nth-child(2)')?.getAttribute('href')
      };
    });
    results.push(metrics);
    if (metrics.overflow > 1 || !metrics.imageLoaded || metrics.activeNav !== 'Curriculum' || metrics.primaryHref !== '#levels' || metrics.secondaryHref !== 'free-sample.html' || badResponses.length || consoleErrors.length) {
      failures.push({ width, metrics, badResponses, consoleErrors });
    }
    if ([390, 768, 1024, 1180, 1440, 1600, 1920].includes(width)) {
      await page.addStyleTag({ content: '.hero *, .hero *::before, .hero *::after { animation: none !important; transition: none !important; }' });
      if ([390, 1600].includes(width)) {
        await page.screenshot({ path: path.join(outDir, `viewport-${width}.png`) });
      }
      await page.locator('.hero').screenshot({ path: path.join(outDir, `hero-${width}.png`) });
    }
    await context.close();
  }

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto('http://127.0.0.1:41743/curriculum.html', { waitUntil: 'networkidle' });
  const reduced = await reducedPage.evaluate(() => {
    const card = document.querySelector('.ch-video-card');
    const reveal = document.querySelector('.hero .reveal');
    return {
      cardAnimation: getComputedStyle(card).animationDuration,
      revealTransition: getComputedStyle(reveal).transitionDuration,
      revealOpacity: getComputedStyle(reveal).opacity
    };
  });
  await reducedContext.close();

  console.log(JSON.stringify({ results, failures, reduced, screenshots: outDir }, null, 2));
  await browser.close();
  server.close();
  if (failures.length) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
