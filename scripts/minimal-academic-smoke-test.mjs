import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { build, preview } from "vite";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "tests", "minimal-academic.slides.ts");
process.env.FRAMESEQ_BUILD_DIR = resolve(packageRoot, "tmp", "minimal-academic-smoke");

await build({ configFile: resolve(packageRoot, "vite.config.ts") });

const server = await preview({
  configFile: resolve(packageRoot, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
  },
});

const browser = await puppeteer.launch({ headless: true });
const errors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  const titlePage = await page.$eval(".frameseq-cover-slide", (slide) => ({
    title: slide.querySelector(".frameseq-cover-title")?.textContent,
    subtitle: slide.querySelector(".frameseq-cover-subtitle")?.textContent,
    author: slide.querySelector(".frameseq-cover-author")?.textContent,
    institute: slide.querySelector(".frameseq-cover-institute")?.textContent,
    date: slide.querySelector(".frameseq-cover-date")?.textContent,
    ruleWidth: slide.querySelector(".frameseq-cover-rule")?.getBoundingClientRect().width,
    pageWidth: slide.getBoundingClientRect().width,
    footerCount: slide.querySelectorAll(".frameseq-theme-footer").length,
  }));
  assert.equal(titlePage.title, "Minimal Academic Theme");
  assert.equal(titlePage.subtitle, "A restrained presentation style");
  assert.equal(titlePage.author, "Ada Lovelace");
  assert.equal(titlePage.institute, "Analytical Engine Institute");
  assert.equal(titlePage.date, "2026");
  assert.ok(Math.abs((titlePage.ruleWidth ?? 0) / titlePage.pageWidth - 0.619) < 0.01);
  assert.equal(titlePage.footerCount, 0);

  await page.keyboard.press("ArrowRight");
  const frame = await page.$eval(".frameseq-slide-frame.is-active .frameseq-slide", (slide) => {
    const titleBar = slide.querySelector(".frameseq-theme-title-bar");
    const footer = slide.querySelector(".frameseq-theme-footer");
    const titleRect = titleBar?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const marker = slide.querySelector(".frameseq-list-marker");
    const copy = slide.querySelector(".frameseq-list-copy");
    const markerRect = marker?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const markerStyle = marker ? getComputedStyle(marker) : undefined;
    const bulletStyle = marker ? getComputedStyle(marker, "::before") : undefined;
    return {
      title: titleBar?.textContent,
      titleClass: titleBar?.className,
      footerClass: footer?.className,
      footer: footer?.textContent,
      titleInset: titleRect ? titleRect.left - slideRect.left : undefined,
      footerAtBottom: footerRect ? Math.abs(footerRect.bottom - slideRect.bottom) < 1 : false,
      bulletHeight: markerStyle?.height,
      bulletSize: bulletStyle?.width,
      bulletCenterDelta: markerRect && copyRect
        ? Math.abs(
          markerRect.top + markerRect.height / 2
          - (copyRect.top + copyRect.height / 2),
        )
        : undefined,
    };
  });
  assert.equal(frame.title, "Design principles");
  assert.match(frame.titleClass ?? "", /is-underline/);
  assert.match(frame.footerClass ?? "", /is-title-layout/);
  assert.match(frame.footer ?? "", /Minimal Academic Theme/);
  assert.match(frame.footer ?? "", /2 \/ 3/);
  assert.doesNotMatch(frame.footer ?? "", /Ada Lovelace|Analytical Engine Institute|2026/);
  assert.ok((frame.titleInset ?? 0) > 80);
  assert.equal(frame.footerAtBottom, true);
  assert.equal(frame.bulletHeight, "29.3906px");
  assert.equal(frame.bulletSize, "10px");
  assert.ok((frame.bulletCenterDelta ?? Infinity) < 1);

  const themeData = await page.evaluate(() => ({
    theme: document.documentElement.dataset.frameseqTheme,
    coverLayout: document.documentElement.dataset.frameseqCoverLayout,
  }));
  assert.deepEqual(themeData, {
    theme: "minimal-academic",
    coverLayout: "academic-left",
  });

  await page.keyboard.press("ArrowRight");
  const manualCover = await page.$eval(
    ".frameseq-slide-frame.is-active .frameseq-cover-slide",
    (slide) => ({
      content: slide.textContent,
      automaticTitlePages: slide.querySelectorAll(".frameseq-auto-title-page").length,
      footerCount: slide.querySelectorAll(".frameseq-theme-footer").length,
    }),
  );
  assert.match(manualCover.content ?? "", /A manually authored cover/);
  assert.equal(manualCover.automaticTitlePages, 0);
  assert.equal(manualCover.footerCount, 0);
  assert.deepEqual(errors, []);

  console.log("Minimal Academic smoke test passed: automatic and manual covers, underline title, minimal footer, and metadata.");
} finally {
  await browser.close();
  await server.close();
  delete process.env.FRAMESEQ_ENTRY;
  delete process.env.FRAMESEQ_BUILD_DIR;
}
