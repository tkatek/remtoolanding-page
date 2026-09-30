import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageNames = [
  "index.html",
  "curriculum.html",
  "whats-included.html",
  "schools.html",
  "teachers.html",
  "pricing.html",
  "free-sample.html",
  "legal.html",
];

const finalCtaClassByPage = new Map([
  ["index.html", "final-cta-section"],
  ["curriculum.html", "final-banner-section"],
  ["whats-included.html", "wi-cta-section"],
  ["schools.html", "final-cta"],
  ["teachers.html", "t-cta-section"],
  ["pricing.html", "pricing-final-cta"],
  ["free-sample.html", "fs-final"],
]);

const headerTemplate = (await readFile(path.join(repoRoot, "partials", "site-header.html"), "utf8")).trim();
const prefooterTemplate = (await readFile(path.join(repoRoot, "partials", "site-prefooter.html"), "utf8")).trim();
const footerDocument = (await readFile(path.join(repoRoot, "partials", "site-footer.html"), "utf8")).trim();
const footerStart = footerDocument.search(/<footer\b[^>]*\bclass=["'][^"']*\bglobal-footer\b/i);

if (footerStart < 0) {
  throw new Error("Shared .global-footer markup not found in partials/site-footer.html");
}

// The cinematic showcase is the Schools page's dedicated final section. The
// compact shared pre-footer remains on the other marketing pages.
const showcaseTemplate = footerDocument.slice(0, footerStart).trim();
const footerOnlyTemplate = footerDocument.slice(footerStart);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findElementRange = (html, tagName, className, fromIndex = 0) => {
  const escapedTag = escapeRegExp(tagName);
  const escapedClass = escapeRegExp(className);
  const opener = new RegExp(
    `<${escapedTag}\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>`,
    "gi"
  );
  opener.lastIndex = fromIndex;
  const openingMatch = opener.exec(html);
  if (!openingMatch) return null;

  const token = new RegExp(`<\\/?${escapedTag}\\b[^>]*>`, "gi");
  token.lastIndex = openingMatch.index;
  let depth = 0;
  let match;

  while ((match = token.exec(html))) {
    const closing = /^<\//.test(match[0]);
    if (closing) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) return { start: openingMatch.index, end: token.lastIndex };
  }

  throw new Error(`Could not find closing </${tagName}> for .${className}`);
};

const removeRangeAndAdjacentBlankLine = (html, range) => {
  let start = range.start;
  let end = range.end;
  while (start > 0 && (html[start - 1] === " " || html[start - 1] === "\t")) start -= 1;
  if (html.slice(start - 2, start) === "\r\n") start -= 2;
  else if (start > 0 && html[start - 1] === "\n") start -= 1;
  while (end < html.length && (html[end] === " " || html[end] === "\t")) end += 1;
  if (html.slice(end, end + 2) === "\r\n") end += 2;
  else if (html[end] === "\n") end += 1;
  return html.slice(0, start) + html.slice(end);
};

const applyBuildTimeActiveState = (template, pageName) =>
  template.replace(
    /(<a\b[^>]*\bdata-nav-route="([^"]+)"[^>]*)(>)/gi,
    (fullMatch, openingTag, route, close) => {
      const withoutCurrent = openingTag.replace(/\s+aria-current="page"/gi, "");
      return route.toLowerCase() === pageName.toLowerCase()
        ? `${withoutCurrent} aria-current="page"${close}`
        : `${withoutCurrent}${close}`;
    }
  );

const formatBlock = (name, template, newline) => {
  const normalized = template.replace(/\r?\n/g, newline);
  const indented = normalized
    .split(newline)
    .map((line) => (line ? `  ${line}` : ""))
    .join(newline);
  return `  <!-- ${name}:start -->${newline}${indented}${newline}  <!-- ${name}:end -->`;
};

const replaceMarkedBlock = (html, name, block) => {
  const pattern = new RegExp(
    `[ \\t]*<!-- ${escapeRegExp(name)}:start -->[\\s\\S]*?<!-- ${escapeRegExp(name)}:end -->`,
    "i"
  );
  return pattern.test(html) ? html.replace(pattern, block) : null;
};

const includeLeadingIndent = (html, range) => {
  const lineStart = html.lastIndexOf("\n", range.start - 1) + 1;
  return /^[ \t]*$/.test(html.slice(lineStart, range.start))
    ? { ...range, start: lineStart }
    : range;
};

const replaceLegacyHeader = (html, block) => {
  const foundHeader = findElementRange(html, "header", "site-header");
  const headerRange = foundHeader ? includeLeadingIndent(html, foundHeader) : null;
  if (!headerRange) throw new Error("Legacy .site-header not found");

  let end = headerRange.end;
  const mobileRange = findElementRange(html, "nav", "mobile-menu", end);
  if (mobileRange) {
    const between = html.slice(end, mobileRange.start);
    if (/^(?:\s|<!--[\s\S]*?-->)*$/.test(between)) end = mobileRange.end;
  }

  return html.slice(0, headerRange.start) + block + html.slice(end);
};

