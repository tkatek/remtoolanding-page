const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = process.cwd();
const outDir = path.join(root, '.qa-screenshots', 'ambient');
const pages = [
  'index.html',
  'curriculum.html',
  'whats-included.html',
  'schools.html',
  'teachers.html',
  'pricing.html',
  'free-sample.html',
  'legal.html'
];
const widths = (process.env.QA_WIDTHS || '390,768,1440').split(',').map(Number);
const targetSections = {
  'index.html': ['.features-section', '.testimonials-section'],
  'curriculum.html': ['.curr-audience-section'],
  'whats-included.html': ['.wi-features'],
  'schools.html': ['#programs'],
  'teachers.html': ['.t-benefits', '.t-testimonials'],
  'pricing.html': ['.pricing-plans'],
  'free-sample.html': ['.fs-journey', '.fs-feedback'],
  'legal.html': ['.page-hero[aria-labelledby="legal-title"]']
};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

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

(async () => {
  await new Promise(resolve => server.listen(4186, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const results = [];
  const failures = [];

  try {
    for (const file of pages) {
      for (const width of widths) {
        const height = width < 600 ? 844 : width < 1000 ? 1024 : 900;
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
        const errors = [];
        const badResponses = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().startsWith('http://127.0.0.1:4186/') && response.status() >= 400) {
            badResponses.push(`${response.status()} ${response.url()}`);
          }
        });

        await page.goto(`http://127.0.0.1:4186/${file}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          await document.fonts.ready;
          document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
          const step = Math.max(320, Math.floor(innerHeight * 0.78));
          for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
          document.querySelectorAll('.reveal').forEach(node => node.classList.add('is-visible'));
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(350);

        const metrics = await page.evaluate(() => {
          const art = [...document.querySelectorAll('.ambient-art')];
          const brokenImages = [...document.images]
            .filter(image => image.complete && !image.naturalWidth)
            .map(image => image.getAttribute('src'));
          return {
            documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            ambientCount: art.length,
            brokenImages,
            layers: art.map(node => {
              const style = getComputedStyle(node);
              const host = getComputedStyle(node.parentElement);
              return {
                className: node.className,
                pointerEvents: style.pointerEvents,
                opacity: style.opacity,
                zIndex: style.zIndex,
                hostIsolation: host.isolation,
                hostOverflowX: host.overflowX
              };
            })
          };
        });

        if (metrics.documentOverflow > 1) failures.push(`${file} ${width}px: overflow ${metrics.documentOverflow}px`);
        if (metrics.ambientCount < 1) failures.push(`${file} ${width}px: no ambient art`);
        if (metrics.brokenImages.length) failures.push(`${file} ${width}px: broken images ${metrics.brokenImages.join(', ')}`);
        if (metrics.layers.some(layer => layer.pointerEvents !== 'none')) failures.push(`${file} ${width}px: interactive ambient layer`);
        if (errors.length) failures.push(`${file} ${width}px console: ${errors.join(' | ')}`);
        if (badResponses.length) failures.push(`${file} ${width}px responses: ${badResponses.join(' | ')}`);

        await page.addStyleTag({ content: '.ambient-art, .ambient-art::before, .ambient-art::after { animation: none !important; transition: none !important; }' });
        if (width === 1440) {
          await page.screenshot({ path: path.join(outDir, `${path.basename(file, '.html')}-1440-full.png`), fullPage: true });
        } else {
          await page.screenshot({ path: path.join(outDir, `${path.basename(file, '.html')}-${width}-top.png`) });
        }
        for (const [index, selector] of targetSections[file].entries()) {
          await page.locator(selector).screenshot({
            path: path.join(outDir, `${path.basename(file, '.html')}-${width}-ambient-${index + 1}.png`)
          });
        }

        results.push({ file, width, errors, badResponses, ...metrics });
        await page.close();
      }
    }

    const reducedPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await reducedPage.goto('http://127.0.0.1:4186/index.html', { waitUntil: 'domcontentloaded' });
    const reducedMotion = await reducedPage.evaluate(() => {
      const node = document.querySelector('.ambient-art.is-drifting');
      if (!node) return { found: false };
      const style = getComputedStyle(node);
      return { found: true, animationName: style.animationName, animationDuration: style.animationDuration };
    });
    if (reducedMotion.found && reducedMotion.animationName !== 'none') failures.push('reduced motion: ambient animation remains active');
    await reducedPage.close();

    const darkPages = ['index.html', 'curriculum.html', 'pricing.html'];
    const darkResults = [];
    for (const file of darkPages) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      await page.goto(`http://127.0.0.1:4186/${file}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
        const step = Math.max(320, Math.floor(innerHeight * 0.78));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        document.querySelectorAll('.reveal').forEach(node => node.classList.add('is-visible'));
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(350);
      const data = await page.evaluate(() => ({
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        visibleAmbient: [...document.querySelectorAll('.ambient-art')].filter(node => {
          const style = getComputedStyle(node);
          return style.display !== 'none' && Number(style.opacity) > 0;
        }).length
      }));
      darkResults.push({ file, ...data });
      if (!data.visibleAmbient) failures.push(`${file} dark: no visible ambient art`);
      await page.addStyleTag({ content: '.ambient-art, .ambient-art::before, .ambient-art::after { animation: none !important; transition: none !important; }' });
      await page.screenshot({ path: path.join(outDir, `${path.basename(file, '.html')}-1440-dark.png`), fullPage: true });
      for (const [index, selector] of targetSections[file].entries()) {
        await page.locator(selector).screenshot({
          path: path.join(outDir, `${path.basename(file, '.html')}-1440-dark-ambient-${index + 1}.png`)
        });
      }
      await page.close();
    }

    const payload = { results, reducedMotion, darkResults, failures, screenshots: outDir };
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(payload, null, 2));
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
