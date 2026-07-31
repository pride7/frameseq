#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { documentationGroups, documentationPages, localisedGroups } from "./docs-structure.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const galleryOutput = resolve(packageRoot, "dist", "gallery");
const docsOutput = resolve(galleryOutput, "docs");
const docsFiles = (await readdir(docsOutput)).filter((file) => file.endsWith(".html"));
assert.equal(docsFiles.length, documentationPages.length);

// The recipes page shows the slide each recipe renders, captured from the deck
// on every build. A missing or blank capture means the page is showing nothing.
const previewImages = (await readdir(resolve(docsOutput, "images")))
  .filter((file) => file.startsWith("recipes-") && file.endsWith(".png"));
const recipesPage = await readFile(resolve(docsOutput, "recipes.html"), "utf8");
const referenced = [...recipesPage.matchAll(/src="images\/(recipes-\d+\.png)"/g)]
  .map((match) => match[1]);
assert.equal(referenced.length, 10, "Every recipe should show its slide");
assert.equal(previewImages.length, referenced.length);
for (const file of referenced) {
  assert.ok(previewImages.includes(file), `The recipes page references a missing ${file}`);
  const { size } = await stat(resolve(docsOutput, "images", file));
  assert.ok(size > 5000, `${file} is too small to be a rendered slide`);
}

// The Chinese reading path is published beside the English documentation, each page
// linking to its counterpart, and untranslated pages are offered in English.
const chineseFiles = (await readdir(resolve(docsOutput, "zh"))).filter((f) => f.endsWith(".html"));
const translated = localisedGroups("zh").flatMap((group) => group.pages)
  .filter((page) => page.translated);
assert.equal(chineseFiles.length, translated.length);
const chineseHome = await readFile(resolve(docsOutput, "zh", "index.html"), "utf8");
assert.match(chineseHome, /<html lang="zh-Hans"/);
assert.match(chineseHome, /href="\.\.\/index\.html"[^>]*>English</);
const untranslated = localisedGroups("zh").flatMap((group) => group.pages)
  .find((page) => !page.translated);
assert.ok(untranslated, "Some pages are still English only");
assert.match(
  chineseHome,
  new RegExp(`href="\.\./${untranslated.slug}\.html"[^>]*>[^<]+<span class="docs-nav-lang">EN<`),
  "An untranslated page should be offered in English rather than hidden",
);
const englishHome = await readFile(resolve(docsOutput, "index.html"), "utf8");
assert.match(englishHome, /href="zh\/index\.html"[^>]*>中文</);
const chineseRecipes = await readFile(resolve(docsOutput, "zh", "recipes.html"), "utf8");
assert.match(chineseRecipes, /src="\.\.\/images\/recipes-1\.png"/);

const docsSources = new Map();
for (const file of docsFiles) {
  docsSources.set(file, await readFile(resolve(docsOutput, file), "utf8"));
}

for (const [file, source] of docsSources) {
  for (const match of source.matchAll(/href="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|\.\.\/)/.test(target)) continue;
    const [path, fragment] = target.split("#", 2);
    if (path && !path.endsWith(".html")) continue;
    const targetFile = path || file;
    const targetSource = docsSources.get(basename(targetFile));
    assert.ok(targetSource, `Broken documentation link in ${file}: ${target}`);
    if (fragment) {
      assert.ok(
        targetSource.includes(`id="${fragment}"`),
        `Broken documentation anchor in ${file}: ${target}`,
      );
    }
  }
}

const server = await preview({
  configFile: false,
  root: packageRoot,
  build: { outDir: galleryOutput },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("Gallery preview did not expose a local URL");

const llmsResponse = await fetch(new URL("llms.txt", url));
assert.equal(llmsResponse.status, 200);
assert.match(await llmsResponse.text(), /# FrameSeq[\s\S]+## Authoring model/);

const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.length === 10
      && frames.every((frame) => frame.contentDocument?.querySelector(".frameseq-slide"));
  });

  const desktop = await page.evaluate(() => ({
    title: document.title,
    themeCards: document.querySelectorAll(".theme-card").length,
    capabilityCards: document.querySelectorAll(".capability-card").length,
    frames: document.querySelectorAll("iframe").length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    themeLinks: Array.from(document.querySelectorAll(".theme-copy > a"))
      .map((link) => link.getAttribute("href")),
    languageHeading: document.querySelector("#language-title")?.textContent,
    outputHeading: document.querySelector("#outputs-title")?.textContent,
    onlineAction: document.querySelector(".online-action")?.getAttribute("href"),
    docsLink: document.querySelector('nav a[href="./docs/"]')?.getAttribute("href"),
  }));
  assert.equal(desktop.title, "FrameSeq — Declarative presentations in TypeScript");
  assert.equal(desktop.themeCards, 7);
  assert.equal(desktop.capabilityCards, 4);
  assert.equal(desktop.frames, 10);
  assert.ok(desktop.overflow <= 0);
  assert.match(desktop.languageHeading ?? "", /top to bottom/i);
  assert.match(desktop.outputHeading ?? "", /web/i);
  assert.equal(
    desktop.onlineAction,
    "https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground",
  );
  assert.equal(desktop.docsLink, "./docs/");
  assert.equal(
    await page.$eval(".ai-example-preview iframe", (frame) => frame.getAttribute("src")),
    "./examples/ai-research/#2",
  );
  assert.deepEqual(desktop.themeLinks, [
    "./examples/blank/",
    "./examples/midnight/",
    "./examples/paper/",
    "./examples/beamer-default/",
    "./examples/beamer-madrid/",
    "./examples/beamer-cambridge-us/",
    "./examples/minimal-academic/",
  ]);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".theme-grid")).gridTemplateColumns,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.ok(mobile.overflow <= 0);
  assert.ok(!mobile.columns.includes(" "));

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(new URL("docs/function-guide.html", url), { waitUntil: "networkidle0" });
  const docsDesktop = await page.evaluate(() => ({
    title: document.title,
    groups: document.querySelectorAll(".docs-nav-group").length,
    active: document.querySelector(".docs-nav-group a.is-active")?.textContent?.trim(),
    metric: document.querySelector("#metric")?.textContent,
    signature: Array.from(document.querySelectorAll(".docs-article code"))
      .some((code) => code.textContent?.includes("metric(value, label) → GroupBuilder")),
    apiLink: document.querySelector('.docs-article a[href="api-reference.html"]')?.getAttribute("href"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.equal(docsDesktop.title, "Function reference — FrameSeq docs");
  assert.equal(docsDesktop.groups, documentationGroups.length);
  assert.equal(docsDesktop.active, "Function reference");
  assert.match(docsDesktop.metric ?? "", /metric/i);
  assert.equal(docsDesktop.signature, true);
  assert.equal(docsDesktop.apiLink, "api-reference.html");
  assert.ok(docsDesktop.overflow <= 0);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const docsMobile = await page.evaluate(() => ({
    groups: document.querySelectorAll(".docs-nav-group").length,
    sidebarOverflow: getComputedStyle(document.querySelector(".docs-sidebar")).overflowX,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.equal(docsMobile.groups, documentationGroups.length);
  assert.equal(docsMobile.sidebarOverflow, "auto");
  assert.ok(docsMobile.overflow <= 0);
} finally {
  await browser.close();
  await server.close();
}

console.log("Gallery test passed: product examples, seven themes, and the generated documentation fit desktop and mobile viewports.");
