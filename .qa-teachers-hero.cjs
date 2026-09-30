// Visual QA for the teachers.html hero rebuild.
// Usage: node .qa-teachers-hero.cjs [widths,comma,separated]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'teachers-hero');
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mjs': 'text/javascript'
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const relative = pathname === '/' ? 'teachers.html' : pathname.replace(/^\/+/, '');
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
  await new Promise(resolve => server.listen(41761, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const widths = (process.argv[2] || '360,390,430,768,1024,1180,1280,1440,1600,1920')
    .split(',').map(Number);
  const results = [];
  const allBad = [];

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 1200 : 1080 } });
    const page = await context.newPage();
    const badResponses = [];
    page.on('response', r => { if (r.status() >= 400) allBad.push(`${r.status()} ${r.url()}`); });
    await page.goto('http://127.0.0.1:41761/teachers.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      document.querySelectorAll('.reveal').forEach(n => n.classList.add('is-visible'));
      document.documentElement.classList.remove('js');
    });
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector('.t-hero');
      const visual = document.querySelector('.t-hero-visual');
      const teacher = document.querySelector('.t-hero-teacher');
      const rawCards = [...document.querySelectorAll('.t-hero-visual .t-float-card')];
      const cards = rawCards.map(c => {
        const r = c.getBoundingClientRect();
        return { x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), name: c.className.match(/t-float-card--(\w+)/)?.[1] };
      });
      // scaled cards report scaled rects already — overlap between card pairs:
      const overlaps = [];
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j];
          const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          if (ox > 2 && oy > 2) overlaps.push(`${a.name}x${b.name}:${ox}x${oy}px`);
        }
      }
      const vr = visual ? visual.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
      return {
        width: innerWidth,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        heroH: hero ? +hero.getBoundingClientRect().height.toFixed(0) : 0,
        visualBox: { x: +vr.x.toFixed(0), y: +vr.y.toFixed(0), w: +vr.width.toFixed(0), h: +vr.height.toFixed(0) },
        teacherLoaded: teacher ? (teacher.complete && teacher.naturalWidth > 0) : false,
        cards,
        cardOverlaps: overlaps,
        cardsInVisual: cards.filter(c => c.w > 0 && c.h > 0).length
      };
    });
    results.push(metrics);
    await page.screenshot({ path: path.join(outDir, `viewport-${width}.png`), fullPage: false });
    if (metrics.overflow > 1) await page.screenshot({ path: path.join(outDir, `overflow-${width}.png`), fullPage: true });
    await context.close();
  }

  console.log(JSON.stringify({ results, badResponses: allBad, screenshots: outDir }, null, 2));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
