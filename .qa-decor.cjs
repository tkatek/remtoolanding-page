// Site-wide bg-decor QA: light + dark renders per page, overflow check, and
// verification that decoration colors actually change with the color scheme.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'bg-decor');
const pages = ['index', 'curriculum', 'free-sample', 'pricing', 'schools', 'whats-included', 'legal', 'teachers'];
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
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
  await new Promise(resolve => server.listen(41762, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true
  });
  const results = [];

  for (const scheme of ['light', 'dark']) {
    for (const page of pages) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 }, colorScheme: scheme
      });
      const pg = await context.newPage();
      const bad = [];
      pg.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().split('/').pop()}`); });
      await pg.goto(`http://127.0.0.1:41762/${page}.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pg.evaluate(() => {
        document.querySelectorAll('.reveal').forEach(n => n.classList.add('is-visible'));
      });
      await pg.waitForTimeout(1300);
      const metrics = await pg.evaluate(() => {
        const decor = document.querySelector('.bg-decor') || document.querySelector('.t-atmosphere');
        const wave = document.querySelector('.bg-wave--a') || document.querySelector('.t-wave--a');
        const dot = document.querySelector('.bg-dot--1') || document.querySelector('.t-bdot--1');
        const r = el => { const b = el ? el.getBoundingClientRect() : { width: 0, height: 0 }; return { w: +b.width.toFixed(0), h: +b.height.toFixed(0) }; };
        return {
          decorLayer: r(decor),
          wave: r(wave),
          dotColor: dot ? getComputedStyle(dot).backgroundColor : 'none',
          waveStroke: wave ? getComputedStyle(wave.querySelector('path')).stroke : 'none',
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
        };
      });
      await pg.screenshot({ path: path.join(outDir, `${page}-${scheme}-1440.png`) });
      results.push({ scheme, page, ...metrics, bad });
      await context.close();
    }
  }

  // Mobile overflow sweep (light scheme).
  for (const width of [320, 390, 768]) {
    for (const page of pages) {
      const context = await browser.newContext({ viewport: { width, height: 1100 } });
      const pg = await context.newPage();
      await pg.goto(`http://127.0.0.1:41762/${page}.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pg.waitForTimeout(700);
      const overflow = await pg.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
      results.push({ scheme: `w${width}`, page, overflow });
      await context.close();
    }
  }

  console.log(JSON.stringify(results.map(r => ({
    scheme: r.scheme, page: r.page, overflow: r.overflow,
    decor: r.decorLayer ? `${r.decorLayer.w}x${r.decorLayer.h}` : '-',
    wave: r.wave ? `${r.wave.w}x${r.wave.h}` : '-',
    dot: r.dotColor ? r.dotColor.replace(/rgba?\(([^)]+)\)/, '$1').split(',').slice(0, 3).join(',') : '-',
    bad: r.bad
  })), null, 1));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
