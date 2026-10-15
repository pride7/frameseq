#!/usr/bin/env node

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import katex from "katex";
import { marked } from "marked";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { documentationPages, locales, localisedGroups } from "./docs-structure.mjs";
import { captureStudio } from "./gallery-studio.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const galleryOutput = resolve(distRoot, "gallery");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

/**
 * GitHub Pages lets a browser keep a stylesheet for ten minutes, so a page published with new
 * markup could arrive styled by the previous release. Each page asks for its stylesheet by the
 * stylesheet's content, so a changed one is fetched afresh.
 */
const fingerprint = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
const galleryStyles = await readFile(resolve(packageRoot, "gallery", "styles.css"), "utf8");
const docsStyles = await readFile(resolve(packageRoot, "gallery", "docs.css"), "utf8");
const katexStyles = await readFile(resolve(packageRoot, "node_modules", "katex", "dist", "katex.min.css"), "utf8");
const siteScript = await readFile(resolve(packageRoot, "gallery", "site.js"), "utf8");
const examples = [
  { slug: "midnight", entry: resolve(packageRoot, "slides.ts") },
  { slug: "language", entry: resolve(packageRoot, "gallery", "slides", "language.slides.ts") },
  // The product review the Studio is photographed editing, so the landing page can show it live too.
  { slug: "atlas", entry: resolve(packageRoot, "gallery", "slides", "studio.slides.ts") },
  { slug: "atlas-zh", entry: resolve(packageRoot, "gallery", "slides", "studio-zh.slides.ts") },
  { slug: "recipes", entry: resolve(packageRoot, "gallery", "slides", "recipes.slides.ts") },
  { slug: "ai-research", entry: resolve(packageRoot, "gallery", "slides", "ai-research.slides.ts") },
  { slug: "poster", entry: resolve(packageRoot, "gallery", "slides", "poster.slides.ts") },
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

const staleNotice = {
  zh: '<aside class="docs-stale">本页可能落后于英文原文,以 <a href="../{slug}.html">英文版</a> 为准。</aside>',
};

/** The page's sections, from its second-level headings, for the list beside a wide article. */
function pageSections(html, locale) {
  const sections = [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<a class="heading-anchor"/g)]
    .map(([, id, title]) => ({ id, title: title.replace(/<[^>]+>/g, "").trim() }));
  if (sections.length < 2) return "";
  return `<aside class="docs-toc" aria-label="${locale === "en" ? "On this page" : "本页内容"}">
        <p>${locale === "en" ? "On this page" : "本页内容"}</p>
        ${sections.map(({ id, title }) => `<a href="#${id}">${title}</a>`).join("\n        ")}
      </aside>`;
}

