import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

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

const browser = await puppeteer.launch(puppeteerLaunchOptions());
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

  assert.equal(await count(".frameseq-slide-frame"), 7);
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "0");
  assert.equal(await count(".katex"), 2);
  assert.equal(await count(".frameseq-inline-math .katex"), 1);
  assert.equal(await count(".frameseq-typst > svg"), 2);
  assert.equal(await count(".frameseq-layout-split"), 1);
  assert.equal(await count(".frameseq-grid-cell"), 3);
  assert.equal(await count(".frameseq-layout-center"), 2);
  assert.equal(await count(".frameseq-rect"), 2);
  assert.equal(await count(".frameseq-circle"), 1);
  assert.equal(await count(".frameseq-line > svg > line"), 2);

  const shapeGeometry = await page.evaluate(() => {
    const rect = document.querySelector(".shape-rect-smoke");
    const circle = document.querySelector(".shape-circle-smoke");
    const line = document.querySelector(".shape-line-smoke > svg > line");
    if (!(rect instanceof HTMLElement)
      || !(circle instanceof HTMLElement)
      || !(line instanceof SVGLineElement)) {
      throw new Error("Shape smoke-test elements are missing");
    }
    const rectStyle = getComputedStyle(rect);
    const circleBounds = circle.getBoundingClientRect();
    return {
      rect: {
        left: rectStyle.left,
        top: rectStyle.top,
        width: rectStyle.width,
        height: rectStyle.height,
        background: rectStyle.backgroundColor,
        borderWidth: rectStyle.borderWidth,
        borderRadius: rectStyle.borderRadius,
      },
      circle: {
        width: circleBounds.width,
        height: circleBounds.height,
        borderRadius: getComputedStyle(circle).borderRadius,
      },
      line: {
        x1: line.getAttribute("x1"),
        y1: line.getAttribute("y1"),
        x2: line.getAttribute("x2"),
        y2: line.getAttribute("y2"),
        stroke: line.getAttribute("stroke"),
        strokeWidth: line.getAttribute("stroke-width"),
        markerEnd: line.getAttribute("marker-end"),
      },
    };
  });
  assert.deepEqual(shapeGeometry.rect, {
    left: "80px",
    top: "145px",
    width: "240px",
    height: "110px",
    background: "rgb(23, 37, 84)",
    borderWidth: "3px",
    borderRadius: "18px",
  });
  assert.ok(Math.abs(shapeGeometry.circle.width - shapeGeometry.circle.height) < 1);
  assert.ok(shapeGeometry.circle.borderRadius === "50%"
    || shapeGeometry.circle.borderRadius === "9999px");
  assert.deepEqual(
    { ...shapeGeometry.line, markerEnd: undefined },
    {
      x1: "320",
      y1: "200",
      x2: "460",
      y2: "200",
      stroke: "#38bdf8",
      strokeWidth: "4px",
      markerEnd: undefined,
    },
  );
  assert.match(shapeGeometry.line.markerEnd ?? "", /^url\(#frameseq-arrow-\d+\)$/);

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

  assert.equal(await count(".frameseq-presenter"), 0);
  assert.equal(await count(".frameseq-presenter-notes"), 0);
  assert.equal(await count("[data-action='remote-pair']"), 0);

  const presenterPopup = new Promise((resolve) => page.once("popup", resolve));
  await page.click("[data-action='presenter']");
  const presenterPage = await presenterPopup;
  presenterPage.on("console", (message) => {
    if (message.type() === "error") errors.push(`Presenter: ${message.text()}`);
  });
  presenterPage.on("pageerror", (error) => errors.push(`Presenter: ${error.message}`));
  await presenterPage.setViewport({ width: 1440, height: 900 });
  await presenterPage.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  assert.equal(new URL(presenterPage.url()).searchParams.get("presenter"), "1");
  await presenterPage.waitForFunction(
    () => document.querySelector(".frameseq-counter")?.textContent?.startsWith("1/7"),
  );

  assert.equal(
    await presenterPage.$eval(".frameseq-presenter-notes", (element) => element.textContent),
    "Welcome the audience and introduce FrameSeq as a UI-style presentation framework.",
  );
  assert.equal(
    await presenterPage.$$eval(
      ".frameseq-presenter-current .frameseq-slide-frame.is-active",
      (elements) => elements.length,
    ),
    1,
  );
  assert.equal(
    await presenterPage.$$eval(
      ".frameseq-presenter-next-frame > .frameseq-slide",
      (elements) => elements.length,
    ),
    1,
  );
  assert.match(
    await presenterPage.$eval(".frameseq-presenter-timer", (element) => element.textContent ?? ""),
    /^\d{2}:\d{2}$/,
  );

  await presenterPage.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keydown", {
      key: "Process",
      code: "KeyL",
    }));
  });
  assert.equal(
    await presenterPage.$eval("[data-action='laser-toggle']", (element) => element.textContent),
    "Laser: Off",
  );
  await presenterPage.evaluate(() => {
    dispatchEvent(new KeyboardEvent("keydown", {
      key: "l",
      code: "KeyL",
      ctrlKey: true,
    }));
  });
  assert.equal(
    await presenterPage.$eval("[data-action='laser-toggle']", (element) => element.textContent),
    "Laser: On",
  );
  const presenterCanvas = await presenterPage.$(
    ".frameseq-presenter-current .frameseq-slide-frame.is-active > .frameseq-slide",
  );
  const presenterCanvasBounds = await presenterCanvas?.boundingBox();
  assert.ok(presenterCanvasBounds);
  await presenterPage.mouse.move(
    presenterCanvasBounds.x + presenterCanvasBounds.width * 0.25,
    presenterCanvasBounds.y + presenterCanvasBounds.height * 0.6,
  );
  await page.waitForFunction(
    () => Boolean(document.querySelector(".frameseq-laser-pointer.is-visible")),
  );
  const audiencePointer = await page.$eval(
    ".frameseq-laser-pointer.is-visible",
    (element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
    }),
  );
  assert.ok(Math.abs(audiencePointer.left - 25) < 0.5);
  assert.ok(Math.abs(audiencePointer.top - 60) < 0.5);
  assert.equal(
    await presenterPage.$$eval(".frameseq-laser-pointer.is-visible", (elements) => elements.length),
    1,
  );
  const notesPanel = await presenterPage.$(".frameseq-presenter-notes-panel");
  const notesBounds = await notesPanel?.boundingBox();
  assert.ok(notesBounds);
  await presenterPage.mouse.move(notesBounds.x + 10, notesBounds.y + 10);
  await page.waitForFunction(
    () => !document.querySelector(".frameseq-laser-pointer.is-visible"),
  );

  await presenterPage.click(".frameseq-presenter-controls [data-action='next']");
  await page.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "1",
  );
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "1");
  assert.equal(
    await presenterPage.$eval(".frameseq-presenter-notes", (element) => element.textContent),
    "Emphasize that source order replaces nested callbacks and layout boilerplate.",
  );

  await presenterPage.select(".frameseq-presenter-page-select", "2");
  await page.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "2",
  );
  assert.equal(await attribute(".frameseq-slide-frame.is-active", "data-index"), "2");

  await presenterPage.select(".frameseq-presenter-page-select", "0");
  await page.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "0",
  );
  await presenterPage.click("[data-action='timer-toggle']");
  assert.equal(
    await presenterPage.$eval("[data-action='timer-toggle']", (element) => element.textContent),
    "Resume",
  );
  await presenterPage.close();

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
  assert.equal(await count(".frameseq-slide-frame.is-active"), 7);
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

  console.log("Smoke test passed: theme, rendering, navigation, presenter laser, reveals, math, and print mode.");
} finally {
  await browser.close();
  await server.close();
}
