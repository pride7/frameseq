import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { build, preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

/**
 * FrameSeq resolves a row or column at build time so its children can be anchored
 * without coordinates. That calculation only holds if it agrees with what the browser
 * actually lays out, so this test measures the rendered boxes and checks every
 * connector endpoint against them. Print mode is used because it disables the canvas
 * scale transform and keeps every slide laid out.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "tests", "flow-anchors.slides.ts");
process.env.FRAMESEQ_BUILD_DIR = resolve(packageRoot, "tmp", "flow-anchors");

await build({ configFile: resolve(packageRoot, "vite.config.ts") });

const server = await preview({
  configFile: resolve(packageRoot, "vite.config.ts"),
  preview: {
    host: "127.0.0.1",
    port: 4181,
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
  await page.goto("http://127.0.0.1:4181/?print=1", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const boxIn = (element, frame) => {
      const bounds = element.getBoundingClientRect();
      const origin = frame.getBoundingClientRect();
      return {
        x: bounds.left - origin.left,
        y: bounds.top - origin.top,
        width: bounds.width,
        height: bounds.height,
      };
    };

    return Array.from(document.querySelectorAll(".frameseq-line")).map((wrapper) => {
      const vector = wrapper.querySelector("line");
      // A connector is absolutely positioned, so its containing block is the frame
      // that its coordinates are expressed in.
      const frame = wrapper.offsetParent;
      const boxes = Array.from(frame.querySelectorAll("[data-frameseq-name]"))
        .map((element) => ({
          name: element.dataset.frameseqName,
          ...boxIn(element, frame),
        }));
      return {
        slide: wrapper.closest(".frameseq-slide")?.dataset.frameseqSlideLabel
          ?? wrapper.closest(".frameseq-slide-frame")?.dataset.index,
        points: {
          x1: Number(vector.getAttribute("x1")),
          y1: Number(vector.getAttribute("y1")),
          x2: Number(vector.getAttribute("x2")),
          y2: Number(vector.getAttribute("y2")),
        },
        boxes,
      };
    });
  });

  assert.equal(measured.length, 7, "Every connector in the fixture should be rendered");

  const tolerance = 1;
  const edgeDistance = (point, box) => {
    const insideX = point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance;
    const insideY = point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance;
    if (!insideX || !insideY) return Infinity;
    return Math.min(
      Math.abs(point.x - box.x),
      Math.abs(point.x - (box.x + box.width)),
      Math.abs(point.y - box.y),
      Math.abs(point.y - (box.y + box.height)),
    );
  };

  for (const connector of measured) {
    for (const [end, point] of [
      ["start", { x: connector.points.x1, y: connector.points.y1 }],
      ["end", { x: connector.points.x2, y: connector.points.y2 }],
    ]) {
      const nearest = connector.boxes
        .map((box) => ({ box, distance: edgeDistance(point, box) }))
        .sort((left, right) => left.distance - right.distance)[0];
      assert.ok(
        nearest && nearest.distance <= tolerance,
        `Slide ${connector.slide}: the ${end} of a connector is at `
        + `(${point.x}, ${point.y}), which is not on the edge of any rendered box. `
        + `Build-time layout disagrees with the browser. Boxes: `
        + connector.boxes.map((box) =>
          `${box.name} @ (${Math.round(box.x)}, ${Math.round(box.y)}) `
          + `${Math.round(box.width)}x${Math.round(box.height)}`).join("; "),
      );
    }
  }

  const named = new Map();
  for (const connector of measured) {
    for (const box of connector.boxes) named.set(box.name, box);
  }

  // A row starts at the container origin and advances by width plus gap.
  assert.deepEqual(
    [named.get("parse").x, named.get("build").x, named.get("render").x],
    [0, 320, 640],
  );
  assert.equal(named.get("parse").width, 240);

  // The centred column places each child by the widest one. Both shapes render 96px
  // tall even though the fixture asks for 80, because the shape stylesheet sets a
  // minimum height, so the second child starts at 96 + the 40px gap.
  assert.equal(named.get("wide").x, 0);
  assert.equal(named.get("wide").height, 96);
  assert.equal(named.get("narrow").x, 80);
  assert.equal(named.get("narrow").y, 136);

  // Stretch gives a child without its own height the height of the line.
  assert.equal(named.get("tall").height, 160);
  assert.equal(named.get("auto").height, 160);
  const stretchConnector = measured.find((connector) =>
    connector.boxes.some((box) => box.name === "tall"));
  assert.equal(stretchConnector.points.y1, 80);
  assert.equal(stretchConnector.points.y2, 80);

  // space-between spreads the free space of an explicit main size.
  assert.deepEqual(
    [named.get("left").x, named.get("middle").x, named.get("right").x],
    [0, 360, 720],
  );

  // The anchored group needs no coordinates, and its contents still resolve.
  assert.equal(named.get("a").x, 0);
  assert.equal(named.get("b").x, 260);

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

console.log("Flow layout test passed: build-time row and column geometry matches the browser.");