const replaceLegacyFooter = (html, block) => {
  const siteFooter = findElementRange(html, "footer", "site-footer");
  const sampleFooter = findElementRange(html, "footer", "fs-footer");
  const footerRange = [siteFooter, sampleFooter]
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)[0];
  if (!footerRange) throw new Error("Legacy site footer not found");
  const replacementRange = includeLeadingIndent(html, footerRange);
  return html.slice(0, replacementRange.start) + block + html.slice(replacementRange.end);
};

const ensureStylesheet = (html, newline) => {
  const withoutExisting = html.replace(
    /[ \t]*<link\b[^>]*href=["']css\/site-system\.css["'][^>]*\/?\s*>[ \t]*(?:\r?\n)?/gi,
    ""
  );
  const tag = `  <link rel="stylesheet" href="css/site-system.css" />`;
  return withoutExisting.replace(/\s*<\/head>/i, `${newline}${tag}${newline}</head>`);
};

const ensureThemeMetadata = (html, newline) => {
  const withoutExisting = html.replace(
    /[ \t]*<meta\b[^>]*name=["'](?:color-scheme|theme-color)["'][^>]*\/?\s*>[ \t]*(?:\r?\n)?/gi,
    ""
  );
  const metadata = [
    `  <meta name="color-scheme" content="light dark" />`,
    `  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />`,
    `  <meta name="theme-color" content="#071221" media="(prefers-color-scheme: dark)" />`,
  ].join(newline);
  const viewport = /(<meta\b[^>]*name=["']viewport["'][^>]*\/?\s*>)/i;
  if (viewport.test(withoutExisting)) {
    return withoutExisting.replace(viewport, `$1${newline}${metadata}`);
  }
  return withoutExisting.replace(/(<meta\b[^>]*charset[^>]*\/?\s*>)/i, `$1${newline}${metadata}`);
};

const ensureScript = (html, newline) => {
  if (/src=["']js\/site-shell\.js["']/i.test(html)) return html;
  const tag = `  <script src="js/site-shell.js" defer></script>`;
  return html.replace(/\s*<\/body>/i, `${newline}${tag}${newline}</body>`);
};

const syncPage = async (pageName) => {
  const pagePath = path.join(repoRoot, pageName);
  const original = await readFile(pagePath, "utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  let html = original;

  const finalCtaClass = finalCtaClassByPage.get(pageName);
  if (finalCtaClass) {
    const finalCtaRange = findElementRange(html, "section", finalCtaClass);
    if (finalCtaRange) html = removeRangeAndAdjacentBlankLine(html, finalCtaRange);
  }

  if (pageName === "schools.html") {
    const showcaseBlock = showcaseTemplate
      .replace(/\r?\n/g, newline)
      .split(newline)
      .map((line) => (line ? `    ${line}` : ""))
      .join(newline);
    const currentShowcase = findElementRange(html, "section", "cta-showcase");

    if (currentShowcase) {
      html = html.slice(0, currentShowcase.start) + showcaseBlock.trimStart() + html.slice(currentShowcase.end);
    } else {
      const finalCtaMarker = /([ \t]*<!--[^\r\n]*FINAL CTA[^\r\n]*-->)[ \t]*(?:\r?\n[ \t]*)?(<\/main>)/i;
      if (!finalCtaMarker.test(html)) throw new Error("Schools FINAL CTA marker not found");
      html = html.replace(finalCtaMarker, `$1${newline}${showcaseBlock}${newline}  $2`);
    }
  }

  const pageHeader = applyBuildTimeActiveState(headerTemplate, pageName);
  const headerBlock = formatBlock("site-header", pageHeader, newline);
  const markedHeader = replaceMarkedBlock(html, "site-header", headerBlock);
  html = markedHeader ?? replaceLegacyHeader(html, headerBlock);

  const pagePrefooter = pageName === "schools.html" ? "" : `${prefooterTemplate}\n\n`;
  const footerBlock = formatBlock("site-footer", `${pagePrefooter}${footerOnlyTemplate}`, newline);
  const markedFooter = replaceMarkedBlock(html, "site-footer", footerBlock);
  html = markedFooter ?? replaceLegacyFooter(html, footerBlock);

  html = ensureThemeMetadata(html, newline);
  html = ensureStylesheet(html, newline);
  html = ensureScript(html, newline);

  if (html !== original) await writeFile(pagePath, html, "utf8");
  return html !== original;
};

const changedPages = [];
for (const pageName of pageNames) {
  if (await syncPage(pageName)) changedPages.push(pageName);
}

console.log(
  changedPages.length
    ? `Synchronized shared site shell in: ${changedPages.join(", ")}`
    : "Shared site shell is already synchronized."
);
