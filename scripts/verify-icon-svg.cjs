/* Compare traced remtoo-icon.svg against the original PNG icon crop.
   Renders both at 2x and reports coverage diff + writes a side-by-side PNG. */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const W = 418, H = 460; // 2x

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 800, height: 520 } });
  await page.goto("about:blank");
  const pngData = "data:image/png;base64," + fs.readFileSync(path.join(root, ".qa-screenshots", "icon-crop.png")).toString("base64");
  const svgData = "data:image/svg+xml;base64," + fs.readFileSync(path.join(root, "assets", "logos", "remtoo-icon.svg")).toString("base64");
  const result = await page.evaluate(async ({ W, H, pngData, svgData }) => {
    const load = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("failed " + src.slice(0, 40)));
      img.src = src;
    });
    const png = await load(pngData);
    const svg = await load(svgData);
    const draw = (img) => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      return ctx.getImageData(0, 0, W, H);
    };
    const a = draw(png), b = draw(svg);
    let diff = 0, worst = 0, overlap = 0, onlyA = 0, onlyB = 0;
    for (let i = 0; i < W * H; i++) {
      const aa = a.data[i * 4 + 3], ab = b.data[i * 4 + 3];
      const d = Math.abs(aa - ab);
      diff += d;
      if (d > worst) worst = d;
      if (aa > 128 && ab > 128) overlap++;
      else if (aa > 128) onlyA++;
      else if (ab > 128) onlyB++;
    }
    // side-by-side composite on white
    const c = document.createElement("canvas");
    c.width = W * 2 + 30; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(png, 0, 0, W, H);
    ctx.drawImage(svg, W + 30, 0, W, H);
    const dataUrl = c.toDataURL("image/png");
    const opa = overlap + onlyA + onlyB || 1;
    return {
      meanDiff: (diff / (W * H)).toFixed(3),
      worst,
      overlapPct: (overlap / opa * 100).toFixed(2),
      onlyPngPct: (onlyA / opa * 100).toFixed(2),
      onlySvgPct: (onlyB / opa * 100).toFixed(2),
      dataUrl,
    };
  }, { W, H });
  fs.mkdirSync(path.join(root, ".qa-screenshots"), { recursive: true });
  fs.writeFileSync(path.join(root, ".qa-screenshots", "icon-compare.png"), Buffer.from(result.dataUrl.split(",")[1], "base64"));
  const { dataUrl, ...stats } = result;
  console.log(JSON.stringify(stats, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
