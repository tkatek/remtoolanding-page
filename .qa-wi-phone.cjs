// QA capture: WI hero phone view full-top (with navbar) + geometry.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = process.cwd();
const scheme = process.argv[2] || 'light';
const tag = process.argv[3] || 'rebuild1';
const outDir = path.join(root, '.qa-screenshots', 'wi-hero');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
fs.mkdirSync(outDir, { recursive: true });
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent((request.url || '/').split('?')[0]).replace(/^\/+/, '') || 'whats-included.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root))) return response.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(4202, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const s of [{ name: 'm375', width: 375, height: 812 }, { name: 'm390', width: 390, height: 844 }, { name: 'm430', width: 430, height: 900 }]) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, colorScheme: scheme, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:4202/whats-included.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
    await page.screenshot({ path: path.join(outDir, `${tag}-${scheme}-${s.name}-top.png`) }); // includes navbar + copy
    const hero = page.locator('.wi-hero').first();
    await hero.screenshot({ path: path.join(outDir, `${tag}-${scheme}-${s.name}-hero.png`) });
    const diag = await page.evaluate(() => {
      const rect = el => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
      const visual = rect(document.querySelector('.wi-hero-visual'));
      const img = rect(document.querySelector('.wi-teacher-picture img'));
      const overlap = (a, b) => ({ x: Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)), y: Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) });
      const face = { l: img.l + img.w * 0.427, r: img.l + img.w * 0.687, t: img.t + img.h * 0.024, b: img.t + img.h * 0.21 };
      const out = { visual, img, cards: {} };
      for (const cls of ['wi-float-card--lesson', 'wi-float-card--video', 'wi-float-card--vocabulary', 'wi-float-card--materials', 'wi-trust-card', 'wi-note--top']) {
        const el = document.querySelector('.' + cls);
        if (!el) continue;
        const vis = getComputedStyle(el).display !== 'none';
        const r = rect(el);
        out.cards[cls.replace('wi-float-card--', '').replace('wi-trust-card', 'trust').replace('wi-note--top', 'note')] = {
          vis, x: r.l - visual.l, y: r.t - visual.t, r: r.r - visual.l, b: r.b - visual.t,
          face: (cls !== 'wi-note--top') ? overlap(face, r) : null
        };
      }
      // overflow checks
      out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
    });
    console.log(`\n=== ${s.name} (${scheme}) === visual ${diag.visual.w}x${diag.visual.h} overflowX:${diag.overflowX}`);
    console.log('img', `x:${diag.img.l - diag.visual.l}..${diag.img.r - diag.visual.l} y:${diag.img.t - diag.visual.t}..${diag.img.b - diag.visual.t}`);
    for (const [k, c] of Object.entries(diag.cards)) {
      console.log(`${k.padEnd(11)}`, c.vis ? `x:${c.x}..${c.r} y:${c.y}..${c.b}` : 'HIDDEN', c.face && c.face.x > 0 && c.face.y > 0 ? `FACE ${c.face.x}x${c.face.y}px` : '');
    }
    await page.close();
  }
  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
