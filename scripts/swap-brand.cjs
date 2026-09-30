/* Swap the flattened logo image for the shared brand component
   (blue icon SVG + REMTOO wordmark) across all pages and partials. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [
  "index.html",
  "curriculum.html",
  "free-sample.html",
  "legal.html",
  "pricing.html",
  "schools.html",
  "teachers.html",
  "whats-included.html",
  path.join("partials", "site-header.html"),
  path.join("partials", "site-footer.html"),
];

const anchorRe = /<a class="([^"]*)" href="index\.html" aria-label="Remtoo home">\s*<img class="global-brand__image"[^>]*?(\sloading="lazy")?[^>]*>\s*<\/a>/g;

let total = 0;
for (const file of files) {
  const full = path.join(root, file);
  let html = fs.readFileSync(full, "utf8");
  let count = 0;
  html = html.replace(anchorRe, (match, anchorClass, lazy) => {
    if (!/global-brand/.test(anchorClass) && anchorClass !== "global-mobile-nav__brand") return match;
    count++;
    const loading = lazy ? " loading=\"lazy\"" : "";
    // Drawer anchor only carried its own class; give it the shared base too.
    const cls = anchorClass === "global-mobile-nav__brand"
      ? "global-brand global-mobile-nav__brand"
      : anchorClass;
    return `<a class="${cls}" href="index.html" aria-label="Remtoo home">
            <img class="global-brand__icon" src="assets/logos/remtoo-icon.svg" alt="" width="209" height="230"${loading} aria-hidden="true" decoding="async" />
            <span class="global-brand__wordmark">REMTOO</span>
          </a>`;
  });
  if (count) fs.writeFileSync(full, html);
  console.log(`${file}: ${count} brand block(s) replaced`);
  total += count;
}
console.log(`total: ${total}`);
