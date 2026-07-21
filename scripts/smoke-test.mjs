import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { preview } from "vite";

const server = await preview({
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },
});

const address = server.httpServer.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("Could not determine preview server address");
}

const browser = await puppeteer.launch({ headless: true });
const errors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  const count = (selector) => page.$$eval(selector, (elements) => elements.length);
  const attribute = (selector, name) => page.$eval(
    selector,
    (element, attributeName) => element.getAttribute(attributeName),
    name,
  );

  assert.equal(await count(".frameseq-slide-frame"), 6);
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "0");
  assert.equal(await count(".katex"), 2);
  assert.equal(await count(".frameseq-inline-math .katex"), 1);
  assert.equal(await count(".frameseq-typst > svg"), 2);
  assert.equal(await count(".frameseq-layout-split"), 1);
  assert.equal(await count(".frameseq-grid-cell"), 3);
  assert.equal(await count(".frameseq-layout-center"), 2);

  const typstFragments = await page.$$eval(
    ".frameseq-typst > svg",
    (elements) => elements.map((element) => ({
      viewBox: element.getAttribute("viewBox"),
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })),
  );
  assert.ok(typstFragments.every((fragment) => fragment.viewBox));

  const tailwindStyle = await page.$eval(".tailwind-smoke", (element) => {
    const style = getComputedStyle(element);
    return {
      className: element.className,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    };
  });
  assert.match(tailwindStyle.className, /text-\[31px\]/);
  assert.equal(tailwindStyle.color, "rgb(249, 115, 22)");
  assert.equal(tailwindStyle.fontSize, "31px");
  assert.equal(tailwindStyle.fontWeight, "750");
  assert.equal(tailwindStyle.letterSpacing, "2px");

  const activeTheme = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement)
      .getPropertyValue("--frameseq-background").trim(),
    accent: getComputedStyle(document.documentElement)
      .getPropertyValue("--frameseq-accent").trim(),
  }));
  assert.deepEqual(activeTheme, {
    background: "#020617",
    accent: "#22d3ee",
  });

  await page.setViewport({ width: 375, height: 667 });
  await page.waitForFunction(() => {
    const frame = document.querySelector(".frameseq-slide-frame.is-active");
    const canvas = frame?.querySelector(".frameseq-slide");
    if (!frame || !canvas) return false;
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return Math.abs(
      (frameRect.left + frameRect.right) / 2 - (canvasRect.left + canvasRect.right) / 2,
    ) < 1;
  });
  const mobileGeometry = await page.$eval(
    ".frameseq-slide-frame.is-active",
    (frame) => {
      const canvas = frame.querySelector(".frameseq-slide");
      if (!canvas) throw new Error("Active slide canvas is missing");
      const frameRect = frame.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        frame: {
          left: frameRect.left,
          right: frameRect.right,
          top: frameRect.top,
          bottom: frameRect.bottom,
        },
        canvas: {
          left: canvasRect.left,
          right: canvasRect.right,
          top: canvasRect.top,
          bottom: canvasRect.bottom,
          width: canvasRect.width,
          height: canvasRect.height,
        },
      };
    },
  );
  assert.ok(mobileGeometry.canvas.width > 0 && mobileGeometry.canvas.height > 0);
  assert.ok(mobileGeometry.canvas.left >= mobileGeometry.frame.left - 1);
  assert.ok(mobileGeometry.canvas.right <= mobileGeometry.frame.right + 1);
  assert.ok(mobileGeometry.canvas.top >= mobileGeometry.frame.top - 1);
  assert.ok(mobileGeometry.canvas.bottom <= mobileGeometry.frame.bottom + 1);

  await page.setViewport({ width: 1440, height: 900 });

  const slideText = await page.$$eval(
    ".frameseq-slide-frame",
    (frames) => frames.map((frame) => frame.textContent ?? ""),
  );
  assert.match(slideText[0], /Build slides like building apps/);
  assert.doesNotMatch(slideText[0], /Write one file/);
  assert.match(slideText[1], /Write one file/);
  assert.match(slideText[1], /Use semantic components/);
  assert.doesNotMatch(slideText[1], /A fixed canvas with time/);
  assert.match(slideText[2], /A fixed canvas with time/);
  assert.match(slideText[4], /Rendered with KaTeX/);

  await page.keyboard.press("ArrowRight");
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "1");

  await page.keyboard.press("ArrowRight");
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "2");
  assert.equal(await count(".frameseq-slide-frame.is-active .frameseq-step.is-visible"), 0);

  await page.keyboard.press("ArrowRight");
  assert.equal(await count(".frameseq-slide-frame.is-active .frameseq-step.is-visible"), 1);

  await page.goto(`http://127.0.0.1:${address.port}/?print=1`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  assert.equal(await count(".frameseq-slide-frame.is-active"), 6);
  assert.equal(await count(".frameseq-step.is-visible"), 3);
  const printedTypstGeometry = await page.$$eval(
    ".frameseq-typst > svg",
    (elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  assert.ok(printedTypstGeometry.every((fragment) => fragment.width > 0 && fragment.height > 0));

  const splitRects = await page.$$eval(
    ".frameseq-layout-split > .frameseq-region",
    (elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    }),
  );
  assert.equal(splitRects.length, 2);
  assert.ok(Math.abs(splitRects[0].y - splitRects[1].y) < 1);
  assert.ok(splitRects[1].x > splitRects[0].x + splitRects[0].width);

  const gridRects = await page.$$eval(
    ".frameseq-grid-cell",
    (elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    }),
  );
  assert.ok(gridRects.every((rect) => Math.abs(rect.y - gridRects[0].y) < 1));
  assert.ok(gridRects[0].x < gridRects[1].x && gridRects[1].x < gridRects[2].x);
  assert.deepEqual(errors, []);

  console.log("Smoke test passed: theme, rendering, navigation, reveals, math, and print mode.");
} finally {
  await browser.close();
  await server.close();
}
