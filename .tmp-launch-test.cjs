const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.BROWSER_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const p = await b.newPage();
  await p.setContent('<h1>hi</h1>', { timeout: 15000 });
  await p.screenshot({ path: '.qa-screenshots/teachers-hero/launch-test.png' });
  await b.close();
  console.log('launch ok');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
