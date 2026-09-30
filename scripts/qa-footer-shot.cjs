/* Footer brand visual check: element geometry + wide screenshot. */
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const path = require("path");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "..", ".serve.mjs")], { stdio: "ignore" });
  await wait(600);
  const b = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:8137/", { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  const brand = p.locator(".global-footer__brand");
  await brand.scrollIntoViewIfNeeded();
  await wait(300);
  const box = await brand.boundingBox();
  console.log("footer brand box:", JSON.stringify(box));
  const info = await p.evaluate(() => {
    const el = document.querySelector(".global-footer__brand");
    return {
      children: [...el.children].map((c) => `${c.tagName}.${c.className} h=${c.getBoundingClientRect().height.toFixed(0)}`),
      height: el.getBoundingClientRect().height.toFixed(0),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await p.screenshot({
    path: path.join(__dirname, "..", ".qa-screenshots", "brand", "footer-full-1440-light.png"),
    clip: { x: 0, y: Math.max(0, box.y - 20), width: 1440, height: Math.min(900, box.height + 280) },
  });
  await b.close();
  server.kill();
})().catch((e) => { console.error(e); process.exit(1); });
