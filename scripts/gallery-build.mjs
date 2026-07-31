#!/usr/bin/env node

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { marked } from "marked";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { documentationPages, locales, localisedGroups } from "./docs-structure.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const galleryOutput = resolve(distRoot, "gallery");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const examples = [
  { slug: "midnight", entry: resolve(packageRoot, "slides.ts") },
  { slug: "language", entry: resolve(packageRoot, "gallery", "slides", "language.slides.ts") },
  { slug: "recipes", entry: resolve(packageRoot, "gallery", "slides", "recipes.slides.ts") },
  { slug: "ai-research", entry: resolve(packageRoot, "gallery", "slides", "ai-research.slides.ts") },
  { slug: "minimal-academic", entry: resolve(packageRoot, "tests", "minimal-academic.slides.ts") },
  { slug: "beamer-madrid", entry: resolve(packageRoot, "tests", "beamer.slides.ts") },
  { slug: "blank", entry: resolve(packageRoot, "gallery", "slides", "blank.slides.ts") },
  { slug: "paper", entry: resolve(packageRoot, "gallery", "slides", "paper.slides.ts") },
  { slug: "beamer-default", entry: resolve(packageRoot, "gallery", "slides", "beamer-default.slides.ts") },
  {
    slug: "beamer-cambridge-us",
    entry: resolve(packageRoot, "gallery", "slides", "beamer-cambridge-us.slides.ts"),
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rewriteMarkdownLinks(source) {
  return source.replace(/\]\(([^)]+)\)/g, (match, rawTarget) => {
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) return match;
    const [path, fragment] = rawTarget.split("#", 2);
    if (!path.toLowerCase().endsWith(".md")) return match;
    // A translated page links into its own directory or up into the English one,
    // so the prefix has to survive the rewrite.
    const prefix = path.slice(0, path.length - basename(path).length);
    const name = basename(path, ".md").toLowerCase();
    const slug = name === "readme"
      ? "index"
      : name === "changelog"
        ? "changelog"
        : name;
    return `](${prefix}${slug}.html${fragment ? `#${fragment}` : ""})`;
  });
}

function headingSlug(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "and")
    .replaceAll("&quot;", "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, content) => {
    const base = headingSlug(content) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${content}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}

function documentationNavigation(activeSlug, locale) {
  return localisedGroups(locale).map((group) => `
    <section class="docs-nav-group">
      <h2>${escapeHtml(group.label)}</h2>
      ${group.pages.map((page) => {
        // An untranslated page is offered in English rather than hidden.
        const english = locale !== "en" && !page.translated;
        const href = english ? `../${page.slug}.html` : `${page.slug}.html`;
        const active = page.slug === activeSlug && !english;
        return `
        <a${active ? ' class="is-active" aria-current="page"' : ""} href="${href}">${escapeHtml(page.label)}${english ? ' <span class="docs-nav-lang">EN</span>' : ""}</a>
      `;
      }).join("")}
    </section>
  `).join("");
}

/** Replace each preview marker with the slide the recipe above it produces. */
function withSlidePreviews(html, slug, locale = "en") {
  if (!slug) return html;
  const directory = locale === "en" ? "images" : "../images";
  let index = 0;
  return html.replace(/<!-- preview -->/g, () => {
    index += 1;
    return `<figure class="docs-preview">`
      + `<img src="${directory}/${slug}-${index}.png" width="1280" height="720" loading="lazy"`
      + ` alt="The slide this recipe renders" />`
      + `</figure>`;
  });
}

function documentationPage({ slug, label, source, previews }, content, locale = "en") {
  const rendered = withSlidePreviews(
    addHeadingIds(marked.parse(rewriteMarkdownLinks(content), { gfm: true })),
    previews,
    locale,
  );
  const other = locale === "en" ? locales.zh : locales.en;
  const switchHref = locale === "en" ? `zh/${slug}.html` : `../${slug}.html`;
  return `<!doctype html>
<html lang="${locales[locale].htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f2ea" />
    <meta name="description" content="${escapeHtml(label)} — FrameSeq documentation." />
    <link rel="icon" href="${locale === "en" ? ".." : "../.."}/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${locale === "en" ? "." : ".."}/styles.css" />
    <title>${escapeHtml(label)} — FrameSeq docs</title>
  </head>
  <body>
    <header class="docs-header">
      <a class="docs-brand" href="../" aria-label="FrameSeq Gallery home">
        <span class="docs-brand-mark" aria-hidden="true"></span>
        <span>FrameSeq</span>
      </a>
      <nav aria-label="Documentation navigation">
        <a href="index.html">${locale === "en" ? "Docs" : "文档"}</a>
        <a href="${locale === "en" ? "../" : "../../"}">Gallery</a>
        <a class="docs-lang-switch" href="${switchHref}" lang="${other.htmlLang}">${other.label}</a>
        <a href="https://github.com/pride7/frameseq">GitHub <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <div class="docs-shell">
      <aside class="docs-sidebar" aria-label="Documentation sections">
        ${documentationNavigation(slug, locale)}
      </aside>
      <main class="docs-main">
        <article class="docs-article">${rendered}</article>
        <footer class="docs-footer">
          <span>FrameSeq documentation</span>
          <a href="https://github.com/pride7/frameseq/blob/main/${source}">Edit this page on GitHub ↗</a>
        </footer>
      </main>
    </div>
  </body>
</html>`;
}

