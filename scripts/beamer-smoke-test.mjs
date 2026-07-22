import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { build, preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "tmp", "beamer-smoke");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "tests", "beamer.slides.ts");
process.env.FRAMESEQ_BUILD_DIR = outputDirectory;

await build({ configFile: resolve(packageRoot, "vite.config.ts") });

const server = await preview({
  configFile: resolve(packageRoot, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  const themeData = await page.evaluate(() => ({
    theme: document.documentElement.dataset.frameseqTheme,
    family: document.documentElement.dataset.frameseqThemeFamily,
  }));
  assert.deepEqual(themeData, {
    theme: "beamer-madrid",
    family: "beamer",
  });

  assert.equal(await page.$$(".frameseq-theme-title-bar").then((items) => items.length), 1);
  assert.equal(await page.$$(".frameseq-theme-footer").then((items) => items.length), 1);
  assert.equal(await page.$$(".frameseq-cover-slide .frameseq-theme-footer").then((items) => items.length), 0);

  await page.keyboard.press("ArrowRight");
  const chrome = await page.$eval(".frameseq-slide-frame.is-active .frameseq-slide", (slide) => {
    const titleBar = slide.querySelector(".frameseq-theme-title-bar");
    const footer = slide.querySelector(".frameseq-theme-footer");
    const originalTitle = slide.querySelector(".frameseq-slide-title");
    const slideRect = slide.getBoundingClientRect();
    const titleRect = titleBar?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      title: titleBar?.textContent,
      footer: footer?.textContent,
      originalTitleDisplay: originalTitle ? getComputedStyle(originalTitle).display : undefined,
      titleAtTop: titleRect ? Math.abs(titleRect.top - slideRect.top) < 1 : false,
      footerAtBottom: footerRect ? Math.abs(footerRect.bottom - slideRect.bottom) < 1 : false,
    };
  });
  assert.equal(chrome.title, "Architecture");
  assert.match(chrome.footer ?? "", /Ada Lovelace/);
  assert.match(chrome.footer ?? "", /Analytical Engine Institute/);
  assert.match(chrome.footer ?? "", /2026 · 2 \/ 2/);
  assert.equal(chrome.originalTitleDisplay, "none");
  assert.equal(chrome.titleAtTop, true);
  assert.equal(chrome.footerAtBottom, true);

  await page.goto("http://127.0.0.1:4174/?print=1", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  assert.equal(await page.$$(".frameseq-slide-frame.is-active").then((items) => items.length), 2);
  assert.equal(await page.$$(".frameseq-theme-title-bar").then((items) => items.length), 1);
  assert.equal(await page.$$(".frameseq-theme-footer").then((items) => items.length), 1);
  assert.deepEqual(errors, []);

  console.log("Beamer smoke test passed: metadata, title bar, footer, numbering, cover, and print behavior.");
} finally {
  await browser.close();
  await server.close();
  delete process.env.FRAMESEQ_ENTRY;
  delete process.env.FRAMESEQ_BUILD_DIR;
}
