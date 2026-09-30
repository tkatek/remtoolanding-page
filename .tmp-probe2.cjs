// Diagnose why teachers.html load hangs in headless Chrome.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'
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

const log = (...a) => { console.log(...a); process.stdout.write(''); };

(async () => {
  await new Promise(r => server.listen(41761, '127.0.0.1', r));
  log('server up');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true
  });
  log('browser up');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();
  page.on('request', r => log('REQ ', r.url().slice(0, 110)));
  page.on('requestfailed', r => log('FAIL', r.url().slice(0, 110), r.failure()?.errorText));
  page.on('response', r => { if (r.status() >= 400) log('HTTP', r.status(), r.url().slice(0, 110)); });
  page.on('console', m => log('CONSOLE', m.type(), m.text().slice(0, 160)));
  page.on('pageerror', e => log('PAGEERROR', String(e).slice(0, 200)));
  log('goto...');
  await page.goto('http://127.0.0.1:41761/teachers.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  log('domcontentloaded reached');
  await page.waitForTimeout(4000);
  log('wait done, taking screenshot');
  await page.screenshot({ path: '.qa-screenshots/teachers-hero/probe-1440.png' });
  await browser.close();
  server.close();
  log('done');
})().catch(e => { console.error('ERR', e); try { server.close(); } catch {} process.exit(1); });