const relativeOutput = relative(distRoot, galleryOutput);
if (!relativeOutput || relativeOutput === ".." || relativeOutput.startsWith("../") || relativeOutput.startsWith("..\\")) {
  throw new Error(`Unsafe gallery output path: ${galleryOutput}`);
}

await rm(galleryOutput, { recursive: true, force: true });
await mkdir(resolve(galleryOutput, "examples"), { recursive: true });
await mkdir(resolve(galleryOutput, "docs"), { recursive: true });

for (const example of examples) {
  const output = resolve(galleryOutput, "examples", example.slug);
  const result = spawnSync(
    process.execPath,
    [cli, "build", example.entry, "--output", output],
    { cwd: packageRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not build gallery example ${example.slug}`);
  }
}

/**
 * Photograph every slide of a deck so a documentation page can show the result
 * beside its source. The pictures are generated on every build, so they cannot
 * fall out of step with the deck they come from.
 */
async function captureSlides(slug) {
  const imagesDirectory = resolve(galleryOutput, "docs", "images");
  await mkdir(imagesDirectory, { recursive: true });

  const server = await preview({
    configFile: false,
    root: packageRoot,
    build: { outDir: galleryOutput },
    preview: { host: "127.0.0.1", port: 0, open: false },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Gallery preview did not expose a local URL");

  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.goto(new URL(`examples/${slug}/?print=1`, url).href, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await page.evaluate(() => document.fonts.ready);

    const slides = await page.$$(".frameseq-slide");
    if (slides.length === 0) throw new Error(`No slides to capture in ${slug}`);
    for (const [index, slide] of slides.entries()) {
      await slide.screenshot({
        path: resolve(imagesDirectory, `${slug}-${index + 1}.png`),
        optimizeForSpeed: false,
      });
    }
    console.log(`Captured ${slides.length} slides from ${slug}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

for (const slug of new Set(documentationPages.map((page) => page.previews).filter(Boolean))) {
  await captureSlides(slug);
}

for (const page of documentationPages) {
  const markdown = await readFile(resolve(packageRoot, page.source), "utf8");
  await writeFile(
    resolve(galleryOutput, "docs", `${page.slug}.html`),
    documentationPage(page, markdown),
    "utf8",
  );
}

const chinesePages = localisedGroups("zh").flatMap((group) => group.pages)
  .filter((page) => page.translated);
await mkdir(resolve(galleryOutput, "docs", "zh"), { recursive: true });
for (const page of chinesePages) {
  const source = page.slug === "index" ? "docs/zh/README.md" : `docs/zh/${page.slug}.md`;
  const markdown = await readFile(resolve(packageRoot, source), "utf8");
  await writeFile(
    resolve(galleryOutput, "docs", "zh", `${page.slug}.html`),
    documentationPage(page, markdown, "zh"),
    "utf8",
  );
}
console.log(`Documentation written: ${documentationPages.length} English, ${chinesePages.length} Chinese.`);

await Promise.all([
  copyFile(resolve(packageRoot, "gallery", "index.html"), resolve(galleryOutput, "index.html")),
  copyFile(resolve(packageRoot, "gallery", "styles.css"), resolve(galleryOutput, "styles.css")),
  copyFile(resolve(packageRoot, "gallery", "docs.css"), resolve(galleryOutput, "docs", "styles.css")),
  copyFile(resolve(packageRoot, "public", "favicon.svg"), resolve(galleryOutput, "favicon.svg")),
  copyFile(resolve(packageRoot, "llms.txt"), resolve(galleryOutput, "llms.txt")),
  writeFile(resolve(galleryOutput, ".nojekyll"), "", "utf8"),
]);

console.log(`FrameSeq Gallery built at ${galleryOutput}`);