function documentationPage({ slug, label, source, previews }, content, locale = "en") {
  const stale = /^<!-- translation-of: \S+ sha256:stale -->/.test(content);
  const rendered = withSlidePreviews(
    addHeadingIds(marked.parse(rewriteMarkdownLinks(content), { gfm: true })),
    previews,
    locale,
  );
  const other = locale === "en" ? locales.zh : locales.en;
  const switchHref = locale === "en" ? `zh/${slug}.html` : `../${slug}.html`;
  // The landing page in the documentation's language.
  const home = locale === "en" ? "../" : "../../zh/";
  return `<!doctype html>
<html lang="${locales[locale].htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="description" content="${escapeHtml(label)} — FrameSeq documentation." />
    <link rel="icon" href="${locale === "en" ? ".." : "../.."}/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${locale === "en" ? "." : ".."}/styles.css?v=${fingerprint(docsStyles)}" />
    <title>${escapeHtml(label)} — FrameSeq docs</title>
  </head>
  <body>
    <header class="docs-header">
      <a class="docs-brand" href="${home}" aria-label="${locale === "en" ? "FrameSeq home" : "FrameSeq 首页"}">
        <span class="docs-brand-mark" aria-hidden="true"></span>
        <span>FrameSeq</span>
        <span class="docs-brand-tag">${locale === "en" ? "Docs" : "文档"}</span>
      </a>
      <label class="docs-nav-button" for="docs-nav">
        <span class="docs-nav-icon" aria-hidden="true"></span>
        ${locale === "en" ? "Contents" : "目录"}
      </label>
      <nav aria-label="Documentation navigation">
        <a class="docs-nav-home" href="index.html">${locale === "en" ? "Docs" : "文档"}</a>
        <a class="docs-nav-gallery" href="${home}">${locale === "en" ? "Home" : "首页"}</a>
        <a class="docs-lang-switch" href="${switchHref}" lang="${other.htmlLang}">${other.label}</a>
        <a class="docs-nav-external" href="https://github.com/pride7/frameseq">GitHub <span aria-hidden="true">↗</span></a>
        <a class="docs-nav-download" href="${home}download/">${locale === "en" ? "Download" : "下载"}</a>
      </nav>
    </header>
    <input class="docs-nav-state" id="docs-nav" type="checkbox" aria-label="${locale === "en" ? "Show the documentation contents" : "显示文档目录"}" />
    <div class="docs-shell">
      <aside class="docs-sidebar" aria-label="Documentation sections">
        ${documentationNavigation(slug, locale)}
      </aside>
      <main class="docs-main">
        <article class="docs-article">${stale ? staleNotice[locale].replace("{slug}", slug) : ""}${rendered}</article>
        <footer class="docs-footer">
          <span>${locale === "en" ? "FrameSeq documentation" : "FrameSeq 文档"}</span>
          <a href="https://github.com/pride7/frameseq/blob/main/${source}">${locale === "en" ? "Edit this page on GitHub" : "在 GitHub 上编辑本页"} ↗</a>
        </footer>
      </main>
      ${pageSections(rendered, locale)}
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

/**
 * The slides the landing pages show as pictures: each theme's example, the diagram from the
 * product review in English and in Chinese, and the poster. They are drawn as print draws them, with every reveal step
 * shown, and taken on every build like the documentation's.
 */
const landingSlides = [
  { slug: "atlas", slide: 2 },
  { slug: "atlas-zh", slide: 2 },
  // A0 is drawn far larger than a slide, so it is taken smaller.
  { slug: "poster", slide: 1, scale: 0.5 },
  { slug: "blank", slide: 1 },
  { slug: "midnight", slide: 1 },
  { slug: "paper", slide: 1 },
  { slug: "beamer-default", slide: 1 },
  { slug: "beamer-madrid", slide: 2 },
  { slug: "beamer-cambridge-us", slide: 1 },
  { slug: "minimal-academic", slide: 2 },
];

async function captureLandingSlides() {
  const imagesDirectory = resolve(galleryOutput, "images");
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
    // A slide is 1280 pixels across, taken at 1.25 times that: sharp in a card, light to load.
    for (const { slug, slide, scale = 1.25 } of landingSlides) {
      await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: scale });
      await page.goto(new URL(`examples/${slug}/?print=1`, url).href, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
      await page.evaluate(() => document.fonts.ready);
      const slides = await page.$$(".frameseq-slide");
      if (!slides[slide - 1]) throw new Error(`${slug} has no slide ${slide} to show on the landing page`);
      await slides[slide - 1].screenshot({
        path: resolve(imagesDirectory, `${slug}-${slide}.webp`),
        type: "webp",
        quality: 88,
        optimizeForSpeed: false,
      });
    }
    console.log(`Captured ${landingSlides.length} slides for the landing page`);
  } finally {
    await browser.close();
    await server.close();
  }
}

for (const slug of new Set(documentationPages.map((page) => page.previews).filter(Boolean))) {
  await captureSlides(slug);
}
await captureLandingSlides();
await captureStudio(resolve(galleryOutput, "images"));
await captureStudio(resolve(galleryOutput, "images", "zh"), "zh");

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

/**
 * Typeset every `data-tex` element on a landing page with KaTeX, using the options the
 * runtime uses for `math`, so the page shows the formula FrameSeq itself would draw.
 */
function typesetLandingPage(html) {
  return html.replace(
    /<(\w+)([^>]*?) data-tex="([^"]*)"([^>]*)><\/\1>/g,
    (_match, tag, before, tex, after) => {
      const source = tex.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
      const rendered = katex.renderToString(source, { displayMode: true, throwOnError: true, output: "htmlAndMathml" });
      return `<${tag}${before}${after}>${rendered}</${tag}>`;
    },
  );
}

const katexDist = resolve(packageRoot, "node_modules", "katex", "dist");
await mkdir(resolve(galleryOutput, "katex", "fonts"), { recursive: true });
for (const font of (await readdir(resolve(katexDist, "fonts"))).filter((file) => file.endsWith(".woff2"))) {
  await copyFile(resolve(katexDist, "fonts", font), resolve(galleryOutput, "katex", "fonts", font));
}

/** The app for each system, by the name of its file in a release. */
const appDownloads = {
  "win-setup": /^FrameSeq-Setup-.+-win-x64\.exe$/,
  "win-zip": /^FrameSeq-.+-win-x64\.zip$/,
  "mac-arm64": /^FrameSeq-.+-mac-arm64\.dmg$/,
  "mac-x64": /^FrameSeq-.+-mac-x64\.dmg$/,
  "linux-x64": /^FrameSeq-.+-linux-x64\.tar\.gz$/,
  "linux-arm64": /^FrameSeq-.+-linux-arm64\.tar\.gz$/,
};
const releasesPage = "https://github.com/pride7/frameseq/releases/latest";

/**
 * The newest release, which the download pages offer: its version, its date, and the app for each
 * system, read from GitHub as the site is built. When GitHub cannot be asked, as offline, the pages
 * send people to the releases page for every system and name the version in package.json.
 */
async function latestRelease() {
  const packageVersion = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8")).version;
  try {
    const response = await fetch("https://api.github.com/repos/pride7/frameseq/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = await response.json();
    const files = {};
    for (const [key, pattern] of Object.entries(appDownloads)) {
      const asset = release.assets.find((candidate) => pattern.test(candidate.name));
      if (asset) files[key] = { url: asset.browser_download_url, size: `${Math.round(asset.size / 1048576)} MB` };
    }
    return { version: release.tag_name.replace(/^v/, ""), date: release.published_at.slice(0, 10), files };
  } catch (error) {
    console.warn(`The download pages link to the releases page: the latest release could not be read (${error.message}).`);
    return { version: packageVersion, date: "", files: {} };
  }
}

const release = await latestRelease();

/** Put the release into a download page's {{version}}, {{date}}, {{download:…}}, and {{size:…}}. */
function fillRelease(html) {
  return html
    .replaceAll("{{version}}", release.version)
    .replaceAll("{{date}}", release.date)
    .replace(/\{\{download:([a-z0-9-]+)\}\}/g, (_match, key) => release.files[key]?.url ?? releasesPage)
    .replace(/\{\{size:([a-z0-9-]+)\}\}/g, (_match, key) => release.files[key]?.size ?? "");
}

/**
 * A landing page as published: its formula typeset, its release filled in, and its stylesheets
 * and script asked for by their content. `root` is the way from the page up to the site's root.
 */
async function writeLandingPage(source, output, root) {
  const html = fillRelease(typesetLandingPage(await readFile(resolve(packageRoot, "gallery", source), "utf8")))
    .replace(`href="${root}/styles.css"`, `href="${root}/styles.css?v=${fingerprint(galleryStyles)}"`)
    .replace(`href="${root}/katex/katex.min.css"`, `href="${root}/katex/katex.min.css?v=${fingerprint(katexStyles)}"`)
    .replace(`src="${root}/site.js"`, `src="${root}/site.js?v=${fingerprint(siteScript)}"`);
  await mkdir(dirname(resolve(galleryOutput, output)), { recursive: true });
  await writeFile(resolve(galleryOutput, output), html, "utf8");
}

await Promise.all([
  writeLandingPage("index.html", "index.html", "."),
  writeLandingPage("zh/index.html", "zh/index.html", ".."),
  writeLandingPage("download/index.html", "download/index.html", ".."),
  writeLandingPage("zh/download/index.html", "zh/download/index.html", "../.."),
  writeFile(resolve(galleryOutput, "site.js"), siteScript, "utf8"),
  writeFile(resolve(galleryOutput, "katex", "katex.min.css"), katexStyles, "utf8"),
  writeFile(resolve(galleryOutput, "styles.css"), galleryStyles, "utf8"),
  writeFile(resolve(galleryOutput, "docs", "styles.css"), docsStyles, "utf8"),
  copyFile(resolve(packageRoot, "public", "favicon.svg"), resolve(galleryOutput, "favicon.svg")),
  copyFile(resolve(packageRoot, "llms.txt"), resolve(galleryOutput, "llms.txt")),
  writeFile(resolve(galleryOutput, ".nojekyll"), "", "utf8"),
]);

console.log(`FrameSeq Gallery built at ${galleryOutput}`);
