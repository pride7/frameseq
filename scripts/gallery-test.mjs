#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
assert.equal(referenced.length, 11, "Every recipe should show its slide");
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

// Every page the landing page sends a reader to has to exist, anchor included.
const landing = await readFile(resolve(galleryOutput, "index.html"), "utf8");
for (const match of landing.matchAll(/href="\.\/docs\/([^"#]*)(?:#([^"]+))?"/g)) {
  const [, path, fragment] = match;
  if (!path || path.endsWith("/")) continue;
  const target = docsSources.get(path);
  assert.ok(target, `The landing page links to a missing documentation page: ${path}`);
  if (fragment) {
    assert.ok(target.includes(`id="${fragment}"`), `The landing page links to a missing anchor: ${path}#${fragment}`);
  }
}

// The Studio pictures are taken on every build; a link preview needs the card at its full size.
const card = await stat(resolve(galleryOutput, "images", "studio-card.jpg"));
assert.ok(card.size > 20_000, "The link-preview card is too small to be a picture of the Studio");
assert.match(landing, /<meta property="og:image" content="https:\/\/pride7\.github\.io\/frameseq\/images\/studio-card\.jpg"/);

// The Chinese landing page stands beside the English one, each a link from the other, with its
// own pictures of the Studio in Chinese. Everything it links to or shows has to exist.
const chineseLanding = await readFile(resolve(galleryOutput, "zh", "index.html"), "utf8");
assert.match(chineseLanding, /<html lang="zh-Hans"/);
assert.match(landing, /href="\.\/zh\/"[^>]*>中文</, "The English landing page should lead to the Chinese one");
assert.match(chineseLanding, /href="\.\.\/"[^>]*>English</, "The Chinese landing page should lead to the English one");
for (const [, target] of chineseLanding.matchAll(/href="(\.\.\/docs\/[^"#]+)"/g)) {
  const file = resolve(galleryOutput, "zh", target.endsWith("/") ? `${target}index.html` : target);
  assert.ok(await stat(file).catch(() => false), `The Chinese landing page links to a missing page: ${target}`);
}
for (const [, file] of chineseLanding.matchAll(/src(?:set)?="\.\.\/images\/([^"]+)"/g)) {
  const { size } = await stat(resolve(galleryOutput, "images", file));
  assert.ok(size > 20_000, `${file} is too small to be a picture taken by the build`);
}
assert.ok(chineseLanding.includes('src="../images/zh/studio.webp"'), "The Chinese page should show the Studio in Chinese");
const chineseCard = await stat(resolve(galleryOutput, "images", "zh", "studio-card.jpg"));
assert.ok(chineseCard.size > 20_000, "The Chinese link-preview card is too small to be a picture of the Studio");
assert.match(chineseLanding, /<meta property="og:image" content="https:\/\/pride7\.github\.io\/frameseq\/images\/zh\/studio-card\.jpg"/);

// Every page asks for its stylesheet by content, so a browser holding the previous release's
// stylesheet fetches the new one instead of styling new markup with old rules.
const fingerprint = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
const galleryStyles = await readFile(resolve(galleryOutput, "styles.css"), "utf8");
assert.ok(
  landing.includes(`href="./styles.css?v=${fingerprint(galleryStyles)}"`),
  "The landing page should ask for its stylesheet by content",
);
assert.ok(chineseLanding.includes(`href="../styles.css?v=${fingerprint(galleryStyles)}"`));
const siteScript = await readFile(resolve(galleryOutput, "site.js"), "utf8");
assert.ok(landing.includes(`src="./site.js?v=${fingerprint(siteScript)}"`), "The landing page should ask for its script by content");
assert.ok(chineseLanding.includes(`src="../site.js?v=${fingerprint(siteScript)}"`));
const docsStyles = await readFile(resolve(docsOutput, "styles.css"), "utf8");
assert.ok(
  docsSources.get("index.html").includes(`href="./styles.css?v=${fingerprint(docsStyles)}"`),
  "The documentation should ask for its stylesheet by content",
);
assert.ok(chineseHome.includes(`href="../styles.css?v=${fingerprint(docsStyles)}"`));

// The landing page calls them slides throughout.
assert.doesNotMatch(landing, /\bdecks?\b/i, "The landing page should say slides, not deck");

/**
 * The integral's limits reach past KaTeX's line box, so a scrolling box around the formula
 * shows a vertical scroll bar. The box has to stay unscrolled and wide enough for the formula.
 */
function formulaFits(page) {
  return page.$eval(".formula-tex", (box) => {
    const range = document.createRange();
    range.selectNodeContents(box.querySelector(".katex-html"));
    const style = getComputedStyle(box);
    return style.overflowX === "visible" && style.overflowY === "visible"
      && range.getBoundingClientRect().width <= box.clientWidth;
  });
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
  // The one live slide waits below the fold, so it loads once it is near the screen.
  await page.$eval(".language-stage iframe", (frame) => frame.scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.length === 1
      && frames.every((frame) => frame.contentDocument?.querySelector(".frameseq-slide"));
  });

  const desktop = await page.evaluate(() => ({
    title: document.title,
    themeCards: document.querySelectorAll(".theme-card").length,
    bentoCards: document.querySelectorAll(".bento-card").length,
    frames: document.querySelectorAll("iframe").length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    themeLinks: Array.from(document.querySelectorAll(".theme-copy > a"))
      .map((link) => link.getAttribute("href")),
    languageHeading: document.querySelector("#language-title")?.textContent,
    outputHeading: document.querySelector("#outputs-title")?.textContent,
    onlineAction: document.querySelector(".online-action")?.getAttribute("href"),
    docsLink: document.querySelector('nav a[href="./docs/"]')?.getAttribute("href"),
    download: document.querySelector(".hero .button-primary")?.getAttribute("href"),
  }));
  assert.equal(desktop.title, "FrameSeq Studio — Slides you can click. Code you can read.");
  assert.equal(desktop.themeCards, 8);
  assert.equal(desktop.bentoCards, 5);
  assert.equal(desktop.frames, 1);
  assert.ok(desktop.overflow <= 0);
  assert.match(desktop.languageHeading ?? "", /top to bottom/i);
  assert.match(desktop.outputHeading ?? "", /web/i);
  assert.equal(
    desktop.onlineAction,
    "https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground",
  );
  assert.equal(desktop.docsLink, "./docs/");
  assert.equal(desktop.download, "./docs/app.html");
  assert.equal(
    await page.$eval(".language-stage iframe", (frame) => frame.getAttribute("src")),
    "./examples/atlas/?show#3",
  );
  const studio = await page.$eval(".hero-shot picture img", async (image) => {
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      shown: image.getBoundingClientRect().width,
      source: image.currentSrc,
    };
  });
  assert.match(studio.source, /\/images\/studio\.webp$/, "A desktop should show the whole Studio window");
  assert.ok(studio.width >= 2400 && studio.height >= 1400, `The Studio picture should be sharp, found ${studio.width}x${studio.height}`);
  assert.ok(studio.shown > 1000, "The Studio picture should span the page on a desktop");

  // The tour shows one picture of the Studio at a time, the one its chosen tab names.
  const shownPanels = () => page.$$eval(".tour-stage [role='tabpanel']", (panels) => panels
    .filter((panel) => getComputedStyle(panel).display !== "none")
    .map((panel) => panel.id));
  assert.equal(await page.$$eval(".tour-tab", (tabs) => tabs.length), 4);
  assert.deepEqual(await shownPanels(), ["panel-insert"]);
  await page.click("#tab-masters");
  assert.deepEqual(await shownPanels(), ["panel-masters"]);
  assert.equal(await page.$eval("#tab-masters", (tab) => tab.getAttribute("aria-selected")), "true");

  // The switch between the two views shows one picture of the window at a time.
  const shownView = () => page.$$eval("[data-view-stage] img", (images) => images
    .filter((image) => Number(getComputedStyle(image).opacity) > 0)
    .map((image) => image.className));
  await page.$eval(".view-switch", (element) => element.scrollIntoView({ block: "center" }));
  assert.deepEqual(await shownView(), ["view-design"]);
  await page.click(".view-switch [data-view='code']");
  await new Promise((resolveWait) => setTimeout(resolveWait, 600));
  assert.deepEqual(await shownView(), ["view-code"]);

  // Every picture the page shows comes out of the build, the Studio's and the slides' alike.
  for (const [, file] of landing.matchAll(/src(?:set)?="\.\/images\/([^"]+)"/g)) {
    const { size } = await stat(resolve(galleryOutput, "images", file));
    assert.ok(size > 20_000, `${file} is too small to be a picture taken by the build`);
  }

  // The formula is typeset by KaTeX at build time and drawn in KaTeX's own fonts, not
  // approximated with superscripts in the page's serif.
  await page.$eval(".formula-tex", (element) => element.scrollIntoView({ block: "center" }));
  const formula = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      typeset: Boolean(document.querySelector(".formula-tex .katex-html")),
      font: [...document.fonts].some((face) => face.family.replaceAll('"', "") === "KaTeX_Main" && face.status === "loaded"),
    };
  });
  assert.ok(formula.typeset, "The typesetting card should show a formula typeset by KaTeX");
  assert.ok(formula.font, "The KaTeX fonts should load with the landing page");
  assert.ok(await formulaFits(page), "The formula should fit its card without a scroll bar");
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
  assert.ok(await formulaFits(page), "The formula should fit its card on a phone without a scroll bar");

  // The whole Studio window is unreadable at phone width, so a phone shows the slide being edited.
  const phoneStudio = await page.$eval(".hero-shot picture img", async (image) => {
    await image.decode();
    return { source: image.currentSrc, width: image.naturalWidth, shown: image.getBoundingClientRect().width };
  });
  assert.match(phoneStudio.source, /\/images\/studio-phone\.webp$/, "A phone should show the slide being edited");
  assert.ok(phoneStudio.width >= 2000, `The phone picture should be sharp, found ${phoneStudio.width}`);
  assert.ok(phoneStudio.shown > 300, "A phone should show the slide across the page");

  // Code on a phone wraps between words or fits; it is never cut off at the card's edge.
  const clippedCode = await page.$$eval("pre", (blocks) => blocks
    .filter((block) => block.scrollWidth > block.clientWidth + 1)
    .map((block) => block.textContent.trim().split(/\r?\n/)[0]));
  assert.deepEqual(clippedCode, [], "Code blocks should fit a phone");

  /**
   * What a phone shows of a landing page's header and headings: the header's links, and anything
   * that runs past the edge of its box. A Chinese heading breaks only between its phrases, so a
   * phrase too long for a phone would otherwise run out of its box unseen.
   */
  const phoneFit = () => page.evaluate(() => ({
    header: [...document.querySelectorAll(".site-header a")]
      .filter((link) => link.offsetParent !== null)
      .map((link) => link.getAttribute("href")),
    clipped: [...document.querySelectorAll(".site-header a, .site-header .header-inner, h1, h2")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent.trim().slice(0, 40)),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  const englishPhone = await phoneFit();
  assert.ok(englishPhone.header.includes("./zh/"), "A phone should keep the way to the Chinese page");
  assert.deepEqual(englishPhone.clipped, [], "Nothing in the English page's header or headings should be cut off on a phone");

  await page.goto(new URL("zh/", url).href, { waitUntil: "networkidle0" });
  const chinesePhone = await phoneFit();
  assert.ok(chinesePhone.overflow <= 0);
  assert.ok(chinesePhone.header.includes("../docs/zh/"), "A phone should keep the Chinese documentation in reach");
  assert.ok(chinesePhone.header.includes("../"), "A phone should keep the way to the English page");
  assert.deepEqual(chinesePhone.clipped, [], "Nothing in the Chinese page's header or headings should be cut off on a phone");
  const chinesePhoneStudio = await page.$eval(".hero-shot picture img", async (image) => {
    await image.decode();
    return image.currentSrc;
  });
  assert.match(chinesePhoneStudio, /\/images\/zh\/studio-phone\.webp$/);
  assert.ok(await formulaFits(page), "The formula should fit its card on the Chinese page on a phone");

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.$eval(".language-stage iframe", (frame) => frame.scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.length === 1 && frames[0].contentDocument?.querySelector(".frameseq-slide");
  });
  const chineseDesktop = await page.evaluate(() => ({
    title: document.title,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    bentoCards: document.querySelectorAll(".bento-card").length,
    themeCards: document.querySelectorAll(".theme-card").length,
    download: document.querySelector(".hero .button-primary")?.getAttribute("href"),
  }));
  assert.match(chineseDesktop.title, /用鼠标做幻灯片/);
  assert.ok(chineseDesktop.overflow <= 0);
  assert.equal(chineseDesktop.bentoCards, 5);
  assert.equal(chineseDesktop.themeCards, 8);
  assert.equal(chineseDesktop.download, "../docs/zh/app.html");
  await page.click("#tab-menu");
  assert.deepEqual(await shownPanels(), ["panel-menu"]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

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
  const docsMobile = await page.evaluate(() => {
    const sidebar = document.querySelector(".docs-sidebar");
    return {
      groups: document.querySelectorAll(".docs-nav-group").length,
      sidebarHeight: sidebar.offsetHeight,
      toggle: getComputedStyle(document.querySelector(".docs-nav-button")).display,
      titleTop: Math.round(document.querySelector(".docs-article h1").getBoundingClientRect().top),
      headerLinks: [...document.querySelectorAll(".docs-header nav a")]
        .filter((link) => getComputedStyle(link).display !== "none")
        .map((link) => link.textContent.trim()),
      // How much room the header has left over. Fonts differ between platforms, so a header
      // that only just fits here is one that overflows somewhere else.
      headerSpare: (() => {
        const header = document.querySelector(".docs-header");
        const style = getComputedStyle(header);
        const gap = Number.parseFloat(style.columnGap) || 0;
        const children = [...header.children];
        const needed = children.reduce((total, child) => total + child.getBoundingClientRect().width, 0)
          + gap * Math.max(0, children.length - 1);
        const available = header.clientWidth
          - Number.parseFloat(style.paddingLeft)
          - Number.parseFloat(style.paddingRight);
        return Math.round(available - needed);
      })(),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  // The landing page hides its in-page anchors on a phone; the documentation is a
  // separate destination, so its link has to stay reachable.
  await page.goto(url, { waitUntil: "networkidle0" });
  const homeMobile = await page.evaluate(() => ({
    header: [...document.querySelectorAll(".site-header a")]
      .filter((link) => link.offsetParent !== null)
      .map((link) => link.getAttribute("href")),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.ok(
    homeMobile.header.includes("./docs/"),
    `The landing page should link to the documentation on a phone, found ${homeMobile.header.join(", ")}`,
  );
  assert.ok(homeMobile.overflow <= 0);
  await page.goto(new URL("docs/index.html", url).href, { waitUntil: "networkidle0" });

  assert.equal(docsMobile.groups, documentationGroups.length);
  assert.ok(docsMobile.overflow <= 0);
  assert.ok(
    docsMobile.headerSpare >= 24,
    `The phone header should fit with room to spare rather than exactly, found ${docsMobile.headerSpare}px`,
  );

  // On a phone the contents are a drawer: the page opens on the article, and the
  // navigation appears only when asked for. The switch has to survive either way,
  // since it is the only way into the Chinese documentation.
  assert.equal(docsMobile.sidebarHeight, 0, "The mobile navigation should start closed");
  assert.notEqual(docsMobile.toggle, "none", "A phone needs a control that opens it");
  assert.ok(
    docsMobile.titleTop < 200,
    `The article should open at the top on a phone, found ${docsMobile.titleTop}`,
  );
  assert.ok(
    docsMobile.headerLinks.includes("中文"),
    `The language switch should survive on a phone, found ${docsMobile.headerLinks.join(", ")}`,
  );

  await page.click(".docs-nav-button");
  const opened = await page.evaluate(() => ({
    height: document.querySelector(".docs-sidebar").offsetHeight,
    links: document.querySelectorAll(".docs-sidebar a").length,
    scrollX: document.querySelector(".docs-sidebar").scrollWidth
      - document.querySelector(".docs-sidebar").clientWidth,
  }));
  assert.ok(opened.height > 0, "The drawer should open");
  assert.equal(opened.links, documentationPages.length, "The drawer should list every page");
  assert.equal(opened.scrollX, 0, "The drawer should not scroll sideways");

  // The desktop layout keeps the sidebar in place and needs no control.
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const docsDesktopAgain = await page.evaluate(() => ({
    sidebar: document.querySelector(".docs-sidebar").offsetHeight,
    toggle: getComputedStyle(document.querySelector(".docs-nav-button")).display,
  }));
  assert.ok(docsDesktopAgain.sidebar > 0, "The sidebar stays visible on a desktop");
  assert.equal(docsDesktopAgain.toggle, "none", "A desktop needs no contents button");

} finally {
  await browser.close();
  await server.close();
}

console.log("Gallery test passed: the English and Chinese landing pages, their Studio pictures, the tour, seven themes, and the generated documentation fit desktop and mobile viewports.");
