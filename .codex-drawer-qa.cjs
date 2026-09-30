// Drawer QA: compact mobile nav across phone viewports, light + dark.
// Usage: node .codex-drawer-qa.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'drawer');
const PORT = 4193;

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const viewports = [
  [320, 568], [360, 800], [375, 812], [390, 844], [412, 915], [430, 932]
];

fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent((request.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root))) return response.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(data);
  });
});

const results = [];
const failures = [];
const check = (pass, label, detail = '') => {
  results.push(label);
  if (!pass) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

  const drawerMetrics = () => {
    const panel = document.querySelector('.global-mobile-nav__panel');
    const nav = document.querySelector('.global-mobile-nav');
    const backdrop = document.querySelector('.global-mobile-nav__backdrop');
    const close = document.querySelector('.global-mobile-nav__close');
    const logo = document.querySelector('.global-mobile-nav__head .global-brand__icon');
    const links = [...document.querySelectorAll('.global-mobile-nav__link')];
    const cta = document.querySelector('.global-mobile-nav__cta');
    const decor = document.querySelector('.global-mobile-nav__decor');
    const head = document.querySelector('.global-mobile-nav__head');
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      navOpen: nav.classList.contains('is-open'),
      panel: rect(panel), backdrop: rect(backdrop), backdropVisible: backdrop ? getComputedStyle(backdrop).opacity : null,
      close: rect(close),
      closeSize: close ? { w: close.getBoundingClientRect().width, h: close.getBoundingClientRect().height } : null,
      logo: rect(logo),
      logoRatio: logo && logo.naturalWidth ? (logo.getBoundingClientRect().width / logo.getBoundingClientRect().height).toFixed(3) : null,
      naturalRatio: logo ? (logo.naturalWidth / logo.naturalHeight).toFixed(3) : null,
      links: links.map(l => ({ h: l.getBoundingClientRect().height, text: l.querySelector('.global-mobile-nav__label').textContent, active: l.getAttribute('aria-current') === 'page' })),
      cta: rect(cta),
      decor: rect(decor),
      head: rect(head),
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      scrollWidth: document.documentElement.scrollWidth,
      panelBg: getComputedStyle(panel).backgroundColor,
      activeRowBg: (() => { const a = links.find(l => l.getAttribute('aria-current') === 'page'); return a ? getComputedStyle(a).backgroundColor : null; })(),
      logoFilter: logo ? getComputedStyle(logo).filter : null,
      firstFocus: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : '',
      expanded: document.querySelector('[data-mobile-nav-toggle]')?.getAttribute('aria-expanded')
    };
  };

  // ---------- Per-viewport geometry + behavior ----------
  for (const [w, h] of viewports) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(250);

    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(420);
    let m = await page.evaluate(drawerMetrics);
    const tag = `${w}x${h}`;

    check(m.navOpen, `${tag}: drawer opens`);
    check(errors.length === 0, `${tag}: no JS errors`, errors.join('; '));
    check(m.panel && m.panel.w < m.vw, `${tag}: panel narrower than viewport`, `panel ${m.panel && m.panel.w} vs vw ${m.vw}`);
    const ratio = m.panel ? m.panel.w / m.vw : 0;
    if (w <= 360) check(ratio >= 0.82 && ratio <= 0.95, `${tag}: width ratio in 82-95%`, ratio.toFixed(2));
    else if (w < 600) check(ratio >= 0.82 && ratio <= 0.88, `${tag}: width ratio in 82-88%`, ratio.toFixed(2));
    else check(Math.abs(m.panel.w - 380) < 1, `${tag}: width capped at 380px`, m.panel && m.panel.w);
    check(m.panel && Math.abs(m.panel.y) < 0.5, `${tag}: no top gap`, m.panel && m.panel.y);
    check(m.panel && Math.abs(m.panel.right - m.vw) < 0.5, `${tag}: flush to right edge`, m.panel && m.panel.right);
    check(m.backdrop && m.backdrop.w === m.vw && Math.abs(m.backdrop.h - m.vh) < 1 && parseFloat(m.backdropVisible) > 0.9, `${tag}: backdrop covers viewport`, JSON.stringify(m.backdrop));
    check(m.closeSize && m.closeSize.w >= 44 && m.closeSize.h >= 44, `${tag}: close button >= 44px`, JSON.stringify(m.closeSize));
    check(m.close && m.close.right <= m.vw && m.close.x >= 0, `${tag}: close button visible`, JSON.stringify(m.close));
    check(m.logo && m.logo.h > 20 && Math.abs(m.logoRatio - m.naturalRatio) < 0.02, `${tag}: logo aspect preserved`, `${m.logoRatio} vs ${m.naturalRatio}`);
    check(m.links.length === 6 && m.links.every(l => l.h >= 56 && l.h <= 74), `${tag}: 6 rows at 56-74px`, JSON.stringify(m.links.map(l => l.h)));
    check(m.cta && m.cta.bottom <= m.vh + 0.5 && m.cta.h >= 52, `${tag}: CTA on screen 52px+`, JSON.stringify(m.cta));
    check(!m.decor || m.decor.h <= 150, `${tag}: decor <= 150px`, m.decor && m.decor.h);
    check(m.bodyOverflow === 'hidden' || m.htmlOverflow === 'hidden', `${tag}: page scroll locked`, `${m.htmlOverflow}/${m.bodyOverflow}`);
    check(m.scrollWidth <= m.vw + 1, `${tag}: no horizontal overflow`, `${m.scrollWidth} vs ${m.vw}`);
    check(m.links.every(l => l.text.length > 0), `${tag}: all labels readable`);
    check(m.firstFocus.includes('global-mobile-nav'), `${tag}: focus moves into drawer`, m.firstFocus);

    // Escape closes + focus returns to hamburger
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    m = await page.evaluate(drawerMetrics);
    check(!m.navOpen && m.expanded === 'false', `${tag}: Escape closes drawer`);
    check((m.firstFocus || '').includes('global-menu-toggle'), `${tag}: focus returns to hamburger`, m.firstFocus);

    // Backdrop click closes
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(380);
    await page.mouse.click(Math.round(w * 0.08), Math.round(h * 0.5));
    await page.waitForTimeout(120);
    m = await page.evaluate(drawerMetrics);
    check(!m.navOpen, `${tag}: backdrop click closes drawer`);

    // Nav link click closes drawer (prevent real navigation for the test)
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(380);
    await page.evaluate(() => {
      const link = document.querySelector('.global-mobile-nav__link');
      link.addEventListener('click', (event) => event.preventDefault(), { once: true });
      link.click();
    });
    await page.waitForTimeout(80);
    m = await page.evaluate(drawerMetrics);
    check(!m.navOpen, `${tag}: nav item click closes drawer`);

    // Swipe to close (touch)
    const cdp = await context.newCDPSession(page);
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(380);
    await page.evaluate(() => {
      window.__blockSwipeClick = (event) => { event.preventDefault(); };
      document.addEventListener('click', window.__blockSwipeClick, true);
    });
    const px = w * 0.5;
    const endX = Math.min(Math.round(px + Math.min(96, w * 0.3) + 40), w - 8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: h * 0.4 }] });
    for (let i = 1; i <= 8; i++) {
      const x = Math.round(px + ((endX - px) * i) / 8);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: h * 0.4 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.removeEventListener('click', window.__blockSwipeClick, true));
    m = await page.evaluate(drawerMetrics);
    check(!m.navOpen, `${tag}: swipe right closes drawer`);

    // Screenshots (light)
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(420);
    if ([320, 390, 430].includes(w)) {
      await page.screenshot({ path: path.join(outDir, `index-${tag}-light.png`) });
    }
    await context.close();
  }

  // ---------- Dark mode ----------
  for (const [w, h] of [[360, 800], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(250);
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(420);
    const m = await page.evaluate(drawerMetrics);
    const tag = `${w}x${h} dark`;
    const darkPanel = m.panelBg.match(/\d+/g)?.map(Number) ?? [];
    check(darkPanel.length >= 3 && darkPanel[0] < 60 && darkPanel[1] < 70 && darkPanel[2] < 100, `${tag}: deep navy panel`, m.panelBg);
    check(m.logoFilter === 'none', `${tag}: logo asset unchanged (capsule treatment)`, m.logoFilter);
    check(m.cta && m.cta.bottom <= m.vh + 0.5, `${tag}: CTA on screen`);
    await page.screenshot({ path: path.join(outDir, `index-${tag.replace(' ', '')}.png`) });
    await context.close();
  }

  // ---------- Active page + cross-page markup sanity ----------
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/curriculum.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(250);
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(420);
    const m = await page.evaluate(drawerMetrics);
    const active = m.links.filter(l => l.active);
    check(active.length === 1 && active[0].text === 'Curriculum', '390x844 curriculum: exactly Curriculum active', JSON.stringify(m.links.map(l => [l.text, l.active])));
    const bg = m.activeRowBg.match(/\d+/g)?.map(Number) ?? [];
    check(bg.length >= 3 && bg[0] >= 200 && bg[2] > bg[0] - 40 && bg[2] >= bg[0], '390x844 curriculum: pale blue active row', m.activeRowBg);
    await page.screenshot({ path: path.join(outDir, 'curriculum-390x844-light.png') });
    await context.close();
  }

  // Every page: drawer markup present & opens without console errors
  for (const file of ['whats-included.html', 'schools.html', 'teachers.html', 'pricing.html', 'free-sample.html', 'legal.html']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    await page.click('[data-mobile-nav-toggle]');
    await page.waitForTimeout(400);
    const m = await page.evaluate(drawerMetrics);
    check(m.navOpen && errors.length === 0, `${file}: drawer opens cleanly`, errors.join('; '));
    check(m.links.length === 6, `${file}: 6 menu rows`);
    await context.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exitCode = 1;
  } else {
    console.log('All drawer QA checks passed.');
  }
})();
